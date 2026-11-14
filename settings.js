// 小克 3.0 — 设置窗口
(async () => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const A = window.pet; const PH = window.PHYS;
  let S = await A.store.get('settings'), PF = await A.store.get('profile'), MEM = await A.store.get('memory'), HIST = await A.store.get('history'), CFG = await A.config.get(), INFO = await A.info();
  S.physics = PH.sanitize(S.physics || PH.DEFAULT_PHYSICS);
  const toastEl = $('#toast'); let toastT = null;
  const toast = t => { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 1800); };
  const setS = async patch => { Object.assign(S, patch); await A.store.patch('settings', patch); };
  const sw = (id, key, onChange) => { const b = $('#' + id); b.setAttribute('aria-checked', String(!!S[key])); b.addEventListener('click', async () => { await setS({ [key]: !S[key] }); b.setAttribute('aria-checked', String(!!S[key])); onChange && onChange(S[key]); }); return b; };
  const num = (id, key, fix) => { const i = $('#' + id); i.value = S[key] == null ? '' : S[key]; i.addEventListener('change', async () => { let v = i.value === '' ? null : +i.value; if (fix) v = fix(v); await setS({ [key]: v }); i.value = v == null ? '' : v; }); return i; };

  /* 导航 */
  function showTab(t){ $$('nav [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t))); $$('section.tab').forEach(s => s.classList.toggle('on', s.dataset.tab === t)); }
  $$('nav [data-tab]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  const want = new URLSearchParams(location.search).get('tab'); if (want && $(`section.tab[data-tab="${want}"]`)) showTab(want);
  A.onSettingsTab(t => { if (t && $(`section.tab[data-tab="${t}"]`)) showTab(t); });
  $('#brandVer').textContent = INFO.version; $('#aboutVer').textContent = INFO.version; $('#aboutDir').textContent = INFO.userData; $('#aboutApp').textContent = INFO.appDir; $('#memPath').textContent = INFO.userData;
  $('#openFolder').addEventListener('click', () => A.openFolder());

  /* ===== 人物与窗口 ===== */
  const size = $('#size'), sizeO = $('#sizeO');
  const renderSize = () => { size.value = S.size; sizeO.textContent = S.size + ' px'; $$('#sizeSeg button').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.size - S.size) < 30))); };
  renderSize();
  size.addEventListener('input', () => { sizeO.textContent = size.value + ' px'; });
  size.addEventListener('change', () => setS({ size: +size.value }).then(renderSize));
  $$('#sizeSeg button').forEach(b => b.addEventListener('click', () => setS({ size: +b.dataset.size }).then(renderSize)));
  sw('fixed', 'fixed'); sw('clickThrough', 'clickThrough', v => v && toast('穿透已开：托盘菜单里可以关')); sw('topmost', 'topmost');
  const motionSel = $('#motion'); const renderMotion = () => { motionSel.value = S.motion || 'full'; }; renderMotion(); motionSel.addEventListener('change', () => setS({ motion: motionSel.value }));
  const disp = $('#display');
  async function renderDisplays(){ const d = await A.displays(); disp.textContent = ''; const o0 = document.createElement('option'); o0.value = 'primary'; o0.textContent = '主屏幕'; disp.appendChild(o0); for (const x of d.all){ const o = document.createElement('option'); o.value = x.id; o.textContent = x.label + (x.id === String(d.primary) ? '（主）' : ''); disp.appendChild(o); } disp.value = S.display && [...disp.options].some(o => o.value === String(S.display)) ? String(S.display) : 'primary'; }
  renderDisplays(); disp.addEventListener('change', () => setS({ display: disp.value }));
  $('#home').addEventListener('click', () => A.relay('reset-position'));
  $('#hideBtn').addEventListener('click', () => A.relay('hide'));
  const login = $('#login'); login.setAttribute('aria-checked', String(!!INFO.login)); login.addEventListener('click', async () => { const v = await A.setLogin(login.getAttribute('aria-checked') !== 'true'); login.setAttribute('aria-checked', String(!!v)); });
  async function renderPacks(){ const list = await A.packs(); const box = $('#packs'); box.textContent = ''; for (const p of list){ const d = document.createElement('div'); d.className = 'pack'; d.setAttribute('aria-selected', String(p.id === CFG.pack)); d.innerHTML = `<img alt=""><b></b><small></small>`; d.querySelector('img').src = p.preview || ''; d.querySelector('b').textContent = p.name; d.querySelector('small').textContent = (p.version ? 'v' + p.version + ' · ' : '') + (p.desc || ''); d.addEventListener('click', async () => { if (p.id === CFG.pack) return; if (await A.setPack(p.id)){ CFG.pack = p.id; renderPacks(); toast('已切换人物包：' + p.name); } }); box.appendChild(d); } $('#aboutPack').textContent = (list.find(p => p.id === CFG.pack) || {}).name || CFG.pack; }
  renderPacks();

  /* ===== 模型 ===== */
  const PROV_HELP = { claude: '在 console.anthropic.com → API Keys 申请密钥，按用量计费，和 Claude 订阅额度分开。默认模型 claude-haiku-5-5 最省；不提供余额查询接口。', deepseek: '在 platform.deepseek.com 申请密钥。模型：deepseek-chat（日常）/ deepseek-reasoner（推理）。支持余额查询。', custom: '任何 OpenAI 兼容接口（/v1/chat/completions）：填端点（如 https://api.xxx.com/v1）、模型名和密钥。余额看各家。' };
  const PROV_EP = { claude: 'https://api.anthropic.com', deepseek: 'https://api.deepseek.com', custom: 'https://…/v1' };
  let prov = CFG.provider;
  function renderProv(){
    $$('#provSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.prov === prov)));
    const p = CFG.providers[prov] || {}; $('#endpoint').value = p.endpoint || ''; $('#endpoint').placeholder = '默认：' + PROV_EP[prov]; $('#model').value = p.model || '';
    $('#keyState').textContent = p.hasKey ? `已保存（…${p.keyTail}）` : '未填'; $('#keyState').className = 'muted ' + (p.hasKey ? 'ok' : 'warn'); $('#key').value = '';
    $('#provHelp').textContent = PROV_HELP[prov]; $('#testOut').textContent = ''; $('#balanceOut').textContent = prov === 'deepseek' ? '点「查询」' : '该服务商不提供余额查询接口'; $('#balanceBtn').disabled = prov !== 'deepseek';
    $('#modelList').textContent = '';
  }
  renderProv();
  $$('#provSeg button').forEach(b => b.addEventListener('click', async () => { prov = b.dataset.prov; await A.config.setProvider(prov); CFG = await A.config.get(); renderProv(); toast('当前服务商：' + b.textContent); }));
  $('#endpoint').addEventListener('change', async () => { await A.config.setOpts(prov, { endpoint: $('#endpoint').value }); CFG = await A.config.get(); });
  $('#model').addEventListener('change', async () => { await A.config.setOpts(prov, { model: $('#model').value }); CFG = await A.config.get(); });
  $('#saveKey').addEventListener('click', async () => { const k = $('#key').value.trim(); if (!k) return toast('先粘贴密钥'); await A.config.setKey(prov, k); CFG = await A.config.get(); renderProv(); toast('密钥已加密保存'); });
  $('#clearKey').addEventListener('click', async () => { await A.config.setKey(prov, ''); CFG = await A.config.get(); renderProv(); toast('已清除'); });
  $('#testBtn').addEventListener('click', async () => { const o = $('#testOut'); o.textContent = '测试中…'; o.className = 'muted'; const r = await A.llm.test(prov); if (r.ok){ o.textContent = `连接成功 ✓ ${r.ms} ms · 模型 ${r.model}` + (r.usage ? ` · 用了 ${r.usage.input_tokens}+${r.usage.output_tokens} token` : ''); o.className = 'muted ok'; } else { o.textContent = `失败：${r.explain}${r.detail ? '（' + r.detail.slice(0, 160) + '）' : ''}`; o.className = 'muted bad'; } });
  $('#fetchModels').addEventListener('click', async () => { const r = await A.llm.models(prov); const dl = $('#modelList'); dl.textContent = ''; for (const m of r.models){ const o = document.createElement('option'); o.value = m; dl.appendChild(o); } toast(r.ok ? `拿到 ${r.models.length} 个模型名，点输入框选` : (r.explain || '没拿到，用内置清单')); $('#model').focus(); });
  $('#balanceBtn').addEventListener('click', async () => { const o = $('#balanceOut'); o.textContent = '查询中…'; const r = await A.llm.balance(prov); if (!r.supported) o.textContent = '该服务商不提供余额查询接口'; else if (!r.ok) o.textContent = '查不到：' + (r.explain || r.code); else o.textContent = r.balances.map(b => `${b.total} ${b.currency}`).join(' / ') + (r.available ? '' : '（账户不可用）') + ' · ' + new Date(r.at).toLocaleTimeString(); });
  function renderLedger(){
    let led = null; try { led = JSON.parse(localStorage.getItem('xk.ledger')); } catch {}
    // 账本存在桌宠窗口的 localStorage（同源，这里能读）
    const fmtTok = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n || 0);
    if (!led || !led.calls){ $('#ledgerOut').textContent = '这个月还没用过'; $('#costOut').textContent = '—'; $('#ledgerBar').style.width = '0'; return; }
    $('#ledgerOut').textContent = `${fmtTok(led.inTok + led.outTok)}（输入 ${fmtTok(led.inTok)} / 输出 ${fmtTok(led.outTok)}，${led.calls} 次调用）` + (led.byProvider ? ' · ' + Object.entries(led.byProvider).map(([k, v]) => `${k} ${fmtTok(v.in + v.out)}`).join('，') : '');
    const pct = S.budget > 0 ? Math.min(100, led.cost / S.budget * 100) : 0;
    $('#costOut').textContent = `估算 ≈ $${led.cost.toFixed(4)}${S.budget > 0 ? `，预算 $${S.budget} 用了 ${pct.toFixed(1)}%` : ''}`; $('#ledgerBar').style.width = pct + '%';
  }
  renderLedger(); setInterval(renderLedger, 5000);
  num('budget', 'budget', v => Math.max(0, v || 0)); num('priceIn', 'priceIn', v => Math.max(0, v || 0)); num('priceOut', 'priceOut', v => Math.max(0, v || 0));
  num('rounds', 'rounds', v => Math.max(0, Math.min(30, Math.round(v || 0)))); sw('stickerOn', 'stickerOn'); sw('emotionOn', 'emotionOn');

  /* ===== 陪伴 ===== */
  const LEVEL_DESC = { quiet: '安静：约每 30 分钟才可能冒一句，不提醒吃饭，不会因为你不理她而掏枪，休息提醒 90 分钟一次。', normal: '适中：约每 10 分钟可能冒一句，饭点和休息（60 分钟）会提醒，早上播天气。', lively: '活泼：约每 4 分钟可能冒一句，话更多，休息提醒 45 分钟一次。' };
  const renderLevel = () => { $$('#levelSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.level === (S.companion || 'normal')))); $('#levelDesc').textContent = LEVEL_DESC[S.companion || 'normal']; };
  renderLevel(); $$('#levelSeg button').forEach(b => b.addEventListener('click', () => setS({ companion: b.dataset.level }).then(renderLevel)));
  sw('dnd', 'dnd');
  const q = S.quietHours || { on: true, from: '23:00', to: '08:00' }; const qOn = $('#quietOn'); qOn.setAttribute('aria-checked', String(!!q.on)); $('#quietFrom').value = q.from || '23:00'; $('#quietTo').value = q.to || '08:00';
  const saveQuiet = () => setS({ quietHours: { on: qOn.getAttribute('aria-checked') === 'true', from: $('#quietFrom').value || '23:00', to: $('#quietTo').value || '08:00' } });
  qOn.addEventListener('click', () => { qOn.setAttribute('aria-checked', String(qOn.getAttribute('aria-checked') !== 'true')); saveQuiet(); }); $('#quietFrom').addEventListener('change', saveQuiet); $('#quietTo').addEventListener('change', saveQuiet);
  sw('whisperOn', 'whisperOn'); num('whisperMin', 'whisperMin', v => Math.max(0, Math.min(240, Math.round(v || 0)))); num('restRemindMin', 'restRemindMin', v => v == null ? null : Math.max(0, Math.min(300, Math.round(v))));
  sw('mealRemind', 'mealRemind'); sw('weatherRemind', 'weatherRemind'); sw('notifyOn', 'notifyOn'); $('#notifyTest').addEventListener('click', () => A.relay('test-notify'));
  $('#bday').value = S.bday || ''; $('#bday').addEventListener('change', () => setS({ bday: $('#bday').value || '' })); $('#bdayClear').addEventListener('click', () => { $('#bday').value = ''; setS({ bday: '' }); });

  /* ===== 资料 ===== */
  const pf = { ...PF }; let interests = [...(PF.interests || [])];
  $('#pfName').value = pf.name || ''; $('#pfAddress').value = pf.address || ''; $('#pfCity').value = pf.city || ''; $('#pfTz').value = pf.timezone || ''; $('#pfWake').value = (pf.schedule && pf.schedule.wake) || ''; $('#pfSleep').value = (pf.schedule && pf.schedule.sleep) || ''; $('#pfNotes').value = pf.notes || '';
  const renderTone = () => $$('#toneSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tone === (pf.tone || 'cute'))));
  renderTone(); $$('#toneSeg button').forEach(b => b.addEventListener('click', () => { pf.tone = b.dataset.tone; renderTone(); }));
  const geoPicked = () => { $('#geoPicked').textContent = pf.lat != null ? `已定位：${pf.city}${pf.country ? '（' + pf.country + '）' : ''} ${(+pf.lat).toFixed(2)}, ${(+pf.lon).toFixed(2)}` : '未定位（填了城市后点查找）'; $('#geoPicked').className = 'muted ' + (pf.lat != null ? 'ok' : 'warn'); };
  geoPicked();
  async function geoSearch(){ const qv = $('#pfCity').value.trim(); if (!qv) return; const g = $('#geoList'); g.textContent = '查找中…'; const res = await A.geoSearch(qv); g.textContent = ''; if (!res.length){ g.textContent = '没找到，换个写法试试（比如英文名）'; return; } for (const r of res){ const b = document.createElement('button'); b.type = 'button'; b.textContent = `${r.name}${r.admin ? ' · ' + r.admin : ''}${r.country ? ' · ' + r.country : ''}（${r.timezone}）`; b.addEventListener('click', () => { Object.assign(pf, { city: r.name, country: r.country, lat: r.lat, lon: r.lon, timezone: r.timezone || pf.timezone }); $('#pfCity').value = r.name; $('#pfTz').value = pf.timezone; g.textContent = ''; geoPicked(); }); g.appendChild(b); } }
  $('#geoBtn').addEventListener('click', geoSearch); $('#pfCity').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); geoSearch(); } });
  $('#tzAuto').addEventListener('click', () => { $('#pfTz').value = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; });
  const renderTags = () => { const box = $('#interests'); box.querySelectorAll('.tag').forEach(t => t.remove()); const input = $('#interestIn'); for (const t of interests){ const s = document.createElement('span'); s.className = 'tag'; s.textContent = t; const x = document.createElement('button'); x.textContent = '×'; x.addEventListener('click', () => { interests = interests.filter(i => i !== t); renderTags(); }); s.appendChild(x); box.insertBefore(s, input); } };
  renderTags();
  $('#interestIn').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ',' || e.key === '，' || e.key === '、'){ e.preventDefault(); const v = e.target.value.trim(); if (v && !interests.includes(v) && interests.length < 12) interests.push(v); e.target.value = ''; renderTags(); } });
  $('#pfSave').addEventListener('click', async () => {
    const pending = $('#interestIn').value.trim(); if (pending && !interests.includes(pending)) { interests.push(pending); $('#interestIn').value = ''; renderTags(); }
    const city = $('#pfCity').value.trim(); if (city !== pf.city){ pf.city = city; if (!city){ pf.lat = null; pf.lon = null; } }
    const data = { ...pf, done: true, name: $('#pfName').value.trim(), address: $('#pfAddress').value.trim(), timezone: $('#pfTz').value.trim(), interests, schedule: { wake: $('#pfWake').value, sleep: $('#pfSleep').value }, notes: $('#pfNotes').value.trim() };
    await A.store.set('profile', data); PF = data; await setS({ firstRunDone: true }); $('#pfState').textContent = '已保存 ✓'; toast('资料已保存'); setTimeout(() => { $('#pfState').textContent = ''; }, 2000);
  });

  /* ===== 记忆 ===== */
  const memEnabled = $('#memEnabled'); memEnabled.setAttribute('aria-checked', String(MEM.enabled !== false));
  memEnabled.addEventListener('click', async () => { MEM.enabled = !(MEM.enabled !== false); memEnabled.setAttribute('aria-checked', String(MEM.enabled)); await A.store.set('memory', MEM); });
  function renderMem(){
    const list = $('#memList'); list.textContent = '';
    for (const m of MEM.items){ const d = document.createElement('div'); d.className = 'item'; const t = document.createElement('div'); t.className = 't'; t.contentEditable = 'true'; t.textContent = m.text; t.title = '点击可以直接改'; t.addEventListener('blur', async () => { const v = t.textContent.trim().slice(0, 120); if (v && v !== m.text){ m.text = v; await A.store.set('memory', MEM); toast('已修改'); } else t.textContent = m.text; }); t.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); t.blur(); } }); const s = document.createElement('small'); s.textContent = (m.source === 'confirmed' ? '聊天确认 · ' : m.source === 'user' ? '你说的 · ' : '手动 · ') + new Date(m.ts || 0).toLocaleDateString(); const x = document.createElement('button'); x.className = 'x'; x.textContent = '删除'; x.addEventListener('click', async () => { MEM.items = MEM.items.filter(i => i !== m); await A.store.set('memory', MEM); renderMem(); }); d.append(t, s, x); list.appendChild(d); }
    if (!MEM.items.length){ const e = document.createElement('p'); e.className = 'muted'; e.textContent = '还没有记忆。聊天里说「记住：我喜欢喝奶茶」她就会记下来。'; list.appendChild(e); }
    $('#memCount').textContent = `${MEM.items.length} 条`;
  }
  renderMem();
  const memAdd = async () => { const v = $('#memAdd').value.trim().slice(0, 120); if (!v) return; if (!MEM.items.some(i => i.text === v)) MEM.items.unshift({ id: Math.random().toString(36).slice(2, 10), text: v, ts: Date.now(), source: 'manual' }); $('#memAdd').value = ''; await A.store.set('memory', MEM); renderMem(); };
  $('#memAddBtn').addEventListener('click', memAdd); $('#memAdd').addEventListener('keydown', e => { if (e.key === 'Enter') memAdd(); });
  $('#memClear').addEventListener('click', async () => { if (!MEM.items.length) return; if (!confirm('确定清空全部长期记忆？这不影响聊天记录。')) return; MEM.items = []; await A.store.set('memory', MEM); renderMem(); toast('已清空'); });
  const renderHist = () => { $('#histCount').textContent = `共 ${(HIST.messages || []).length} 条消息`; };
  renderHist();
  $('#histClear').addEventListener('click', async () => { if (!confirm('确定清空聊天记录？长期记忆不受影响。')) return; HIST = { version: 2, messages: [] }; await A.store.set('history', HIST); renderHist(); toast('已清空'); });

  /* ===== 联动 ===== */
  async function renderHooks(){
    const r = await A.hooks('status'); const s = $('#hooksState'), b = $('#hooksBadge');
    if (!r.ok){ s.textContent = '读取失败：' + r.error; b.textContent = '未知'; return; }
    const recent = r.lastWorkEvent && Date.now() - r.lastWorkEvent < 10 * 60000;
    b.textContent = r.installed ? (recent ? '· 已连接，刚收到事件' : '· 已安装，等待事件') : '· 未安装'; b.className = 'muted ' + (r.installed ? (recent ? 'ok' : '') : 'warn');
    s.textContent = r.installed ? `已安装（hooks 指向端口 ${r.port}${r.portMismatch ? '，但当前接口在 ' + r.apiPort + '，请重新安装' : ''}），文件：${r.file}${r.lastWorkEvent ? '。最近一次事件：' + new Date(r.lastWorkEvent).toLocaleTimeString() : '。还没收到过事件（重启 Claude Code 后干活时会有）'}` : `未安装。安装会写入 ${r.file}（先备份）。`;
  }
  renderHooks(); setInterval(renderHooks, 8000);
  $('#hooksInstall').addEventListener('click', async () => { const r = await A.hooks('install'); renderHooks(); toast(r.ok ? '装好了，重启 Claude Code 生效' : '没装上：' + (r.error || '')); });
  $('#hooksRemove').addEventListener('click', async () => { const r = await A.hooks('remove'); renderHooks(); toast(r.ok ? '已卸载' : '卸载失败：' + (r.error || '')); });
  $('#workTest').addEventListener('click', () => { A.relay('demo-work'); toast('看她（演示，不是真实事件）'); });
  async function renderApi(){ const i = await A.apiInfo(); $('#apiState').textContent = i && i.port ? `http://127.0.0.1:${i.port}/ 正在监听（只接受本机连接）` : '本地接口没开起来（7341–7346 都被占用？）'; $('#apiBadge').textContent = i && i.port ? '· 运行中' : '· 未开启'; $('#apiBadge').className = 'muted ' + (i && i.port ? 'ok' : 'bad'); }
  renderApi();
  sw('neighbour', 'neighbour');
  async function renderFish(){ const r = await A.fish({ op: 'state' }); const on = !!(r.ok && r.data && r.data.pets); $('#fishBadge').textContent = S.neighbour === false ? '· 已关闭' : on ? '· 已检测到蓝毛' : '· 未检测到（DeepSeek Harness 没开）'; $('#fishBadge').className = 'muted ' + (on ? 'ok' : ''); }
  renderFish(); setInterval(renderFish, 10000);
  function renderSc(){ const list = $('#scList'); list.textContent = ''; const sc = S.shortcuts || []; for (const [i, x] of sc.entries()){ const d = document.createElement('div'); d.className = 'item'; const n = document.createElement('input'); n.type = 'text'; n.value = x.name || ''; n.placeholder = '名字'; n.style.width = '140px'; n.addEventListener('change', () => { sc[i].name = n.value.trim(); setS({ shortcuts: sc }); }); const t = document.createElement('div'); t.className = 't muted'; t.textContent = x.path; const go = document.createElement('button'); go.className = 'x'; go.textContent = '打开'; go.addEventListener('click', () => A.launch(x.path)); const del = document.createElement('button'); del.className = 'x'; del.textContent = '删除'; del.addEventListener('click', () => { sc.splice(i, 1); setS({ shortcuts: sc }).then(renderSc); }); d.append(n, t, go, del); list.appendChild(d); } if (!sc.length){ const e = document.createElement('p'); e.className = 'muted'; e.textContent = '还没有快捷启动项。'; list.appendChild(e); } }
  renderSc();
  $('#scAdd').addEventListener('click', async () => { const p = await A.pickExe(); if (!p) return; const sc = S.shortcuts || []; sc.push({ name: p.split(/[\\/]/).pop().replace(/\.(exe|lnk|bat|cmd|url)$/i, ''), path: p }); await setS({ shortcuts: sc }); renderSc(); });

  /* ===== 手感 ===== */
  const PHS = [['phGravity', 'gravity', v => v], ['phRest', 'restitution', v => (+v).toFixed(2)], ['phFric', 'groundFriction', v => (+v).toFixed(1)], ['phPower', 'throwPower', v => (+v).toFixed(1)]];
  function renderPhysics(){ for (const [id, key, f] of PHS){ $('#' + id).value = S.physics[key]; $('#' + id + 'O').textContent = f(S.physics[key]); } $('#phCeil').setAttribute('aria-checked', String(!!S.physics.ceilingBounce)); const box = $('#physPresets'); box.textContent = ''; for (const [k, p] of Object.entries(PH.PRESETS)){ const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = p.label; b.addEventListener('click', async () => { S.physics = PH.sanitize(p); await setS({ physics: S.physics }); renderPhysics(); toast('手感：' + p.label); }); box.appendChild(b); } }
  renderPhysics();
  for (const [id, key] of PHS) $('#' + id).addEventListener('input', async () => { S.physics[key] = +$('#' + id).value; S.physics = PH.sanitize(S.physics); await setS({ physics: S.physics }); renderPhysics(); });
  $('#phCeil').addEventListener('click', async () => { S.physics.ceilingBounce = !S.physics.ceilingBounce; await setS({ physics: S.physics }); renderPhysics(); });

  /* 外部变化（托盘 / 桌宠窗口改了设置） */
  A.store.onChange(({ name, data }) => {
    if (name === 'settings'){ S = { ...data, physics: PH.sanitize(data.physics || PH.DEFAULT_PHYSICS) }; renderSize(); for (const id of ['fixed', 'clickThrough', 'topmost', 'dnd', 'whisperOn', 'mealRemind', 'weatherRemind', 'notifyOn', 'stickerOn', 'emotionOn', 'neighbour']) $('#' + id).setAttribute('aria-checked', String(!!S[id])); renderLevel(); renderPhysics(); renderLedger(); renderMotion(); }
    if (name === 'memory'){ MEM = data; memEnabled.setAttribute('aria-checked', String(MEM.enabled !== false)); renderMem(); }
    if (name === 'history'){ HIST = data; renderHist(); }
    if (name === 'profile'){ PF = data; }
  });
  A.config.onChange(c => { CFG = c; prov = c.provider; renderProv(); renderPacks(); });
})();
