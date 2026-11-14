// 小克 2.3 — 拖拽弹簧 / 甩抛 / 反弹 / Q 弹 的纯计算（无 DOM）。
// 坐标语义：全部是「她的包围盒左上角」像素坐标（窗口视口坐标），速度 px/s。
(() => {
  const SPRING_K = 200, SPRING_C = 30;            // 过阻尼弹簧：ζ≈1.06，跟手不抖不过冲
  const TRAIL_KEEP_MS = 200, RELEASE_WINDOW_MS = 150, RELEASE_STALE_MS = 150, MIN_SPAN_MS = 20, SEG_MIN_DT_MS = 8;
  const DEAD_ZONE_SPEED = 500, MAX_THROW_SPEED = 3600, PEAK_WEIGHT = .5, ACCEL_REF = 8000, ACCEL_GAIN_MAX = .6;
  const REST_VY = 40, REST_VX = 15, MAX_STEP_DT = .05;
  const SQ_SQUASH = .55, SQ_DURATION_MS = 220, SQ_SOFT_SPEED = 300, SQ_HARD_SPEED = 1500;

  const DEFAULT_PHYSICS = { gravity: 1400, restitution: .78, groundFriction: 2.5, ceilingBounce: true, throwPower: 1 };
  const PRESETS = {
    normal: { label: '正常', gravity: 1400, restitution: .78, groundFriction: 2.5, ceilingBounce: true, throwPower: 1 },
    moon:   { label: '月球', gravity: 300, restitution: .85, groundFriction: 1.2, ceilingBounce: true, throwPower: 1 },
    ice:    { label: '冰面', gravity: 1400, restitution: .6, groundFriction: 0.15, ceilingBounce: true, throwPower: 1 },
    bouncy: { label: '弹力球', gravity: 1400, restitution: .97, groundFriction: 2.5, ceilingBounce: true, throwPower: 1.2 },
    float:  { label: '无重力', gravity: 0, restitution: .95, groundFriction: 0, ceilingBounce: true, throwPower: 1 },
  };
  function sanitize(p){
    const o = { ...DEFAULT_PHYSICS, ...(p || {}) };
    o.gravity = Math.max(0, +o.gravity || 0); o.restitution = Math.min(1, Math.max(0, +o.restitution || 0));
    o.groundFriction = Math.max(0, +o.groundFriction || 0); o.throwPower = Math.max(.1, +o.throwPower || 1); o.ceilingBounce = !!o.ceilingBounce;
    return o;
  }

  const springStep = (v, x, target, dt, power = 1) => v + ((target - x) * SPRING_K - v * SPRING_C) * power * dt;
  function trimTrail(trail, now){ const cut = now - TRAIL_KEEP_MS; let i = 0; while (i < trail.length && trail[i].t < cut) i++; return i ? trail.slice(i) : trail; }
  const softClamp = s => s <= 0 ? 0 : MAX_THROW_SPEED * (1 - Math.exp(-s / MAX_THROW_SPEED));

  /** 由最近 150ms 指针轨迹估算松手初速；null = 温柔放下 */
  function estimateReleaseVelocity(trail, now, physics = DEFAULT_PHYSICS){
    if (!trail.length) return null;
    if (now - trail[trail.length - 1].t > RELEASE_STALE_MS) return null;
    const win = trail.filter(s => now - s.t <= RELEASE_WINDOW_MS); if (win.length < 2) return null;
    const a = win[0], b = win[win.length - 1], span = b.t - a.t; if (span < MIN_SPAN_MS) return null;
    const bvx = (b.x - a.x) / span * 1000, bvy = (b.y - a.y) / span * 1000, base = Math.hypot(bvx, bvy); if (base < 1e-6) return null;
    const segs = []; let px = a.x, py = a.y, pt = a.t;
    for (const s of win.slice(1)){ const dt = s.t - pt; if (dt >= SEG_MIN_DT_MS){ segs.push({ speed: Math.hypot(s.x - px, s.y - py) / dt * 1000, t: s.t }); px = s.x; py = s.y; pt = s.t; } }
    const peak = segs.length ? Math.max(...segs.map(s => s.speed)) : base;
    let accel = 0; if (segs.length >= 2){ const l = segs[segs.length - 1], f = segs[0]; accel = (l.speed - f.speed) / Math.max((l.t - f.t) / 1000, MIN_SPAN_MS / 1000); }
    const pre = ((1 - PEAK_WEIGHT) * base + PEAK_WEIGHT * peak) * (1 + Math.min(Math.max(accel, 0) / ACCEL_REF, 1) * ACCEL_GAIN_MAX);
    const speed = softClamp(pre) * physics.throwPower; if (speed < DEAD_ZONE_SPEED) return null;
    return { vx: bvx / base * speed, vy: bvy / base * speed };
  }

  /** 抛体单步 + 边界反弹。b = {minX,minY,maxX,maxY}（包围盒左上角允许范围） */
  function throwStep(s, dtRaw, b, physics = DEFAULT_PHYSICS){
    const dt = Math.min(Math.max(dtRaw, 0), MAX_STEP_DT);
    let { x, y, vx, vy } = s; vy += physics.gravity * dt; x += vx * dt; y += vy * dt;
    let bounced = false, wall = false, ground = false;
    if (x < b.minX){ x = b.minX; vx = Math.abs(vx) * physics.restitution; bounced = wall = true; }
    else if (x > b.maxX){ x = b.maxX; vx = -Math.abs(vx) * physics.restitution; bounced = wall = true; }
    if (y < b.minY){ if (physics.ceilingBounce){ y = b.minY; vy = Math.abs(vy) * physics.restitution; bounced = wall = true; } }
    else if (y >= b.maxY){ y = b.maxY; vx *= Math.max(0, 1 - physics.groundFriction * dt); if (Math.abs(vy) < REST_VY) vy = 0; else vy = -Math.abs(vy) * physics.restitution; bounced = ground = true; }
    const speed = Math.hypot(vx, vy);
    const atRest = (y >= b.maxY - 1 && Math.abs(vy) < 1 && Math.abs(vx) < REST_VX) || (bounced && speed < REST_VY && Math.abs(vy) < 1);
    return { x, y, vx, vy, bounced, wall, ground, atRest };
  }

  /** 落地冲击速度 → 压扁深度（scaleY 最小值）：轻落 0.8，重砸 0.55 */
  const landingSquash = v => { const t = Math.min(Math.max((Math.abs(v) - SQ_SOFT_SPEED) / (SQ_HARD_SPEED - SQ_SOFT_SPEED), 0), 1); return Math.min(.8, 1 - t * (1 - SQ_SQUASH)); };
  /** Q 弹曲线：u∈[0,1] → scaleY。前 45% ease-in 压下，后 55% easeOutBack 回弹过冲 */
  function squashScale(u, squash = SQ_SQUASH){
    if (u < .45){ const p = u / .45; return 1 - (1 - squash) * p * p; }
    const p = (u - .45) / .55, c1 = 1.70158, c3 = c1 + 1, f = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
    return Math.min(1.12, squash + (1 - squash) * Math.max(f, 0));
  }
  /** 飞行中点中得分：每 100 px/s 一分，人物越小越难点、分越高（以身高 330px 为基准） */
  const clickScore = (speed, heightPx) => Math.max(1, Math.round(speed / 100 * 330 / Math.max(120, heightPx)));

  window.PHYS = { DEFAULT_PHYSICS, PRESETS, sanitize, springStep, trimTrail, estimateReleaseVelocity, throwStep, landingSquash, squashScale, clickScore,
    SQ_DURATION_MS, SQ_SQUASH, DEAD_ZONE_SPEED, SCORE_MIN_SPEED: 400 };
})();
