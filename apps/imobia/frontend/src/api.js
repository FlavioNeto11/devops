// Cliente HTTP do imobia. Base relativa a /imobia/api (Traefik faz strip). Injeta o Bearer
// do localStorage nas chamadas autenticadas. Helpers de IA + CRUD generico para os modulos.
const BASE = import.meta.env.VITE_API_BASE_URL || '/imobia/api';
const TOKEN_KEY = 'imobia_token';

export function authToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

// Sessao expirada (401 numa chamada autenticada): limpa a sessao e leva ao login
// preservando a rota atual, em vez de deixar a tela morta / lista falsamente vazia.
// Imports tardios evitam ciclo de modulo no bootstrap (router/store importam views que
// importam este arquivo). O guard 'redirecting' colapsa 401s concorrentes num unico push.
let redirecting = false;
async function handleSessionExpired() {
  if (redirecting) return;
  redirecting = true;
  localStorage.removeItem(TOKEN_KEY);
  try {
    const [{ router }, { useAuthStore }] = await Promise.all([import('./router'), import('./stores/auth')]);
    try { useAuthStore().logout(); } catch { /* pinia pode nao estar ativo */ }
    const current = router.currentRoute.value;
    if (current.name !== 'login') {
      await router.push({ name: 'login', query: { redirect: current.fullPath, expired: '1' } });
    }
  } finally {
    redirecting = false;
  }
}

async function req(method, path, body, { auth = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth) {
    const t = authToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (auth && res.status === 401) {
    await handleSessionExpired();
    return new Promise(() => {}); // navega ao login; nao resolve para nao acionar catch/empty nas views
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && (data.message || data.error)) || `HTTP ${res.status}`);
  return data;
}

export const api = {
  health: () => req('GET', '/health'),
  meta: () => req('GET', '/meta'),
  // IA
  aiStatus: () => req('GET', '/ai/status'),
  aiChat: (message, history) => req('POST', '/ai/chat', { message, history }, { auth: true }),
  aiTriage: (message) => req('POST', '/ai/triage', { message }, { auth: true }),
  aiStreamUrl: (q) => `${BASE}/ai/stream?token=${encodeURIComponent(authToken())}&q=${encodeURIComponent(q)}`,
  // Upload multipart (documentos, fotos de vistoria)
  upload: async (resource, file, params) => {
    const fd = new FormData();
    fd.append('file', file);
    const qs = params ? '?' + new URLSearchParams(params) : '';
    const res = await fetch(`${BASE}/${resource}${qs}`, { method: 'POST', headers: { Authorization: `Bearer ${authToken()}` }, body: fd });
    if (res.status === 401) { await handleSessionExpired(); return new Promise(() => {}); }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && (data.message || data.error)) || `HTTP ${res.status}`);
    return data;
  },
  fileUrl: (key) => `${BASE}/files/${key}`,
  // CRUD generico (modulos F3+)
  list: (resource, params) => req('GET', `/${resource}${params ? '?' + new URLSearchParams(params) : ''}`, null, { auth: true }),
  get: (resource, id) => req('GET', `/${resource}/${id}`, null, { auth: true }),
  create: (resource, body) => req('POST', `/${resource}`, body, { auth: true }),
  update: (resource, id, body) => req('PUT', `/${resource}/${id}`, body, { auth: true }),
  remove: (resource, id) => req('DELETE', `/${resource}/${id}`, null, { auth: true }),
};
