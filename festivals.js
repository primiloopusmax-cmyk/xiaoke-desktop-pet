// 小克 3.0 — 时间背景与节日表（纯逻辑，无 DOM）。传入的 Date 应是用户时区的墙上时间。
// 用途：① 给碎碎念 / 聊天的系统提示词加一行「当下」；② 给动作链的「时节」分类算权重与开关。
// 农历用浏览器自带的 ICU 中国农历（Intl 'en-u-ca-chinese'），零依赖；闰月不参与匹配。
(() => {
  const SLOTS = [[23, '深夜'], [19, '晚上'], [17, '傍晚'], [13, '下午'], [11, '中午'], [9, '上午'], [7, '早上'], [5, '清晨'], [0, '凌晨']];
  const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const DAY_MS = 86400000;
  const DEF = { ahead: 3, span: 1, after: 3 };

  // 顺序 = 优先级（一天只说一句，靠前的先说）。tags 给动作链用：哪些时节动作在这个节日窗口里加权。
  const PRIORITY = [
    { kind: 'solar', key: '2-14', name: '情人节', after: 0, tags: ['valentine'] },
    { kind: 'solar', key: '12-31', name: '跨年夜', after: 0, tags: ['fireworks'] },
    { kind: 'solar', key: '4-1', name: '愚人节', after: 0, tags: [] },
    { kind: 'solar', key: '11-5', name: '篝火夜', after: 1, tags: ['fireworks'] },           // 英国 Bonfire Night
    { kind: 'lunarEve', name: '除夕', ahead: 1, after: 0, tags: ['fu', 'dumplings', 'fireworks', 'hongbao'] },
    { kind: 'lunar', key: '1-15', name: '元宵节', tags: ['tangyuan', 'lantern', 'skylantern'] },
    { kind: 'lunar', key: '1-1', name: '春节', spoken: '大年初一', span: 15, tags: ['hongbao', 'lion', 'fu', 'dumplings', 'fireworks'] },
    { kind: 'lunar', key: '8-15', name: '中秋节', span: 3, after: 2, tags: ['moon', 'mooncake'] },
    { kind: 'solar', key: '10-1', name: '国庆节', span: 7, tags: [] },
    { kind: 'solar', key: '1-1', name: '元旦', spoken: '新年第一天', span: 3, tags: ['fireworks'] },
    { kind: 'lunar', key: '5-5', name: '端午节', span: 3, tags: ['zongzi'] },
    { kind: 'solar', key: '4-4', name: '清明节', span: 3, ahead: 1, tags: ['qingtuan', 'kite'] },
    { kind: 'easter', name: '复活节', ahead: 3, span: 2, after: 1, tags: ['easter'] },
    { kind: 'solar', key: '5-1', name: '劳动节', span: 3, tags: [] },
    { kind: 'solar', key: '6-1', name: '儿童节', tags: ['balloon', 'gift'] },
    { kind: 'lunar', key: '7-7', name: '七夕', tags: ['stargazing', 'valentine'] },
    { kind: 'lunar', key: '7-15', name: '中元节', tags: ['skylantern'] },
    { kind: 'lunar', key: '2-2', name: '龙抬头', tags: [] },
    { kind: 'lunar', key: '9-9', name: '重阳节', tags: [] },
    { kind: 'lunar', key: '12-8', name: '腊八节', tags: [] },
    { kind: 'lunar', key: '12-23', name: '小年', tags: ['fu'] },
    { kind: 'season', from: '1-20', to: '2-18', name: '寒假', tags: [] },
    { kind: 'season', from: '7-1', to: '8-29', name: '暑假', tags: [] },
    { kind: 'solar', key: '3-8', name: '妇女节', tags: [] },
    { kind: 'solar', key: '9-10', name: '教师节', tags: [] },
    { kind: 'solar', key: '10-31', name: '万圣夜', ahead: 6, tags: ['trickortreat', 'ghost', 'pumpkin'] },
    { kind: 'solar', key: '12-24', name: '平安夜', after: 0, tags: ['xmastree', 'gift'] },
    { kind: 'solar', key: '12-25', name: '圣诞节', ahead: 10, span: 2, tags: ['xmastree', 'gift', 'snowman'] },
    { kind: 'solar', key: '12-26', name: '节礼日', after: 0, tags: ['gift'] },                  // 英国 Boxing Day
  ];

  let lunarFmt;
  function getLunarFmt(){
    if (lunarFmt === null) return undefined;
    if (!lunarFmt){
      try {
        const f = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric', year: 'numeric' });
        lunarFmt = f.resolvedOptions().calendar === 'chinese' ? f : null;
      } catch { lunarFmt = null; }
    }
    return lunarFmt || undefined;
  }
  function lunarPartsOf(d){
    const f = getLunarFmt(); if (!f) return undefined;
    const parts = f.formatToParts(d); const pick = t => (parts.find(p => p.type === t) || {}).value;
    const rm = pick('month'), rd = pick('day'), ry = pick('relatedYear') || pick('year');
    if (!rm || !rd || !ry) return undefined;
    const m = parseInt(rm, 10), day = parseInt(rd, 10), y = parseInt(ry, 10);
    if (![m, day, y].every(Number.isFinite)) return undefined;
    const gy = d.getFullYear(); if (y !== gy && y !== gy - 1) return undefined;
    return { month: /bis/i.test(rm) ? -m : m, day };
  }
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  function isLunarEve(d){
    const t = lunarPartsOf(d); if (!t || t.month !== 12) return false;
    const n = lunarPartsOf(addDays(d, 1)); return !!(n && n.month === 1 && n.day === 1);
  }
  // 复活节（西方，Anonymous Gregorian algorithm）
  function easterOf(year){
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const dayOfYear = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / DAY_MS;
  const doyOf = (y, md) => { const [m, dd] = md.split('-').map(Number); return (Date.UTC(y, m - 1, dd) - Date.UTC(y, 0, 1)) / DAY_MS; };

  function entriesAt(d, extra){
    const out = [];
    const solarKey = (d.getMonth() + 1) + '-' + d.getDate();
    const lunar = lunarPartsOf(d);
    PRIORITY.forEach((e, priority) => {
      if (e.kind === 'solar' && e.key === solarKey) out.push({ e, priority });
      else if (e.kind === 'lunar' && lunar && lunar.month > 0 && e.key === lunar.month + '-' + lunar.day) out.push({ e, priority });
      else if (e.kind === 'lunarEve' && isLunarEve(d)) out.push({ e, priority });
      else if (e.kind === 'easter' && sameDay(easterOf(d.getFullYear()), d)) out.push({ e, priority });
    });
    if (extra && extra.birthday){ // 'MM-DD'
      if (extra.birthday === solarKey) out.push({ e: { kind: 'solar', name: '你的生日', spoken: '你的生日', ahead: 2, span: 1, after: 1, tags: ['birthday', 'noodles', 'cake', 'gift'] }, priority: -1 });
    }
    return out;
  }
  function phraseOf(e, delta){
    const span = e.span ?? DEF.span;
    if (delta > 0) return delta === 1 ? '明天就是' + e.name : '快要过' + e.name + '了';
    if (delta === 0) return '今天是' + (e.spoken || e.name);
    const daysIn = -delta;
    if (daysIn < span) return span - daysIn === 1 ? e.name + '假期最后一天了' : '还在' + e.name + '假期里';
    const rest = daysIn - span; return rest <= 1 ? e.name + '刚过完' : e.name + '这么快就过完了';
  }
  function candidateOf(r, delta){
    const e = r.e, ahead = e.ahead ?? DEF.ahead, span = e.span ?? DEF.span, after = e.after ?? DEF.after, daysIn = -delta;
    if (delta > 0 && delta > ahead) return undefined;
    if (delta < 0 && daysIn >= span + after) return undefined;
    return { clause: phraseOf(e, delta), priority: r.priority, e, delta, span };
  }
  function seasonCandidateOf(d){
    const y = d.getFullYear(), today = dayOfYear(d);
    for (let i = 0; i < PRIORITY.length; i++){
      const e = PRIORITY[i]; if (e.kind !== 'season') continue;
      const from = doyOf(y, e.from), to = doyOf(y, e.to), name = e.name;
      if (today < from){ const ahead = from - today; if (ahead > 3) continue; return { clause: ahead === 1 ? '明天就放' + name + '了' : '快要放' + name + '了', priority: i, e }; }
      if (today <= to){ if (today === from) return { clause: name + '开始了', priority: i, e }; if (to - today < 3) return { clause: name + '快结束了', priority: i, e }; return { clause: '正在放' + name, priority: i, e }; }
      const rest = today - to - 1; if (rest >= 3) continue; return { clause: rest <= 1 ? name + '刚结束' : name + '这么快就过完了', priority: i, e };
    }
    return undefined;
  }
  const MAX_AHEAD = 10, MAX_LOOKBACK = 17;
  /** 所有在窗口内的节日候选（按优先级排序），给动作链用 */
  function activeFestivals(d, extra){
    const list = [];
    for (let delta = -MAX_LOOKBACK; delta <= MAX_AHEAD; delta++){
      const day = addDays(d, delta);
      for (const r of entriesAt(day, extra)){ const c = candidateOf(r, delta); if (c) list.push(c); }
    }
    const s = seasonCandidateOf(d); if (s) list.push(s);
    list.sort((a, b) => a.priority - b.priority);
    return list;
  }
  function holidayClauseOf(d, extra){ const l = activeFestivals(d, extra); return l.length ? l[0].clause : ''; }
  const timeSlotOf = h => { for (const [s, name] of SLOTS) if (h >= s) return name; return '凌晨'; };
  const pad2 = n => String(n).padStart(2, '0');

  /** 注入提示词的一行时间背景 */
  function timeContextOf(d, extra){
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    const hol = holidayClauseOf(d, extra);
    return '【当下】现在是' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日' + WEEKDAYS[d.getDay()] + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + '，' + timeSlotOf(d.getHours()) + '，' + ((d.getDay() === 0 || d.getDay() === 6) ? '周末' : '工作日') + (hol ? '，' + hol : '') + '。这只是背景，不必刻意报时，也别句句都提节日，真贴切时才顺口带一句。';
  }

  /** 当下的「时节标签」→ 权重倍数。节日窗口里的 tags 高权重；当季标签普通权重；天气标签由调用方合并。 */
  function seasonTags(d, extra){
    const tags = new Map(); // tag → weight multiplier
    let m = d.getMonth() + 1;
    if (extra && extra.south) m = ((m + 5) % 12) + 1;   // 南半球：季节反过来
    const add = (t, w) => tags.set(t, Math.max(tags.get(t) || 0, w));
    // 当季（北半球温带的节奏）
    if (m >= 9 && m <= 11) ['leaves', 'crab'].forEach(t => add(t, 1));
    if (m === 12 || m <= 2) ['snowman', 'scarf', 'hotpot'].forEach(t => add(t, 1));
    if (m >= 3 && m <= 5) ['kite', 'cherry'].forEach(t => add(t, 1));
    if (m >= 6 && m <= 8) ['watermelon', 'fan', 'watergun'].forEach(t => add(t, 1));
    for (const c of activeFestivals(d, extra)){
      const weight = c.delta === 0 ? 4 : 2.5;   // 当天最高
      for (const t of (c.e.tags || [])) add(t, weight);
    }
    return tags;
  }

  window.TIMECTX = { timeContextOf, activeFestivals, seasonTags, timeSlotOf, easterOf, lunarPartsOf };
})();
