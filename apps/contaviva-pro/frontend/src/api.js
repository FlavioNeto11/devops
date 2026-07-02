// Client da API (base absoluta sob o subpath). Sem ${} — concatenação. Gerado pela Forge.
const BASE = import.meta.env.VITE_API_BASE_URL || '/contaviva-pro/api';

// --- Token store (bloco contas-acesso) -------------------------------------
// Fonte única do access token (localStorage). useAuth.js reusa estes helpers. O 401 LIMPA o token
// e dispara o evento 'auth:logout' (window) p/ o useAuth derrubar a sessão reativa — sem import cíclico.
const TOKEN_KEY = 'contaviva-pro.accessToken';
export function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
export function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch {} }
function emitLogout() { try { window.dispatchEvent(new CustomEvent('auth:logout')); } catch {} }

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const tok = getToken();
  if (tok) headers['Authorization'] = 'Bearer ' + tok;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { setToken(null); emitLogout(); const e = new Error((data && data.error && data.error.message) || 'Sessão expirada.'); e.status = 401; throw e; }
  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
  return data;
}
function qs(params) {
  const p = new URLSearchParams();
  for (const k in (params || {})) { const v = params[k]; if (v !== '' && v !== null && v !== undefined) p.append(k, v); }
  const s = p.toString(); return s ? ('?' + s) : '';
}
// fábrica de recurso REST: o backend expõe /v1/<name>. list aceita page/pageSize/sort/dir/filtros.
export function resourceFactory(name) {
  const root = "/v1/" + name;
  return {
    list: (params) => request("GET", root + qs(params)).then((d) => (d && d.data !== undefined ? d : { data: d || [], total: (d || []).length })),
    get: (id) => request("GET", root + "/" + id),
    create: (body) => request("POST", root, body),
    update: (id, body) => request("PUT", root + "/" + id, body),
    remove: (id) => request("DELETE", root + "/" + id),
  };
}
export const health = () => request("GET", "/health");
export const records = resourceFactory('records');

// --- Auth + contas (bloco contas-acesso) -----------------------------------
// Contrato do backend (pós-strip, raiz): /auth/* e /me na raiz; /v1/users sob /v1. Tudo via request()
// (que injeta o Bearer e trata 401). register/login/sso devolvem { accessToken, refreshToken, user }.
export const auth = {
  register: (body) => request('POST', '/auth/register', body),
  login: (body) => request('POST', '/auth/login', body),
  refresh: (refreshToken) => request('POST', '/auth/refresh', { refreshToken }),
  logout: (refreshToken) => request('POST', '/auth/logout', { refreshToken }),
  me: () => request('GET', '/me'),
  updateMe: (body) => request('PATCH', '/me', body),
  ssoConfig: () => request('GET', '/auth/sso/config'),
  ssoExchange: (accessToken) => request('POST', '/auth/sso/exchange', { accessToken }),
};
// Usuários (admin). PATCH parcial (role/is_active); DELETE desativa (is_active=false) no backend.
export const users = {
  list: (params) => request('GET', '/v1/users' + qs(params)).then((d) => (d && d.data !== undefined ? d : { data: d || [], total: (d || []).length })),
  create: (body) => request('POST', '/v1/users', body),
  update: (id, body) => request('PATCH', '/v1/users/' + id, body),
  remove: (id) => request('DELETE', '/v1/users/' + id),
};

// Assistente de IA (bloco control-ai-por-app). Aceita ARQUIVOS (multimodal): envia multipart/form-data
// quando há File[] (campo 'files'); senão JSON (retrocompat). NUNCA setamos Content-Type no multipart
// (o browser põe o boundary). Erros estruturados (status + message) sobem p/ a view.
export async function assistant(message, files) {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  // bloco contas-acesso: anexa o Bearer (sem fixar Content-Type no multipart — o browser põe o boundary).
  const tok = getToken();
  const authHdr = tok ? { Authorization: 'Bearer ' + tok } : {};
  let res;
  if (list.length) {
    const fd = new FormData();
    fd.append('message', String(message || ''));
    for (const f of list) fd.append('files', f, f.name);
    res = await fetch(BASE + '/v1/assistant', { method: 'POST', headers: authHdr, body: fd });
  } else {
    res = await fetch(BASE + '/v1/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHdr }, body: JSON.stringify({ message: String(message || '') }) });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { setToken(null); try { window.dispatchEvent(new CustomEvent('auth:logout')); } catch {} }
  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
  return data;
}
export const assistantHealth = () => request('GET', '/v1/assistant/health');
