/**
 * api.js
 * ------
 * Cliente HTTP do portal-recorder (frontend).
 *
 * Base da API:
 *   import.meta.env.BASE_URL e o base path do Vite ('/portal-rec/'). Concatenamos
 *   'api' para chegar em '/portal-rec/api'. Em producao, o Traefik aplica StripPrefix
 *   de /portal-rec/api e o portal-recorder-api recebe as rotas na raiz
 *   (ex.: /portal-rec/api/v1/portals -> backend ve /v1/portals). Em desenvolvimento,
 *   o proxy do Vite (vite.config.js) faz o mesmo strip contra http://localhost:8080.
 *
 * Envelope:
 *   sucesso { data: ... } · erro { error: { code, message } }.
 *
 * Autenticacao de escrita:
 *   As leituras (GET) sao abertas. As escritas (POST) exigem o Bearer
 *   PORTAL_REC_TOKEN, digitado pelo operador e guardado em localStorage
 *   ('portal_rec_token'). E enviado no header Authorization dos writes.
 */

// BASE_URL sempre termina com '/', portanto BASE_URL + 'api' => '/portal-rec/api'.
export const API_BASE = `${import.meta.env.BASE_URL}api`;

// Base do WebSocket de streaming (screencast do browser remoto). Resolvida em
// runtime para o host atual com o esquema ws/wss correto (https -> wss).
export function streamUrl(sessionId) {
  const base = import.meta.env.BASE_URL; // '/portal-rec/'
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = `${base}stream`.replace(/\/{2,}/g, '/'); // '/portal-rec/stream'
  return `${proto}//${window.location.host}${path}?session=${encodeURIComponent(sessionId)}`;
}

// ---------------------------------------------------------------------------
// Token de escrita (operador) em localStorage.
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'portal_rec_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Wrapper de fetch com envelope { data } / { error }, em pt-BR.
 * @param {string} path Caminho relativo a API_BASE (deve comecar com '/').
 * @param {object} [opts]
 * @param {string} [opts.method] Verbo HTTP (default GET).
 * @param {object} [opts.body] Corpo JSON (writes).
 * @param {boolean} [opts.auth] Se true, envia o Bearer token (writes).
 * @returns {Promise<any>} O conteudo de `data` ja desembrulhado.
 */
async function apiFetch(path, { method = 'GET', body, auth = false } = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (!token) {
      throw new Error('Token ausente: preencha o campo de token (PORTAL_REC_TOKEN) no topo.');
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new Error(
      `Falha de rede ao acessar ${url}: ${networkErr && networkErr.message ? networkErr.message : networkErr}`
    );
  }

  if (res.status === 204) return null;

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg =
      (json && json.error && json.error.message) ||
      `Erro ${res.status} (${res.statusText}) em ${path}`;
    const err = new Error(msg);
    err.code = json && json.error && json.error.code;
    err.status = res.status;
    throw err;
  }

  // Algumas respostas (ex.: stop) podem nao ter corpo util; retornamos data ?? json.
  return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
}

// ---------------------------------------------------------------------------
// Portais.
// ---------------------------------------------------------------------------
export const listPortals = () => apiFetch('/v1/portals');

export const createPortal = (portal) =>
  apiFetch('/v1/portals', { method: 'POST', body: portal, auth: true });

// ---------------------------------------------------------------------------
// Sessoes.
// ---------------------------------------------------------------------------
export function listSessions({ portal, status } = {}) {
  const qs = new URLSearchParams();
  if (portal) qs.set('portal', portal);
  if (status) qs.set('status', status);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/v1/sessions${suffix}`);
}

export const getSession = (id) => apiFetch(`/v1/sessions/${encodeURIComponent(id)}`);

export const createSession = (portalId, body = {}) =>
  apiFetch(`/v1/portals/${encodeURIComponent(portalId)}/sessions`, {
    method: 'POST',
    body,
    auth: true,
  });

export const stopSession = (id) =>
  apiFetch(`/v1/sessions/${encodeURIComponent(id)}/stop`, { method: 'POST', auth: true });

// ---------------------------------------------------------------------------
// Timeline / anotacoes / screenshots / normalizacao / contrato.
// ---------------------------------------------------------------------------
export const getTimeline = (id) =>
  apiFetch(`/v1/sessions/${encodeURIComponent(id)}/timeline`);

export const createAnnotation = (id, annotation) =>
  apiFetch(`/v1/sessions/${encodeURIComponent(id)}/annotations`, {
    method: 'POST',
    body: annotation,
    auth: true,
  });

export const takeScreenshot = (id) =>
  apiFetch(`/v1/sessions/${encodeURIComponent(id)}/screenshots`, { method: 'POST', auth: true });

export const normalizeSession = (id) =>
  apiFetch(`/v1/sessions/${encodeURIComponent(id)}/normalize`, { method: 'POST', auth: true });

export const getContract = (id) => apiFetch(`/v1/contracts/${encodeURIComponent(id)}`);

/**
 * URL direta do blob PNG de um screenshot (usavel em <img src>). Nao passa pelo
 * apiFetch porque o navegador busca a imagem diretamente.
 */
export function screenshotBlobUrl(sessionId, shotId) {
  return `${API_BASE}/v1/sessions/${encodeURIComponent(sessionId)}/screenshots/${encodeURIComponent(shotId)}/blob`;
}
