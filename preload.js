// 小克 3.0 — 渲染进程桥（桌宠窗口和设置窗口共用）
const { contextBridge, ipcRenderer } = require('electron');

const on = (ch, fn) => { const h = (_e, p) => fn(p); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };

contextBridge.exposeInMainWorld('pet', {
  // 窗口
  setInteractive: v => ipcRenderer.send('pet:mouse', !!v),
  focus: () => ipcRenderer.send('pet:focus'),
  hide: () => ipcRenderer.send('pet:hide'),
  open: url => ipcRenderer.send('pet:open', url),
  openSettings: tab => ipcRenderer.send('pet:open-settings', tab || ''),
  relay: c => ipcRenderer.send('pet:relay', c),
  tray: p => ipcRenderer.send('pet:tray', p),
  notify: n => ipcRenderer.send('pet:notify', n),
  info: () => ipcRenderer.invoke('app:info'),
  setLogin: v => ipcRenderer.invoke('app:login', !!v),
  openFolder: () => ipcRenderer.invoke('app:open-folder'),
  pickExe: () => ipcRenderer.invoke('app:pick-exe'),
  launch: p => ipcRenderer.invoke('app:launch', p),
  displays: () => ipcRenderer.invoke('displays:list'),
  packs: () => ipcRenderer.invoke('packs:list'),
  setPack: id => ipcRenderer.invoke('config:set-pack', id),
  // 存储：settings / profile / memory / history
  store: {
    get: name => ipcRenderer.invoke('store:get', name),
    set: (name, data) => ipcRenderer.invoke('store:set', { name, data }),
    patch: (name, patch) => ipcRenderer.invoke('store:patch', { name, patch }),
    onChange: fn => on('store:changed', fn),
  },
  // 模型服务商
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    setProvider: id => ipcRenderer.invoke('config:set-provider', id),
    setOpts: (id, opts) => ipcRenderer.invoke('config:set-provider-opts', { id, opts }),
    setKey: (id, key) => ipcRenderer.invoke('config:set-key', { id, key }),
    onChange: fn => on('config:changed', fn),
  },
  llm: {
    chat: req => ipcRenderer.invoke('llm:chat', req),
    abort: id => ipcRenderer.invoke('llm:abort', id),
    test: id => ipcRenderer.invoke('llm:test', id),
    balance: id => ipcRenderer.invoke('llm:balance', id),
    models: id => ipcRenderer.invoke('llm:models', id),
    current: () => ipcRenderer.invoke('llm:current'),
    onDelta: fn => on('llm:delta', fn),
  },
  geoSearch: q => ipcRenderer.invoke('geo:search', q),
  weather: () => ipcRenderer.invoke('weather:get'),
  // 联动
  fish: req => ipcRenderer.invoke('pet:fish', req),
  hooks: action => ipcRenderer.invoke('pet:hooks', action),
  apiInfo: () => ipcRenderer.invoke('pet:api-info'),
  // 主进程 → 渲染
  onCmd: fn => on('pet:cmd', c => fn(String(c))),
  onApi: fn => on('pet:api', fn),
  apiReply: (id, res) => ipcRenderer.send('pet:api-reply', { id, res }),
  onSettingsTab: fn => on('settings:tab', fn),
});
