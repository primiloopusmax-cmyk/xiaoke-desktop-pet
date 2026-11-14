// 小克 3.0 — 动效引擎：一张静态图也能"动起来"。
// 原理：把人物按水平条切成几十条，每一帧按高度给每条不同的位移 / 缩放（像布娃娃一样弯腰、摆头、呼吸、
// 果冻式晃动、以脚底或吊点为轴摆动），再整体平移 / 旋转 / 压扁拉伸。所有变形都以脚底为锚点，脚不会漂。
// 没有 DOM 依赖（除了传进来的 canvas），app.js 负责决定"现在播哪个画面、哪套动效"。
(() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
  const env = p => Math.sin(Math.PI * clamp(p, 0, 1));                   // 0→1→0
  const easeOut = p => 1 - Math.pow(1 - clamp(p, 0, 1), 3);
  const back = p => { const c1 = 1.70158, c3 = c1 + 1; p = clamp(p, 0, 1); return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

  /* ---------- 动效定义 ----------
   * 每个程序是 (t, I, o) => 参数，t 秒，I 强度，o 为可选参数。返回：
   *   tx, ty   整体平移（画布像素）           rot 整体旋转（度，默认绕脚底；pivot 可改轴的 y）
   *   sx, sy   整体缩放（绕脚底）
   *   waves    [{amp, pow, k, ph}]  每条 x 位移 = amp·|u|^pow·sin(ph − k·u)，u 为离脚底的身高比例（0 脚 1 头顶）
   *   bands    [{lo, hi, s}]       高度区间内的竖向缩放（胸口呼吸、脖子点头、腿压缩）
   *   xbands   [{lo, hi, s}]       高度区间内的横向缩放
   */
  const LOOPS = {
    none: () => ({}),
    doze: (t, I) => { const T = 3.4, p = (t % T) / T, dip = p < .78 ? Math.pow(p / .78, 1.6) : (1 - p) / .22 * (1 - smooth(.9, 1, p)) ; return { bands: [{ lo: .58, hi: .72, s: 1 - .07 * I * dip }], rot: -2.2 * I * dip, ty: 4 * I * dip, waves: [{ amp: 6 * I, pow: 1.3, k: .4, ph: TAU * t / 3.9 }] }; },
    idle: t => ({
      bands: [{ lo: .42, hi: .78, s: 1 + .011 * Math.sin(TAU * t / 3.4) }],
      xbands: [{ lo: .35, hi: .75, s: 1 + .005 * Math.sin(TAU * t / 3.4) }],
      waves: [{ amp: 7, pow: 1.4, k: .5, ph: TAU * t / 4.7 }],
      rot: .5 * Math.sin(TAU * t / 7.3),
    }),
    sway: (t, I, o) => { const T = (o && o.T) || 1.5, w = TAU * t / T; return {
      waves: [{ amp: 30 * I, pow: 1.5, k: .7, ph: w }], rot: -1.1 * I * Math.sin(w), ty: -4 * I * Math.abs(Math.sin(w)),
      bands: [{ lo: .42, hi: .78, s: 1 + .008 * Math.sin(TAU * t / 3.1) }] }; },
    bob: (t, I) => { const s = Math.pow(Math.abs(Math.sin(Math.PI * t / .55)), 1.6); return { ty: -34 * I * s, sy: 1 - .02 * I * (1 - s), sx: 1 + .014 * I * (1 - s) }; },
    hop: (t, I) => { const T = .78, p = (t % T) / T; let ty = 0, sy = 1;
      if (p < .5) ty = -78 * I * Math.sin(Math.PI * p / .5); else if (p < .7) sy = 1 - .06 * I * Math.sin(Math.PI * (p - .5) / .2); else if (p > .9) sy = 1 - .03 * I * Math.sin(Math.PI * (p - .9) / .1);
      return { ty, sy, sx: 1 + (1 - sy) * .8 }; },
    nod: (t, I) => { const s = Math.max(0, Math.sin(TAU * t / .7)); return { bands: [{ lo: .58, hi: .72, s: 1 - .09 * I * s }], rot: .8 * I * s }; },
    shake: (t, I) => ({ waves: [{ amp: 16 * I, pow: 2.2, k: 0, ph: TAU * 4 * t }] }),
    tremble: (t, I) => ({ tx: 4 * I * Math.sin(TAU * 14 * t), waves: [{ amp: 6 * I, pow: 1, k: 2, ph: TAU * 11 * t }], bands: [{ lo: .5, hi: .8, s: 1 + .006 * Math.sin(TAU * 3 * t) }] }),
    wobble: (t, I) => ({ waves: [{ amp: 22 * I, pow: 1.2, k: 5, ph: TAU * 1.8 * t }], rot: 2 * I * Math.sin(TAU * t / 1.3) }),
    rock: (t, I, o) => ({ rot: ((o && o.deg) || 6) * I * Math.sin(TAU * t / ((o && o.T) || 1.4)) }),
    pendulum: (t, I, o) => ({ rot: ((o && o.deg) || 5) * I * Math.sin(TAU * t / ((o && o.T) || 2.4)), pivot: (o && o.pivot != null) ? o.pivot : 0 }),
    float: (t, I) => ({ ty: -30 * I * Math.sin(TAU * t / 2.6), rot: 1.5 * I * Math.sin(TAU * t / 3.1 + 1), waves: [{ amp: 8 * I, pow: 1.3, k: .6, ph: TAU * t / 2.2 }] }),
    dance: (t, I) => { const w = TAU * t / .55; return { rot: 6 * I * Math.sin(w), ty: -30 * I * Math.abs(Math.sin(w)), waves: [{ amp: 14 * I, pow: 1.5, k: .8, ph: w + 1.2 }] }; },
    munch: (t, I) => { const s = Math.max(0, Math.sin(TAU * t / .46)); return { bands: [{ lo: .56, hi: .72, s: 1 - .055 * I * s }], ty: -6 * I * Math.abs(Math.sin(TAU * t / .92)), rot: .5 * I * Math.sin(TAU * t / 2.9) }; },
    type: (t, I) => ({ ty: 4 * I * Math.sin(TAU * 6 * t), waves: [{ amp: -8, pow: 1.3, k: 0, ph: Math.PI / 2 }], bands: [{ lo: .58, hi: .72, s: 1 - .02 * I * Math.max(0, Math.sin(TAU * t / 1.9)) }] }),
    think: (t, I) => ({ rot: -1.5 + 2.2 * I * Math.sin(TAU * t / 3.4), waves: [{ amp: 10 * I, pow: 1.6, k: .3, ph: TAU * t / 2.7 }], bands: [{ lo: .42, hi: .78, s: 1 + .009 * Math.sin(TAU * t / 3.2) }] }),
    talk: (t, I) => ({ bands: [{ lo: .6, hi: .72, s: 1 - .035 * I * Math.max(0, Math.sin(TAU * t / .5)) }], ty: -6 * I * Math.abs(Math.sin(TAU * t / 1.0)), waves: [{ amp: 8 * I, pow: 1.5, k: .5, ph: TAU * t / 1.7 }] }),
    breathe: (t, I) => ({ bands: [{ lo: .3, hi: .78, s: 1 + .016 * I * Math.sin(TAU * t / 4.2) }], xbands: [{ lo: .25, hi: .7, s: 1 + .006 * I * Math.sin(TAU * t / 4.2) }] }),
    lie: (t, I) => ({ sy: 1 + .012 * I * Math.sin(TAU * t / 4.0), sx: 1 + .004 * I * Math.sin(TAU * t / 4.0) }),
    huff: (t, I) => ({ ty: -5 * I * Math.sin(TAU * t / .7), xbands: [{ lo: .4, hi: .75, s: 1 + .012 * I * Math.max(0, Math.sin(TAU * t / .7)) }] }),
    sulk: (t, I) => ({ rot: 1 + 1 * I * Math.sin(TAU * t / 2.4), waves: [{ amp: -12, pow: 1.6, k: 0, ph: Math.PI / 2 }], ty: 3 * Math.sin(TAU * t / 2.4) }),
    walk: (t, I, o) => { const d = (o && o.dir) || 1, w = TAU * t / .33; return { ty: -14 * I * Math.abs(Math.sin(w)), rot: 1.3 * I * Math.sin(w), waves: [{ amp: 14 * d, pow: 1.4, k: 0, ph: Math.PI / 2 }] }; },
    dangle: (t, I) => ({ rot: 5 * I * Math.sin(TAU * t / .9), pivot: 60, waves: [{ amp: 10 * I, pow: 1, k: 1.2, ph: TAU * t / .9 + 1 }] }),
    spin: t => ({ ty: -6 * Math.abs(Math.sin(TAU * t / .24)), xbands: [{ lo: 0, hi: .5, s: 1 + .04 * Math.sin(TAU * t / .48) }] }),
    sparkle: (t, I) => ({ ty: -10 * I * Math.abs(Math.sin(TAU * t / .9)), waves: [{ amp: 14 * I, pow: 1.5, k: .6, ph: TAU * t / 1.6 }], rot: .8 * I * Math.sin(TAU * t / 1.6) }),
    lookup: (t, I) => ({ bands: [{ lo: .58, hi: .72, s: 1 + .05 * I * (.6 + .4 * Math.sin(TAU * t / 3.5)) }], rot: -1.2 * I, waves: [{ amp: 6 * I, pow: 1.4, k: .5, ph: TAU * t / 4 }] }),
    bowing: (t, I) => ({ waves: [{ amp: 26 * I, pow: 1.3, k: .4, ph: TAU * t / 1.15 }], bands: [{ lo: .58, hi: .72, s: 1 - .03 * I * Math.max(0, Math.sin(TAU * t / 1.15 + 1)) }] }),
    kick: (t, I) => { const T = 1.1, p = (t % T) / T; return { ty: p < .35 ? -40 * I * Math.sin(Math.PI * p / .35) : 0, rot: 2.5 * I * Math.sin(TAU * p), sy: p > .35 && p < .5 ? 1 - .04 * I * Math.sin(Math.PI * (p - .35) / .15) : 1 }; },
    juggle: (t, I) => ({ ty: -8 * I * Math.abs(Math.sin(TAU * t / .62)), waves: [{ amp: 12 * I, pow: 1.3, k: .3, ph: TAU * t / 1.24 }], bands: [{ lo: .58, hi: .72, s: 1 + .03 * I * Math.sin(TAU * t / 1.24) }] }),
  };

  const SHOTS = {  // 一次性小动作：(p, I, dur) ，p 0→1
    jump:   { dur: 700, f: (p, I) => { let sy = 1; if (p < .15) sy = 1 - .06 * I * Math.sin(Math.PI * p / .15); else if (p > .85) sy = 1 - .05 * I * Math.sin(Math.PI * (p - .85) / .15); return { ty: -110 * I * (p >= .15 && p <= .85 ? Math.sin(Math.PI * (p - .15) / .7) : 0), sy, sx: 1 + (1 - sy) * .8 }; } },
    hop:    { dur: 760, f: (p, I) => ({ ty: -44 * I * Math.abs(Math.sin(TAU * p)), sy: 1 - .02 * I * Math.abs(Math.cos(TAU * p)) }) },
    wiggle: { dur: 720, f: (p, I) => ({ rot: 3.2 * I * Math.sin(TAU * 4 * p) * env(p) }) },
    shake:  { dur: 720, f: (p, I) => ({ tx: 5 * I * Math.sin(TAU * 8 * p), waves: [{ amp: 8 * I, pow: 1.5, k: 0, ph: TAU * 8 * p + 1 }] }) },
    bounce: { dur: 1300, f: (p, I) => { const s = Math.abs(Math.sin(TAU * 3 * p)); return { sy: 1 - .035 * I * s, sx: 1 + .025 * I * s }; } },
    sway:   { dur: 1800, f: (p, I) => ({ waves: [{ amp: 26 * I * env(p), pow: 1.5, k: .7, ph: TAU * 1.1 * p * 1.8 }], rot: -1.2 * I * Math.sin(TAU * 2 * p) * env(p) }) },
    dance:  { dur: 2000, f: (p, I) => { const w = TAU * 4 * p; return { rot: 6 * I * Math.sin(w) * env(p), ty: -30 * I * Math.abs(Math.sin(w)) * env(p), waves: [{ amp: 14 * I * env(p), pow: 1.5, k: .8, ph: w + 1.2 }] }; } },
    stretch:{ dur: 1200, f: (p, I) => ({ sy: 1 + .05 * I * env(p), sx: 1 - .015 * I * env(p), rot: 1.5 * I * env(p), bands: [{ lo: .55, hi: .8, s: 1 + .03 * I * env(p) }] }) },
    pat:    { dur: 1140, f: (p, I) => ({ bands: [{ lo: .6, hi: .75, s: 1 - .07 * I * Math.max(0, Math.sin(TAU * 3.5 * p)) }], ty: 2 * I * Math.max(0, Math.sin(TAU * 3.5 * p)) }) },
    tilt:   { dur: 1200, f: (p, I) => ({ rot: -5 * I * smooth(0, .25, p) * (1 - smooth(.7, 1, p)), waves: [{ amp: 10 * I * smooth(0, .3, p) * (1 - smooth(.7, 1, p)), pow: 2, k: 0, ph: Math.PI / 2 }] }) },
    nod:    { dur: 1060, f: (p, I) => ({ bands: [{ lo: .6, hi: .72, s: 1 - .08 * I * Math.max(0, Math.sin(TAU * 3 * p)) }] }) },
    sneeze: { dur: 720, f: (p, I) => p < .45 ? { rot: -4 * I * Math.sin(Math.PI * p / .9), bands: [{ lo: .58, hi: .72, s: 1 + .04 * I * Math.sin(Math.PI * p / .9) }] } : { rot: 3 * I * Math.sin(Math.PI * (p - .45) / .55), bands: [{ lo: .58, hi: .72, s: 1 - .06 * I * Math.sin(Math.PI * (p - .45) / .55) }], ty: -10 * I * Math.sin(Math.PI * (p - .45) / .55) } },
    throw:  { dur: 460, f: (p, I) => ({ rot: p < .35 ? -5 * I * Math.sin(Math.PI * p / .7) : 3 * I * Math.sin(Math.PI * (p - .35) / .65), tx: p < .35 ? -20 * I * Math.sin(Math.PI * p / .7) : 0 }) },
    thud:   { dur: 520, f: (p, I) => p < .4 ? { ty: -60 * I * (1 - p / .4) } : { sy: 1 - .06 * I * Math.sin(Math.PI * (p - .4) / .6), sx: 1 + .04 * I * Math.sin(Math.PI * (p - .4) / .6) } },
    startle:{ dur: 620, f: (p, I) => { const a = Math.sin(Math.PI * Math.min(1, p / .7)); return { ty: -130 * I * a, sy: 1 + .05 * I * a, sx: 1 - .04 * I * a, waves: [{ amp: 10 * I * (1 - p), pow: 1, k: 3, ph: TAU * 12 * p }] }; } },
    typing: { dur: 1140, f: (p, I) => ({ ty: 6 * I * Math.sin(TAU * 8 * p) }) },
    pop:    { dur: 340, f: (p, I) => { const s = Math.sin(TAU * p); return { sy: 1 - .055 * I * s, sx: 1 + .04 * I * s }; } },
    settle: { dur: 420, f: (p, I) => { const s = Math.sin(Math.PI * p) * (1 - p); return { sy: 1 - .03 * I * s, sx: 1 + .02 * I * s }; } },
    peek:   { dur: 1500, f: (p, I) => { const e = smooth(0, .2, p) * (1 - smooth(.75, 1, p)); return { waves: [{ amp: 18 * I * e, pow: 1.8, k: 0, ph: Math.PI / 2 }], rot: -2 * I * e, bands: [{ lo: .58, hi: .72, s: 1 + .02 * I * e }] }; } },
    shift:  { dur: 1800, f: (p, I) => { const e = smooth(0, .3, p) * (1 - smooth(.6, 1, p)); return { rot: 1.4 * I * e, waves: [{ amp: -10 * I * e, pow: 1.3, k: 0, ph: Math.PI / 2 }], bands: [{ lo: 0, hi: .3, s: 1 - .012 * I * e }] }; } },
    yawn:   { dur: 1600, f: (p, I) => { const e = env(p); return { sy: 1 + .03 * I * e, bands: [{ lo: .58, hi: .72, s: 1 + .04 * I * e }], rot: -1.5 * I * e }; } },
    recoil: { dur: 120, f: (p, I) => ({ tx: -6 * I * Math.sin(Math.PI * p), rot: -.8 * I * Math.sin(Math.PI * p) }) },
  };

  function create(opts){
    const { canvas, W, H, feetY, cx, body } = opts;
    const mctx = canvas.getContext('2d', { alpha: true });
    const N = opts.strips || 56;
    const stripH = H / N;
    const UM = new Float32Array(N);             // 每条中心的 u（0 脚底，1 当前画面的最高点：坐着 / 趴着时头顶也算 1，这样"脖子"那一段的位置才对）
    let bodyNow = body;
    function setBody(h){ bodyNow = Math.max(body * .35, h || body); for (let i = 0; i < N; i++) UM[i] = (feetY - (i + .5) * stripH) / bodyNow; }
    setBody(body);
    const feetStrip = clamp(Math.floor(feetY / stripH), 0, N - 1);

    let cur = null, prev = null, fadeAt = 0, fadeMs = 160;
    let loop = { name: 'idle', fn: LOOPS.idle, o: null, t0: performance.now() };
    let shots = [];
    let I = 1, fpsCap = 0, running = false, paused = false, flipX = false;
    let blink = null, blinkOn = false;
    let onFrame = null, lastDraw = 0, k = 1, cw = 0, ch = 0, dpr = 1, need = true, extra = null;

    function resize(){
      const r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.min(1500, Math.round(r.width * dpr)), h = Math.round(w * H / W);
      if (w !== cw || h !== ch){ cw = w; ch = h; canvas.width = w; canvas.height = h; k = w / W; need = true; }
    }
    if (window.ResizeObserver) new ResizeObserver(() => { resize(); need = true; }).observe(canvas);

    // 把多个程序的参数叠加
    const sDX = new Float32Array(N), sSY = new Float32Array(N), sSX = new Float32Array(N);
    function compose(ts){
      const t = (ts - loop.t0) / 1000;
      const parts = [];
      if (I > 0){
        parts.push(loop.fn(t, I, loop.o) || {});
        shots = shots.filter(s => ts - s.t0 < s.dur);
        for (const s of shots) parts.push(s.f((ts - s.t0) / s.dur, I * (s.I || 1)) || {});
      }
      if (extra) parts.push(extra);
      let tx = 0, ty = 0, rot = 0, sx = 1, sy = 1, pivot = null;
      sDX.fill(0); sSY.fill(1); sSX.fill(1);
      for (const p of parts){
        tx += p.tx || 0; ty += p.ty || 0; rot += p.rot || 0; if (p.sx) sx *= p.sx; if (p.sy) sy *= p.sy; if (p.pivot != null) pivot = p.pivot;
        if (p.waves) for (const w of p.waves){ const pw = w.pow == null ? 1.5 : w.pow, kk = w.k || 0, ph = w.ph || 0; for (let i = 0; i < N; i++){ const u = UM[i]; if (u <= 0) continue; sDX[i] += w.amp * Math.pow(u, pw) * Math.sin(ph - kk * u); } }
        if (p.bands) for (const b of p.bands){ const m = (b.lo + b.hi) / 2, hw = (b.hi - b.lo) / 2; for (let i = 0; i < N; i++){ const u = UM[i]; const e = 1 - smooth(0, hw, Math.abs(u - m)); if (e > 0) sSY[i] *= 1 + (b.s - 1) * e; } }
        if (p.xbands) for (const b of p.xbands){ const m = (b.lo + b.hi) / 2, hw = (b.hi - b.lo) / 2; for (let i = 0; i < N; i++){ const u = UM[i]; const e = 1 - smooth(0, hw, Math.abs(u - m)); if (e > 0) sSX[i] *= 1 + (b.s - 1) * e; } }
      }
      return { tx, ty, rot, sx, sy, pivot };
    }

    // 每条的目标纵坐标（以脚底为锚，向上累加）
    const DY = new Float32Array(N + 1);
    function layout(){
      DY[feetStrip + 1] = (feetStrip + 1) * stripH;  // 脚底那条的下边界不动
      for (let i = feetStrip; i >= 0; i--) DY[i] = DY[i + 1] - stripH * sSY[i];
      for (let i = feetStrip + 1; i < N; i++) DY[i + 1] = DY[i] + stripH * sSY[i];
    }

    // 半透明（淡入淡出）时不能逐条带透明度画：条与条的重叠处会叠成深色横纹。先整张画到离屏画布，再整体按透明度合成。
    const off = document.createElement('canvas'); const octx = off.getContext('2d');
    let ctx = mctx;
    function drawWarped(img, sx0, sy0, sw, sh, dx0, dy0, dw, dh, alpha){
      if (!img || !img.complete || !img.naturalWidth) return;
      if (alpha < 1){
        if (off.width !== cw || off.height !== ch){ off.width = cw; off.height = ch; }
        octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, cw, ch); octx.setTransform(mctx.getTransform()); octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'medium';
        ctx = octx; drawWarped(img, sx0, sy0, sw, sh, dx0, dy0, dw, dh, 1); ctx = mctx;
        const tr = mctx.getTransform(); mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.globalAlpha = alpha; mctx.drawImage(off, 0, 0); mctx.globalAlpha = 1; mctx.setTransform(tr);
        return;
      }
      // 图 img 的 (sx0,sy0,sw,sh) 贴到画布坐标矩形 (dx0,dy0,dw,dh)，按条变形
      ctx.globalAlpha = 1;
      const b0 = clamp(Math.floor(dy0 / stripH), 0, N - 1), b1 = clamp(Math.ceil((dy0 + dh) / stripH), 1, N);
      const scaleY = sh / dh, scaleX = sw / dw;
      for (let i = b0; i < b1; i++){
        const y0 = Math.max(dy0, i * stripH), y1 = Math.min(dy0 + dh, (i + 1) * stripH); if (y1 <= y0) continue;
        const ssy = sy0 + (y0 - dy0) * scaleY, ssh = (y1 - y0) * scaleY;
        const f0 = (y0 - i * stripH) / stripH, f1 = (y1 - i * stripH) / stripH;   // 本条内的比例
        const Y0 = DY[i] + (DY[i + 1] - DY[i]) * f0, Y1 = DY[i] + (DY[i + 1] - DY[i]) * f1;
        const sxi = sSX[i], X0 = cx + sDX[i] + (dx0 - cx) * sxi, DW = dw * sxi;
        const ov = i + 1 < b1 ? Math.min(stripH, Math.ceil(1.5 / k) + 1) : 0;   // 条与条之间重叠 ≥1.5 个设备像素，避免接缝
        const ovS = Math.min(ov, (sy0 + sh) - (ssy + ssh));
        ctx.drawImage(img, sx0, ssy, sw, ssh + ovS * scaleY, X0, Y0, DW, (Y1 - Y0) + ovS * (Y1 - Y0) / Math.max(1e-3, y1 - y0));
      }
    }

    function frame(ts){
      if (!running) return;
      requestAnimationFrame(frame);
      if (paused || !cur) return;
      if (fpsCap && ts - lastDraw < 1000 / fpsCap - 1) return;
      lastDraw = ts;
      if (!cw) resize(); if (!cw) return;
      const fadingNow = prev && ts - fadeAt < fadeMs;
      if (I <= 0 && !fadingNow && !need && !extra) return;   // 动效关闭时只在画面变化时重画
      need = false;
      const g = compose(ts); layout();
      mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, cw, ch);
      mctx.imageSmoothingEnabled = true; mctx.imageSmoothingQuality = 'medium';
      const py = g.pivot == null ? feetY : g.pivot;
      mctx.setTransform(k, 0, 0, k, 0, 0);
      mctx.translate(cx + g.tx, py + g.ty); mctx.rotate(g.rot * Math.PI / 180); mctx.translate(-cx, -py);
      if (g.sx !== 1 || g.sy !== 1){ mctx.translate(cx, feetY); mctx.scale(g.sx, g.sy); mctx.translate(-cx, -feetY); }
      const fading = prev && ts - fadeAt < fadeMs;
      const a = fading ? (ts - fadeAt) / fadeMs : 1;
      if (fading) drawWarped(prev, 0, 0, prev.naturalWidth || W, prev.naturalHeight || H, 0, 0, W, H, 1 - a);
      else prev = null;
      drawWarped(cur, 0, 0, cur.naturalWidth || W, cur.naturalHeight || H, 0, 0, W, H, a);
      if (blink && blinkOn && blink.img.complete) drawWarped(blink.img, 0, 0, blink.img.naturalWidth, blink.img.naturalHeight, blink.x, blink.y, blink.w, blink.h, 1);
      mctx.globalAlpha = 1;
      if (onFrame){
        // 头部（u≈.8）的位移，给 SVG 叠加层用
        let i = 0; for (; i < N; i++) if (UM[i] <= .8) break; i = clamp(i, 0, N - 1);
        const headDy = (DY[i] + DY[i + 1]) / 2 - (i + .5) * stripH;
        onFrame({ tx: g.tx, ty: g.ty, rot: g.rot, sx: g.sx, sy: g.sy, pivot: py, hx: sDX[i], hy: headDy, hsx: sSX[i] });
      }
    }

    const api = {
      start(){ if (running) return; running = true; resize(); requestAnimationFrame(frame); },
      stop(){ running = false; },
      setPaused(v){ paused = !!v; },
      setFrame(img, hard, top){ if (img === cur) return; if (cur && !hard && I > 0) { prev = cur; fadeAt = performance.now(); } else prev = null; cur = img; need = true; setBody(top == null ? body : feetY - top); },
      current(){ return cur; },
      setBlink(img, rect){ blink = img && rect ? { img, x: rect[0], y: rect[1], w: rect[2], h: rect[3] } : null; },
      blink(on){ if (blinkOn !== !!on) need = true; blinkOn = !!on; },
      loop(name, o){ const fn = typeof name === 'function' ? name : LOOPS[name] || LOOPS.idle; if (loop.fn === fn && JSON.stringify(loop.o || null) === JSON.stringify(o || null)) return; loop = { name, fn, o: o || null, t0: performance.now() }; },
      loopName(){ return loop.name; },
      shot(name, mult){ const s = SHOTS[name]; if (!s || I <= 0) return 0; shots.push({ ...s, t0: performance.now(), I: mult || 1 }); return s.dur; },
      clearShots(){ shots = []; },
      setExtra(p){ extra = p; },
      setIntensity(v){ I = Math.max(0, +v || 0); need = true; },
      setFps(v){ fpsCap = v || 0; },
      setFadeMs(ms){ fadeMs = ms; },
      onFrame(fn){ onFrame = fn; },
      resize,
      LOOPS, SHOTS,
      shotDur(name){ return (SHOTS[name] || {}).dur || 0; },
    };
    return api;
  }
  window.XKMotion = { create };
})();
