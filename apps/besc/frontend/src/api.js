// Cliente da API BESC. Mesmo origin em producao (/besc/api). Em dev, o Vite faz proxy.
const BASE = '/besc/api';

// querystring: arrays viram params repetidos; ignora vazios.
function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => { if (x !== undefined && x !== null && x !== '') p.append(k, x); });
    else p.append(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ---- sessão (Fase 0): tokens em localStorage, Bearer nas chamadas, refresh único em 401 ----
const LS_ACCESS = 'besc_access';
const LS_REFRESH = 'besc_refresh';

export function getAccessToken() { try { return localStorage.getItem(LS_ACCESS) || null; } catch { return null; } }
export function getRefreshToken() { try { return localStorage.getItem(LS_REFRESH) || null; } catch { return null; } }
export function setTokens(access, refresh) {
  try {
    if (access) localStorage.setItem(LS_ACCESS, access); else localStorage.removeItem(LS_ACCESS);
    if (refresh) localStorage.setItem(LS_REFRESH, refresh); else localStorage.removeItem(LS_REFRESH);
  } catch { /* storage indisponível (ex.: navegação privada) — segue sem persistir */ }
}
export function clearTokens() { setTokens(null, null); }

// Fila única de refresh: várias chamadas que tomam 401 juntas compartilham o MESMO refresh.
let refreshInFlight = null;
function refreshOnce() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const rt = getRefreshToken();
      if (!rt) throw new Error('Sessão expirada.');
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.error) || 'Sessão expirada.');
      setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

// Sessão inválida numa rota protegida → limpa e manda para /entrar preservando a rota atual.
function redirectToLogin() {
  clearTokens();
  const inApp = window.location.pathname.replace(/^\/besc/, '') || '/';
  const next = encodeURIComponent(inApp + window.location.search);
  window.location.assign(`/besc/entrar?next=${next}`);
}

// fetch com sessão: anexa o Bearer quando existir; num 401 tenta UM refresh e repete a chamada.
// Chamadas públicas (sem token e sem 401) passam direto — o portal continua funcionando sem login.
async function authFetch(url, opts = {}) {
  const run = () => {
    const headers = { ...(opts.headers || {}) };
    const tok = getAccessToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    return fetch(url, { ...opts, headers });
  };
  let res = await run();
  if (res.status === 401 && getRefreshToken()) {
    try {
      await refreshOnce();
    } catch {
      redirectToLogin();
      throw new Error('Sua sessão expirou. Entre novamente.');
    }
    res = await run();
    if (res.status === 401) {
      redirectToLogin();
      throw new Error('Sua sessão expirou. Entre novamente.');
    }
  }
  return res;
}

async function req(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  if (path.startsWith('/auth/')) {
    // rotas de auth nunca disparam refresh automático (login errado = 401 legítimo);
    // /auth/me e /auth/logout ainda levam o Bearer quando existir.
    const tok = getAccessToken();
    if (tok) opts.headers.Authorization = `Bearer ${tok}`;
    res = await fetch(BASE + path, opts);
  } else {
    res = await authFetch(BASE + path, opts);
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || `Erro ${res.status}`);
  return data;
}

export const api = {
  meta: () => req('GET', '/meta'),
  list: () => req('GET', '/cases'),
  create: (b) => req('POST', '/cases', b),
  get: (id) => req('GET', `/cases/${id}`),
  update: (id, b) => req('PUT', `/cases/${id}`, b),
  remove: (id) => req('DELETE', `/cases/${id}`),
  addLawsuit: (id, b) => req('POST', `/cases/${id}/lawsuits`, b),
  updateLawsuit: (id, lid, b) => req('PUT', `/cases/${id}/lawsuits/${lid}`, b),
  deleteLawsuit: (id, lid) => req('DELETE', `/cases/${id}/lawsuits/${lid}`),
  updateDocument: (id, key, b) => req('PUT', `/cases/${id}/documents/${key}`, b),
  updateLegal: (id, key, b) => req('PUT', `/cases/${id}/legal/${key}`, b),
  updateTokenization: (id, key, b) => req('PUT', `/cases/${id}/tokenization/${key}`, b),
  updateCollateral: (id, b) => req('PUT', `/cases/${id}/collateral`, b),
  setStatus: (id, status) => req('POST', `/cases/${id}/status`, { status }),
  report: (id, type) => req('GET', `/cases/${id}/report?type=${encodeURIComponent(type)}`),
  // links abertos em <a href>/nova aba não carregam header — o backend aceita o access
  // token curto (1h) na query SOMENTE em GET (docs/evolution/01-rbac-permissoes.md)
  reportHtmlUrl: (id, type) => `${BASE}/cases/${id}/report.html?type=${encodeURIComponent(type)}${getAccessToken() ? `&access_token=${encodeURIComponent(getAccessToken())}` : ''}`,

  // --- autenticação (Fase 0) ---
  auth: {
    config: () => req('GET', '/auth/config'),
    login: (email, password) => req('POST', '/auth/login', { email, password }),
    ssoExchange: (accessToken) => req('POST', '/auth/sso/exchange', { accessToken }),
    refresh: (refreshToken) => req('POST', '/auth/refresh', { refreshToken }),
    logout: (refreshToken) => req('POST', '/auth/logout', { refreshToken }),
    me: () => req('GET', '/auth/me'),
  },

  // anexos de documentos
  uploadAttachment: async (id, key, file) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await authFetch(`${BASE}/cases/${id}/documents/${key}/attachments`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data && data.error) || `Erro ${res.status}`);
    return data;
  },
  deleteAttachment: (id, key, attId) => req('DELETE', `/cases/${id}/documents/${key}/attachments/${attId}`),
  attachmentDownloadUrl: (id, key, attId) => `${BASE}/cases/${id}/documents/${key}/attachments/${attId}/download${getAccessToken() ? `?access_token=${encodeURIComponent(getAccessToken())}` : ''}`,
  updatePericia: (id, b) => req('PUT', `/cases/${id}/pericia`, b),

  // --- portal: biblioteca / jurisprudencia / glossario / stats ---
  stats: () => req('GET', '/stats'),
  glossary: () => req('GET', '/glossary'),
  library: (params) => req('GET', '/library' + qs(params)),
  libraryGet: (id) => req('GET', `/library/${id}`),
  libraryFileUrl: (id) => `${BASE}/library/${id}/file`,
  jurisprudence: (params) => req('GET', '/jurisprudence' + qs(params)),
  jurisprudenceGet: (id) => req('GET', `/jurisprudence/${id}`),
  jurisprudenceFileUrl: (id) => `${BASE}/jurisprudence/${id}/file`,
};
