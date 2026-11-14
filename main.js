// 小克桌宠 3.0 — Windows 外壳（Electron 主进程）
// 负责：透明置顶窗口、托盘、设置窗口、本机存储（设置 / 资料 / 记忆 / 聊天记录 / 密钥）、模型服务商调用（流式）、
//       天气与地理编码、本地接口（127.0.0.1:7341）、Claude Code hooks 联动、邻居桌宠（蓝毛）探测。
'use strict';
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, shell, nativeImage, safeStorage, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { execFile } = require('child_process');
const providers = require('./providers.js');

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.setAppUserModelId('XiaoKe.DesktopPet');
const VERSION = '3.0.0';

let win = null, settingsWin = null, tray = null;
let trayState = { size: 'm' };

/* ====================== 本机存储 ======================
   %APPDATA%\小克\
     config.json    服务商 / 密钥（DPAPI 加密）/ 人物包 / 显示器
     settings.json  行为设置（大小、陪伴等级、免打扰、手感、预算…）
     profile.json   用户资料（称呼、所在地、时区、兴趣、作息、语气）
     memory.json    长期记忆（只记明确说过 / 确认过的）
     history.json   聊天记录
*/
const ud = () => app.getPath('userData');
const fileOf = name => path.join(ud(), name + '.json');
function readJson(name, def) { try { return JSON.parse(fs.readFileSync(fileOf(name), 'utf8')); } catch { return typeof def === 'function' ? def() : (def === undefined ? {} : def); } }
function writeJson(name, data) {
  try {
    fs.mkdirSync(ud(), { recursive: true });
    const tmp = fileOf(name) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, fileOf(name)); return true;
  } catch (e) { console.error('write', name, e); return false; }
}
const DEFAULT_SETTINGS = {
  size: 330, fixed: false, clickThrough: false, topmost: true, dnd: false, display: 'primary',
  companion: 'normal', quietHours: { on: true, from: '23:00', to: '08:00' },
  whisperOn: true, whisperMin: 0, restRemindMin: 60, mealRemind: true, weatherRemind: true, notifyOn: true,
  rounds: 5, stickerOn: true, emotionOn: true, budget: 5, priceIn: 0.10, priceOut: 0.50, bday: '',
  physics: null, neighbour: true, shortcuts: [], hooksNotify: true, firstRunDone: false, motion: 'full',
};
const DEFAULT_PROFILE = { done: false, name: '', address: '', tone: 'cute', city: '', country: '', lat: null, lon: null, timezone: '', interests: [], schedule: { wake: '08:00', sleep: '23:30' }, notes: '' };
const stores = {
  settings: () => ({ ...DEFAULT_SETTINGS, ...readJson('settings', {}) }),
  profile: () => ({ ...DEFAULT_PROFILE, ...readJson('profile', {}) }),
  memory: () => { const m = readJson('memory', {}); return { enabled: m.enabled !== false, items: Array.isArray(m.items) ? m.items : [] }; },
  history: () => { const h = readJson('history', null); if (h && Array.isArray(h.messages)) return { version: 2, messages: h.messages }; /* 2.3 的 memory.json 里存的是聊天记录，搬过来 */ try { const old = JSON.parse(fs.readFileSync(path.join(ud(), 'memory.json'), 'utf8')); if (old && Array.isArray(old.messages) && old.version === 1) { const mig = { version: 2, messages: old.messages }; writeJson('history', mig); writeJson('memory', { enabled: true, items: [] }); return mig; } } catch {} return { version: 2, messages: [] }; },
};
const STORE_LIMITS = { history: h => ({ version: 2, messages: (h.messages || []).slice(-600) }), memory: m => ({ enabled: m.enabled !== false, items: (m.items || []).slice(0, 200) }) };
function getStore(name) { const f = stores[name]; return f ? f() : null; }
function setStore(name, data) {
  if (!stores[name] || !data || typeof data !== 'object') return false;
  const lim = STORE_LIMITS[name]; const out = lim ? lim(data) : data;
  const ok = writeJson(name, out); if (ok) broadcast('store:changed', { name, data: getStore(name) }); return ok;
}
function patchStore(name, patch) { const cur = getStore(name); if (!cur) return false; return setStore(name, { ...cur, ...patch }); }
function broadcast(ch, payload) { for (const w of [win, settingsWin]) { try { w && !w.isDestroyed() && w.webContents.send(ch, payload); } catch {} } }

/* ---------- config：服务商与密钥 ---------- */
const loadCfg = () => readJson('config', {});
const saveCfg = c => writeJson('config', c);
function migrateCfg() {
  const c = loadCfg(); let dirty = false;
  c.providers = c.providers && typeof c.providers === 'object' ? c.providers : {};
  for (const id of Object.keys(providers.PROVIDERS)) { if (!c.providers[id]) { c.providers[id] = { endpoint: '', model: providers.PROVIDERS[id].models[0] || '', key: '', enc: false }; dirty = true; } }
  if (c.key && !c.providers.claude.key) { c.providers.claude.key = c.key; c.providers.claude.enc = !!c.enc; delete c.key; delete c.enc; dirty = true; }
  if (!c.provider) { c.provider = 'claude'; dirty = true; }
  if (!c.pack) { c.pack = 'xiaoke'; dirty = true; }
  if (dirty) saveCfg(c);
  return c;
}
function decryptKey(p) { if (!p || !p.key) return ''; try { return p.enc ? safeStorage.decryptString(Buffer.from(p.key, 'base64')) : Buffer.from(p.key, 'base64').toString('utf8'); } catch { return ''; } }
function providerCfg(id) {
  const c = migrateCfg(); id = id || c.provider; const p = c.providers[id] || {};
  return { id, endpoint: p.endpoint || '', model: p.model || (providers.PROVIDERS[id] ? providers.PROVIDERS[id].models[0] : ''), key: decryptKey(p) };
}
function publicCfg() {
  const c = migrateCfg(); const out = { provider: c.provider, pack: c.pack, providers: {} };
  for (const [id, p] of Object.entries(c.providers)) out.providers[id] = { endpoint: p.endpoint || '', model: p.model || '', hasKey: !!p.key, keyTail: p.key ? decryptKey(p).slice(-4) : '' };
  return out;
}
function setKey(id, k) {
  const c = migrateCfg(); if (!c.providers[id]) return false;
  if (!k) { c.providers[id].key = ''; c.providers[id].enc = false; }
  else if (safeStorage.isEncryptionAvailable()) { c.providers[id].key = safeStorage.encryptString(k).toString('base64'); c.providers[id].enc = true; }
  else { c.providers[id].key = Buffer.from(k, 'utf8').toString('base64'); c.providers[id].enc = false; }
  saveCfg(c); broadcast('config:changed', publicCfg()); return true;
}
function setProviderOpts(id, opts) {
  const c = migrateCfg(); if (!c.providers[id]) return false;
  if (typeof opts.endpoint === 'string') c.providers[id].endpoint = opts.endpoint.trim();
  if (typeof opts.model === 'string') c.providers[id].model = opts.model.trim();
  saveCfg(c); broadcast('config:changed', publicCfg()); return true;
}
function setCfgField(k, v) { const c = migrateCfg(); c[k] = v; saveCfg(c); broadcast('config:changed', publicCfg()); }

/* ====================== 窗口 ====================== */
function pickDisplay() {
  const s = getStore('settings'); const all = screen.getAllDisplays();
  if (s.display && s.display !== 'primary') { const d = all.find(d => String(d.id) === String(s.display)); if (d) return d; }
  return screen.getPrimaryDisplay();
}
function fitToWorkArea() {
  if (!win || win.isDestroyed()) return;
  const wa = pickDisplay().workArea;
  win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
  try { win.webContents.send('pet:cmd', 'fit'); } catch {}
}
function applyWindowFlags() {
  if (!win || win.isDestroyed()) return;
  const s = getStore('settings');
  win.setAlwaysOnTop(!!s.topmost, 'floating');
  if (s.clickThrough) win.setIgnoreMouseEvents(true, { forward: true });
}
function createWindow() {
  const wa = pickDisplay().workArea;
  const c = migrateCfg();
  win = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: wa.height,
    transparent: true, frame: false, resizable: false, movable: false, maximizable: false, minimizable: false,
    fullscreenable: false, hasShadow: false, skipTaskbar: true, alwaysOnTop: true, show: false,
    backgroundColor: '#00000000', title: '小克', icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'index.html'), { query: { pack: c.pack || 'xiaoke' } });
  win.once('ready-to-show', () => { win.showInactive(); applyWindowFlags(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { e.preventDefault(); if (/^https:\/\//i.test(url)) shell.openExternal(url); });
  screen.on('display-metrics-changed', fitToWorkArea);
  screen.on('display-added', fitToWorkArea);
  screen.on('display-removed', fitToWorkArea);
  // 置顶看门狗：全屏程序会把她压下去，每 5 秒重申一次（不抢焦点）
  setInterval(() => { try { const s = getStore('settings'); if (s.topmost && win && !win.isDestroyed() && win.isVisible()) win.setAlwaysOnTop(true, 'floating'); } catch {} }, 5000);
}
function openSettings(tab) {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); if (tab) settingsWin.webContents.send('settings:tab', tab); return; }
  const d = pickDisplay().workArea;
  settingsWin = new BrowserWindow({
    width: Math.min(820, d.width - 40), height: Math.min(640, d.height - 40), minWidth: 640, minHeight: 480, useContentSize: true,
    title: '小克 · 设置', backgroundColor: '#ffffff', autoHideMenuBar: true, icon: path.join(__dirname, 'icon.png'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'), { query: tab ? { tab } : {} });
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
  settingsWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

/* ====================== 托盘 ====================== */
const SIZES = [['s', '小', 240], ['m', '中', 330], ['l', '大', 440], ['xl', '特大', 580]];
const sendCmd = c => { try { win && !win.isDestroyed() && win.webContents.send('pet:cmd', c); } catch {} };
function refreshTray() {
  if (!tray) return;
  const s = getStore('settings');
  const login = app.getLoginItemSettings().openAtLogin;
  const displays = screen.getAllDisplays();
  const shortcuts = (s.shortcuts || []).filter(x => x && x.path).slice(0, 8);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win && win.isVisible() ? '藏起小克' : '叫出小克', click: () => { if (win.isVisible()) win.hide(); else { win.showInactive(); sendCmd('fit'); } refreshTray(); } },
    { label: '小克回到右下角', click: () => { if (!win.isVisible()) win.showInactive(); sendCmd('reset-position'); } },
    { label: '打开设置…', click: () => openSettings() },
    { label: '和她聊天', click: () => { win.showInactive(); sendCmd('open-chat'); } },
    { label: '碎碎念一句', click: () => sendCmd('whisper') },
    { type: 'separator' },
    { label: '大小', submenu: SIZES.map(([k, l, px]) => ({ label: l, type: 'radio', checked: nearestSize(s.size) === k, click: () => patchStore('settings', { size: px }) })) },
    { label: '固定位置（不乱跑）', type: 'checkbox', checked: !!s.fixed, click: i => patchStore('settings', { fixed: i.checked }) },
    { label: '鼠标穿透（点不到她）', type: 'checkbox', checked: !!s.clickThrough, click: i => { patchStore('settings', { clickThrough: i.checked }); applyWindowFlags(); if (!i.checked) win.setIgnoreMouseEvents(true, { forward: true }); } },
    { label: '始终置顶', type: 'checkbox', checked: !!s.topmost, click: i => { patchStore('settings', { topmost: i.checked }); applyWindowFlags(); } },
    { label: '免打扰', type: 'checkbox', checked: !!s.dnd, click: i => patchStore('settings', { dnd: i.checked }) },
    ...(displays.length > 1 ? [{ label: '住在哪个屏幕', submenu: [{ label: '主屏幕', type: 'radio', checked: !s.display || s.display === 'primary', click: () => { patchStore('settings', { display: 'primary' }); fitToWorkArea(); } }, ...displays.map((d, i) => ({ label: `屏幕 ${i + 1}（${d.size.width}×${d.size.height}${d.id === screen.getPrimaryDisplay().id ? '，主' : ''}）`, type: 'radio', checked: String(s.display) === String(d.id), click: () => { patchStore('settings', { display: String(d.id) }); fitToWorkArea(); } }))] }] : []),
    ...(shortcuts.length ? [{ type: 'separator' }, ...shortcuts.map(x => ({ label: '打开 ' + (x.name || path.basename(x.path)), click: () => launchPath(x.path) }))] : []),
    { type: 'separator' },
    { label: '开机自动启动', type: 'checkbox', checked: login, click: i => { app.setLoginItemSettings({ openAtLogin: i.checked }); refreshTray(); } },
    { label: `本地接口：${apiPort ? '127.0.0.1:' + apiPort : '未开启'}`, enabled: false },
    { label: '退出小克', click: () => app.quit() },
  ]));
}
function nearestSize(px) { return SIZES.reduce((a, b) => Math.abs(b[2] - px) < Math.abs(a[2] - px) ? b : a)[0]; }
function buildTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('小克 — 单击她互动，右键 / 双击打开面板');
  tray.on('click', () => { if (!win.isVisible()) { win.showInactive(); sendCmd('fit'); } sendCmd('poke'); refreshTray(); });
  refreshTray();
}
async function launchPath(p) { try { if (/^[a-z]+:\/\//i.test(p)) await shell.openExternal(p); else { const err = await shell.openPath(p); if (err) return { ok: false, reason: err }; } return { ok: true }; } catch (e) { return { ok: false, reason: String(e) }; } }

/* ====================== IPC：窗口 / 存储 / 杂项 ====================== */
ipcMain.on('pet:mouse', (_e, on) => { if (!win) return; const s = getStore('settings'); if (on && !s.clickThrough) win.setIgnoreMouseEvents(false); else win.setIgnoreMouseEvents(true, { forward: true }); });
ipcMain.on('pet:focus', () => { if (win) win.focus(); });
ipcMain.on('pet:open', (_e, url) => { if (typeof url === 'string' && /^https:\/\//i.test(url)) shell.openExternal(url); });
ipcMain.on('pet:tray', (_e, p) => { trayState = { ...trayState, ...p }; refreshTray(); });
ipcMain.on('pet:open-settings', (_e, tab) => openSettings(typeof tab === 'string' ? tab : ''));
ipcMain.on('pet:relay', (_e, c) => { if (win && !win.isVisible()) win.showInactive(); sendCmd(String(c || '')); });
ipcMain.on('pet:hide', () => { if (win) { win.hide(); refreshTray(); } });
ipcMain.handle('app:info', () => ({ version: VERSION, userData: ud(), appDir: __dirname, platform: process.platform, login: app.getLoginItemSettings().openAtLogin, apiPort }));
ipcMain.handle('app:login', (_e, on) => { app.setLoginItemSettings({ openAtLogin: !!on }); refreshTray(); return app.getLoginItemSettings().openAtLogin; });
ipcMain.handle('app:open-folder', () => shell.openPath(ud()));
ipcMain.handle('app:pick-exe', async () => { const r = await dialog.showOpenDialog(settingsWin || win, { title: '选择要快捷启动的程序', properties: ['openFile'], filters: [{ name: '程序 / 快捷方式', extensions: ['exe', 'lnk', 'bat', 'cmd', 'url'] }] }); return r.canceled ? '' : r.filePaths[0]; });
ipcMain.handle('app:launch', (_e, p) => launchPath(String(p || '')));
ipcMain.handle('store:get', (_e, name) => getStore(name));
ipcMain.handle('store:set', (_e, { name, data }) => setStore(name, data));
ipcMain.handle('store:patch', (_e, { name, patch }) => patchStore(name, patch));
ipcMain.handle('config:get', () => publicCfg());
ipcMain.handle('config:set-provider', (_e, id) => { if (providers.PROVIDERS[id]) { setCfgField('provider', id); return true; } return false; });
ipcMain.handle('config:set-provider-opts', (_e, { id, opts }) => setProviderOpts(id, opts || {}));
ipcMain.handle('config:set-key', (_e, { id, key }) => setKey(id, typeof key === 'string' ? key.trim() : ''));
ipcMain.handle('config:set-pack', (_e, id) => { if (packList().some(p => p.id === id)) { setCfgField('pack', id); if (win) win.loadFile(path.join(__dirname, 'index.html'), { query: { pack: id } }); return true; } return false; });
ipcMain.handle('packs:list', () => packList());
ipcMain.handle('displays:list', () => ({ primary: screen.getPrimaryDisplay().id, all: screen.getAllDisplays().map((d, i) => ({ id: String(d.id), label: `屏幕 ${i + 1}（${d.size.width}×${d.size.height}，缩放 ${Math.round(d.scaleFactor * 100)}%）` })) }));
ipcMain.on('pet:notify', (_e, n) => {
  try {
    if (!Notification.isSupported()) return;
    const note = new Notification({ title: String(n && n.title || '小克'), body: String(n && n.body || '').slice(0, 160), icon: path.join(__dirname, 'icon.png'), silent: false });
    note.on('click', () => { try { win && win.showInactive(); } catch {} });
    note.show();
  } catch {}
});
function packList() {
  const dir = path.join(__dirname, 'packs'); const out = [];
  try { for (const id of fs.readdirSync(dir)) { const pj = path.join(dir, id, 'pack.json'); if (!fs.existsSync(pj)) continue; try { const m = JSON.parse(fs.readFileSync(pj, 'utf8')); out.push({ id, name: m.name || id, version: m.version || '', desc: m.desc || '', preview: m.preview ? `packs/${id}/${m.preview}` : '' }); } catch {} } } catch {}
  return out;
}

/* ====================== 模型调用（流式） ====================== */
const inflight = new Map();
ipcMain.handle('llm:chat', async (e, req) => {
  const id = String(req && req.id || ('r' + Date.now()));
  const cfg = providerCfg(req && req.provider);
  const ac = new AbortController(); inflight.set(id, ac);
  const sender = e.sender;
  try {
    const r = await providers.chat(cfg, {
      system: req.system, messages: req.messages, max_tokens: req.max_tokens, temperature: req.temperature, timeoutMs: req.timeoutMs, signal: ac.signal,
      onDelta: req.stream ? (delta, text) => { try { sender.send('llm:delta', { id, delta, text }); } catch {} } : null,
    });
    return { ok: true, id, text: r.text, usage: r.usage, model: r.model, provider: cfg.id };
  } catch (err) {
    const code = err.code || 'http';
    return { ok: false, id, code, explain: providers.EXPLAIN[code] || providers.EXPLAIN.http, detail: err.detail || String(err.message || err), provider: cfg.id, model: cfg.model };
  } finally { inflight.delete(id); }
});
ipcMain.handle('llm:abort', (_e, id) => { const ac = inflight.get(String(id)); if (ac) { ac.abort(); return true; } return false; });
ipcMain.handle('llm:test', (_e, id) => providers.test(providerCfg(id)));
ipcMain.handle('llm:balance', (_e, id) => providers.balance(providerCfg(id)));
ipcMain.handle('llm:models', (_e, id) => providers.models(providerCfg(id)));
ipcMain.handle('llm:current', () => { const c = providerCfg(); return { provider: c.id, name: providers.PROVIDERS[c.id].name, model: c.model, hasKey: !!c.key }; });

/* ====================== 天气 / 地理编码（Open-Meteo，免费、无需密钥） ====================== */
ipcMain.handle('geo:search', async (_e, q) => {
  q = String(q || '').trim(); if (!q) return [];
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12000);
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=6&language=zh&format=json', { signal: ac.signal, headers: { 'User-Agent': 'XiaoKe-DesktopPet/3.0' } }).finally(() => clearTimeout(t));
    if (!r.ok) return [];
    const j = await r.json();
    return (j.results || []).map(x => ({ name: x.name, admin: x.admin1 || '', country: x.country || '', lat: x.latitude, lon: x.longitude, timezone: x.timezone || '' }));
  } catch { return []; }
});
ipcMain.handle('weather:get', async () => {
  const p = getStore('profile');
  if (p.lat == null || p.lon == null) return { ok: false, reason: 'nolocation' };
  try {
    const tz = p.timezone || 'auto';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,apparent_temperature,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=${encodeURIComponent(tz)}&forecast_days=1`;
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 15000);
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'XiaoKe-DesktopPet/3.0' } }).finally(() => clearTimeout(t));
    if (!r.ok) return { ok: false, reason: 'http', status: r.status };
    const j = await r.json();
    return { ok: true, temp: j.current.temperature_2m, feels: j.current.apparent_temperature, code: j.current.weather_code, dayCode: j.daily.weather_code[0], high: j.daily.temperature_2m_max[0], low: j.daily.temperature_2m_min[0], rainChance: j.daily.precipitation_probability_max[0] ?? 0, at: Date.now(), city: p.city };
  } catch (e) { return { ok: false, reason: 'network', detail: String(e && e.message || e) }; }
});

/* ====================== 邻居：DeepSeek 的 dsh-pet（蓝毛） ====================== */
const FISH_PREFIX = '/dsh-pet-7340';
let fishOrigin = '', fishLastScan = 0, fishScanning = null;
function psLines(cmd) {
  return new Promise(res => {
    if (process.platform !== 'win32') return res([]);
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 8000 }, (err, out) => { if (err || !out) return res([]); res(out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)); });
  });
}
async function fishProbe(origin) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 1500);
  try { const r = await fetch(origin + FISH_PREFIX + '/state', { signal: ac.signal }); if (!r.ok) return false; const j = await r.json(); return !!(j && j.pets); } catch { return false; } finally { clearTimeout(t); }
}
async function findFish(force) {
  if (fishOrigin && !force) return fishOrigin;
  if (fishScanning) return fishScanning;
  if (!force && Date.now() - fishLastScan < 60000) return '';   // 没找到时每分钟才扫一次（要起 PowerShell）
  fishScanning = (async () => {
    fishLastScan = Date.now();
    const ports = await psLines("$p = @((Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue).Id); if ($p.Count) { Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $p -contains $_.OwningProcess -and $_.LocalAddress -eq '127.0.0.1' } | ForEach-Object { $_.LocalPort } }");
    for (const p of [...new Set(ports)].filter(x => /^\d+$/.test(x))) { const o = 'http://127.0.0.1:' + p; if (await fishProbe(o)) { fishOrigin = o; return o; } }
    fishOrigin = ''; return '';
  })();
  try { return await fishScanning; } finally { fishScanning = null; }
}
async function fishCall(p, method = 'GET', body) {
  const go = async o => {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), /^\/chat/.test(p) ? 90000 : 5000);
    try { const r = await fetch(o + FISH_PREFIX + p, { method, signal: ac.signal, headers: body ? { 'content-type': 'application/json; charset=utf-8' } : undefined, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); return r.status >= 400 ? { ok: false, reason: 'http', status: r.status } : { ok: true, data: j }; } finally { clearTimeout(t); }
  };
  let origin = await findFish(false); if (!origin) return { ok: false, reason: 'offline' };
  try { return await go(origin); } catch { fishOrigin = ''; origin = await findFish(true); if (!origin) return { ok: false, reason: 'offline' }; try { return await go(origin); } catch (e) { return { ok: false, reason: 'network', detail: String(e) }; } }
}
ipcMain.handle('pet:fish', async (_e, req) => {
  const r = req && typeof req === 'object' ? req : {}; const pet = encodeURIComponent(String(r.pet || 'main'));
  switch (r.op) {
    case 'state': return fishCall('/state');
    case 'config': return fishCall('/config');
    case 'say': return fishCall('/broadcast?pet=' + pet, 'POST', { text: String(r.text || ''), image: r.image ? String(r.image) : undefined });
    case 'anim': return fishCall('/anim?pet=' + pet, 'POST', { name: String(r.name || '') });
    case 'chat': return fishCall('/chat?pet=' + pet, 'POST', { text: String(r.text || '') });
    case 'whisper': return fishCall('/whisper?pet=' + pet, 'POST');
    default: return { ok: false, reason: 'bad-op' };
  }
});

/* ====================== 小克自己的本地接口：127.0.0.1:7341 ======================
   GET  /state                 → 她现在在干嘛
   POST /say     {text,sticker?,ms?,mad?}   → 头顶冒一句
   POST /anim    {name}        → 做某个动作（动作 id / 帧名 / spin|dance|walk|turn|scared|doze|read|ramen|badminton|sleep|ledger|whisper|home）
   POST /chat    {text}        → 跟她聊一句（走当前模型），回 {text}
   POST /whisper               → 立刻碎碎念一句
   POST /work    {state,task}  或 Claude Code hook 的原始 JSON → 工作状态（204 无正文，便于当 hook 用）
   POST /notify  {title,body}  → Windows 通知
   只监听回环地址。 */
let apiPort = 0, apiServer = null, apiSeq = 0; const apiPending = new Map();
let lastWorkEvent = 0;
function askRenderer(type, body, timeoutMs = 65000) {
  return new Promise(resolve => {
    if (!win || win.isDestroyed()) return resolve({ ok: false, reason: 'no-window' });
    const id = ++apiSeq; const t = setTimeout(() => { apiPending.delete(id); resolve({ ok: false, reason: 'timeout' }); }, timeoutMs);
    apiPending.set(id, res => { clearTimeout(t); resolve(res); });
    win.webContents.send('pet:api', { id, type, body });
  });
}
ipcMain.on('pet:api-reply', (_e, { id, res }) => { const f = apiPending.get(id); if (f) { apiPending.delete(id); f(res); } });
function hookToWork(h) {
  const ev = String(h.hook_event_name || h.event || '');
  const tool = String(h.tool_name || ''); const inp = h.tool_input || {};
  const short = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 36);
  const hint = inp.file_path ? path.basename(String(inp.file_path)) : inp.command ? short(inp.command) : inp.pattern ? short(inp.pattern) : inp.url ? short(inp.url) : '';
  switch (ev) {
    case 'SessionStart': return { state: null };
    case 'UserPromptSubmit': return { state: 'thinking', task: short(h.prompt) ? '在想：' + short(h.prompt) : '' };
    case 'PreToolUse': return { state: 'working', task: tool + (hint ? ' · ' + hint : '') };
    case 'PostToolUse': { const r = h.tool_response; const bad = r && typeof r === 'object' && (r.is_error || r.error); return { state: bad ? 'error' : 'result', task: tool + (hint ? ' · ' + hint : '') }; }
    case 'PostToolUseFailure': return { state: 'error', task: tool + (hint ? ' · ' + hint : '') };
    case 'PermissionRequest': return { state: 'waiting', task: '要用 ' + tool + (hint ? '：' + hint : '') + '，等你批准' };
    case 'Notification': { const m = short(h.message); const kind = String(h.notification_type || ''); return { state: 'waiting', task: kind === 'idle_prompt' ? '等你下一步指示' : (m || '需要你看一下') }; }
    case 'Stop': return { state: 'success', task: '' };
    case 'SubagentStop': return null;
    case 'SessionEnd': return { state: null };
    default: return null;
  }
}
function startApi() {
  const tryPort = port => new Promise(resolve => {
    const srv = http.createServer(async (req, res) => {
      const send = (code, obj) => { if (code === 204) { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); } const body = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); res.end(body); };
      if (req.method === 'OPTIONS') return send(204);
      const url = new URL(req.url, 'http://127.0.0.1'); const route = url.pathname.replace(/\/+$/, '') || '/';
      let body = {};
      if (req.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > 256 * 1024) { return send(413, { ok: false, reason: 'too-large' }); } chunks.push(c); }
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (raw) { try { body = JSON.parse(raw); } catch { body = { text: raw }; } }
      }
      try {
        if (route === '/' || route === '/state') { if (req.method !== 'GET') return send(405, { error: 'method not allowed' }); return send(200, await askRenderer('state', {}, 5000)); }
        if (req.method !== 'POST') return send(405, { error: 'method not allowed' });
        if (route === '/say') return send(200, await askRenderer('say', body, 5000));
        if (route === '/anim') return send(200, await askRenderer('anim', body, 5000));
        if (route === '/whisper') return send(200, await askRenderer('whisper', body, 5000));
        if (route === '/notify') return send(200, await askRenderer('notify', body, 5000));
        if (route === '/chat') return send(200, await askRenderer('chat', body, 120000));
        if (route === '/work') {
          let w = body;
          if (body && (body.hook_event_name || body.event)) { w = hookToWork(body); if (!w) return send(204); }
          lastWorkEvent = Date.now();
          askRenderer('work', { state: w.state || null, task: w.task || '', source: body && body.hook_event_name ? 'claude-code' : 'api' }, 3000).catch(() => {});
          return send(204);
        }
        return send(404, { error: 'not found' });
      } catch (err) { return send(500, { ok: false, reason: 'error', message: String(err && err.message || err) }); }
    });
    srv.on('error', () => resolve(null));
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
  (async () => {
    for (const p of [7341, 7342, 7343, 7344, 7345, 7346]) { const s = await tryPort(p); if (s) { apiServer = s; apiPort = p; break; } }
    refreshTray();
  })();
}
ipcMain.handle('pet:api-info', () => ({ port: apiPort, lastWorkEvent }));

/* ====================== Claude Code hooks ====================== */
const CC_SETTINGS = () => path.join(os.homedir(), '.claude', 'settings.json');
const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];
const HOOK_MARK = 'X-Xiaoke: 1';
const hookCmd = port => `curl -s -m 3 -X POST http://127.0.0.1:${port}/work -H "Content-Type: application/json" -H "${HOOK_MARK}" --data-binary @- || exit 0`;
const isOurs = h => h && typeof h.command === 'string' && h.command.includes(HOOK_MARK);
function readCC() { try { return JSON.parse(fs.readFileSync(CC_SETTINGS(), 'utf8')); } catch (e) { if (e && e.code === 'ENOENT') return {}; throw e; } }
function hooksStatus() {
  try {
    const s = readCC(); const hooks = s.hooks || {}; let found = 0, port = 0;
    for (const ev in hooks) for (const g of (hooks[ev] || [])) for (const h of (g.hooks || [])) if (isOurs(h)) { found++; const m = h.command.match(/127\.0\.0\.1:(\d+)/); if (m) port = +m[1]; }
    return { ok: true, installed: found > 0, port: port || apiPort, apiPort, file: CC_SETTINGS(), portMismatch: found > 0 && port && apiPort && port !== apiPort, lastWorkEvent };
  } catch (e) { return { ok: false, installed: false, file: CC_SETTINGS(), error: String(e && e.message || e) }; }
}
function hooksInstall() {
  try {
    if (!apiPort) return { ok: false, error: '本地接口没开起来', file: CC_SETTINGS() };
    const file = CC_SETTINGS(); const s = readCC();
    if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak-xiaoke-' + Date.now());
    s.hooks = s.hooks && typeof s.hooks === 'object' ? s.hooks : {};
    for (const ev of HOOK_EVENTS) {
      const groups = Array.isArray(s.hooks[ev]) ? s.hooks[ev] : [];
      const kept = groups.map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !isOurs(h)) })).filter(g => g.hooks.length);
      kept.push({ matcher: '', hooks: [{ type: 'command', command: hookCmd(apiPort), timeout: 5 }] });
      s.hooks[ev] = kept;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(s, null, 2));
    return { ...hooksStatus(), ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e), file: CC_SETTINGS() }; }
}
function hooksRemove() {
  try {
    const file = CC_SETTINGS(); if (!fs.existsSync(file)) return { ...hooksStatus(), ok: true };
    const s = readCC(); if (s.hooks) {
      fs.copyFileSync(file, file + '.bak-xiaoke-' + Date.now());
      for (const ev of Object.keys(s.hooks)) { const kept = (s.hooks[ev] || []).map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !isOurs(h)) })).filter(g => g.hooks.length); if (kept.length) s.hooks[ev] = kept; else delete s.hooks[ev]; }
      if (!Object.keys(s.hooks).length) delete s.hooks;
      fs.writeFileSync(file, JSON.stringify(s, null, 2));
    }
    return { ...hooksStatus(), ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e), file: CC_SETTINGS() }; }
}
ipcMain.handle('pet:hooks', (_e, action) => action === 'install' ? hooksInstall() : action === 'remove' ? hooksRemove() : hooksStatus());

/* ====================== 启动 ====================== */
app.whenReady().then(() => {
  migrateCfg(); getStore('history'); /* 顺带把 2.3 的 memory.json 聊天记录搬到 history.json */ createWindow(); buildTray(); startApi();
});
app.on('second-instance', () => { if (win) { win.showInactive(); sendCmd('poke'); } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { try { apiServer && apiServer.close(); } catch {} });
// 设置改了（任一窗口）→ 同步托盘和窗口标志
const _setStore = setStore;
setStore = function (name, data) { const before = name === 'settings' ? getStore('settings') : null; const ok = _setStore(name, data); if (ok && name === 'settings') { refreshTray(); applyWindowFlags(); if (before && String(before.display) !== String(data.display)) fitToWorkArea(); } return ok; };
