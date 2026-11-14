// 小克桌宠 3.0 — 渲染层（桌宠窗口）。
// 结构：先按 ?pack= 加载人物包（layout / masks / poses / lines / persona），再读本机存储（设置 / 资料 / 记忆 / 聊天记录），然后启动引擎。
// 引擎：帧与轮廓 → 位置与大小 → 气泡与面板 → 特效 → 天气与时间背景 → 动作链（随机 / 时节 / 体力）→ 转向漫游 → 拖拽甩抛物理与积分
//       → 冷落掏枪 / 转圈摔倒 / 扔东西 → 点击部位反应 → 面板（聊天 / 互动 / 动作 / 设置）→ 聊天（流式、情绪标签、记忆确认）
//       → 碎碎念与主动陪伴（三档 + 免打扰时段）→ 工作状态（代理事件）→ token 账本 → 邻居蓝毛 → 本地接口 → 首次见面向导
(async () => {
  const $ = s => document.querySelector(s);
  const packId = new URLSearchParams(location.search).get('pack') || 'xiaoke';
  const loadScript = f => new Promise((res, rej) => { const s = document.createElement('script'); s.src = `packs/${packId}/${f}`; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  try { for (const f of ['layout.js', 'masks.js', 'poses.js', 'lines.js', 'persona.js']) await loadScript(f); }
  catch (e) { console.error('人物包加载失败', packId, e); if (packId !== 'xiaoke') { location.search = '?pack=xiaoke'; return; } }
  const P0 = window.pet;
  const [S0, PF0, MEM0, HIST0, CFG0, CUR0] = await Promise.all([P0.store.get('settings'), P0.store.get('profile'), P0.store.get('memory'), P0.store.get('history'), P0.config.get(), P0.llm.current()]).catch(() => [null, null, null, null, null, null]);

  /* ================= 基础工具 ================= */
  const now = () => Date.now();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = () => Math.random().toString(36).slice(2, 10);
  function bag(list){ let pool = []; let last = null; return () => { if (!pool.length){ pool = list.slice().sort(() => Math.random() - .5); if (pool[0] === last && pool.length > 1) pool.push(pool.shift()); } last = pool.shift(); return last; }; }
  const store = { get(k, d){ try { const v = localStorage.getItem('xk.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
                  set(k, v){ try { localStorage.setItem('xk.' + k, JSON.stringify(v)); } catch {} } };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pet = $('#pet'), sq = $('#sq'), framesEl = $('#frames'), ov = $('#ov'), bubble = $('#bubble'), menu = $('#menu'), inter = $('#inter'), acts = $('#acts'), chat = $('#chat'), tip = $('#tip'), wizard = $('#wizard');
  const L = window.PACK_LAYOUT, P = L.points || {}, W = L.W, H = L.H, BODY = L.body || H, CX = L.cx || W / 2;
  const POSES = window.PACK_POSES || {}, CATS = window.PACK_CATS || [], EMO = window.PACK_EMOTIONS || {}, MEMES = window.PACK_MEMES || {}, PERSONA = window.PACK_PERSONA || { name: '桌宠' };
  const LN = window.PACK_MECH || {}, PARTS = window.PACK_PARTS || {}, ACT_LINES = window.PACK_ACT_LINES || {};
  const PH = window.PHYS, TC = window.TIMECTX;
  const NS = 'http://www.w3.org/2000/svg';
  const NAME = PERSONA.name || '小克';
  document.title = NAME; pet.setAttribute('aria-label', '桌宠' + NAME); tip.textContent = NAME; $('#chatName').textContent = NAME;

  /* ================= 设置 / 资料 / 记忆（主进程文件） ================= */
  let S = S0 || {}, PF = PF0 || {}, MEM = MEM0 || { enabled: true, items: [] }, CFG = CFG0 || { provider: 'claude', providers: {} }, CUR = CUR0 || { provider: 'claude', name: '', model: '', hasKey: false };
  S.physics = PH.sanitize(S.physics || PH.DEFAULT_PHYSICS);
  const setS = patch => { Object.assign(S, patch); P0.store.patch('settings', patch).catch(() => {}); };
  const setPF = patch => { Object.assign(PF, patch); P0.store.patch('profile', patch).catch(() => {}); };
  const saveMem = () => P0.store.set('memory', MEM).catch(() => {});
  const fmt = s => String(s || '').replace(/\{city\}/g, PF.city || '这边').replace(/\{name\}/g, PF.address || PF.name || '你');
  const userLabel = () => PF.address || PF.name || '';
  // 用户时区的墙上时间（资料里填了时区就按它算，没填按系统）
  const tzOk = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
  let tzFmt = null;
  function nowLocal(){
    const tz = PF.timezone; if (!tz || !tzOk(tz)) return new Date();
    if (!tzFmt || tzFmt.resolvedOptions().timeZone !== tz) tzFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const o = {}; for (const p of tzFmt.formatToParts(new Date())) o[p.type] = p.value;
    return new Date(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second);
  }
  const hourNow = () => nowLocal().getHours();
  const dayKey = () => { const d = nowLocal(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const hhmm = () => { const d = nowLocal(); return d.getHours() * 60 + d.getMinutes(); };
  const parseHM = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  function quietNow(){ const q = S.quietHours || {}; if (!q.on) return false; const a = parseHM(q.from), b = parseHM(q.to); if (a == null || b == null) return false; const t = hhmm(); return a <= b ? (t >= a && t < b) : (t >= a || t < b); }
  const LEVELS = { quiet: { whisperMin: 30, whisperP: .35, idleP: .08, restEvery: 90, meals: false, greetWeather: true, talkP: .15 }, normal: { whisperMin: 10, whisperP: .5, idleP: .3, restEvery: 60, meals: true, greetWeather: true, talkP: .35 }, lively: { whisperMin: 4, whisperP: .7, idleP: .5, restEvery: 45, meals: true, greetWeather: true, talkP: .5 } };
  const LV = () => LEVELS[S.companion] || LEVELS.normal;
  const whisperMinutes = () => (+S.whisperMin > 0 ? +S.whisperMin : LV().whisperMin);
  const dnd = () => !!S.dnd;

  /* ================= 帧（画布 + 动效引擎） ================= */
  pet.style.setProperty('--ar', W + '/' + H);
  ov.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const IMG = {}, HAVE = new Set(L.frames);
  for (const name of L.frames){ const im = new Image(); im.decoding = 'async'; im.src = `packs/${packId}/img/${name}.webp`; IMG[name] = im; }
  const IDLE = HAVE.has('normal') ? 'normal' : L.frames[0];
  let frame = IDLE;
  // 动效引擎：所有画面都经它绘制；非序列切换 160ms 淡入淡出，序列（走路 / 转圈）硬切
  const M = window.XKMotion.create({ canvas: $('#stage'), W, H, feetY: L.feet || L.feetY || (H - 9), cx: CX, body: BODY });
  const MOTION_LEVEL = { full: [1, 0], light: [.6, 30], off: [0, 0] };
  function applyMotionLevel(){ const [I, fps] = MOTION_LEVEL[S.motion] || MOTION_LEVEL.full; M.setIntensity(reduced ? 0 : I); M.setFps(fps); }
  applyMotionLevel();
  function setFrame(name, opts = {}){
    if (!IMG[name]) name = IDLE;
    if (frame === name && M.current() === IMG[name]) return;
    M.setFrame(IMG[name], !!opts.hard, (L.bbox[name] || [0, 0])[1]);
    frame = name; updateBlink();
  }
  M.setFrame(IMG[IDLE], true); M.start(); window.__xkMotion = M;
  document.addEventListener('visibilitychange', () => M.setPaused(document.hidden));
  const EVD = window.PACK_EVENTS || {};
  const EV = {};
  for (const [k, v] of Object.entries(EVD)){ const real = v.frames.filter(f => HAVE.has(f)); const fb = (v.fallback || []).filter(f => HAVE.has(f)); EV[k] = { frames: real.length ? real : (fb.length ? fb : [IDLE]), real: real.length === v.frames.length }; }
  const evFrame = (k, i = 0) => { const a = (EV[k] || { frames: [IDLE] }).frames; return a[Math.min(i, a.length - 1)] || a[0]; };

  const MASK = {};
  for (const [k, m] of Object.entries(window.PACK_MASKS || {})){ const bin = atob(m.d), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); MASK[k] = { w: m.w, h: m.h, s: m.s, bits: arr }; }
  const petBox = () => pet.getBoundingClientRect();
  const flipped = () => pet.classList.contains('flip');
  function solidAt(cx, cy){
    const r = petBox(); if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return false;
    let x = (cx - r.left) / r.width * W, y = (cy - r.top) / r.height * H;
    if (flipped()) x = W - x;
    { const u = clamp(((L.feet || H) - y) / BODY / .8, 0, 1); x -= lastG.tx + lastG.hx * Math.pow(u, 1.5); y -= lastG.ty + lastG.hy * u; }
    const m = MASK[frame] || MASK[IDLE]; if (!m) return true; const mx = Math.floor(x / m.s), my = Math.floor(y / m.s);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const X = mx + dx, Y = my + dy; if (X < 0 || Y < 0 || X >= m.w || Y >= m.h) continue; const i = Y * m.w + X; if (m.bits[i >> 3] & (1 << (i & 7))) return true; }
    return false;
  }
  const toLocal = (cx, cy) => { const r = petBox(); let x = (cx - r.left) / r.width * W; if (flipped()) x = W - x; return [x, (cy - r.top) / r.height * H]; };
  const toScreen = (x, y) => { const r = petBox(); if (flipped()) x = W - x; return { x: r.left + x / W * r.width, y: r.top + y / H * r.height }; };

  /* ================= 叠加层（脸红 / 怒 / 汗 / 泪 / 星星…） ================= */
  function el(tag, attrs, parent){ const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; }
  const A = P.A || { cheekL: [CX - 120, H * .6], cheekR: [CX + 80, H * .6], cheekR2: 40, anger: [CX - 160, H * .5], sweat: [CX + 150, H * .5], tearL: [CX - 90, H * .58], tearR: [CX + 50, H * .58], head: [CX, H * .37], mouth: [CX, H * .6], flower: [CX + 170, H * .38] };
  if (P.blink){ const bi = new Image(); bi.src = `packs/${packId}/img/blink.webp`; M.setBlink(bi, P.blink); }
  function updateBlink(){ M.blink(!!(P.blink && frame === IDLE && pet.dataset.blink === '1')); }
  // 叠加层（脸红 / 汗 / 怒）跟着头部的形变走；命中测试也扣掉当前位移
  let lastG = { tx: 0, ty: 0, rot: 0, sx: 1, sy: 1, hx: 0, hy: 0 };
  M.onFrame(g => {
    lastG = g;
    const fl = pet.classList.contains('flip') ? ' scaleX(-1)' : '';
    ov.style.transform = `translate(${(g.tx + g.hx) / W * 100}%, ${(g.ty + g.hy) / H * 100}%) rotate(${g.rot}deg) scale(${g.sx}, ${g.sy})` + fl;
  });
  function placeFaceOverlays(F){
    const blush = $('#ovBlush'); blush.textContent = '';
    for (const c of [F.cheekL, F.cheekR]) el('ellipse', { cx: c[0], cy: c[1], rx: F.cheekR2 || 40, ry: (F.cheekR2 || 40) * .42, fill: '#ff8f7e', opacity: .5, filter: 'url(#soft)' }, blush);
    $('#ovAnger').setAttribute('transform', `translate(${F.anger[0]} ${F.anger[1]})`);
    $('#ovSweat').setAttribute('transform', `translate(${F.sweat[0]} ${F.sweat[1]})`);
    const t = $('#ovTears'); t.textContent = '';
    for (const c of [F.tearL, F.tearR]) el('path', { transform: `translate(${c[0]} ${c[1]})`, d: 'M0 0 Q-11 18 0 26 Q11 18 0 0Z' }, t);
    $('#ovStars').setAttribute('transform', `translate(${F.head[0]} ${F.head[1]})`);
    $('#ovFire').setAttribute('transform', `translate(${F.mouth[0]} ${F.mouth[1] + 10})`);
    $('#ovSpicy').setAttribute('transform', `translate(${F.mouth[0] + 120} ${F.mouth[1] - 60})`);
  }
  placeFaceOverlays(A);
  if (P.ramen){
    const st = $('#ovSteam'); for (const [x, y] of P.ramen.steam) el('path', { class: 'steam', d: `M${x} ${y} q-11 -18 0 -36 q11 -18 0 -36` }, st);
    const sn = $('#ovStain'); P.ramen.stains.forEach(([x, y, r], i) => el('ellipse', { cx: x, cy: y, rx: r, ry: r * .75, fill: '#b8692c', opacity: .55, style: `animation-delay:${i * 60}ms` }, sn));
  }
  if (P.badminton) $('#ovShuttle').setAttribute('transform', `translate(${P.badminton.shuttle[0]} ${P.badminton.shuttle[1]})`);
  if (P.sleep){ $('#ovSnot').setAttribute('cx', P.sleep.snot[0]); $('#ovSnot').setAttribute('cy', P.sleep.snot[1]); const z = $('#zzz'); z.style.left = (P.sleep.zzz[0] / W * 100) + '%'; z.style.top = (P.sleep.zzz[1] / H * 100) + '%'; }
  if (P.pistol){ $('#flash').setAttribute('transform', `translate(${P.pistol.muzzle[0]} ${P.pistol.muzzle[1]})`); $('#muzzle').setAttribute('cx', P.pistol.muzzle[0]); $('#muzzle').setAttribute('cy', P.pistol.muzzle[1]); }

  /* ================= 状态 ================= */
  let mode = 'idle';           // idle | read | ramen | badminton | sleep | gun | sulk | spin | fallen | throw | pose | walk | turn | drag | fly | work | event | chat
  let modeUntil = 0, modeStart = now(), lastAct = 'idle', nextRoll = now() + 4000;
  let lastInteract = now(), lastGun = 0, gunCount = 0, lastPointer = now();
  let energy = store.get('energy', 100);
  let faceTimer = null, animTimer = null, eventTimer = null;
  let eventFrame = null, workFrame = null, chatFrame = null;
  const has = f => HAVE.has(f);
  const BASE = { idle: IDLE, read: 'read', ramen: 'ramen', badminton: 'badminton', sleep: 'sleep', gun: 'pistol', sulk: 'back', fallen: 'faint', spin: 'spin0', throw: IDLE, drag: IDLE, fly: IDLE, walk: IDLE, turn: IDLE, chat: IDLE };
  const BASEX = { ramen: 'steam', badminton: 'shuttle', sleep: 'snot zzz' };
  function baseFrame(){
    if (mode === 'pose' && poseFrame) return poseFrame;
    if (mode === 'event' && eventFrame) return eventFrame;
    if (mode === 'work' && workFrame) return workFrame;
    if (mode === 'chat' && chatFrame) return chatFrame;
    if (mode === 'gun' && gunLeft && has('pistol_l')) return 'pistol_l';
    if (mode === 'drag') return evFrame('hang');
    if (mode === 'walk') return walkFrameNow();
    const f = BASE[mode] || IDLE; return has(f) ? f : IDLE;
  }
  function rest(){ setFrame(baseFrame()); pet.dataset.blush = mode === 'ramen' ? 'on' : ''; pet.dataset.x = (mode === 'work' && workState === 'thinking' && !EV.work.real) ? 'think' : (BASEX[mode] || ''); placeFaceOverlays(mode === 'ramen' && P.ramen ? P.ramen.face : A); }
  function expr(f, ms = 2000, blush = '', x = ''){
    clearTimeout(faceTimer); setFrame(has(f) ? f : IDLE); pet.dataset.blush = blush ? 'on' : ''; pet.dataset.x = x;
    placeFaceOverlays(f === 'ramen' && P.ramen ? P.ramen.face : A);
    if (ms) faceTimer = setTimeout(rest, ms);
  }
  function anim(name, mult){
    if (!name) return;
    if (name === 'glow'){ pet.classList.remove('a-glow'); void pet.offsetWidth; pet.classList.add('a-glow'); clearTimeout(animTimer); animTimer = setTimeout(() => pet.classList.remove('a-glow'), 1420); return; }
    M.shot(name, mult);
  }
  let poseId = null, poseFrame = null, poseTimer = null, fxTimer = null;
  /* ---- 动效选择：按当前模式 / 动作决定循环程序（motion.js） ---- */
  const CAT_LOOP = { daily: 'sway', play: 'sway', food: 'munch', season: 'sway', mood: 'sway', sleep: 'breathe', book: 'sparkle' };
  const LYING = new Set(window.PACK_LYING || ['faint', 'fall', 'm_sleep', 'm_tired', 'stargazing']);
  const EVENT_LOOP = { walk: 'walk', hang: 'dangle', fly: 'none', sitfall: 'tremble', scared: 'tremble', doze: 'doze', whisper: 'talk', token: 'sway', work: 'idle' };
  const FRAME_KIND = {}; for (const [k, v] of Object.entries(EVD)) for (const f of v.frames) FRAME_KIND[f] = k;
  const WORK_LOOP = { thinking: 'think', working: 'type', result: 'sway', waiting: 'lookup', success: 'bob', error: 'tremble' };
  function applyLoop(){
    let name = 'idle', o = null;
    if (mode === 'pose' && poseId){ const Pz = POSES[poseId] || {}; name = Pz.m || (Pz.sleepy ? 'breathe' : CAT_LOOP[Pz.cat]) || 'sway'; o = Pz.mo || null; }
    else if (mode === 'event'){ const kind = FRAME_KIND[eventFrame]; name = EVENT_LOOP[kind] || 'sway'; if (kind === 'work') name = WORK_LOOP[workState] || 'idle'; }
    else if (mode === 'work') name = WORK_LOOP[workState] || 'idle';
    else if (mode === 'chat'){ const kind = FRAME_KIND[chatFrame]; name = kind === 'work' ? 'think' : kind === 'whisper' ? 'talk' : chatFrame ? ((Object.values(EMO).find(e => e.f === chatFrame) || {}).m || 'sway') : 'idle'; }
    else if (mode === 'walk'){ name = 'walk'; o = { dir: -1 }; }
    else if (mode === 'drag') name = 'dangle';
    else if (mode === 'fly') name = 'none';
    else if (mode === 'spin') name = 'spin';
    else if (mode === 'fallen') name = 'lie';
    else if (mode === 'gun') name = 'huff';
    else if (mode === 'sulk') name = 'sulk';
    if (LYING.has(frame) && name !== 'none') name = 'lie';
    M.loop(name, o);
  }
  // 发呆时的小动作：换个重心、瞟一眼、点点头、伸个懒腰…让她站着也像活的
  const IDLE_SHOTS = ['shift', 'peek', 'settle', 'tilt', 'nod', 'shift', 'peek', 'yawn'];
  let nextMicro = now() + 5000;
  function microTick(){
    const t = now(); if (t < nextMicro) return;
    nextMicro = t + rnd(4500, 11000);
    if (mode === 'idle' && frame === IDLE && !drag){ const sh = pick(IDLE_SHOTS); if (sh === 'yawn' && (energy > 50 || hourNow() < 21)) return; anim(sh); if (sh === 'peek' && Math.random() < .3) expr('smile', 1400); }
    else if (mode === 'pose' && poseId && !LYING.has(frame) && Math.random() < .6){ const Pz = POSES[poseId] || {}; anim(pick(Pz.shots || ['nod', 'hop', 'tilt', 'bounce'])); }
  }
  setInterval(microTick, 500);
  function setMode(m, dur = 0){
    stopGun(); stopSpin(); stopWalk(false); stopThrow(); clearTimeout(poseTimer); clearTimeout(eventTimer); clearTimeout(ramenTimer);
    if (m !== 'pose'){ poseId = null; poseFrame = null; } if (m !== 'event') eventFrame = null; if (m !== 'chat') chatFrame = null;
    clearTimeout(faceTimer);
    if (mode === 'walk' && m !== 'walk') pet.classList.remove('flip');
    const wasMode = mode; mode = m; pet.dataset.mode = m; modeStart = now(); modeUntil = dur ? now() + dur : 0;
    if (!['idle', 'spin', 'fallen', 'throw', 'gun', 'sulk', 'pose', 'walk', 'turn', 'drag', 'fly', 'work', 'event', 'chat'].includes(m)) lastAct = m;
    if (m === 'idle') nextRoll = now() + rnd(2500, 6500);
    clearInterval(fxTimer); fxTimer = null;
    rest(); M.clearShots(); applyLoop(); hideTip();
    if (m === 'idle' && ['pose', 'event', 'chat', 'work', 'turn'].includes(wasMode)) anim('settle');
    if (m !== 'fly') setSq(1, 0);
  }
  const busyModes = () => ['drag', 'fly', 'gun', 'fallen', 'spin', 'throw'].includes(mode);

  (function blinkLoop(){ setTimeout(() => {
    const once = then => { if (frame !== IDLE) return then && then(); pet.dataset.blink = '1'; updateBlink(); setTimeout(() => { pet.dataset.blink = '0'; updateBlink(); then && then(); }, 120); };
    once(() => { if (Math.random() < .22) setTimeout(() => once(), 170); });
    blinkLoop();
  }, rnd(2400, 5600)); })();

  /* ================= 位置与大小 ================= */
  // size = 她站立时在屏幕上的身高（px）；元素高度按画布比例换算
  let sizeH = clamp(+S.size || 330, 170, 680);
  const elH = h => Math.round(h * H / BODY);
  function applySize(h, keepFeet = true, fromStore = false){
    const r = petBox(); const feetX = r.left + r.width / 2, feetY = r.bottom;
    sizeH = clamp(Math.round(h), 170, 680); pet.style.setProperty('--h', elH(sizeH) + 'px');
    if (!fromStore) setS({ size: sizeH });
    if (keepFeet && r.width){ const nr = petBox(); place(feetX - nr.width / 2, feetY - nr.height); }
    positionAll();
  }
  const bodyBB = () => L.bbox[IDLE] || [0, 0, W, H];
  function bounds(){
    const r = petBox(), b = bodyBB(), k = r.width / W;
    return { minX: -b[0] * k + 4, maxX: innerWidth - b[2] * k - 4, minY: -b[1] * k + 4, maxY: innerHeight - r.height };
  }
  function clampPos(x, y){ const b = bounds(); return [clamp(x, b.minX, b.maxX), clamp(y, b.minY, b.maxY)]; }
  function place(x, y){ [x, y] = clampPos(x, y); pet.style.left = x + 'px'; pet.style.top = y + 'px'; }
  function placeRaw(x, y){ pet.style.left = x + 'px'; pet.style.top = y + 'px'; }
  function defPos(){ const r = petBox(), k = r.width / W; place(innerWidth - bodyBB()[2] * k - 30, innerHeight - r.height); }
  pet.style.setProperty('--h', elH(sizeH) + 'px');
  requestAnimationFrame(() => {
    const s = store.get('pos', null); if (s) place(s[0], s[1]); else defPos();
    applySize(sizeH, false, true); positionAll(); pet.classList.add('ready');
  });
  // 屏幕 / 缩放变了：把她拉回可见范围（离屏恢复）
  function fit(){ const r = petBox(); place(r.left, r.top); positionAll(); savePos(); }
  addEventListener('resize', fit);
  const savePos = () => { const r = petBox(); store.set('pos', [r.left, r.top]); };
  const posX = () => parseFloat(pet.style.left) || 0, posY = () => parseFloat(pet.style.top) || 0;

  let sqY = 1, sqRot = 0, sqTimer = null;
  function setSq(y, rot){ sqY = y; sqRot = rot; sq.style.transform = (rot ? `rotate(${rot}deg) ` : '') + (y !== 1 ? `scaleY(${y})` : ''); }
  function squash(depth = PH.SQ_SQUASH){
    if (reduced) return; cancelAnimationFrame(sqTimer);
    const t0 = performance.now();
    const step = ts => { const u = Math.min(1, (ts - t0) / PH.SQ_DURATION_MS); setSq(PH.squashScale(u, depth), sqRot); if (u < 1) sqTimer = requestAnimationFrame(step); else setSq(1, sqRot); };
    sqTimer = requestAnimationFrame(step);
  }

  /* ================= 气泡与面板摆放 ================= */
  let bubbleTimer = null, hold = null, lastSaid = null;
  function renderBubble(text, mad, opts){
    bubble.textContent = ''; bubble.hidden = false; bubble.classList.toggle('mad', !!mad); bubble.classList.toggle('hold', !!opts.hold); bubble.classList.toggle('live', !!opts.live);
    bubble.append(document.createTextNode(text || ''));
    if (opts.sub){ const s = document.createElement('span'); s.className = 'sub'; s.textContent = opts.sub; bubble.appendChild(s); }
    if (!opts.quiet){ bubble.style.animation = 'none'; void bubble.offsetWidth; bubble.style.animation = ''; }
    positionBubble();
  }
  function say(text, ms = 3000, mad = false, opts = {}){
    if (!text) return;
    clearTimeout(bubbleTimer);
    if (opts.hold){ hold = { text, mad: !!mad }; renderBubble(text, mad, { hold: true }); lastSaid = { text, t: now() }; return; }
    renderBubble(text, mad, opts); lastSaid = { text, t: now() };
    const dur = ms || (hold ? 4000 : 0);
    if (dur) bubbleTimer = setTimeout(() => { if (hold) renderBubble(hold.text, hold.mad, { hold: true }); else bubble.hidden = true; }, dur);
  }
  function releaseHold(){ hold = null; if (bubble.classList.contains('hold')){ bubble.hidden = true; bubble.classList.remove('hold'); } }
  const sayMs = t => Math.max(4000, Math.min(16000, 2500 + String(t).length * 150));
  function bodyBox(){
    const b = L.bbox[frame] || bodyBB(); const a = toScreen(b[0], b[1]), c = toScreen(b[2], b[3]);
    const l = Math.min(a.x, c.x), rr = Math.max(a.x, c.x); return { left: l, top: a.y, right: rr, bottom: c.y, width: rr - l, height: c.y - a.y };
  }
  function positionBubble(){
    if (bubble.hidden) return;
    const r = bodyBox(), w = bubble.offsetWidth, h = bubble.offsetHeight;
    let x = r.left + r.width / 2 - w / 2; x = Math.max(8, Math.min(innerWidth - w - 8, x));
    let y = r.top - h - 4, below = false; if (y < 8){ y = r.bottom + 10; below = true; }
    if (below && y + h > innerHeight - 8) y = 8;
    bubble.classList.toggle('below', below); bubble.style.left = x + 'px'; bubble.style.top = y + 'px';
    bubble.style.setProperty('--tail', Math.max(16, Math.min(w - 16, r.left + r.width / 2 - x)) + 'px');
  }
  function sidePlace(node, prefer){
    const r = bodyBox(), w = node.offsetWidth, h = node.offsetHeight;
    let x = r.left - w - 12; if (x < 8) x = r.right + 12; if (x + w > innerWidth - 8) x = Math.max(8, (innerWidth - w) / 2);
    const y = Math.max(8, Math.min(innerHeight - h - 8, prefer === 'bottom' ? r.bottom - h : r.top + r.height * .1));
    node.style.left = x + 'px'; node.style.top = y + 'px';
  }
  const PANELS = [menu, inter, acts, chat, wizard];
  function positionAll(){ positionBubble(); for (const p of PANELS) if (!p.hidden) sidePlace(p, p === chat ? 'bottom' : undefined); }
  const panelsOpen = () => PANELS.some(p => !p.hidden);
  function closePanels(except){ for (const p of PANELS) if (p !== except) p.hidden = true; }

  /* ================= 特效 ================= */
  function burst(chars, n = 5, cls = 'heart', at){
    const r = bodyBox(); const o = at || { x: r.left + r.width / 2, y: r.top + r.height * .2 };
    for (let i = 0; i < n; i++){
      const s = document.createElement('span'); s.className = 'fx ' + cls; s.textContent = pick(chars);
      s.style.left = (o.x - 10 + rnd(-50, 50)) + 'px'; s.style.top = (o.y + rnd(0, 40)) + 'px';
      s.style.setProperty('--dx', rnd(-50, 50) + 'px'); s.style.setProperty('--r', rnd(-30, 30) + 'deg');
      s.style.animationDelay = (i * 80) + 'ms'; document.body.appendChild(s); setTimeout(() => s.remove(), 1500 + i * 80);
    }
  }
  function bigHeart(){ const r = bodyBox(); const s = document.createElement('span'); s.className = 'fx heart big'; s.textContent = '♥';
    s.style.left = (r.left + r.width / 2 - 26) + 'px'; s.style.top = (r.top + r.height * .3) + 'px'; s.style.setProperty('--dx', '0px'); s.style.setProperty('--r', '0deg');
    document.body.appendChild(s); setTimeout(() => s.remove(), 1900); burst(['♥', '♡'], 4); }
  function petals(n = 9){ const o = toScreen(...A.flower);
    for (let i = 0; i < n; i++){ const p = document.createElement('i'); p.className = 'petal'; p.style.left = (o.x + rnd(-14, 14)) + 'px'; p.style.top = o.y + 'px';
      p.style.setProperty('--dx', rnd(-90, 50) + 'px'); p.style.setProperty('--r', rnd(-270, 270) + 'deg'); p.style.animationDelay = (i * 90) + 'ms'; document.body.appendChild(p); setTimeout(() => p.remove(), 2400 + i * 90); } }
  function word(text, color, x, y){ const w = document.createElement('span'); w.className = 'word'; w.textContent = text; w.style.setProperty('--c', color || '#f2762f'); w.style.left = x + 'px'; w.style.top = y + 'px'; document.body.appendChild(w); setTimeout(() => w.remove(), 1350); }
  function dust(x, y, n = 6){ for (let i = 0; i < n; i++){ const d = document.createElement('i'); d.className = 'dust'; d.style.left = (x + rnd(-20, 20)) + 'px'; d.style.top = y + 'px'; d.style.setProperty('--dx', rnd(-60, 60) + 'px'); d.style.setProperty('--dy', rnd(-30, -5) + 'px'); document.body.appendChild(d); setTimeout(() => d.remove(), 750); } }
  function sparks(x, y, n = 20){
    if (reduced) return;
    const colors = ['#ffb300', '#ff8f00', '#ff7043', '#f4511e', '#ffc400', '#ffd54f', '#ef5350'];
    const parts = []; for (let i = 0; i < n; i++){ const s = document.createElement('i'); s.className = 'spark'; const d = rnd(5, 12); s.style.width = s.style.height = d + 'px'; s.style.background = pick(colors); const a = rnd(0, Math.PI * 2), v = rnd(120, 460); parts.push({ el: s, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: rnd(500, 900) }); document.body.appendChild(s); }
    const t0 = performance.now();
    const step = ts => { const t = (ts - t0) / 1000; let alive = false; for (const p of parts){ const k = t * 1000 / p.life; if (k >= 1){ p.el.remove(); continue; } alive = true; p.el.style.transform = `translate(${x + p.vx * t}px, ${y + p.vy * t + 350 * t * t}px)`; p.el.style.opacity = 1 - k; } if (alive) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  const FX = { hearts: () => burst(['♥', '♡', '✿'], 4), stars: () => burst(['✦', '✧', '★'], 4, 'star'), notes: () => burst(['♪', '♫', '♪'], 5, 'note'), laugh: () => burst(['哈', '哈', '嘻'], 4, 'note'), bigheart: bigHeart, petals: () => petals(), petalstorm: () => { petals(16); setTimeout(() => petals(10), 500); } };
  let pointer = null;
  function throwAt(sprite, from, sizeFrac, onHit){
    const r = petBox(); const s = toScreen(...from);
    const t = pointer ? { x: pointer.x + rnd(-10, 10), y: pointer.y + rnd(-10, 10) } : { x: innerWidth * .45, y: innerHeight * .4 };
    const im = document.createElement('img'); im.className = 'proj'; im.src = `packs/${packId}/img/${sprite}.webp`; im.alt = '';
    const w0 = r.height * sizeFrac; im.style.width = w0 + 'px'; document.body.appendChild(im);
    const dur = 650, t0 = performance.now(), spin = rnd(540, 900) * (t.x < s.x ? -1 : 1), peak = Math.min(160, Math.abs(t.x - s.x) * .3 + 60);
    const step = ts => { const k = Math.min(1, (ts - t0) / dur); const x = s.x + (t.x - s.x) * k, y = s.y + (t.y - s.y) * k - peak * 4 * k * (1 - k), sc = 1 + 1.6 * k; im.style.transform = `translate(${x - w0 / 2}px, ${y - w0 / 2}px) rotate(${spin * k}deg) scale(${sc})`; if (k < 1) requestAnimationFrame(step); else { im.remove(); onHit && onHit(t); } };
    requestAnimationFrame(step);
  }
  function bonk(p, text){
    const b = document.createElement('div'); b.className = 'bonk'; b.textContent = text; b.style.left = p.x + 'px'; b.style.top = p.y + 'px';
    const m = document.createElement('div'); m.className = 'bump'; m.style.left = p.x + 'px'; m.style.top = p.y + 'px';
    document.body.append(b, m); setTimeout(() => b.remove(), 950); setTimeout(() => m.remove(), 2900); burst(['✦', '★', '✧'], 5, 'star', { x: p.x - 10, y: p.y - 20 });
  }
  function bookFlyOff(from){
    const r = petBox(), s = toScreen(...from);
    const im = document.createElement('img'); im.className = 'proj'; im.src = `packs/${packId}/img/book.webp`; im.alt = '';
    const w0 = r.height * .12; im.style.width = w0 + 'px'; document.body.appendChild(im);
    const tx = s.x + r.width * .32, ty = r.bottom - r.height * .06, t0 = performance.now(), dur = 700;
    const step = ts => { const k = Math.min(1, (ts - t0) / dur); const x = s.x + (tx - s.x) * k, y = s.y + (ty - s.y) * k - 140 * 4 * k * (1 - k); im.style.transform = `translate(${x - w0 / 2}px, ${y - w0 / 2}px) rotate(${400 * k}deg)`; im.style.opacity = k > .95 ? 0 : 1; if (k < 1) requestAnimationFrame(step); else im.remove(); };
    requestAnimationFrame(step);
  }

  /* ================= 天气（真实查询；没设置所在地就说没法查） ================= */
  let wx = null, wxState = PF.lat == null ? 'nolocation' : 'loading';
  const WMO = c => c === 0 ? '晴' : c === 1 ? '晴间多云' : c === 2 ? '多云' : c === 3 ? '阴' : (c === 45 || c === 48) ? '有雾' : (c >= 51 && c <= 57) ? '毛毛雨' : c === 61 ? '小雨' : c === 63 ? '中雨' : c === 65 ? '大雨' : (c === 66 || c === 67) ? '冻雨' : (c >= 71 && c <= 77) ? '下雪' : (c >= 80 && c <= 82) ? '阵雨' : (c === 85 || c === 86) ? '阵雪' : c >= 95 ? '雷雨' : '多云';
  const wxKind = () => !wx ? '' : /雪/.test(wx.condition) ? 'snow' : (/雨/.test(wx.condition) || wx.rainChance >= 60) ? 'rain' : /^晴/.test(wx.short) ? 'clear' : 'cloud';
  function wxTips(w){
    if (!w) return [];
    const tips = [], rain = +w.rainChance || 0, hi = +w.high, feels = +w.feels;
    if (rain >= 50 || /雨/.test(w.condition)) tips.push('今天可能会下雨，出门记得带伞 ☂'); else if (rain >= 30) tips.push('今天有点可能下雨，包里放把小伞比较安心～');
    if (hi <= 12 || feels <= 8) tips.push('今天挺冷的，出门穿件外套吧，别着凉了！'); else if (hi <= 16) tips.push('今天有点凉，带件薄外套比较好～');
    if (hi >= 30) tips.push('今天好热，记得多喝水、别中暑！'); else if (hi >= 26) tips.push('今天挺热的，多喝水哦～');
    if (!tips.length) tips.push('今天天气不错，适合出门走走～');
    return tips;
  }
  const wxLine = () => !wx ? '' : `${wx.city || PF.city || '这边'}现在 ${Math.round(wx.temp)}°C，${wx.condition}，最高 ${Math.round(wx.high)}°，最低 ${Math.round(wx.low)}°，降雨概率 ${Math.round(wx.rainChance)}%。`;
  async function loadWx(){
    if (PF.lat == null || PF.lon == null){ wx = null; wxState = 'nolocation'; return; }
    try {
      const d = await P0.weather();
      if (!d || !d.ok){ wxState = d && d.reason === 'nolocation' ? 'nolocation' : 'fail'; return; }
      const later = /雨/.test(WMO(d.dayCode)) && !/雨/.test(WMO(d.code)) ? `，今天晚些时候有${WMO(d.dayCode)}` : '';
      wx = { temp: d.temp, feels: d.feels, high: d.high, low: d.low, rainChance: d.rainChance, short: WMO(d.code), condition: WMO(d.code) + later, city: d.city, at: d.at }; wxState = 'ok';
    } catch { wxState = 'fail'; }
  }
  loadWx(); setInterval(loadWx, 30 * 60 * 1000);
  function weatherTalk(){
    if (wxState === 'nolocation'){ say('还不知道你在哪儿，查不了天气～去设置里的「资料」填一下所在地吧。', 5000); return; }
    if (!wx){ say('天气暂时查不到（可能没联网），等会儿我再试试。', 4000); return; }
    if (mode === 'idle') expr('smile', 3000);
    say(wxLine() + wxTips(wx).join(''), 7000);
  }

  /* ================= 时间背景 ================= */
  const tcExtra = () => ({ birthday: S.bday ? S.bday.slice(5).replace(/^0/, '').replace('-0', '-') : '', south: PF.lat != null && PF.lat < 0 });
  const timeLine = () => TC.timeContextOf(nowLocal(), tcExtra());
  function seasonTagsNow(){
    const tags = TC.seasonTags(nowLocal(), tcExtra());
    const k = wxKind(); if (k === 'snow') tags.set('snowman', Math.max(tags.get('snowman') || 0, 3)); if (k === 'rain') tags.set('umbrella', 2);
    if (wx && wx.temp <= 4) tags.set('scarf', Math.max(tags.get('scarf') || 0, 2)); if (wx && wx.temp >= 22){ tags.set('fan', Math.max(tags.get('fan') || 0, 2)); tags.set('watermelon', Math.max(tags.get('watermelon') || 0, 2)); }
    return tags;
  }

  /* ================= 动作（姿势）与老活动 ================= */
  const nextIdle = bag((window.PACK_IDLE_LINES || ['…']).map(fmt)), nextSulk = bag(window.PACK_SULK_LINES || ['哼。']), nextGun = bag(window.PACK_GUN_LINES || ['哼！']);
  function touch(){ lastInteract = now(); }
  let ramenTimer = null;
  const OLD_OK = { read: has('read'), ramen: has('ramen'), badminton: has('badminton'), sleep: has('sleep') };
  function startAct(a, dur){
    if (!OLD_OK[a]) return doPose(pick(Object.keys(POSES).filter(id => POSES[id].cat === ({ read: 'book', ramen: 'food', badminton: 'play', sleep: 'sleep' })[a] && poseReady(id))) || '', dur);
    setMode(a, dur); say(pick(ACT_LINES[a] || ['…']), 3000); fishLinkAct(a);
    if (a === 'ramen') ramenTimer = setTimeout(ramenEvent, rnd(4500, 7500));
    if (a === 'badminton' || a === 'ramen') energy = Math.max(0, energy - 12);
    if (a === 'sleep') energy = Math.min(100, energy + 70);
    store.set('energy', energy);
  }
  const poseFrames = Pz => Pz.seq || [Pz.f];
  const poseReady = id => { const Pz = POSES[id]; return !!Pz && poseFrames(Pz).every(f => HAVE.has(f)); };
  function inHours(h, [a, b]){ return a <= b ? (h >= a && h <= b) : (h >= a || h <= b); }
  function poseWeight(id, tags){
    const Pz = POSES[id]; if (!Pz || !poseReady(id)) return 0;
    const w = Pz.when; if (!w) return 1;
    const h = hourNow(); let mult = 1;
    if (w.hours && !inHours(h, w.hours)) return 0;
    if (w.night && !(h >= 22 || h <= 5)) return 0;
    if (w.energy && w.energy.max != null && energy > w.energy.max) return 0;
    if (w.temp){ if (!wx) return w.tag ? 0 : .3; if (w.temp.min != null && wx.temp < w.temp.min) return 0; if (w.temp.max != null && wx.temp > w.temp.max) return 0; }
    if (w.weather && wxKind() !== w.weather) return 0;
    if (w.tag){ const t = tags.get(w.tag); if (!t) return w.optional ? .25 : 0; mult *= t; }
    return mult;
  }
  const recentPoses = [];
  function doPose(id, dur){
    const Pz = POSES[id]; if (!Pz) return;
    if (!poseReady(id)){ say('这个动作的图还没画好呢～', 2200); return; }
    setMode('pose', dur || (Pz.seq ? Pz.seq.length * Pz.step + 1500 : Pz.sleepy ? 16000 : 12000)); poseId = id; lastAct = id;
    recentPoses.push(id); if (recentPoses.length > 6) recentPoses.shift();
    if (Pz.sleepy) fishLinkAct('sleepy');
    const frames = poseFrames(Pz); let i = 0;
    const show = () => {
      if (mode !== 'pose' || poseId !== id) return;
      poseFrame = frames[i]; setFrame(poseFrame, { hard: !!Pz.seq }); pet.dataset.x = ''; pet.dataset.blush = '';
      say(fmt(Pz.seq ? Pz.l[Math.min(i, Pz.l.length - 1)] : pick(Pz.l)), Pz.seq ? Pz.step - 100 : 3400, id === 'panic');
      poseFx(Pz.fx); i++;
      if (i < frames.length) poseTimer = setTimeout(show, Pz.step);
    };
    show(); applyLoop();
    // 进场小弹跳 + 该动作自带的起手动作；特效按节奏持续冒（音符 / 爱心 / 蒸汽…）
    if (!LYING.has(poseFrame)) anim('pop'); if (Pz.shot) setTimeout(() => { if (mode === 'pose' && poseId === id) anim(Pz.shot); }, 300);
    const every = Pz.fxEvery || FX_EVERY[Pz.fx]; if (every && !Pz.seq){ clearInterval(fxTimer); fxTimer = setInterval(() => { if (mode !== 'pose' || poseId !== id) return clearInterval(fxTimer); if (Math.random() < .85) poseFx(Pz.fx); }, every); }
    nextMicro = now() + rnd(2500, 5000);
    if (Pz.sleepy) energy = Math.min(100, energy + 20); else energy = Math.max(0, energy - 3);
    store.set('energy', energy);
  }
  const FX_EVERY = { notes: 950, hearts: 1600, sparkle: 1500, shine: 1500, petals: 1100, steam: 1500, zzz: 1900, tears: 1200, bubbles: 2800, stars: 1500, rain: 800, bigheart: 2600, sweat: 2400 };
  function poseFx(k){
    const r = bodyBox(), top = { x: r.left + r.width / 2, y: r.top + r.height * .12 };
    if (k === 'stars') FX.stars(); else if (k === 'hearts') FX.hearts(); else if (k === 'notes') FX.notes(); else if (k === 'bigheart') bigHeart(); else if (k === 'petals') petals();
    else if (k === 'sparkle' || k === 'shine') burst(['✦', '✧', '✨'], 5, 'star', top);
    else if (k === 'zzz') burst(['Z', 'z', 'z'], 3, 'note', { x: r.right - r.width * .25, y: r.top + r.height * .15 });
    else if (k === 'steam') burst(['～', '∿'], 3, 'note', { x: r.left + r.width * .45, y: r.top + r.height * .3 });
    else if (k === 'tears' || k === 'sweat' || k === 'rain') burst(['💧'], k === 'rain' ? 8 : 3, 'note', k === 'rain' ? { x: r.left + r.width / 2, y: r.top - 20 } : top);
    else if (k === 'bubbles'){ for (let i = 0; i < 9; i++){ const b = document.createElement('i'); b.className = 'bub'; const d = rnd(12, 30); b.style.width = b.style.height = d + 'px'; b.style.left = (r.left + r.width * rnd(.05, .6)) + 'px'; b.style.top = (r.top + r.height * rnd(.25, .5)) + 'px'; b.style.setProperty('--dx', rnd(-80, 30) + 'px'); b.style.animationDelay = (i * 260) + 'ms'; document.body.appendChild(b); setTimeout(() => b.remove(), 3600 + i * 260); } }
  }
  function playEvent(f, ms, line, opts = {}){
    if (['drag', 'fly', 'gun'].includes(mode) && !opts.force) return false;
    setMode('event', ms); eventFrame = f; setFrame(f); pet.dataset.x = opts.x || ''; pet.dataset.blush = opts.blush ? 'on' : ''; applyLoop();
    if (opts.anim) anim(opts.anim); else if (!LYING.has(f)) anim('pop'); if (line) say(line, opts.ms || Math.min(ms, 4000), !!opts.mad, opts.sayOpts || {});
    return true;
  }
  function ramenEvent(){
    if (mode !== 'ramen' || !P.ramen) return;
    if (Math.random() < .5){ expr('ramen', 4200, 1, 'fire spicy tears sweat steam'); anim('shake'); say(pick(['好辣好辣！！嘶——哈——', '辣、辣死我了！水！快给我水！', '谁在汤里放了这么多辣椒！呜呜…']), 3600); }
    else {
      const r = petBox(); const o = toScreen(...P.ramen.bowl);
      for (let i = 0; i < 10; i++){ const d = document.createElement('i'); d.className = 'drop'; d.style.left = (o.x + rnd(-30, 30)) + 'px'; d.style.top = o.y + 'px'; d.style.setProperty('--dx', rnd(-60, 60) + 'px'); d.style.setProperty('--dy', rnd(20, r.height * .25) + 'px'); document.body.appendChild(d); setTimeout(() => d.remove(), 650); }
      expr('excited', 0, 1, 'stain anger sweat'); anim('jump'); say(pick(['呀！汤溅到裙子上了！！', '我的白裙子！！面汤！！', '哇！好烫！裙子脏了…呜…']), 2600, true);
      setTimeout(() => { if (mode === 'ramen'){ expr('ramen', 0, 1, 'stain steam'); say('哼…换个姿势继续吃。可恶的面条！', 2600); } }, 2600);
    }
  }

  /* ================= 动作链（没人理她时自己干什么） ================= */
  const CAT_BASE = { book: 16, food: 14, sleep: 4, play: 20, mood: 12, daily: 14, season: 0 };
  const OLD_ACTS = { book: OLD_OK.read ? ['read'] : [], food: OLD_OK.ramen ? ['ramen'] : [], play: OLD_OK.badminton ? ['badminton'] : [], sleep: OLD_OK.sleep ? ['sleep'] : [], mood: ['spin', 'dance'] };
  function catWeights(tags){
    const h = hourNow(), w = { ...CAT_BASE };
    if (energy < 25) w.sleep = 40; else if (h >= 1 && h < 6) w.sleep = 30; else if (energy < 45) w.sleep = 12;
    if ((h >= 7 && h <= 9) || (h >= 11 && h <= 13) || (h >= 18 && h <= 20)) w.food *= 1.6;
    let best = 0; for (const id in POSES) if (POSES[id].cat === 'season'){ best = Math.max(best, poseWeight(id, tags)); }
    w.season = best ? 10 * best : 0;
    return w;
  }
  function pickFrom(cat, tags){
    const items = [];
    for (const id in POSES) if (POSES[id].cat === cat && id !== lastAct && !recentPoses.includes(id)){ const pw = poseWeight(id, tags); if (pw > 0) items.push({ kind: 'pose', id, w: pw }); }
    for (const a of (OLD_ACTS[cat] || [])) if (a !== lastAct) items.push({ kind: 'act', id: a, w: cat === 'mood' ? .6 : 1.4 });
    if (!items.length) return null;
    const total = items.reduce((s, i) => s + i.w, 0); let t = Math.random() * total;
    for (const i of items){ t -= i.w; if (t <= 0) return i; } return items[items.length - 1];
  }
  function dance(){ expr('happy', 2100); anim('dance'); FX.notes(); fishLinkAct('dance'); say('给你跳支舞！啦啦～'); lastAct = 'dance'; nextRoll = now() + 4000; }
  function doAction(item){
    if (!item) return;
    if (item.kind === 'pose') return doPose(item.id);
    const a = item.id;
    if (a === 'spin') return startSpin(2);
    if (a === 'dance') return dance();
    startAct(a, { read: 16000, ramen: 17000, badminton: 14000, sleep: 22000 }[a]);
  }
  function rollNext(){
    const h = hourNow(), tags = seasonTagsNow();
    if (energy < 25 || (h >= 1 && h < 6 && Math.random() < .5)){
      const naps = ['booknap', 'pillownap', 'blanket', 'm_sleep'].filter(poseReady); if (naps.length && Math.random() < .6) return doPose(pick(naps), 20000);
      if (OLD_OK.sleep) return startAct('sleep', 22000);
    }
    if (fishTick()) return;
    if (wx && (wx.rainChance >= 60 || /雨/.test(wx.condition)) && Math.random() < .12 && poseReady('umbrella')) return doPose('umbrella');
    const r = Math.random(), turnW = (S.fixed || !has('side_l')) ? 0 : 5, moveW = (S.fixed || dnd()) ? 0 : 5;
    if (r < .10){ nextRoll = now() + rnd(3000, 7000); if (!dnd() && !quietNow() && bubble.hidden && Math.random() < LV().idleP) say(nextIdle(), 3800); return; }
    if (r < (10 + turnW) / 100) return startTurn();
    if (r < (10 + turnW + moveW) / 100){ if (startWalk()) return; }
    const w = catWeights(tags), cats = Object.keys(w).filter(c => w[c] > 0), total = cats.reduce((s, c) => s + w[c], 0);
    let t = Math.random() * total, cat = cats[cats.length - 1];
    for (const c of cats){ t -= w[c]; if (t <= 0){ cat = c; break; } }
    let item = pickFrom(cat, tags);
    if (!item) for (const c of cats){ item = pickFrom(c, tags); if (item) break; }
    doAction(item);
  }
  setInterval(() => {
    if (drag || panelsOpen()) return;
    const t = now(), ignored = t - lastInteract;
    if (['spin', 'fallen', 'throw', 'fly', 'drag', 'walk', 'turn', 'chat'].includes(mode)) return;
    if (!dnd() && !quietNow() && mode !== 'work' && S.companion !== 'quiet'){
      if (mode !== 'gun' && mode !== 'sulk' && ignored >= 60000 && t - lastGun >= 60000 && has('pistol')){ if (gunCount >= 2) return startSulk(); return startGun(); }
      if (mode === 'sulk' && t - modeStart > 20000 && bubble.hidden && Math.random() < .2) say(nextSulk(), 3600, true);
    }
    if (mode !== 'idle' && mode !== 'sulk' && mode !== 'work' && modeUntil && t > modeUntil){
      const was = mode; setMode('idle');
      if (was === 'gun'){ expr('normal', 2600, 1, 'anger'); say('哼…不理你了，我自己玩…', 2600); }
      if (was === 'sleep'){ expr('happy', 1800); say(pick(['睡饱啦！精神满满！', '呼啊…睡醒了～你还在呀！'])); }
      return;
    }
    if (mode === 'idle' && ignored > 6000 && t >= nextRoll){ nextRoll = t + 4000; rollNext(); }
  }, 1000);

  /* ================= 转向与漫游 ================= */
  function startTurn(){
    if (mode !== 'idle' || !has('side_l') || !has('back')) return false;
    setMode('turn', 2300); const seq = Math.random() < .5 ? ['side_l', 'back', 'side_r'] : ['side_r', 'back', 'side_l'];
    let i = 0; const step = () => { if (mode !== 'turn') return; setFrame(seq[i]); i++; if (i < seq.length) eventTimer = setTimeout(step, i === 2 ? 800 : 550); else eventTimer = setTimeout(() => { if (mode === 'turn'){ setMode('idle'); if (Math.random() < .3) say(pick(LN.turn), 2200); } }, 600); };
    step(); if (Math.random() < .35) say(pick(LN.turn), 2000);
    return true;
  }
  let walk = null;
  function walkFrameNow(){ const fr = EV.walk.frames; if (!walk) return fr[0]; return fr[Math.floor(walk.step) % fr.length]; }
  function startWalk(dir, dist){
    if (S.fixed || mode === 'work' || mode === 'chat') return false;
    if (!['idle', 'pose', 'event', 'read', 'badminton'].includes(mode)) return false;
    const b = bounds(), x = posX();
    if (!dir){ const frac = (x - b.minX) / Math.max(1, b.maxX - b.minX); dir = frac < .25 ? 1 : frac > .75 ? -1 : (Math.random() < .5 ? -1 : 1); }
    dist = dist || rnd(70, 260) * (sizeH / 330);
    const target = clamp(x + dir * dist, b.minX, b.maxX);
    if (Math.abs(target - x) < 30){ dir = -dir; const t2 = clamp(x + dir * dist, b.minX, b.maxX); if (Math.abs(t2 - x) < 30) return false; return startWalk(dir, dist); }
    setMode('walk'); lastAct = 'walk';
    walk = { dir, target, speed: 58 * (sizeH / 330), step: 0, last: performance.now(), raf: 0 };
    pet.classList.toggle('flip', dir > 0); setFrame(walkFrameNow(), { hard: true });
    if (Math.random() < .4) say(pick(LN.walkStart), 1800);
    const tick = ts => {
      if (mode !== 'walk' || !walk) return;
      const dt = Math.min(.05, (ts - walk.last) / 1000); walk.last = ts;
      let nx = posX() + walk.dir * walk.speed * dt;
      walk.step += dt * 3.6; const f = walkFrameNow(); if (f !== frame) setFrame(f, { hard: true });
      if ((walk.dir > 0 && nx >= walk.target) || (walk.dir < 0 && nx <= walk.target)){ placeRaw(walk.target, posY()); return endWalk(true); }
      placeRaw(nx, posY()); positionAll();
      walk.raf = requestAnimationFrame(tick);
    };
    walk.raf = requestAnimationFrame(tick);
    return true;
  }
  function stopWalk(){ if (walk){ cancelAnimationFrame(walk.raf); walk = null; } pet.classList.remove('flip'); }
  function endWalk(arrived){ stopWalk(); savePos(); if (mode === 'walk'){ setMode('idle'); if (arrived && Math.random() < .35) say(pick(LN.walkEnd), 2200); if (arrived && Math.random() < .3) startTurn(); } }

  /* ================= 拖拽（弹簧）与甩抛（物理） ================= */
  let dragging = null, trail = [], throwing = null, scoreTotal = store.get('score', 0);
  function startDragFollow(){
    const d = dragging; d.vx = 0; d.vy = 0; d.last = performance.now();
    const tick = ts => {
      if (!dragging || dragging !== d) return;
      const dt = Math.min(1 / 30, (ts - d.last) / 1000); d.last = ts;
      d.vx = PH.springStep(d.vx, d.x, d.tx, dt, S.physics.throwPower); d.vy = PH.springStep(d.vy, d.y, d.ty, dt, S.physics.throwPower);
      d.x += d.vx * dt; d.y += d.vy * dt; placeRaw(d.x, d.y); positionAll();
      setSq(1, clamp(-d.vx / 60, -14, 14));
      d.raf = requestAnimationFrame(tick);
    };
    d.raf = requestAnimationFrame(tick);
  }
  function startThrow(x, y, vx, vy){
    setMode('fly'); lastAct = 'fly';
    const useSpin = !EV.fly.real && has('spin0'); let spinI = 0, spinT = 0;
    throwing = { x, y, vx, vy, rot: 0, last: performance.now(), raf: 0, bounces: 0, grounded: false, peakSpeed: Math.hypot(vx, vy) };
    setFrame(evFrame('fly'), { hard: true }); say(pick(LN.flyStart), 1500, true); fishLinkAct('fly');
    const tick = ts => {
      const th = throwing; if (!th || mode !== 'fly') return;
      const dt = Math.min(.05, (ts - th.last) / 1000); th.last = ts;
      const prevVy = th.vy, prevG = th.grounded;
      const s = PH.throwStep(th, dt, bounds(), S.physics);
      Object.assign(th, { x: s.x, y: s.y, vx: s.vx, vy: s.vy }); th.grounded = s.ground;
      const speed = Math.hypot(th.vx, th.vy); th.peakSpeed = Math.max(th.peakSpeed, speed);
      th.rot += clamp(th.vx / 3.2, -480, 480) * dt;
      if (useSpin){ spinT += dt; if (spinT > .09){ spinT = 0; spinI++; setFrame('spin' + (spinI % 4), { hard: true }); } }
      placeRaw(th.x, th.y); positionAll();
      if (s.bounced){
        th.bounces++;
        if (s.ground && !prevG){ squash(PH.landingSquash(prevVy)); const r = petBox(); dust(r.left + r.width / 2, r.bottom - 4, Math.abs(prevVy) > 700 ? 9 : 4); if (Math.abs(prevVy) > 1150 && th.bounces <= 2 && Math.random() < .5) say(pick(LN.bounce), 900, true); }
        else if (s.wall && speed > 300){ const r = petBox(); word(pick(LN.bounce), '#e2462f', th.vx > 0 ? r.left : r.right, r.top + r.height * .4); }
      }
      if (s.atRest) return land(th);
      if (!s.ground) setSq(1, th.rot); else setSq(sqY, th.rot * .3);
      th.raf = requestAnimationFrame(tick);
    };
    throwing.raf = requestAnimationFrame(tick);
  }
  function stopThrow(){ if (throwing){ cancelAnimationFrame(throwing.raf); throwing = null; } }
  function land(th){
    const hard = th.peakSpeed > 1900 || th.bounces >= 5 && th.peakSpeed > 1400;
    stopThrow(); savePos(); setSq(1, 0);
    if (hard && has('fall') && has('faint')){
      setMode('fallen'); setFrame('fall'); anim('thud'); say(pick(LN.landHard), 2600, true); fishLinkAct('fallen');
      setTimeout(() => { if (mode === 'fallen') setFrame('faint'); }, 700);
      setTimeout(() => { if (mode !== 'fallen') return; setMode('idle'); expr('normal', 2600, '', 'sweat'); anim('hop'); say('呜…站起来了。下次轻一点嘛…', 3000); }, 4800);
    } else {
      playEvent(evFrame('sitfall'), 1500, pick(LN.landSoft), { x: 'stars', force: true });
      setTimeout(() => { if (mode === 'event' && eventFrame === evFrame('sitfall')){ setMode('idle'); expr('happy', 1200); anim('hop'); } }, 1500);
    }
    energy = Math.max(0, energy - 2); store.set('energy', energy);
  }
  function scorePopup(x, y, speed){
    const pts = PH.clickScore(speed, petBox().height); scoreTotal += pts; store.set('score', scoreTotal);
    const c = document.createElement('div'); c.className = 'score'; c.innerHTML = `<b>+${pts}</b><small>速度 ${Math.round(speed)} · 累计 ${scoreTotal}</small>`;
    c.style.left = clamp(x, 70, innerWidth - 70) + 'px'; c.style.top = Math.max(60, y - 14) + 'px'; document.body.appendChild(c); setTimeout(() => c.remove(), 2300);
    sparks(x, y); word(pick(LN.score), '#ff8f00', x, y + 30);
  }

  /* ================= 掏枪 / 生闷气 ================= */
  const flash = $('#flash'); let gunLoop = null, gunLeft = false;
  addEventListener('mousemove', e => { pointer = { x: e.clientX, y: e.clientY }; lastPointer = now(); }, { passive: true });
  addEventListener('keydown', () => { lastPointer = now(); }, { passive: true });
  function faceTarget(){
    if (!P.pistol) return;
    const r = bodyBox(), cx = r.left + r.width / 2;
    gunLeft = pointer ? pointer.x < cx : cx > innerWidth / 2;
    if (mode === 'gun') setFrame(gunLeft && has('pistol_l') ? 'pistol_l' : 'pistol');
    const mz = gunLeft ? P.pistol.muzzleL : P.pistol.muzzle;
    $('#muzzle').setAttribute('cx', mz[0]); $('#muzzle').setAttribute('cy', mz[1]);
    $('#flash').setAttribute('transform', `translate(${mz[0]} ${mz[1]}) scale(${gunLeft ? -1 : 1} 1)`);
  }
  function target(){
    const m = $('#muzzle').getBoundingClientRect(), left = gunLeft;
    let b = pointer; const ok = b && (left ? b.x < m.left - 30 : b.x > m.right + 30);
    if (!ok) b = { x: left ? rnd(40, Math.max(60, m.left - 160)) : rnd(Math.min(innerWidth - 60, m.right + 160), innerWidth - 40), y: rnd(innerHeight * .2, innerHeight * .7) };
    return { x: b.x + rnd(-24, 24), y: b.y + rnd(-24, 24) };
  }
  function hole(x, y){
    const h = document.createElement('div'); h.className = 'hole'; h.style.left = x + 'px'; h.style.top = y + 'px';
    h.innerHTML = `<svg viewBox="-20 -20 40 40" style="transform:rotate(${rnd(0, 360)}deg)"><circle r="9" fill="var(--crack)" opacity=".2"/><path d="M0 0 L14 -3 M0 0 L-6 13 M0 0 L-13 -6 M0 0 L5 -14 M0 0 L11 9" stroke="var(--crack)" stroke-width="1.1" stroke-linecap="round"/><circle r="4" fill="#1b1416"/><circle r="4" fill="none" stroke="#6b5a55" stroke-width="1.2"/></svg>`;
    document.body.appendChild(h); setTimeout(() => h.remove(), 8000);
  }
  function shot(){
    faceTarget();
    const t = target(), m = $('#muzzle').getBoundingClientRect();
    flash.setAttribute('opacity', '1'); anim('recoil'); setTimeout(() => { flash.setAttribute('opacity', '0'); }, 70);
    const dx = t.x - m.left, dy = t.y - m.top;
    const tr = document.createElement('i'); tr.className = 'tracer'; tr.style.left = m.left + 'px'; tr.style.top = m.top + 'px'; tr.style.width = Math.hypot(dx, dy) + 'px'; tr.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`; document.body.appendChild(tr); setTimeout(() => tr.remove(), 160);
    const p = document.createElement('span'); p.className = 'puff'; p.textContent = pick(['啪', '砰', '啪']); p.style.left = (m.left + (gunLeft ? -26 : 6)) + 'px'; p.style.top = (m.top - 26) + 'px'; p.style.setProperty('--dx', rnd(-8, 8) + 'px'); p.style.setProperty('--r', '0deg'); document.body.appendChild(p); setTimeout(() => p.remove(), 950);
    const c = document.createElement('i'); c.className = 'casing'; const fl = gunLeft ? -1 : 1; c.style.left = (m.left - 30 * fl) + 'px'; c.style.top = (m.top - 4) + 'px'; c.style.setProperty('--dx', fl * rnd(-40, -20) + 'px'); document.body.appendChild(c); setTimeout(() => c.remove(), 750);
    setTimeout(() => hole(t.x, t.y), 70);
  }
  function startGun(){
    if (!has('pistol') || !P.pistol) return;
    setMode('gun', 9500); faceTarget(); lastGun = now(); gunCount++;
    say(pick(['一分钟都不理我！为什么不陪我玩！！', '哼！再不理我我就开枪了！']), 2800, true); fishLinkAct('gun');
    let n = 0;
    const fire = () => { if (mode !== 'gun') return; const k = Math.random() < .5 ? 2 : 3; for (let i = 0; i < k; i++) setTimeout(() => { if (mode === 'gun') shot(); }, i * 170); if (n++ % 2 === 1) say(nextGun(), 2200, true); gunLoop = setTimeout(fire, rnd(1100, 1800)); };
    gunLoop = setTimeout(fire, 900);
  }
  function stopGun(){ clearTimeout(gunLoop); gunLoop = null; }
  function startSulk(){ setMode('sulk'); lastGun = now(); say('哼！你都不理我…我自己去玩了，不理你了！', 5000, true); fishLinkAct('sulk'); }

  /* ================= 转圈 / 摔倒 / 扔东西 / 吓一跳 / 打盹 ================= */
  // 转圈：固定转 5 秒，然后晕倒在地；转的时候点她会转得更快，并改为 3 秒后就晕倒
  let spinTimer = null, spinEnd = 0, spinFast = false, spinIdx = 0;
  function stopSpin(){ clearInterval(spinTimer); spinTimer = null; }
  function spinLoop(ms){
    clearInterval(spinTimer);
    spinTimer = setInterval(() => { if (mode !== 'spin') return stopSpin(); setFrame('spin' + (spinIdx % 4), { hard: true }); spinIdx++; if (now() >= spinEnd) collapse(); }, ms);
  }
  function startSpin(){
    if (!has('spin0')) return dance();
    if (mode === 'spin') return spinBoost();
    setMode('spin'); spinFast = false; spinIdx = 0; spinEnd = now() + 5000; burst(['✿', '✦'], 5, 'star');
    say(pick(['好开心！转圈圈～', '看我转！裙子飞起来啦！', '咻——！']), 1800); fishLinkAct('spin');
    spinLoop(120);
  }
  function spinBoost(){
    if (spinFast){ word('更快了!', '#f2762f', bodyBox().left + bodyBox().width / 2, bodyBox().top); return; }
    spinFast = true; spinEnd = now() + 3000; burst(['✦', '✧'], 4, 'star');
    say(pick(['哇哇哇转得更快了！', '停、停不下来啦——！', '咻咻咻咻！头好晕！']), 1600); spinLoop(60);
  }
  function collapse(){
    stopSpin(); setMode('fallen'); setFrame(has('fall') ? 'fall' : evFrame('sitfall')); anim('thud');
    say('哎呀——！转、转太久了…', 2000); fishLinkAct('fallen'); if (P.fall) bookFlyOff(P.fall.book);
    setTimeout(() => { if (mode !== 'fallen') return; setFrame(has('faint') ? 'faint' : evFrame('sitfall')); say('@_@ 天旋地转…让我躺一会儿…', 4500); }, 900);
    setTimeout(() => { if (mode !== 'fallen') return; setMode('idle'); expr('normal', 2600, '', 'sweat'); anim('hop'); say('呜…站起来了。下次不转那么久了…', 3000); }, 7900);
  }
  function throwShoe(two){
    if (!has('shoe') || !P.shoe) return;
    setMode('throw'); setFrame('shoe'); anim('throw'); pet.dataset.x = 'anger';
    const go = () => throwAt('shoe_item', P.shoe.release, .11, p => { bonk(p, pick(['咚！', '砰！', '啪！'])); });
    go(); if (two) setTimeout(go, 380);
    setTimeout(() => { if (mode === 'throw'){ setMode('idle'); expr('normal', 2200, 1, 'anger'); } }, two ? 1500 : 1100);
  }
  function throwBook(){
    if (!has('throwbook') || !P.throwbook) return;
    setMode('throw'); setFrame('throwbook'); anim('throw');
    throwAt('book', P.throwbook.release, .16, p => bonk(p, '啪！'));
    setTimeout(() => { if (mode === 'throw'){ setMode('idle'); expr('normal', 2200, 1, 'anger'); say('哼！书我自己捡回来…', 2200); } }, 1200);
  }
  function scare(line){
    if (busyModes()) return;
    const wasWork = mode === 'work';
    playEvent(evFrame('scared'), 1800, line || pick(LN.scared), { x: 'sweat', anim: 'startle', force: true }); fishLinkAct('scared');
    setTimeout(() => { if (mode === 'event'){ if (wasWork && workState) setWork(workState, workTask); else setMode('idle'); } }, 1800);
  }
  function doze(){ if (!['idle', 'pose', 'event'].includes(mode)) return; playEvent(evFrame('doze'), 14000, pick(LN.doze), { x: EV.doze.real ? '' : 'zzz' }); energy = Math.min(100, energy + 8); store.set('energy', energy); }

  /* ================= 点她 ================= */
  const partStep = {}; let lastPart = '', clicks = [];
  function zoneAt(x, y){
    for (const z of (L.zones || [])){
      if (z.e){ const [cx, cy, rx, ry] = z.e; if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) return z.part; }
      else { const [x0, y0, x1, y1] = z.r; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return z.part; }
    }
    return 'chest';
  }
  function react(part, cx, cy){
    const P2 = PARTS[part] || PARTS.chest; if (!P2) return;
    partStep[part] = lastPart !== part ? Math.floor(Math.random() * 3) : (partStep[part] + 1) % 4;
    lastPart = part;
    const e = P2.eggs[partStep[part] % P2.eggs.length];
    word(e.w, P2.color, cx, cy - 14); fishLink(e.w, true); squash(.78);
    if (e.fx === 'shoe' || e.fx === 'shoe2'){ say(fmt(e.l), 2600, true); return throwShoe(e.fx === 'shoe2'); }
    if (e.fx === 'throwbook'){ say(fmt(e.l), 2400, true); return throwBook(); }
    if (e.fx === 'spin'){ say(fmt(e.l), 1800); return startSpin(2); }
    expr(e.f, 2200, e.b, e.x || ''); anim(e.a); e.fx && FX[e.fx] && FX[e.fx](); say(fmt(e.l), 3000, /anger/.test(e.x || ''));
    if (part === 'book') setTimeout(openMenu, 250);
    if (['happy', 'love', 'excited'].includes(e.f) && part !== 'book' && Math.random() < .18) setTimeout(() => { if (mode === 'idle') startSpin(2); }, 900);
    energy = Math.max(0, energy - 1); store.set('energy', energy);
  }
  function onClick(cx, cy){
    touch(); menu.hidden = true; hideTip();
    if (mode === 'fallen'){ word('躺平中', '#9a7062', cx, cy - 14); return say(pick(['让我躺一会儿嘛…还没缓过来…', '别戳…地板好凉快…', '@_@ 等我一下…']), 2200); }
    if (mode === 'throw') return;
    if (mode === 'spin'){ word('再快点!', '#f2762f', cx, cy - 14); return spinBoost(); }
    if (mode === 'sulk'){ if (has('side_r')) setFrame('side_r'); gunCount = 0; setTimeout(() => { setMode('idle'); expr('love', 3000, 1); bigHeart(); say('哼…算你还记得我。那、那我就不跟别人玩了！', 3600); }, 450); return; }
    if (mode === 'work'){ squash(.8); word('工作中…', '#9a7062', cx, cy - 14); expr(pick(['smile', 'happy']), 1500, 1); anim('nod'); say(pick(['等我忙完这阵～', '在干活呢，摸摸头就好', '马上马上！']), 2000); return; }
    if (mode === 'chat'){ squash(.85); word('在想…', '#9a7062', cx, cy - 14); return; }
    if (mode !== 'idle') return interrupt();
    clicks = clicks.filter(t => now() - t < 3000); clicks.push(now());
    if (clicks.length >= 8){ clicks = []; return startSpin(4); }
    const [x, y] = toLocal(cx, cy);
    react(zoneAt(x, y), cx, cy);
  }
  function interrupt(){
    const was = mode, wasEvent = eventFrame; setMode('idle'); gunCount = 0;
    if (was === 'sleep'){ expr('closed', 1600, '', 'sweat'); anim('jump'); say(pick(['唔…被吵醒了…人家刚梦到你呢', '嗯…？天亮了吗…', '再睡五分钟嘛…'])); }
    else if (was === 'gun'){ document.querySelectorAll('.hole').forEach(h => { h.style.animation = 'holeOut .5s forwards'; setTimeout(() => h.remove(), 520); }); expr('love', 2800, 1, 'tears'); anim('hop'); bigHeart(); say('呜…你终于理我了！那、那就原谅你啦～', 3200); }
    else if (was === 'ramen'){ expr('happy', 2000, 1); anim('hop'); say(pick(['要吃一口吗？呼呼～小心烫哦！', '你也饿了吗？分你一半！'])); }
    else if (was === 'badminton'){ expr('excited', 1800, '', 'sweat'); anim('jump'); say('接球！……啊，没接到 >_<'); }
    else if (was === 'walk'){ expr('happy', 1500); anim('hop'); say(pick(['嗯？找我呀～', '散步被打断了！', '正好，走累了'])); }
    else if (was === 'turn'){ expr('smile', 1500); anim('tilt'); say('原来是你在叫我呀'); }
    else if (was === 'event'){ if (wasEvent === evFrame('doze')){ expr('closed', 1600, '', 'sweat'); anim('startle'); say(pick(LN.dozeWake)); } else { expr('happy', 1500); anim('hop'); say(pick(['你来啦！', '嘿嘿～'])); } }
    else if (was === 'pose'){
      const P0z = POSES[lastAct] || {};
      if (P0z.sleepy){ expr('closed', 1600, '', 'sweat'); anim('jump'); say(pick(['唔…被吵醒了…', '嗯…？我没睡着！'])); }
      else if (P0z.cat === 'food'){ expr('happy', 2000, 1); anim('hop'); say(pick(['要吃一口吗？', '分你一半～', '这个超好吃的！'])); }
      else { expr(pick(['happy', 'love', 'excited']), 1800, 1); anim('hop'); say(pick(['你来啦！', '嘿嘿，陪我玩～', '被你发现啦！'])); }
    }
    else if (was === 'read'){ expr('smile', 1600); anim('hop'); say('啊，你来啦！我刚看到一个好有趣的段落～'); }
  }

  /* 指针：单击 / 双击 / 长按 / 拖拽 / 甩 / Ctrl+滚轮 */
  let drag = null, clickTimer = null, pressTimer = null;
  pet.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !solidAt(e.clientX, e.clientY)) return;
    hideTip();
    if (mode === 'fly' && throwing){ const sp = Math.hypot(throwing.vx, throwing.vy); if (sp >= PH.SCORE_MIN_SPEED) scorePopup(e.clientX, e.clientY, sp); stopThrow(); setSq(1, 0); setMode('idle'); say(pick(LN.caught), 1600); }
    const r = petBox();
    drag = { sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false, long: false };
    pet.setPointerCapture(e.pointerId); pet.classList.add('grab');
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { if (drag && !drag.moved && mode === 'idle'){ drag.long = true; touch(); expr('love', 2600, 1); anim('hop'); bigHeart(); say(pick(['一直按着我…是想牵手吗？', '好好好，抱抱一整天～', '被你抱住啦，不许松手！'])); } }, 650);
  });
  pet.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6){
      if (mode === 'fallen') return;
      drag.moved = true; clearTimeout(pressTimer); pet.classList.add('dragging'); closePanels(chat);
      const wasWork = mode === 'work';
      setMode('drag'); drag.wasWork = wasWork; releaseHold();
      say(pick(LN.hang), 0, false, { force: true }); fishLinkAct('drag');
      dragging = { x: posX(), y: posY(), tx: posX(), ty: posY() }; trail = []; startDragFollow();
    }
    if (drag.moved && dragging){ dragging.tx = e.clientX - drag.ox; dragging.ty = e.clientY - drag.oy; trail.push({ t: performance.now(), x: e.clientX, y: e.clientY }); trail = PH.trimTrail(trail, performance.now()); }
  });
  const endPress = e => {
    if (!drag) return; clearTimeout(pressTimer); pet.classList.remove('grab');
    const d = drag; drag = null;
    if (d.moved){
      pet.classList.remove('dragging'); touch();
      const dg = dragging; dragging = null; if (dg) cancelAnimationFrame(dg.raf);
      setSq(1, 0); bubble.hidden = true;
      const v = PH.estimateReleaseVelocity(trail, performance.now(), S.physics); trail = [];
      const x = dg ? dg.x : posX(), y = dg ? dg.y : posY();
      if (v && e.type !== 'pointercancel' && !S.fixed){ startThrow(x, y, v.vx, v.vy); return; }
      place(x, y); savePos(); setMode('idle'); expr('happy', 1400); anim('jump'); squash(.86); say(pick(['稳稳落地！', '这里风景不错～', '新家！']), 1800);
      if (d.wasWork) setTimeout(() => { if (mode === 'idle' && workState) setWork(workState, workTask); }, 1500);
      return;
    }
    if (d.long || e.type === 'pointercancel') return;
    if (clickTimer){ clearTimeout(clickTimer); clickTimer = null; return openMenu(); }
    const cx = e.clientX, cy = e.clientY;
    clickTimer = setTimeout(() => { clickTimer = null; onClick(cx, cy); }, 230);
  };
  pet.addEventListener('pointerup', endPress);
  pet.addEventListener('pointercancel', endPress);
  pet.addEventListener('contextmenu', e => { e.preventDefault(); if (solidAt(e.clientX, e.clientY)) openMenu(); });
  let wheelT = null;
  pet.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); const h = sizeH * (e.deltaY < 0 ? 1.06 : 1 / 1.06); applySize(h, true, true); clearTimeout(wheelT); wheelT = setTimeout(() => setS({ size: sizeH }), 400); }, { passive: false });

  /* 鼠标穿透 + 悬停名牌 */
  let hit = null, tipTimer = null;
  function setHit(on){ if (on !== hit){ hit = on; P0.setInteractive(on); } }
  function hideTip(){ clearTimeout(tipTimer); tipTimer = null; tip.hidden = true; }
  addEventListener('mousemove', e => {
    if (drag) return setHit(true);
    const elx = document.elementFromPoint(e.clientX, e.clientY);
    const onPanel = !!(elx && elx.closest('.panel,#bubble'));
    const solid = !S.clickThrough && solidAt(e.clientX, e.clientY);
    setHit(onPanel || solid);
    if (solid && !onPanel && !panelsOpen() && ['idle', 'work', 'pose', 'event', 'read'].includes(mode)){
      if (!tipTimer && tip.hidden) tipTimer = setTimeout(() => { tipTimer = null; if (drag || !pointer || !solidAt(pointer.x, pointer.y)) return; tip.hidden = false; tip.style.left = (pointer.x + 14) + 'px'; tip.style.top = (pointer.y + 18) + 'px'; }, 650);
      else if (!tip.hidden){ tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 18) + 'px'; }
    } else hideTip();
  }, { passive: true });
  setHit(false);

  /* ================= 面板：主面板 / 互动 / 动作 ================= */
  function openMenu(){
    touch(); if (!['idle', 'fallen', 'work', 'chat', 'pose', 'event'].includes(mode)) interrupt();
    closePanels(menu); menu.hidden = false; sidePlace(menu); if (mode === 'idle') expr('happy', 1400);
    $('#menuFoot').textContent = `${NAME} · ${CUR.hasKey ? CUR.name + ' · ' + CUR.model : '还没填模型密钥'}`;
    say(pick(['想和我一起做什么呀？', '我在～', '嗯？叫我吗？']), 2600);
  }
  menu.addEventListener('click', e => {
    const b = e.target.closest('[data-cmd]'); if (!b) return; const c = b.dataset.cmd; menu.hidden = true; touch();
    if (c === 'chat') return openChat();
    if (c === 'inter') return openInter();
    if (c === 'acts') return openActs();
    if (c === 'settings'){ P0.openSettings(''); expr('smile', 1500); return; }
  });
  const INTER = () => [
    ['sep', '碰碰她'],
    ['pat', '摸摸头'], ['hug', '抱抱'], ['hand', '握手'],
    ['feed', '喂她吃东西'], ['praise', '夸夸她'], ['tease', '逗逗她'],
    ['sep', '一起玩'],
    ['spin', '转圈圈'], ['dance', '跳支舞'], ['walk', '散个步'],
    ...(has('side_l') ? [['turn', '东张西望']] : []), ['nap', '去睡觉'], ['weather', '今天天气'],
    ['sep', '她的事'],
    ['whisper', '碎碎念一句'], ['ledger', '查 token 账本'], ['home', '回右下角'],
    ['fixed', S.fixed ? '解除固定' : '固定位置'], ['dnd', S.dnd ? '关闭免打扰' : '免打扰'], ['hide', '藏起来（托盘找回）'],
    ...(has('pistol') ? [['ignore', '冷落她（看她生气）']] : []),
  ];
  function openInter(){
    touch(); closePanels(inter); const g = $('#interGrid'); g.textContent = '';
    for (const [k, label] of INTER()){
      if (k === 'sep'){ const d = document.createElement('div'); d.className = 'sep'; d.textContent = label; g.appendChild(d); continue; }
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.inter = k;
      if (k === 'fixed') b.setAttribute('aria-pressed', String(!!S.fixed)); if (k === 'dnd') b.setAttribute('aria-pressed', String(!!S.dnd)); if (k === 'ignore') b.className = 'wide';
      g.appendChild(b);
    }
    $('#interSub').textContent = `体力 ${Math.round(energy)} · 积分 ${scoreTotal}`;
    inter.hidden = false; sidePlace(inter); if (mode === 'idle') expr('smile', 1500);
  }
  inter.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return (inter.hidden = true);
    const b = e.target.closest('[data-inter]'); if (!b) return; const k = b.dataset.inter; inter.hidden = true; touch(); lastInteract = now() - 10000;
    const idle = () => { if (!['idle', 'fallen'].includes(mode)) setMode('idle'); };
    switch (k){
      case 'pat': idle(); expr('love', 2600, 1); anim('pat'); FX.hearts(); say(pick(['嘿嘿…摸头最喜欢了～', '再摸一下嘛…', '呼噜呼噜（享受）'])); energy = Math.min(100, energy + 2); break;
      case 'hug': idle(); expr('love', 2800, 1); anim('hop'); bigHeart(); say(pick(['抱抱！最喜欢你了～', '暖暖的…不想松手', '抱紧紧！'])); break;
      case 'hand': idle(); expr('smile', 2200); anim('nod'); say(pick(['你好你好，请多关照～', '握手！约定好了哦', '（小手软软的）'])); break;
      case 'feed': { const foods = Object.keys(POSES).filter(id => POSES[id].cat === 'food' && poseReady(id)); if (OLD_OK.ramen && Math.random() < .4) startAct('ramen', 17000); else if (foods.length) doPose(pick(foods)); else say('谢谢！…可是没有吃的图呢'); break; }
      case 'praise': idle(); expr(has('m_smug') ? 'm_smug' : 'happy', 3000, 1); anim('sway'); burst(['✦', '✧', '✨'], 5, 'star'); say(pick(['哼哼～我就知道我最棒！', '被夸了被夸了！', '那、那当然啦！'])); break;
      case 'tease': idle(); if (Math.random() < .5){ expr(has('m_angry') ? 'm_angry' : 'normal', 2600, 1, 'anger'); anim('shake'); say(pick(['哼！不许逗我！', '再逗我就扔书了！', '生气了！（鼓腮）']), 2600, true); } else { expr(has('m_shock') ? 'm_shock' : 'excited', 2400, 1, 'sweat'); anim('startle'); say(pick(['诶？！真的假的！', '不、不会吧！', '吓我一跳！'])); } break;
      case 'spin': idle(); startSpin(2); break;
      case 'dance': idle(); dance(); break;
      case 'walk': idle(); if (S.fixed) say('我被固定住啦，先解除固定～', 2600); else if (!startWalk()) say('这边走不动啦…', 2000); break;
      case 'turn': idle(); startTurn(); break;
      case 'nap': idle(); if (OLD_OK.sleep && Math.random() < .5) startAct('sleep', 22000); else { const naps = ['booknap', 'pillownap', 'blanket', 'm_sleep'].filter(poseReady); if (naps.length) doPose(pick(naps), 20000); else if (OLD_OK.sleep) startAct('sleep', 22000); } break;
      case 'weather': idle(); weatherTalk(); break;
      case 'whisper': doWhisper(true); break;
      case 'ledger': reportLedger(true); break;
      case 'home': goHome(); break;
      case 'fixed': setFixed(!S.fixed); say(pick(S.fixed ? LN.fixedOn : LN.fixedOff), 2400); break;
      case 'dnd': setS({ dnd: !S.dnd }); say(S.dnd ? '好，我安安静静待着～' : '免打扰关掉啦，我又可以吵你了！', 2600); break;
      case 'hide': say('我去托盘里待着啦，点托盘图标叫我～', 1800); setTimeout(() => P0.hide(), 1200); break;
      case 'ignore': lastInteract = now() - 61000; lastGun = 0; gunCount = 0; startGun(); break;
    }
    store.set('energy', energy);
  });
  function goHome(){ store.set('pos', null); if (mode === 'walk') endWalk(false); defPos(); positionAll(); savePos(); say('我回来啦～'); }
  function setFixed(v){ setS({ fixed: !!v }); if (S.fixed && mode === 'walk') endWalk(false); }
  let actCat = store.get('actCat', 'daily');
  const EVENT_ITEMS = () => [
    ...EV.whisper.frames.map((f, i) => ({ label: '说话姿势 ' + (i + 1), f, ok: EV.whisper.real })),
    ...EV.work.frames.map((f, i) => ({ label: ['工作·思考', '工作·忙碌', '工作·清点', '工作·等待', '工作·庆祝', '工作·出错'][i], f, ok: EV.work.real })),
    ...EV.token.frames.map((f, i) => ({ label: '账本档位 ' + (i + 1), f, ok: EV.token.real })),
    { label: '被拎起', f: EV.hang.frames[0], ok: EV.hang.real }, { label: '被甩飞', f: EV.fly.frames[0], ok: EV.fly.real }, { label: '屁股着地', f: EV.sitfall.frames[0], ok: EV.sitfall.real },
    { label: '吓一跳', f: EV.scared.frames[0], ok: EV.scared.real, run: () => scare() }, { label: '站着打瞌睡', f: EV.doze.frames[0], ok: EV.doze.real, run: () => doze() },
    { label: '行走', f: EV.walk.frames[0], ok: EV.walk.real, run: () => startWalk() },
  ];
  const OLD_IN_CATS = { book: OLD_OK.read ? [['read', '看书（翻页）']] : [], food: OLD_OK.ramen ? [['ramen', '吃拉面']] : [], sleep: OLD_OK.sleep ? [['sleep', '躺下睡觉']] : [], play: OLD_OK.badminton ? [['badminton', '打羽毛球']] : [], mood: [['spin', '转圈圈'], ['dance', '跳支舞']] };
  function renderActs(){
    const tabs = $('#actTabs'), grid = $('#actGrid'); tabs.textContent = ''; grid.textContent = '';
    const catsShown = CATS.filter(([k]) => k === 'event' || Object.values(POSES).some(Pz => Pz.cat === k)); if (!catsShown.some(([k]) => k === actCat)) actCat = catsShown[0][0];
    for (const [k, label] of catsShown){ const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = label; b.setAttribute('aria-selected', String(k === actCat)); b.addEventListener('click', () => { actCat = k; store.set('actCat', k); renderActs(); }); tabs.appendChild(b); }
    if (actCat === 'event'){
      for (const it of EVENT_ITEMS()){ const b = document.createElement('button'); b.type = 'button'; b.textContent = it.label + (it.ok ? '' : '（替身）'); if (!it.ok) b.className = 'old'; b.addEventListener('click', () => { acts.hidden = true; lastInteract = now() - 10000; if (it.run) it.run(); else playEvent(it.f, 5000, null, { force: false }); }); grid.appendChild(b); }
      return;
    }
    let n = 0;
    for (const [id, Pz] of Object.entries(POSES)) if (Pz.cat === actCat){ const b = document.createElement('button'); b.type = 'button'; b.textContent = Pz.name; b.dataset.pose = id; const ok = poseReady(id); if (!ok){ b.className = 'old'; b.title = '图还没画（' + poseFrames(Pz).join(', ') + '）'; } grid.appendChild(b); n++; }
    for (const [cmd, label] of (OLD_IN_CATS[actCat] || [])){ const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.cmd = cmd; grid.appendChild(b); n++; }
    if (!n){ const d = document.createElement('div'); d.className = 'empty'; d.textContent = '这一类还没有动作'; grid.appendChild(d); }
    $('#actsSub').textContent = `${Object.keys(POSES).filter(poseReady).length} 个可用`;
  }
  function openActs(){ touch(); if (!['idle', 'fallen', 'pose', 'work', 'event', 'chat'].includes(mode)) interrupt(); closePanels(acts); renderActs(); acts.hidden = false; sidePlace(acts); say('想看我做什么？', 2000); }
  acts.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return (acts.hidden = true);
    const p = e.target.closest('[data-pose]'), c = e.target.closest('[data-cmd]'); if (!p && !c) return;
    acts.hidden = true; lastInteract = now() - 10000;
    if (p){ if (mode === 'work' || mode === 'chat') setMode('idle'); return doPose(p.dataset.pose); }
    const cmd = c.dataset.cmd; if (mode !== 'idle') setMode('idle');
    if (cmd === 'spin') return startSpin(2); if (cmd === 'dance') return dance(); if (cmd === 'sleep') return startAct('sleep', 22000);
    startAct(cmd, { read: 18000, ramen: 18000, badminton: 16000 }[cmd]);
  });
  document.addEventListener('pointerdown', e => { for (const p of [menu, inter, acts]) if (!p.hidden && !p.contains(e.target) && !pet.contains(e.target)) p.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape'){ menu.hidden = true; inter.hidden = true; acts.hidden = true; if (!chat.hidden) closeChat(); } });

  /* ================= 主进程命令 / 设置变化 ================= */
  P0.onCmd(cmd => {
    if (cmd === 'reset-position') goHome();
    else if (cmd === 'fit') fit();
    else if (cmd === 'open-chat') openChat();
    else if (cmd === 'whisper') doWhisper(true);
    else if (cmd === 'poke'){ touch(); if (mode === 'idle'){ expr('happy', 1600); anim('jump'); say('我在这儿呢！'); } else if (!['fallen', 'work', 'chat'].includes(mode)) interrupt(); }
    else if (cmd === 'demo-work') demoWork();
    else if (cmd === 'test-notify') P0.notify({ title: NAME, body: '通知能用啦！代理等你确认、完成、出错时我会这样叫你～' });
    else if (cmd === 'ledger') reportLedger(true);
    else if (cmd === 'weather'){ loadWx().then(weatherTalk); }
    else if (cmd.startsWith('say:')) { talkPose(); say(cmd.slice(4).slice(0, 200), 5000); }
    else if (cmd.startsWith('pose:')) { const id = cmd.slice(5); if (POSES[id]) { if (mode !== 'idle') setMode('idle'); doPose(id); } }
  });
  function demoWork(){
    const seq = [['thinking', ''], ['working', 'Read · app.js'], ['result', ''], ['working', 'Edit · main.js'], ['waiting', '允许运行 npm test 吗？'], ['success', '']];
    let i = 0; const step = () => { if (i >= seq.length) return setTimeout(() => setWork(null), 6000); setWork(seq[i][0], seq[i][1], 'demo'); i++; setTimeout(step, i === 5 ? 4500 : 3000); }; step();
  }
  P0.store.onChange(({ name, data }) => {
    if (name === 'settings'){ const prev = S; S = { ...data, physics: PH.sanitize(data.physics || PH.DEFAULT_PHYSICS) }; if (S.size !== prev.size && Math.abs(S.size - sizeH) > 1) applySize(S.size, true, true); if (S.fixed && mode === 'walk') endWalk(false); if (S.dnd && (mode === 'gun' || mode === 'sulk')) setMode('idle'); if (S.clickThrough) setHit(false); if (S.motion !== prev.motion) applyMotionLevel(); }
    else if (name === 'profile'){ const hadLoc = PF.lat; PF = data; if (PF.lat !== hadLoc) loadWx(); }
    else if (name === 'memory') MEM = data;
    else if (name === 'history'){ /* 设置窗口清空了记录 */ if (!data.messages.length && history.length){ history = []; $('#log').textContent = ''; } }
  });
  P0.config.onChange(async c => { CFG = c; CUR = await P0.llm.current().catch(() => CUR); renderStatus(); });

  /* ================= token 账本（只记她自己调用模型的用量；金额是估算） ================= */
  const monthKey = () => { const d = nowLocal(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const freshLedger = () => ({ month: monthKey(), inTok: 0, outTok: 0, cost: 0, calls: 0, days: {}, lastTier: -1, byProvider: {} });
  let ledger = store.get('ledger', null); if (!ledger || ledger.month !== monthKey()) ledger = freshLedger();
  function ledgerAdd(usage, provider){
    if (!usage) return; if (ledger.month !== monthKey()) ledger = freshLedger();
    const i = +usage.input_tokens || 0, o = +usage.output_tokens || 0, c = i / 1e6 * (+S.priceIn || 0) + o / 1e6 * (+S.priceOut || 0);
    ledger.inTok += i; ledger.outTok += o; ledger.cost += c; ledger.calls++;
    const d = ledger.days[dayKey()] || (ledger.days[dayKey()] = { in: 0, out: 0, cost: 0 }); d.in += i; d.out += o; d.cost += c;
    const bp = ledger.byProvider[provider || 'unknown'] || (ledger.byProvider[provider || 'unknown'] = { in: 0, out: 0, calls: 0 }); bp.in += i; bp.out += o; bp.calls++;
    store.set('ledger', ledger);
    const tier = ledgerTier(); if (tier > ledger.lastTier && tier >= 3){ ledger.lastTier = tier; store.set('ledger', ledger); setTimeout(() => reportLedger(false), 1500); } else if (tier !== ledger.lastTier){ ledger.lastTier = tier; store.set('ledger', ledger); }
  }
  const ledgerPct = () => S.budget > 0 ? clamp(ledger.cost / S.budget * 100, 0, 100) : 0;
  const ledgerTier = () => { const p = ledgerPct(); return p >= 100 ? 5 : Math.min(4, Math.floor(p / 20)); };
  const fmtTok = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
  function reportLedger(manual){
    if (busyModes()) return;
    const tier = ledgerTier(), p = ledgerPct();
    const line = pick(window.PACK_TOKEN_LINES[tier]);
    const sub = ledger.calls ? `本月 ${fmtTok(ledger.inTok + ledger.outTok)} token，估算 ≈ $${ledger.cost.toFixed(3)}（按设置里的单价）${S.budget > 0 ? `，预算 $${S.budget} 用了 ${p.toFixed(1)}%` : ''}` : `这个月还没用过 token${S.budget > 0 ? `，预算 $${S.budget}` : ''}`;
    if (manual && Math.random() < .5) say(pick(LN.ledgerManual), 1200);
    setTimeout(() => playEvent(evFrame('token', tier), 7000, line, { ms: 8000, sayOpts: { sub }, mad: tier === 5, x: tier >= 4 ? 'sweat' : '' }), manual ? 900 : 0);
    fishLinkAct('ledger');
  }

  /* ================= 聊天（流式、情绪标签、记忆确认） ================= */
  const log = $('#log'), form = $('#form'), q = $('#q'), send = $('#send'), stopBtn = $('#stop'), statusEl = $('#status');
  let history = (HIST0 && Array.isArray(HIST0.messages)) ? HIST0.messages.slice(-600) : [];
  let busy = false, curReq = null, lastUserText = '', saveT = null;
  for (const m of history.slice(-30)) addMsg(m.role === 'user' ? 'me' : 'her', m.content, m.sticker);
  function saveHistory(){ clearTimeout(saveT); saveT = setTimeout(() => P0.store.set('history', { version: 2, messages: history.slice(-600) }).catch(() => {}), 300); }
  function pushHistory(role, content, extra){ history.push({ role, content, ts: now(), ...(extra || {}) }); if (history.length > 600) history = history.slice(-600); saveHistory(); }
  function renderStatus(){ statusEl.textContent = CUR.hasKey ? `${CUR.name} · ${CUR.model}` : '未连接模型（只能简单聊）'; $('#chatHint').textContent = CUR.hasKey ? '' : '去「模型设置」填密钥'; }
  renderStatus();
  function addMsg(who, text, sticker){
    const d = document.createElement('div'); d.className = 'msg ' + (who === 'me' ? 'me' : who === 'err' ? 'err' : who === 'sys' ? 'sys' : 'her');
    if (sticker && S.stickerOn !== false && MEMES[sticker]){ const im = document.createElement('img'); im.className = 'sticker'; im.src = `packs/${packId}/memes/${sticker}.webp`; im.alt = ''; im.onerror = () => im.remove(); d.appendChild(im); }
    d.append(document.createTextNode(text || '')); log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }
  function openChat(){
    if (!['idle', 'fallen', 'work', 'chat', 'pose', 'event'].includes(mode)) setMode('idle');
    closePanels(chat); chat.hidden = false; sidePlace(chat, 'bottom'); if (mode === 'idle'){ expr('happy', 1600, 1); anim('hop'); }
    if (!log.children.length){ addMsg('her', `嗨～我是${NAME}！想聊什么都可以跟我说哦 ✿\n想让我记住什么，就说「记住：……」`); if (!CUR.hasKey) addMsg('sys', '还没连接模型：在设置 → 模型里填好密钥，我就能真正回答问题了。'); }
    renderStatus(); P0.focus(); setTimeout(() => q.focus(), 80);
  }
  function closeChat(){ chat.hidden = true; touch(); if (!busy) say('聊得好开心！下次再来找我玩～'); }
  $('#close').addEventListener('click', closeChat);
  $('#compactBtn').addEventListener('click', () => { chat.classList.toggle('compact'); $('#compactBtn').textContent = chat.classList.contains('compact') ? '展开' : '收起'; sidePlace(chat, 'bottom'); });
  $('#clearChat').addEventListener('click', async () => { history = []; log.textContent = ''; await P0.store.set('history', { version: 2, messages: [] }).catch(() => {}); addMsg('sys', '聊天记录已清空（长期记忆还在）'); say('记录清空啦，我们重新开始聊～', 2600); });
  $('#chatSettings').addEventListener('click', () => P0.openSettings('model'));
  q.addEventListener('input', () => { touch(); q.style.height = 'auto'; q.style.height = Math.min(110, q.scrollHeight) + 'px'; });
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); form.requestSubmit(); } });
  q.addEventListener('focus', () => P0.focus());
  stopBtn.addEventListener('click', () => { if (curReq) P0.llm.abort(curReq); });

  // —— 提示词 ——
  const TONE = (PERSONA.tone || {})[PF.tone] || (PERSONA.tone || {}).cute || '';
  function profileBlock(){
    const parts = [];
    if (PF.name) parts.push(`用户叫「${PF.name}」`); if (PF.address) parts.push(`称呼用户为「${PF.address}」`); else if (PF.name) parts.push(`可以直接叫名字`);
    if (PF.city) parts.push(`用户在${PF.city}${PF.country ? '（' + PF.country + '）' : ''}`); if (PF.timezone) parts.push(`时区 ${PF.timezone}`);
    if (PF.interests && PF.interests.length) parts.push(`兴趣：${PF.interests.join('、')}`);
    if (PF.schedule && (PF.schedule.wake || PF.schedule.sleep)) parts.push(`作息：大约 ${PF.schedule.wake || '?'} 起床、${PF.schedule.sleep || '?'} 睡觉`);
    if (PF.notes) parts.push(`其他：${PF.notes}`);
    return parts.length ? '【用户资料】' + parts.join('；') + '。' : '【用户资料】用户还没填资料，别乱猜称呼，用“你”就好。';
  }
  const memoryBlock = () => (MEM.enabled && MEM.items.length) ? '【你记得的事】' + MEM.items.slice(0, 60).map(m => m.text).join('；') + '。' : '';
  const weatherBlock = () => wx ? '【天气】' + wxLine() : (wxState === 'nolocation' ? '【天气】用户没填所在地，你查不到天气，被问到就这么说。' : '【天气】暂时查不到天气。');
  const CONTROL = `【控制标签】回复的最后一行可以加一个标签告诉程序你的表情：[表情:开心] / 害羞 / 爱心 / 生气 / 难过 / 惊讶 / 困 / 得意 / 疑惑 / 饿了 / 累 / 庆祝 / 平静，只能用这些词，每次至多一个，不想加就不加。
如果用户明确说了一件以后值得记住的、关于他自己的事（喜好、习惯、重要日子、称呼等），可以在最后再加一行 [记住:一句话]，程序会先问用户同不同意再保存；不是用户亲口说的事不要记。标签只给程序看，不会显示给用户，正文里不要提到标签。`;
  function systemPrompt(extra){
    return [PERSONA.desc, TONE, PERSONA.rules, profileBlock(), memoryBlock(), weatherBlock(), fishOnline ? '隔壁桌面上还住着一只叫「蓝毛」的 DeepSeek 桌宠（蓝发小女仆，拖着鱼尾，爱吃白饭），你们是拌嘴但要好的邻居。' : '', timeLine(), CONTROL, extra || ''].filter(Boolean).join('\n');
  }
  function stripControl(text){
    let t = String(text || '');
    const emo = /\[\s*表情\s*[:：]\s*([^\]\n]+?)\s*\]/g, mem = /\[\s*记住\s*[:：]\s*([^\]\n]+?)\s*\]/g;
    let emotion = null, memo = null, m;
    while ((m = emo.exec(t))) emotion = m[1].trim(); while ((m = mem.exec(t))) memo = m[1].trim();
    t = t.replace(emo, '').replace(mem, '').replace(/\n{3,}/g, '\n\n').trim();
    return { text: t, emotion, memo };
  }
  // 流式显示时把结尾可能还没写完的标签藏起来
  const liveText = t => String(t || '').replace(/\[\s*(表情|记住)[^\]]*\]?\s*$/g, '').replace(/\[[^\]]{0,4}$/, '').trimEnd();
  function canned(t){
    for (const c of (PERSONA.canned || [])) if (c.re.test(t)) return pick(c.l);
    return pick(PERSONA.cannedDefault || ['…']);
  }
  function showEmotion(emotion, ms){
    if (!S.emotionOn || busyModes()) return;
    const e = EMO[emotion] || EMO['平静'] || null; if (!e) return;
    if (!['idle', 'chat', 'pose', 'event', 'read'].includes(mode)) return;
    if (has(e.f)){ setMode('chat', ms); chatFrame = e.f; setFrame(e.f); pet.dataset.x = e.x || ''; pet.dataset.blush = e.blush ? 'on' : ''; applyLoop(); anim('pop'); }
    if (e.anim) anim(e.anim); if (e.fx && FX[e.fx]) FX[e.fx](); else if (e.fx) poseFx(e.fx);
    setTimeout(() => { if (mode === 'chat') setMode('idle'); }, ms);
  }
  /** 一次模型调用。opts: {stream, onDelta, max_tokens, system, messages, timeoutMs} → {ok,text,usage,model,provider} | {ok:false,code,explain,detail} */
  async function callModel(opts){
    const id = uid(); curReq = id;
    const off = opts.onDelta ? P0.llm.onDelta(d => { if (d.id === id) opts.onDelta(d.delta, d.text); }) : null;
    try { const r = await P0.llm.chat({ id, system: opts.system, messages: opts.messages, max_tokens: opts.max_tokens || 600, temperature: opts.temperature, stream: !!opts.onDelta, timeoutMs: opts.timeoutMs }); if (r && r.ok && r.usage) ledgerAdd(r.usage, r.provider); return r || { ok: false, code: 'http', explain: '没有返回' }; }
    catch (e){ return { ok: false, code: 'http', explain: '调用失败', detail: String(e && e.message || e) }; }
    finally { off && off(); if (curReq === id) curReq = null; }
  }
  function buildMessages(text){
    const hist = S.rounds > 0 ? history.slice(-S.rounds * 2) : [];
    const msgs = hist.map(m => ({ role: m.role, content: m.content })); while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    // 连续同角色合并（有些服务商要求交替）
    const out = []; for (const m of msgs){ if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += '\n' + m.content; else out.push({ ...m }); }
    if (out.length && out[out.length - 1].role === 'user') out[out.length - 1].content += '\n' + text; else out.push({ role: 'user', content: text });
    return out;
  }
  function addMemory(text, source){
    text = String(text || '').trim().slice(0, 120); if (!text) return false;
    if (MEM.items.some(m => m.text === text)) return false;
    MEM.items.unshift({ id: uid(), text, ts: now(), source: source || 'user' }); MEM.items = MEM.items.slice(0, 200); saveMem(); return true;
  }
  /** 处理一句用户输入：显示、调模型（流式）、收尾（标签 / 记忆 / 表情）。via: chat | api */
  async function handleUserText(text, via){
    touch(); lastUserText = text; pushHistory('user', text);
    const mm = text.match(/^(?:请)?(?:记住|记下)[:：,，\s]+(.+)$/s);
    if (mm){ const ok = addMemory(mm[1], 'user'); const r = ok ? `好～我记住啦：「${mm[1].trim()}」✿` : `这件事我已经记着啦～`; pushHistory('assistant', r); if (mode === 'idle') { expr('happy', 1500, 1); anim('nod'); } return { ok: true, text: r }; }
    if (/^(?:忘掉|忘记|别记)[:：,，\s]+(.+)$/.test(text)){ const key = text.replace(/^(?:忘掉|忘记|别记)[:：,，\s]+/, '').trim(); const before = MEM.items.length; MEM.items = MEM.items.filter(m => !m.text.includes(key)); const r = MEM.items.length < before ? `好，关于「${key}」的我忘掉了。` : `我本来就没记过「${key}」呀～`; if (MEM.items.length < before) saveMem(); pushHistory('assistant', r); return { ok: true, text: r }; }
    busy = true; send.disabled = true; stopBtn.hidden = false; statusEl.textContent = '思考中…';
    if (!CUR.hasKey){ const r = canned(text); await new Promise(r2 => setTimeout(r2, 400)); pushHistory('assistant', r); busy = false; send.disabled = false; stopBtn.hidden = true; renderStatus(); talkPose(); say(r, sayMs(r)); return { ok: true, text: r, offline: true }; }
    // 等待时：思考姿势 + 常驻气泡
    const wasWork = mode === 'work' ? [workState, workTask] : null;
    if (['idle', 'pose', 'event', 'read', 'chat'].includes(mode)){ setMode('chat'); chatFrame = evFrame('work', 0); setFrame(chatFrame); pet.dataset.x = EV.work.real ? '' : 'think'; applyLoop(); }
    say(pick(LN.thinking), 0, false, { hold: true });
    let shown = ''; let talking = false;
    const r = await callModel({ system: systemPrompt(), messages: buildMessages(text), max_tokens: 700, onDelta: (delta, full) => {
      const t = liveText(full); if (t === shown) return; shown = t;
      if (!talking && mode === 'chat'){ talking = true; chatFrame = evFrame('whisper', Math.floor(Math.random() * 3)); setFrame(chatFrame); pet.dataset.x = ''; applyLoop(); anim('pop'); }
      if (via !== 'chat' || chat.hidden || chat.classList.contains('compact')) renderBubble(t.slice(0, 160), false, { live: true, quiet: true });
      if (liveMsg){ liveMsg.textContent = t; log.scrollTop = log.scrollHeight; }
    } });
    busy = false; send.disabled = false; stopBtn.hidden = true; releaseHold(); renderStatus();
    if (!r.ok){
      const msg = r.code === 'aborted' ? '（已停止）' : `${r.explain || '出错了'}${r.detail ? '：' + String(r.detail).slice(0, 120) : ''}`;
      if (mode === 'chat') setMode('idle');
      if (r.code !== 'aborted'){ expr(has('m_think') ? 'm_think' : 'normal', 3000, '', 'sweat'); anim('tilt'); say(pick(LN.confused) + ' ' + (r.explain || ''), 5000, true); }
      else if (shown){ pushHistory('assistant', shown + '（未说完）'); }
      if (wasWork) setTimeout(() => setWork(wasWork[0], wasWork[1]), 300);
      return { ok: false, code: r.code, text: msg, explain: r.explain, detail: r.detail };
    }
    const { text: clean, emotion, memo } = stripControl(r.text);
    const e = EMO[emotion] || null, sticker = e && S.stickerOn !== false ? e.sticker : null;
    pushHistory('assistant', clean, sticker ? { sticker } : null);
    const ms = sayMs(clean);
    if (mode === 'chat'){ chatFrame = evFrame('whisper', Math.floor(Math.random() * 3)); setFrame(chatFrame); applyLoop(); }
    if (emotion && e) showEmotion(emotion, Math.min(ms, 9000)); else if (mode === 'chat'){ anim('nod'); setTimeout(() => { if (mode === 'chat') setMode('idle'); }, ms); }
    say(clean.length > 160 ? clean.slice(0, 158) + '…' : clean, ms);
    if (wasWork) setTimeout(() => { if (mode === 'idle') setWork(wasWork[0], wasWork[1]); }, ms + 200);
    return { ok: true, text: clean, emotion, memo: memo && memo.length <= 120 ? memo : null, sticker };
  }
  let liveMsg = null;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = q.value.trim(); if (!text || busy) return;
    q.value = ''; q.style.height = 'auto'; addMsg('me', text);
    liveMsg = addMsg('her', ''); liveMsg.classList.add('live');
    const r = await handleUserText(text, 'chat');
    finishMsg(liveMsg, r); liveMsg = null; q.focus();
  });
  function finishMsg(node, r){
    node.classList.remove('live'); node.textContent = '';
    if (!r.ok){ node.className = 'msg err'; node.append(document.createTextNode(r.text)); if (r.code !== 'aborted'){ const b = document.createElement('button'); b.className = 'act'; b.textContent = '重试'; b.addEventListener('click', () => retryLast()); node.appendChild(b); } if (['nokey', 'badkey', 'quota', 'badmodel'].includes(r.code)){ const b2 = document.createElement('button'); b2.className = 'act'; b2.textContent = '去模型设置'; b2.addEventListener('click', () => P0.openSettings('model')); node.appendChild(b2); } return; }
    if (r.sticker && S.stickerOn !== false && MEMES[r.sticker]){ const im = document.createElement('img'); im.className = 'sticker'; im.src = `packs/${packId}/memes/${r.sticker}.webp`; im.alt = ''; im.onerror = () => im.remove(); node.appendChild(im); }
    node.append(document.createTextNode(r.text)); if (r.offline){ const s = document.createElement('div'); s.style.cssText = 'font-size:11px;color:var(--muted);margin-top:4px'; s.textContent = '（离线自带台词）'; node.appendChild(s); }
    if (r.memo){ const box = document.createElement('div'); box.style.marginTop = '6px'; const lab = document.createElement('div'); lab.style.cssText = 'font-size:12px;color:var(--muted)'; lab.textContent = `要记住「${r.memo}」吗？`; box.appendChild(lab); const y = document.createElement('button'); y.className = 'act'; y.textContent = '记住'; const n = document.createElement('button'); n.className = 'act'; n.textContent = '不用'; y.addEventListener('click', () => { addMemory(r.memo, 'confirmed'); box.textContent = '✓ 记住了（设置 → 记忆 里能改）'; box.style.cssText = 'font-size:12px;color:var(--muted);margin-top:6px'; }); n.addEventListener('click', () => box.remove()); box.append(y, n); node.appendChild(box); }
    log.scrollTop = log.scrollHeight;
  }
  async function retryLast(){ if (busy || !lastUserText) return; const t = lastUserText; if (history.length && history[history.length - 1].role === 'user' && history[history.length - 1].content === t) history.pop(); liveMsg = addMsg('her', ''); liveMsg.classList.add('live'); const r = await handleUserText(t, 'chat'); finishMsg(liveMsg, r); liveMsg = null; }
  function talkPose(){ if (['idle', 'pose', 'event'].includes(mode)) playEvent(evFrame('whisper', Math.floor(Math.random() * 3)), 7000, null, { force: false }); if (mode === 'event') anim('nod'); }

  /* ================= 碎碎念与主动陪伴 ================= */
  let lastWhisper = now() - 60000, whisperBusy = false;
  const userPresent = () => now() - lastPointer < 10 * 60000;
  const recentWhispers = store.get('recentWhispers', []);
  function noteWhisper(t){ recentWhispers.push(t); while (recentWhispers.length > 30) recentWhispers.shift(); store.set('recentWhispers', recentWhispers); }
  const canTalk = () => !dnd() && !quietNow() && userPresent() && !panelsOpen() && bubble.hidden && ['idle', 'pose', 'read', 'event'].includes(mode);
  async function doWhisper(manual, topic){
    if (whisperBusy) return;
    if (!manual){ if (!S.whisperOn || !canTalk()) return; }
    else { touch(); if (busyModes()) return; }
    lastWhisper = now();
    if (!CUR.hasKey){ talkPose(); say(nextIdle(), 4000); return; }
    whisperBusy = true;
    try {
      const hints = [];
      if (PF.interests && PF.interests.length && Math.random() < .4) hints.push(`可以聊聊用户的兴趣之一「${pick(PF.interests)}」`);
      if (wx && Math.random() < .3) hints.push('可以顺口提一句现在的天气');
      if (topic) hints.push(topic);
      const user = `随便说一句日常碎碎念，一句就好，20 字以内，不要问问题。${hints.length ? hints.join('；') + '。' : ''}${recentWhispers.length ? '\n不要和这些重复：' + recentWhispers.slice(-12).join(' / ') : ''}`;
      const res = await callModel({ system: systemPrompt('现在不是在回答问题，而是你自己冒出来的一句话。只输出这一句，不加引号，也不要加控制标签。'), messages: [{ role: 'user', content: user }], max_tokens: 80, timeoutMs: 40000 });
      const text = res.ok ? stripControl(res.text).text.split('\n')[0].replace(/^[「"“']+|[」"”']+$/g, '').slice(0, 60) : '';
      if (!text){ if (manual) say(res.ok ? pick(LN.whisperFail) : ((res.explain || '出错了') + '，先用自带的：' + nextIdle()), 4000); return; }
      if (!manual && !canTalk()) return;
      noteWhisper(text); talkPose(); say(text, 9000);
      if (Math.random() < .4) fishSay(text, false);
    } catch { if (manual) say(pick(LN.whisperFail), 2200); }
    finally { whisperBusy = false; }
  }
  setInterval(() => { if (now() - lastWhisper >= whisperMinutes() * 60000 && Math.random() < LV().whisperP) doWhisper(false); }, 30000);
  // 提醒：每天每种只一次；休息按连续在电脑前的时间算
  const fired = store.get('fired', {}); const firedKey = k => dayKey() + ':' + k;
  const once = (k, fn) => { if (fired[firedKey(k)]) return false; fired[firedKey(k)] = 1; for (const kk of Object.keys(fired)) if (!kk.startsWith(dayKey())) delete fired[kk]; store.set('fired', fired); fn(); return true; };
  let activeMin = 0, lastActiveTick = now(), greeted = false;
  setInterval(() => {
    const t = now();
    if (userPresent() && t - lastPointer < 120000) activeMin += (t - lastActiveTick) / 60000; else if (t - lastPointer > 10 * 60000) activeMin = 0;
    lastActiveTick = t;
    if (!canTalk()) return;
    const h = hourNow(), mins = hhmm(), lv = LV();
    const restEvery = S.restRemindMin === 0 ? 0 : (+S.restRemindMin > 0 ? +S.restRemindMin : lv.restEvery);
    if (restEvery && activeMin >= restEvery){ activeMin = 0; talkPose(); say(pick(LN.rest), 5000); return; }
    if (lv.meals && S.mealRemind !== false){
      if (h >= 7 && h <= 9 && once('meal-b', () => say(pick(LN.meal.breakfast), 4500))) return;
      if (h >= 11 && h <= 13 && once('meal-l', () => say(pick(LN.meal.lunch), 4500))) return;
      if (h >= 17 && h <= 19 && once('meal-d', () => say(pick(LN.meal.dinner), 4500))) return;
    }
    const sl = parseHM(PF.schedule && PF.schedule.sleep); if (sl != null && Math.abs(mins - sl) <= 5 && once('sleep', () => { talkPose(); say(pick(LN.sleepRemind), 5000); })) return;
    if (S.weatherRemind !== false && wx && h >= 7 && h <= 10 && once('wx', () => weatherTalk())) return;
    const fest = TC.activeFestivals(nowLocal(), tcExtra()).find(c => c.delta === 0);
    if (fest && once('fest-' + fest.e.name, () => { talkPose(); say(`${fest.e.name}快乐！${PF.address ? PF.address + '，' : ''}今天也要开开心心的～`, 6000); burst(['✦', '✧', '🎉'], 6, 'star'); })) return;
    if (h === 0 && once('late', () => say('已经过零点了，早点睡觉觉吧…明天还要早起哦。', 5000))) return;
  }, 30000);

  /* ================= 工作状态（代理事件 / 本地接口） ================= */
  let workState = null, workTask = '', workClear = null, workAnimLoop = null, workSource = '';
  const WORK_IDX = { thinking: 0, working: 1, result: 2, waiting: 3, success: 4, error: 5 };
  function setWork(state, task, source){
    if (state && !(state in WORK_IDX)) state = null;
    clearTimeout(workClear);
    if (!state){ workState = null; workTask = ''; clearInterval(workAnimLoop); releaseHold(); if (mode === 'work') setMode('idle'); return; }
    const changed = state !== workState; workState = state; workTask = task || ''; if (source) workSource = source;
    const idx = WORK_IDX[state], terminal = state === 'success' || state === 'error';
    const text = workTask || pick(window.PACK_WORK_TEXTS[idx]);
    if (!busyModes() && mode !== 'chat'){
      if (mode !== 'work') setMode('work');
      workFrame = evFrame('work', idx); rest(); applyLoop(); if (changed && !terminal) anim('pop');
      clearInterval(workAnimLoop);
      if (state === 'waiting') workAnimLoop = setInterval(() => { if (mode === 'work') anim(pick(['peek', 'tilt', 'nod'])); }, 2600);
      if (changed){ if (terminal){ releaseHold(); anim(state === 'success' ? 'jump' : 'shake'); if (state === 'success') burst(['✦', '✧', '★'], 6, 'star'); say(text, 10000, state === 'error'); } else say(text, 0, false, { hold: true }); }
      else if (!terminal) say(text, 0, false, { hold: true });
    }
    const srcName = workSource === 'claude-code' ? 'Claude Code' : workSource === 'demo' ? '演示' : '代理';
    if (changed && S.notifyOn && S.hooksNotify !== false && !quietNow() && (state === 'waiting' || terminal)) P0.notify({ title: state === 'waiting' ? `${srcName} 在等你` : state === 'success' ? `${srcName} 做完啦` : `${srcName} 出错了`, body: workTask || text, tag: 'work' });
    if (changed) fishLinkAct('work_' + state);
    workClear = setTimeout(() => setWork(null), terminal ? 60000 : 15 * 60000);
  }

  /* ================= 本地接口（主进程 http → 这里） ================= */
  P0.onApi(async (req) => {
    const { id, type, body } = req || {};
    const reply = (res) => P0.apiReply(id, res);
    try {
      if (type === 'state') return reply({ ok: true, version: '3.0', pack: packId, mode, frame, pos: [posX(), posY()], size: sizeH, energy, dnd: dnd(), quiet: quietNow(), fixed: !!S.fixed, work: workState ? { state: workState, task: workTask, source: workSource } : null, lastSaid, score: scoreTotal, model: CUR.hasKey ? { provider: CUR.provider, model: CUR.model } : null, ledger: { month: ledger.month, tokens: ledger.inTok + ledger.outTok, estCost: +ledger.cost.toFixed(5), pct: +ledgerPct().toFixed(1) }, fish: { on: !!S.neighbour, online: fishOnline } });
      if (type === 'say'){ const t = String(body && body.text || '').trim(); if (!t) return reply({ ok: false, reason: 'bad-request' }); if (!['drag', 'fly'].includes(mode)) talkPose(); say(t.slice(0, 200), +body.ms || 8000, !!body.mad); return reply({ ok: true }); }
      if (type === 'anim'){ const name = String(body && body.name || ''); if (POSES[name]){ if (!poseReady(name)) return reply({ ok: false, reason: 'no-frame' }); if (mode === 'work') setMode('idle'); doPose(name); return reply({ ok: true }); }
        const map = { spin: () => startSpin(2), dance, walk: () => startWalk(), turn: () => startTurn(), scared: () => scare(), doze: () => doze(), read: () => startAct('read', 16000), ramen: () => startAct('ramen', 17000), badminton: () => startAct('badminton', 14000), sleep: () => startAct('sleep', 22000), ledger: () => reportLedger(true), whisper: () => doWhisper(true), gun: () => startGun(), home: () => goHome() };
        if (map[name]){ if (['drag', 'fly'].includes(mode)) return reply({ ok: false, reason: 'busy' }); if (mode === 'work' && name !== 'ledger' && name !== 'whisper') setMode('idle'); map[name](); return reply({ ok: true }); }
        if (HAVE.has(name)){ playEvent(name, +body.ms || 5000, body.text || null); return reply({ ok: true }); }
        const emo = EMO[name]; if (emo){ showEmotion(name, +body.ms || 5000); if (body.text) say(String(body.text).slice(0, 200), +body.ms || 5000); return reply({ ok: true }); }
        return reply({ ok: false, reason: 'unknown-animation', names: Object.keys(POSES).filter(poseReady).concat(Object.keys(map)).concat(Object.keys(EMO)) }); }
      if (type === 'chat'){ const t = String(body && body.text || '').trim(); if (!t) return reply({ ok: false, reason: 'bad-request' }); if (busy) return reply({ ok: false, reason: 'busy' }); addMsg('me', t); const r = await handleUserText(t, 'api'); addMsg(r.ok ? 'her' : 'err', r.text, r.sticker); return reply({ ok: r.ok, text: r.text, emotion: r.emotion || null, error: r.ok ? null : r.code }); }
      if (type === 'whisper'){ doWhisper(true); return reply({ ok: true }); }
      if (type === 'work'){ setWork(body && body.state, body && body.task, body && body.source); return reply({ ok: true, state: workState }); }
      if (type === 'notify'){ P0.notify({ title: String(body && body.title || NAME), body: String(body && body.body || '') }); return reply({ ok: true }); }
      return reply({ ok: false, reason: 'unknown' });
    } catch (err){ reply({ ok: false, reason: 'error', message: String(err && err.message || err) }); }
  });

  /* ================= 邻居：蓝毛（DeepSeek 桌宠），可关 ================= */
  const FISH = '蓝毛';
  let fishOnline = false, fishBusy = false, fishSayCounter = null, fishSayText = '', fishAnims = null, fishSeenOnline = false;
  let fishNextBanter = now() + 20000, fishNextReact = 0, fishNextAnim = 0, fishNextSay = 0, fishTalkAt = store.get('fishTalkAt', 0);
  const ourSaid = new Map();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fishOn = () => S.neighbour !== false;
  const FB = window.PACK_FISH_BANTER || [], FR = window.PACK_FISH_REACT || [], FRA = window.PACK_FISH_REACT_ANY || ['嗯？'], FHELLO = window.PACK_FISH_HELLO || ['你来啦'], FGONE = window.PACK_FISH_GONE || ['走了？'], FBYE = window.PACK_FISH_BYE || ['拜拜'], FTOPICS = window.PACK_FISH_TOPICS || ['今天过得怎么样'], FLINK = window.PACK_FISH_LINK || {}, FLINKACT = window.PACK_FISH_LINK_ACT || {};
  function fishAllowed(name){ return !fishAnims || fishAnims.has(name); }
  async function fishLoadAnims(){
    const r = await P0.fish({ op: 'config' }); if (!r.ok || !r.data || !r.data.main) return;
    const a = r.data.main.animations || {}, out = new Set();
    const add = l => { if (!Array.isArray(l)) return; for (const n of l){ if (typeof n === 'string' && n) out.add(n); else if (Array.isArray(n)) add(n); else if (n && typeof n === 'object' && typeof n.name === 'string') out.add(n.name); } };
    add(a.idle); add(a.turn); add(a.drag); add(a.clicks); add(a.moves && a.moves.actions);
    if (Array.isArray(a.categories)) for (const c of a.categories) add(c && c.actions);
    if (a.events && typeof a.events === 'object') for (const k in a.events) add(a.events[k]);
    if (out.size) fishAnims = out;
  }
  async function fishAnim(name){ if (!name || !fishOn() || !fishOnline || now() < fishNextAnim || !fishAllowed(name)) return false; fishNextAnim = now() + 6000; const r = await P0.fish({ op: 'anim', name }); return !!(r.ok && r.data && r.data.ok); }
  async function fishSay(text, fromUser, force){ if (!text || !fishOn() || !fishOnline || (!force && now() < fishNextSay)) return false; fishNextSay = now() + 10000; ourSaid.set(text, now()); const r = await P0.fish({ op: 'say', text }); return !!(r.ok && r.data && r.data.ok); }
  async function pollFish(){
    if (!fishOn()){ fishOnline = false; return; }
    const r = await P0.fish({ op: 'state' });
    const was = fishOnline; fishOnline = !!(r.ok && r.data && r.data.pets);
    if (!fishOnline){ if (was){ fishSayCounter = null; fishAnims = null; if (bubble.hidden && mode === 'idle') say(pick(FGONE), 3000); } return; }
    if (!was){ fishLoadAnims(); if (fishSeenOnline && bubble.hidden && mode === 'idle') say(pick(FHELLO), 3000); fishSeenOnline = true; }
    const leaf = r.data.pets.main && r.data.pets.main.say, c = leaf ? leaf.counter : 0, d = leaf && leaf.data;
    const text = d && typeof d.text === 'string' ? d.text.trim() : '';
    const changed = fishSayCounter !== null && c !== fishSayCounter;
    fishSayCounter = c; if (text) fishSayText = text;
    for (const [k, t] of ourSaid) if (now() - t > 90000) ourSaid.delete(k);
    if (changed && text && !ourSaid.has(text) && !fishBusy) fishHeard(text);
  }
  function fishHeard(text){
    if (drag || !bubble.hidden || panelsOpen() || quietNow()) return;
    if (!['idle', 'read', 'pose', 'event'].includes(mode) || now() < fishNextReact || Math.random() < .3) return;
    fishNextReact = now() + 25000;
    if (/[!！]{2,}|救命|啊啊/.test(text) && Math.random() < .5) return scare('蓝毛你喊什么呀！吓我一跳！');
    const hit = FR.find(x => x.re.test(text));
    if (mode === 'idle'){ expr(pick(['smile', 'happy', 'normal']), 2600); anim(pick(['tilt', 'nod', 'hop'])); }
    say(pick(hit ? hit.l : FRA), 3600);
  }
  function fishBanter(manual){
    if (!FB.length) return; const b = pick(FB);
    expr(b.kf || 'happy', 3200, b.kb ? 1 : '', b.kx || ''); anim(b.ka || 'hop'); say(b.k, 3600);
    setTimeout(() => { if (!fishOn() || !fishOnline) return; fishSay(b.f, !!manual, true); if (b.fa) fishAnim(b.fa, !!manual); }, 1700);
    fishNextBanter = now() + 90000;
  }
  function fishTick(){
    if (!fishOn() || !fishOnline || fishBusy || now() < fishNextBanter || Math.random() > .45 || quietNow()) return false;
    if (!dnd() && CUR.hasKey && now() - fishTalkAt > 12 * 60000 && Math.random() < .5){ fishTalk(false); return true; }
    fishBanter(); return true;
  }
  const fishPersona = () => systemPrompt(`现在你不是在和用户说话，而是在和桌面上隔壁的另一只桌宠聊天：她叫「${FISH}」，是 DeepSeek 的 Q 版蓝发小女仆桌宠，身后拖着一条蓝色鱼尾，爱吃白饭、爱摸鱼、爱碎碎念、会帮主人管余额，偶尔毒舌。你们是又拌嘴又要好的邻居，你可以调侃她是「大肥鱼」，也会护着自己的主人。只输出你要对她说的那一句话：中文，不超过 40 字，不要加引号、不要加名字前缀、不要解释、不要控制标签。`);
  async function fishLine(convo, topic){
    const msgs = [{ role: 'user', content: `请你主动跟${FISH}搭话。话题：${topic}` }];
    for (const c of convo) msgs.push(c.who === 'me' ? { role: 'assistant', content: c.text } : { role: 'user', content: `${FISH}回你：「${c.text}」\n请接着回她一句。` });
    const res = await callModel({ system: fishPersona(), messages: msgs, max_tokens: 120, timeoutMs: 40000 });
    return res.ok ? stripControl(res.text).text.split('\n')[0].replace(/^[「"“']+|[」"”']+$/g, '').replace(/^小克[:：]\s*/, '').slice(0, 60) : '';
  }
  async function fishAsk(text){
    const before = fishSayCounter;
    const r = await P0.fish({ op: 'chat', text: `【隔壁桌宠${NAME}对你说】${text}` });
    if (!r.ok || !r.data || r.data.ok === false) return '';
    for (let i = 0; i < 20; i++){ await pollFish(); if (fishSayCounter !== before && fishSayText) return fishSayText; await sleep(1000); }
    return '';
  }
  async function fishTalk(manual){
    if (fishBusy) return;
    if (!fishOn() || !fishOnline){ if (manual) say('蓝毛不在呢…先把 DeepSeek Harness 打开吧。', 3200); return; }
    if (!CUR.hasKey){ if (manual) say('要真的和她聊，得先在设置里填好模型密钥哦～', 3200); return; }
    if (dnd() && !manual) return;
    fishBusy = true; const t0 = now(); fishTalkAt = t0; store.set('fishTalkAt', t0);
    const alive = () => fishOn() && fishOnline && chat.hidden && !drag && (manual || !dnd()) && lastInteract <= t0 + 400;
    const convo = [];
    try {
      if (mode !== 'idle') setMode('idle');
      const topic = pick(FTOPICS);
      for (let round = 0; round < 2; round++){
        if (!alive()) break;
        const mine = await fishLine(convo, topic); if (!mine || !alive()) break;
        convo.push({ who: 'me', text: mine });
        expr(pick(['happy', 'smile', 'excited']), 6000, round ? 1 : ''); anim(pick(['hop', 'tilt', 'sway'])); say(mine, 8000);
        const reply = await fishAsk(mine); if (!reply || !alive()) break;
        convo.push({ who: 'fish', text: reply });
        await sleep(Math.min(7000, 2000 + reply.length * 150));
      }
      if (convo.length >= 2 && alive()){ expr('happy', 2600, 1); anim('nod'); say(pick(FBYE), 3600); }
      else if (manual && !convo.length) say('唔…蓝毛没有回我。', 3000);
    } catch {} finally { fishBusy = false; fishNextBanter = now() + 120000; }
  }
  function fishLink(w, fromUser){ const l = FLINK[w]; if (!l) return; if (l.a) fishAnim(l.a, fromUser); if (l.s && Math.random() < .8) fishSay(l.s, fromUser); }
  const FISH_LINK_ACT_MECH = {
    walk: { a: '螃蟹走路', s: '小克你去哪儿？等等我！', p: .25 }, fly: { a: '被吓一跳', s: '小克飞起来了！！主人你干了什么！', p: .9 }, drag: { a: '被吓一跳', p: 0 },
    scared: { a: '被吓一跳', p: 0 }, ledger: { a: '余额-数金皱眉', s: '说到账本…我也该数数钱袋了', p: .5 },
    work_thinking: { a: '工作状态-思考冒泡', p: 0 }, work_working: { a: '工作状态-忙碌点按', s: '主人在干活，我也忙起来', p: .3 }, work_waiting: { a: '工作状态-原地踱步张望', p: 0 }, work_success: { a: '工作状态-雀跃庆祝', s: '搞定啦！', p: .5 }, work_error: { a: '工作状态-垂头叹气冒汗', p: 0 },
  };
  function fishLinkAct(k){ const l = FLINKACT[k] || FISH_LINK_ACT_MECH[k]; if (!l) return; if (l.a) fishAnim(l.a, false); if (l.s && Math.random() < (l.p == null ? .6 : l.p)) fishSay(l.s, false); }
  setTimeout(pollFish, 1500); setInterval(pollFish, 3000);

  /* ================= 首次见面（可跳过，以后在设置 → 资料 里改） ================= */
  const wiz = { step: 0, data: { name: PF.name || '', address: PF.address || '', city: PF.city || '', country: PF.country || '', lat: PF.lat, lon: PF.lon, timezone: PF.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '', interests: (PF.interests || []).join('、'), wake: (PF.schedule && PF.schedule.wake) || '08:00', sleep: (PF.schedule && PF.schedule.sleep) || '23:30', tone: PF.tone || 'cute' } };
  const wizBody = $('#wizBody');
  function wizRender(){
    const d = wiz.data; wizBody.textContent = ''; $('#wizSteps').textContent = `第 ${wiz.step + 1} / 3 步`; $('#wizBack').hidden = wiz.step === 0; $('#wizNext').textContent = wiz.step === 2 ? '完成' : '下一步';
    const add = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); wizBody.appendChild(t.content); };
    if (wiz.step === 0){
      $('#wizTitle').textContent = '初次见面～';
      add(`<p>我是${NAME}！先告诉我怎么称呼你吧（都可以不填）。</p>
        <label>你的名字 / 昵称<input id="wzName" maxlength="20" placeholder="比如：小明"></label>
        <label>希望我怎么叫你<input id="wzAddr" maxlength="12" placeholder="比如：主人 / 哥哥 / 直接叫名字"></label>
        <label>我说话的语气<select id="wzTone"><option value="cute">软萌可爱（默认）</option><option value="calm">温和安静</option><option value="lively">元气活泼</option></select></label>`);
      $('#wzName').value = d.name; $('#wzAddr').value = d.address; $('#wzTone').value = d.tone;
    } else if (wiz.step === 1){
      $('#wizTitle').textContent = '你在哪儿呀？';
      add(`<p>填了所在地我才能查真实的天气、按你的时间问候（会联网查地名坐标，只保存城市名和经纬度）。</p>
        <label>城市<div class="row"><input id="wzCity" maxlength="40" placeholder="输入城市名，中英文都行" style="flex:1"><button class="btn ghost" id="wzSearch" type="button">查找</button></div></label>
        <div class="geo" id="wzGeo"></div>
        <p id="wzPicked" style="color:var(--muted);font-size:12px">${d.lat != null ? `已选：${d.city}${d.country ? '（' + d.country + '）' : ''} · 时区 ${d.timezone}` : '还没选所在地（也可以跳过）'}</p>
        <label>时区<input id="wzTz" maxlength="40" placeholder="自动填"></label>`);
      $('#wzCity').value = d.city; $('#wzTz').value = d.timezone;
      const doSearch = async () => { const qv = $('#wzCity').value.trim(); if (!qv) return; $('#wzGeo').textContent = '查找中…'; const res = await P0.geoSearch(qv); const g = $('#wzGeo'); g.textContent = ''; if (!res.length){ g.textContent = '没找到，换个写法试试（比如英文名）'; return; } for (const r of res){ const b = document.createElement('button'); b.type = 'button'; b.textContent = `${r.name}${r.admin ? ' · ' + r.admin : ''}${r.country ? ' · ' + r.country : ''}`; b.addEventListener('click', () => { Object.assign(d, { city: r.name, country: r.country, lat: r.lat, lon: r.lon, timezone: r.timezone || d.timezone }); $('#wzTz').value = d.timezone; $('#wzPicked').textContent = `已选：${d.city}（${d.country}） · 时区 ${d.timezone}`; g.textContent = ''; }); g.appendChild(b); } };
      $('#wzSearch').addEventListener('click', doSearch); $('#wzCity').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); doSearch(); } });
    } else {
      $('#wizTitle').textContent = '最后一点点';
      add(`<p>聊天和碎碎念会参考这些；以后随时在设置里改。</p>
        <label>兴趣爱好（用、分开）<input id="wzInt" maxlength="80" placeholder="比如：游戏、看书、做饭"></label>
        <div class="row"><label style="flex:1">平时几点起<input id="wzWake" type="time"></label><label style="flex:1">几点睡<input id="wzSleep" type="time"></label></div>
        <p style="color:var(--muted);font-size:12px">这些都只保存在这台电脑上（profile.json），聊天时会一起发给你选的模型服务商。</p>`);
      $('#wzInt').value = d.interests; $('#wzWake').value = d.wake; $('#wzSleep').value = d.sleep;
    }
    sidePlace(wizard);
  }
  function wizCollect(){
    const d = wiz.data;
    if (wiz.step === 0){ d.name = $('#wzName').value.trim(); d.address = $('#wzAddr').value.trim(); d.tone = $('#wzTone').value; }
    if (wiz.step === 1){ const c = $('#wzCity').value.trim(); if (c && c !== d.city){ d.city = c; } d.timezone = $('#wzTz').value.trim() || d.timezone; }
    if (wiz.step === 2){ d.interests = $('#wzInt').value.trim(); d.wake = $('#wzWake').value; d.sleep = $('#wzSleep').value; }
  }
  function wizSave(done){
    const d = wiz.data;
    setPF({ done: true, name: d.name, address: d.address, tone: d.tone, city: d.city, country: d.country, lat: d.lat, lon: d.lon, timezone: d.timezone, interests: d.interests ? d.interests.split(/[、,，\s/]+/).filter(Boolean).slice(0, 12) : [], schedule: { wake: d.wake, sleep: d.sleep } });
    wizard.hidden = true; setS({ firstRunDone: true });
    if (done){ expr('happy', 2600, 1); anim('hop'); FX.hearts(); say(`记住啦！${d.address || d.name ? (d.address || d.name) + '，' : ''}以后请多关照～`, 4000); loadWx(); }
    else say('好～以后想填的话，在设置 → 资料里。', 3000);
  }
  $('#wizNext').addEventListener('click', () => { wizCollect(); if (wiz.step < 2){ wiz.step++; wizRender(); } else wizSave(true); });
  $('#wizBack').addEventListener('click', () => { wizCollect(); wiz.step = Math.max(0, wiz.step - 1); wizRender(); });
  $('#wizSkip').addEventListener('click', () => { wizCollect(); wizSave(false); });
  $('#wizClose').addEventListener('click', () => { wizard.hidden = true; setS({ firstRunDone: true }); });
  function openWizard(){ closePanels(wizard); wiz.step = 0; wizRender(); wizard.hidden = false; sidePlace(wizard); P0.focus(); }

  /* ================= 见面 ================= */
  setTimeout(() => {
    greeted = true;
    const h = hourNow(); const g = LN.greet || {};
    const line = h < 5 ? pick(g.night || ['…']) : h < 11 ? pick(g.morning || ['早']) : h < 14 ? pick(g.noon || ['中午好']) : h < 22 ? pick(g.evening || ['晚上好']) : pick(g.late || ['夜深了']);
    expr('happy', 1800); anim('hop');
    if (!S.firstRunDone && !PF.done){ say(PERSONA.hello || line, 7000); setTimeout(openWizard, 1200); return; }
    say(userLabel() ? line.replace(/[！!]/, '，' + userLabel() + '！') : line, 3000);
    if (!store.get('seen30', false)){ store.set('seen30', true); setTimeout(() => say('我升级到 3.0 啦！多了一百多个新动作，右键我试试：聊天 / 互动 / 动作 / 设置～', 8000), 3500); }
    else if (wx && !dnd() && !quietNow() && S.weatherRemind !== false) setTimeout(() => once('wx', weatherTalk), 3300);
  }, 700);
})();
