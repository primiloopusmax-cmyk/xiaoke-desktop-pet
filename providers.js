// 小克 3.0 — 模型服务商适配（主进程用）。
// 三种：claude（Anthropic Messages API）/ deepseek（OpenAI 兼容）/ custom（任意 OpenAI 兼容端点）。
// 统一接口：chat({provider, messages, system, max_tokens, temperature, onDelta, signal}) → {text, usage, model}
// 出错抛 ProviderError(code, detail)，code ∈ nokey | badkey | quota | rate | badmodel | network | timeout | http | aborted | badreply
'use strict';

class ProviderError extends Error {
  constructor(code, detail, status) { super(code); this.code = code; this.detail = detail || ''; this.status = status || 0; }
}

const PROVIDERS = {
  claude: { name: 'Claude（Anthropic）', endpoint: 'https://api.anthropic.com', models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'], keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys', balance: false },
  deepseek: { name: 'DeepSeek', endpoint: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'], keyHint: 'sk-…', keyUrl: 'https://platform.deepseek.com/api_keys', balance: true },
  custom: { name: '自定义（OpenAI 兼容）', endpoint: '', models: [], keyHint: '密钥', keyUrl: '', balance: false },
};

// 中文解释
const EXPLAIN = {
  nokey: '还没有填这个服务商的 API 密钥',
  badkey: '密钥不对或没有权限（服务商返回 401/403）',
  quota: '余额不足或额度用完了（服务商返回 402 / 余额不足）',
  rate: '请求太频繁，被服务商限流了（429），稍等再试',
  badmodel: '模型名不对，服务商找不到这个模型（404）',
  network: '连不上服务商（没联网、代理或防火墙拦住了）',
  timeout: '服务商太久没回应，超时了',
  http: '服务商返回了错误',
  aborted: '已停止',
  badreply: '服务商返回的内容读不懂',
  badendpoint: '端点地址不对（要以 http:// 或 https:// 开头）',
};

function trimSlash(u) { return String(u || '').trim().replace(/\/+$/, ''); }

function classify(status, body) {
  const msg = (body && body.error && (body.error.message || body.error.type)) || (body && body.message) || '';
  const low = String(msg).toLowerCase();
  if (status === 401 || status === 403) return new ProviderError('badkey', msg, status);
  if (status === 402 || /insufficient|balance|credit|quota|billing/.test(low)) return new ProviderError('quota', msg, status);
  if (status === 429) return new ProviderError('rate', msg, status);
  if (status === 404 || /model.*not (found|exist)|does not exist/.test(low)) return new ProviderError('badmodel', msg, status);
  return new ProviderError('http', msg || ('HTTP ' + status), status);
}

async function readJsonSafe(r) { try { return await r.json(); } catch { return {}; } }

/** 逐行读 SSE：回调 (eventName, dataString) */
async function readSSE(res, onEvent, signal) {
  const reader = res.body.getReader(); const dec = new TextDecoder('utf-8');
  let buf = '', ev = '', data = [];
  const flush = () => { if (data.length) onEvent(ev || 'message', data.join('\n')); ev = ''; data = []; };
  while (true) {
    if (signal && signal.aborted) { try { reader.cancel(); } catch {} throw new ProviderError('aborted'); }
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      let line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line === '') { flush(); continue; }
      if (line.startsWith(':')) continue;
      const k = line.indexOf(':'); const field = k < 0 ? line : line.slice(0, k); const val = k < 0 ? '' : line.slice(k + 1).replace(/^ /, '');
      if (field === 'event') ev = val; else if (field === 'data') data.push(val);
    }
  }
  flush();
}

function withTimeout(signal, ms) {
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
  const t = setTimeout(() => ac.abort(new Error('timeout')), ms);
  return { signal: ac.signal, done: () => { clearTimeout(t); if (signal) signal.removeEventListener('abort', onAbort); }, timedOut: () => ac.signal.reason && ac.signal.reason.message === 'timeout' };
}

/* ---------- Anthropic ---------- */
async function chatClaude(cfg, req) {
  const base = trimSlash(cfg.endpoint) || PROVIDERS.claude.endpoint;
  const body = { model: cfg.model || 'claude-haiku-5-5', max_tokens: Math.max(16, Math.min(4096, +req.max_tokens || 500)), messages: req.messages, stream: !!req.onDelta };
  if (req.system) body.system = req.system;
  if (req.temperature != null) body.temperature = req.temperature;
  const tm = withTimeout(req.signal, req.timeoutMs || 90000);
  let r;
  try {
    r = await fetch(base + '/v1/messages', { method: 'POST', signal: tm.signal, headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
  } catch (e) { tm.done(); if (req.signal && req.signal.aborted) throw new ProviderError('aborted'); throw new ProviderError(tm.timedOut() ? 'timeout' : 'network', String(e && e.message || e)); }
  try {
    if (!r.ok) throw classify(r.status, await readJsonSafe(r));
    if (!body.stream) {
      const j = await readJsonSafe(r);
      const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
      return { text, usage: j.usage ? { input_tokens: j.usage.input_tokens || 0, output_tokens: j.usage.output_tokens || 0 } : null, model: j.model || body.model };
    }
    let text = '', usage = { input_tokens: 0, output_tokens: 0 }, model = body.model;
    await readSSE(r, (ev, data) => {
      let j; try { j = JSON.parse(data); } catch { return; }
      if (j.type === 'message_start' && j.message) { model = j.message.model || model; if (j.message.usage) usage.input_tokens = j.message.usage.input_tokens || 0; }
      else if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') { text += j.delta.text; req.onDelta(j.delta.text, text); }
      else if (j.type === 'message_delta' && j.usage) { usage.output_tokens = j.usage.output_tokens || usage.output_tokens; if (j.usage.input_tokens) usage.input_tokens = j.usage.input_tokens; }
      else if (j.type === 'error') { throw classify(500, { error: j.error }); }
    }, req.signal);
    return { text, usage, model };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (req.signal && req.signal.aborted) throw new ProviderError('aborted');
    throw new ProviderError(tm.timedOut() ? 'timeout' : 'network', String(e && e.message || e));
  } finally { tm.done(); }
}

/* ---------- OpenAI 兼容（DeepSeek / 自定义） ---------- */
function openaiBase(cfg, def) {
  let base = trimSlash(cfg.endpoint) || def;
  if (!/^https?:\/\//i.test(base)) throw new ProviderError('badendpoint', base);
  // 允许用户填到 /v1 或 /chat/completions 为止
  base = base.replace(/\/chat\/completions$/i, '');
  if (!/\/v\d+$/i.test(base)) base += '/v1';
  return base;
}
async function chatOpenAI(cfg, req, def) {
  const base = openaiBase(cfg, def);
  const msgs = []; if (req.system) msgs.push({ role: 'system', content: req.system });
  for (const m of req.messages) msgs.push({ role: m.role, content: m.content });
  const body = { model: cfg.model || 'deepseek-chat', messages: msgs, max_tokens: Math.max(16, Math.min(4096, +req.max_tokens || 500)), stream: !!req.onDelta };
  if (body.stream) body.stream_options = { include_usage: true };
  if (req.temperature != null) body.temperature = req.temperature;
  const tm = withTimeout(req.signal, req.timeoutMs || 90000);
  let r;
  try {
    r = await fetch(base + '/chat/completions', { method: 'POST', signal: tm.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key }, body: JSON.stringify(body) });
  } catch (e) { tm.done(); if (req.signal && req.signal.aborted) throw new ProviderError('aborted'); throw new ProviderError(tm.timedOut() ? 'timeout' : 'network', String(e && e.message || e)); }
  try {
    if (!r.ok) throw classify(r.status, await readJsonSafe(r));
    if (!body.stream) {
      const j = await readJsonSafe(r);
      const text = j.choices && j.choices[0] && j.choices[0].message ? (j.choices[0].message.content || '') : '';
      return { text, usage: j.usage ? { input_tokens: j.usage.prompt_tokens || 0, output_tokens: j.usage.completion_tokens || 0 } : null, model: j.model || body.model };
    }
    let text = '', usage = null, model = body.model;
    await readSSE(r, (ev, data) => {
      if (data === '[DONE]') return;
      let j; try { j = JSON.parse(data); } catch { return; }
      if (j.error) throw classify(500, j);
      if (j.model) model = j.model;
      const d = j.choices && j.choices[0] && j.choices[0].delta;
      if (d && typeof d.content === 'string' && d.content) { text += d.content; req.onDelta(d.content, text); }
      if (j.usage) usage = { input_tokens: j.usage.prompt_tokens || 0, output_tokens: j.usage.completion_tokens || 0 };
    }, req.signal);
    return { text, usage, model };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (req.signal && req.signal.aborted) throw new ProviderError('aborted');
    throw new ProviderError(tm.timedOut() ? 'timeout' : 'network', String(e && e.message || e));
  } finally { tm.done(); }
}

/** cfg: {id:'claude'|'deepseek'|'custom', endpoint, model, key} */
async function chat(cfg, req) {
  if (!cfg || !PROVIDERS[cfg.id]) throw new ProviderError('http', '未知服务商 ' + (cfg && cfg.id));
  if (!cfg.key) throw new ProviderError('nokey');
  if (cfg.id === 'claude') return chatClaude(cfg, req);
  if (cfg.id === 'deepseek') return chatOpenAI(cfg, req, PROVIDERS.deepseek.endpoint);
  return chatOpenAI(cfg, req, '');
}

/** 测试连接：发一个最小请求，返回 {ok, ms, model, usage} 或 {ok:false, code, explain, detail} */
async function test(cfg) {
  const t0 = Date.now();
  try {
    const r = await chat(cfg, { messages: [{ role: 'user', content: '请只回复一个字：好' }], max_tokens: 8, timeoutMs: 30000 });
    return { ok: true, ms: Date.now() - t0, model: r.model, text: r.text.slice(0, 20), usage: r.usage };
  } catch (e) { return { ok: false, ms: Date.now() - t0, code: e.code || 'http', explain: EXPLAIN[e.code] || EXPLAIN.http, detail: e.detail || String(e.message || e), status: e.status || 0 }; }
}

/** 余额：只有 DeepSeek 提供真实接口（GET /user/balance）；其它返回 {supported:false} */
async function balance(cfg) {
  if (!cfg || cfg.id !== 'deepseek') return { supported: false };
  if (!cfg.key) return { supported: true, ok: false, code: 'nokey', explain: EXPLAIN.nokey };
  const base = trimSlash(cfg.endpoint) || PROVIDERS.deepseek.endpoint;
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 15000);
    const r = await fetch(base.replace(/\/v\d+$/, '') + '/user/balance', { headers: { authorization: 'Bearer ' + cfg.key, accept: 'application/json' }, signal: ac.signal }).finally(() => clearTimeout(t));
    if (!r.ok) { const e = classify(r.status, await readJsonSafe(r)); return { supported: true, ok: false, code: e.code, explain: EXPLAIN[e.code], detail: e.detail }; }
    const j = await readJsonSafe(r);
    const infos = Array.isArray(j.balance_infos) ? j.balance_infos : [];
    return { supported: true, ok: true, available: !!j.is_available, balances: infos.map(b => ({ currency: b.currency, total: b.total_balance, granted: b.granted_balance, topped: b.topped_up_balance })), at: Date.now() };
  } catch (e) { return { supported: true, ok: false, code: 'network', explain: EXPLAIN.network, detail: String(e && e.message || e) }; }
}

/** 模型列表（OpenAI 兼容 GET /models；Anthropic GET /v1/models）。失败就返回内置清单。 */
async function models(cfg) {
  const p = PROVIDERS[cfg.id]; const fallback = p ? p.models.slice() : [];
  if (!cfg.key) return { ok: false, models: fallback, code: 'nokey' };
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 15000);
    let url, headers;
    if (cfg.id === 'claude') { url = (trimSlash(cfg.endpoint) || PROVIDERS.claude.endpoint) + '/v1/models?limit=100'; headers = { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }; }
    else { url = openaiBase(cfg, cfg.id === 'deepseek' ? PROVIDERS.deepseek.endpoint : '') + '/models'; headers = { authorization: 'Bearer ' + cfg.key }; }
    const r = await fetch(url, { headers, signal: ac.signal }).finally(() => clearTimeout(t));
    if (!r.ok) { const e = classify(r.status, await readJsonSafe(r)); return { ok: false, models: fallback, code: e.code, explain: EXPLAIN[e.code] }; }
    const j = await readJsonSafe(r);
    const list = (j.data || []).map(m => m.id).filter(Boolean);
    return { ok: true, models: list.length ? list : fallback };
  } catch (e) { return { ok: false, models: fallback, code: 'network', explain: EXPLAIN.network }; }
}

module.exports = { PROVIDERS, EXPLAIN, ProviderError, chat, test, balance, models };
