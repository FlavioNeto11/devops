import { buildManifestListQueryParams } from './manifest-list-query.js';
import { buildPartnerSearchQueryParams } from './partner-search-query.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080';
const DEFAULT_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 20000);

const SICAT_ACCESS_TOKEN_KEY = 'sicat_session_access_token';
const SICAT_REFRESH_TOKEN_KEY = 'sicat_session_refresh_token';
const SICAT_EXPIRES_AT_KEY = 'sicat_session_expires_at';
const SICAT_USER_KEY = 'sicat_session_user';
const SICAT_ACTIVE_ACCOUNT_KEY = 'sicat_active_cetesb_account';
const SICAT_SESSION_CONTEXT_KEY = 'sicat_active_session_context';
const SICAT_INTEGRATION_ACCOUNT_ID_KEY = 'sicat_active_integration_account_id';

const LEGACY_KEYS = [
  'sicat_auth_token',
  'sicat_auth_expires_at',
  'sicat_auth_user',
  'sicat_auth_partner',
  'sicat_session_context',
  'sicat_integration_account_id'
];

const SICAT_SESSION_REFRESHED_EVENT = 'sicat-session-refreshed';
const SICAT_SESSION_CLEARED_EVENT = 'sicat-session-cleared';

let refreshSessionPromise = null;

function dispatchSessionLifecycleEvent(name, detail = null) {
  if (typeof globalThis.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') {
    return;
  }

  globalThis.dispatchEvent(new CustomEvent(name, { detail }));
}

function safeParseJson(rawValue) {
  try {
    return JSON.parse(rawValue || 'null');
  } catch {
    return null;
  }
}

function readStoredRefreshToken() {
  return String(localStorage.getItem(SICAT_REFRESH_TOKEN_KEY) || '').trim();
}

function persistSicatSessionTokens({ accessToken, refreshToken, expiresAt, user }) {
  const effectiveUser = user === undefined
    ? safeParseJson(localStorage.getItem(SICAT_USER_KEY))
    : user;

  localStorage.setItem(SICAT_ACCESS_TOKEN_KEY, String(accessToken || ''));
  localStorage.setItem(SICAT_REFRESH_TOKEN_KEY, String(refreshToken || ''));
  localStorage.setItem(SICAT_EXPIRES_AT_KEY, String(expiresAt || ''));

  if (effectiveUser === null) {
    localStorage.removeItem(SICAT_USER_KEY);
  } else {
    localStorage.setItem(SICAT_USER_KEY, JSON.stringify(effectiveUser));
  }

  dispatchSessionLifecycleEvent(SICAT_SESSION_REFRESHED_EVENT, {
    accessToken: String(accessToken || ''),
    refreshToken: String(refreshToken || ''),
    expiresAt: String(expiresAt || ''),
    user: effectiveUser
  });
}

function buildCorrelationId(prefix = 'frontend') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function isTokenExpired(expiresAt) {
  if (!expiresAt) {
    return true;
  }

  const expiresAtDate = new Date(expiresAt);
  return Number.isNaN(expiresAtDate.getTime()) || new Date() >= expiresAtDate;
}

export function clearSicatSessionStorage() {
  localStorage.removeItem(SICAT_ACCESS_TOKEN_KEY);
  localStorage.removeItem(SICAT_REFRESH_TOKEN_KEY);
  localStorage.removeItem(SICAT_EXPIRES_AT_KEY);
  localStorage.removeItem(SICAT_USER_KEY);
  localStorage.removeItem(SICAT_ACTIVE_ACCOUNT_KEY);
  localStorage.removeItem(SICAT_SESSION_CONTEXT_KEY);
  localStorage.removeItem(SICAT_INTEGRATION_ACCOUNT_ID_KEY);

  LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));

  dispatchSessionLifecycleEvent(SICAT_SESSION_CLEARED_EVENT);
}

// A SPA é servida sob um base path (`/sicat/` em produção, `/` em dev). Montar a URL
// de login sem esse prefixo tira o usuário da SPA e cai no 404 do portal, por isso
// toda navegação de sessão expirada passa por aqui.
function buildAppPath(routePath) {
  const rawBase = String(import.meta.env.BASE_URL || '/');
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return `${base}${String(routePath).replace(/^\/+/, '')}`;
}

function redirectToLoginIfNeeded() {
  const loginPath = buildAppPath('login');
  const currentPath = String(globalThis.location?.pathname || '');
  const isLoginRoute = currentPath === loginPath || currentPath === loginPath.replace(/\/$/, '');
  if (!isLoginRoute) {
    globalThis.location.href = `${loginPath}?reason=expired`;
  }
}

async function refreshSicatAuthSessionInternal(refreshToken) {
  const correlationId = buildCorrelationId('frontend-refresh');
  const response = await fetch(`${API_BASE_URL}/v1/sicat/auth/refresh`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId
    },
    body: JSON.stringify({ refreshToken })
  });

  const payload = await parseResponsePayload(response);
  const responseCorrelationId = response.headers.get('x-correlation-id') || correlationId;

  if (!response.ok) {
    throw buildResponseError(response, payload, responseCorrelationId);
  }

  persistSicatSessionTokens(payload || {});
  return payload;
}

export async function refreshSicatAuthSession(payload = {}) {
  const refreshToken = String(payload?.refreshToken || readStoredRefreshToken()).trim();
  if (!refreshToken) {
    clearSicatSessionStorage();
    redirectToLoginIfNeeded();
    throw createApiError({
      message: 'Sessão expirada. Faça login novamente.',
      status: 401
    });
  }

  if (!refreshSessionPromise) {
    refreshSessionPromise = (async () => {
      try {
        return await refreshSicatAuthSessionInternal(refreshToken);
      } catch (error) {
        clearSicatSessionStorage();
        redirectToLoginIfNeeded();
        throw error;
      } finally {
        refreshSessionPromise = null;
      }
    })();
  }

  return refreshSessionPromise;
}

async function getAuthToken({ allowRefresh = true } = {}) {
  const token = localStorage.getItem(SICAT_ACCESS_TOKEN_KEY);
  const expiresAt = localStorage.getItem(SICAT_EXPIRES_AT_KEY);

  if (token && expiresAt && !isTokenExpired(expiresAt)) {
    return token;
  }

  if (allowRefresh && readStoredRefreshToken()) {
    const refreshedSession = await refreshSicatAuthSession();
    return String(refreshedSession?.accessToken || localStorage.getItem(SICAT_ACCESS_TOKEN_KEY) || '').trim() || null;
  }

  if (token || expiresAt || readStoredRefreshToken()) {
    clearSicatSessionStorage();
    redirectToLoginIfNeeded();
  }

  return null;
}

function createApiError({ message, status = 0, detail = '', title = '', correlationId = '', payload = null }) {
  const fallbackMessage = message || detail || title || 'Erro inesperado ao acessar API.';
  const error = new Error(fallbackMessage);
  error.name = 'ApiError';
  error.status = status;
  error.detail = detail;
  error.title = title;
  error.correlationId = correlationId;
  error.payload = payload;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterToMs(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const delta = date.getTime() - Date.now();
  return Math.max(delta, 0);
}

function getRetryDelayMs({ attempt, retryAfterMs }) {
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(retryAfterMs, 5000);
  }

  const safeAttempt = Math.max(Number(attempt || 1), 1);
  return Math.min(300 * safeAttempt, 2000);
}

function shouldRetryRequest({ method, status, error }) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const isIdempotentMethod = ['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod);
  if (!isIdempotentMethod) {
    return false;
  }

  if (typeof status === 'number') {
    if (status === 408 || status === 429) {
      return true;
    }

    if (status >= 500) {
      return true;
    }

    return false;
  }

  if (error?.name === 'AbortError') {
    return false;
  }

  const isNetworkError = error instanceof TypeError;
  return Boolean(error) && isNetworkError;
}

function buildRequestHeaders(fetchHeaders, correlationId, token, skipAuth) {
  let headers = {
    Accept: 'application/json',
    'X-Correlation-Id': correlationId
  };

  if (fetchHeaders) {
    headers = {
      ...headers,
      ...fetchHeaders
    };
  }

  if (token && !skipAuth) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function resolveRequestAuthToken(skipAuth, correlationId) {
  if (skipAuth) {
    return null;
  }

  const token = await getAuthToken({ allowRefresh: true });
  if (token) {
    return token;
  }

  throw createApiError({
    message: 'Sessão expirada. Faça login novamente.',
    status: 401,
    correlationId
  });
}

async function shouldRetryAfterUnauthorized(response, skipAuth, hasRetriedAfterUnauthorized) {
  if (response.status !== 401 || skipAuth || hasRetriedAfterUnauthorized) {
    return false;
  }

  await refreshSicatAuthSession();
  return true;
}

function attachAbortHandler(userSignal, controller, timeoutId, correlationId) {
  const abortOnUserSignal = () => controller.abort('external-abort');

  if (!userSignal) {
    return abortOnUserSignal;
  }

  if (userSignal.aborted) {
    clearTimeout(timeoutId);
    throw createApiError({ message: 'Requisição cancelada antes do envio.', correlationId });
  }

  userSignal.addEventListener('abort', abortOnUserSignal, { once: true });
  return abortOnUserSignal;
}

async function parseResponsePayload(response) {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('json') ? response.json() : response.text();
}

function buildResponseError(response, payload, correlationId) {
  const title = typeof payload === 'object' ? payload.title : '';
  const detail = typeof payload === 'object' ? payload.detail : '';
  const fallback = `Erro HTTP ${response.status} ao acessar API`;

  return createApiError({
    message: detail || title || fallback,
    status: response.status,
    detail,
    title,
    correlationId,
    payload
  });
}

function normalizeRequestError(error, controller, correlationId) {
  const isAbortError = error?.name === 'AbortError';
  if (!isAbortError) {
    return error;
  }

  if (controller.signal.reason === 'request-timeout') {
    return createApiError({ message: 'Tempo esgotado ao acessar API.', correlationId });
  }

  if (controller.signal.reason === 'external-abort') {
    return createApiError({ message: 'Requisição cancelada.', correlationId });
  }

  return error;
}

function ensureSuccessfulResponse(response, payload, responseCorrelationId, { skipAuth = false } = {}) {
  if (response.status === 401) {
    if (!skipAuth) {
      clearSicatSessionStorage();
      redirectToLoginIfNeeded();
    }

    throw createApiError({
      message: 'Sessão expirada. Faça login novamente.',
      status: 401,
      correlationId: responseCorrelationId,
      payload
    });
  }

  if (!response.ok) {
    throw buildResponseError(response, payload, responseCorrelationId);
  }

  return payload;
}

async function executeRequestAttempt(url, fetchOptions, headers, timeoutMs, userSignal, correlationId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('request-timeout'), timeoutMs);
  const abortOnUserSignal = attachAbortHandler(userSignal, controller, timeoutId, correlationId);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal: controller.signal
    });

    return {
      response,
      payload: await parseResponsePayload(response),
      responseCorrelationId: response.headers.get('x-correlation-id') || correlationId
    };
  } catch (error) {
    throw normalizeRequestError(error, controller, correlationId);
  } finally {
    clearTimeout(timeoutId);
    if (userSignal) {
      userSignal.removeEventListener('abort', abortOnUserSignal);
    }
  }
}

async function request(path, options = {}) {
  const {
    skipAuth = false,
    retry = 1,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    ...fetchOptions
  } = options;
  const correlationId = buildCorrelationId();
  const url = `${API_BASE_URL}${path}`;
  const method = String(fetchOptions.method || 'GET').toUpperCase();

  const maxAttempts = Math.max(Number(retry || 0), 0) + 1;
  const userSignal = fetchOptions.signal;
  let hasRetriedAfterUnauthorized = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const token = await resolveRequestAuthToken(skipAuth, correlationId);
      const headers = buildRequestHeaders(fetchOptions.headers, correlationId, token, skipAuth);
      const { response, payload, responseCorrelationId } = await executeRequestAttempt(
        url,
        fetchOptions,
        headers,
        timeoutMs,
        userSignal,
        correlationId
      );

      if (await shouldRetryAfterUnauthorized(response, skipAuth, hasRetriedAfterUnauthorized)) {
        hasRetriedAfterUnauthorized = true;
        continue;
      }

      if (!response.ok && attempt < maxAttempts && shouldRetryRequest({ method, status: response.status })) {
        const retryAfterMs = parseRetryAfterToMs(response.headers.get('retry-after'));
        await sleep(getRetryDelayMs({ attempt, retryAfterMs }));
        continue;
      }

      return ensureSuccessfulResponse(response, payload, responseCorrelationId, { skipAuth });
    } catch (error) {
      if (attempt < maxAttempts && shouldRetryRequest({ method, error })) {
        await sleep(getRetryDelayMs({ attempt }));
        continue;
      }

      throw error;
    }
  }

  throw createApiError({ message: 'Falha ao acessar API após novas tentativas.', correlationId });
}

/**
 * Coalescência de GETs idênticos EM VOO.
 *
 * As telas de CDF montam o carregamento com `watch(contextReady, { immediate: true })`
 * E `onMounted` — quando o contexto operacional já está pronto na montagem, os
 * dois disparam e a mesma consulta sai DUAS vezes por carregamento
 * (`/v1/cdf/certificates` e `/v1/cdf/responsibles` foram observados assim em
 * produção). Como essas rotas passam pelo gateway CETESB, a duplicidade dobra a
 * latência das telas mais lentas.
 *
 * Aqui a segunda chamada com o MESMO path enquanto a primeira ainda está em voo
 * reaproveita a mesma promise. Não é cache: assim que a requisição termina a
 * entrada é descartada, então um recarregamento posterior continua indo à rede.
 */
const inFlightGetRequests = new Map();

function dedupedGet(path) {
  const pending = inFlightGetRequests.get(path);
  if (pending) {
    return pending;
  }

  const promise = request(path).finally(() => {
    inFlightGetRequests.delete(path);
  });

  inFlightGetRequests.set(path, promise);
  return promise;
}

function toQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    searchParams.append(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export function listManifests(params) {
  // Lista branca (manifest-list-query.js): parâmetro que o backend não lê não
  // sai na URL — nada de filtro fantasma respondendo 200 e devolvendo tudo.
  return request(`/v1/manifestos${toQueryString(buildManifestListQueryParams(params))}`);
}

export function getManifestById(id) {
  return request(`/v1/manifestos/${id}`);
}

export function getReceiptResponsibles(params) {
  return dedupedGet(`/v1/manifestos/receipt-responsibles${toQueryString(params)}`);
}

export function getCdfResponsibles(params) {
  return dedupedGet(`/v1/cdf/responsibles${toQueryString(params)}`);
}

export function enqueueManifestReceive(payload) {
  return request('/v1/manifestos/receive', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export function enqueueCdfGenerate(payload) {
  return request('/v1/cdf/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export function enqueueCdfDownload(payload) {
  return request('/v1/cdf/download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export function listCdfCertificates(params = {}) {
  return dedupedGet(`/v1/cdf/certificates${toQueryString(params)}`);
}

export async function downloadCdfDocument(documentId, options = {}) {
  const preferredFileName = String(options?.preferredFileName || '').trim();
  const correlationId = buildCorrelationId('frontend-cdf');
  const query = toQueryString({
    integrationAccountId: options?.integrationAccountId,
    sessionContextId: options?.sessionContextId
  });
  const url = `${API_BASE_URL}/v1/cdf/documents/${encodeURIComponent(documentId)}${query}`;

  let response = null;
  let attemptedRefresh = false;

  while (true) {
    const token = await getAuthToken({ allowRefresh: true });
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/pdf',
        'X-Correlation-Id': correlationId,
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401 && !attemptedRefresh) {
      attemptedRefresh = true;
      await refreshSicatAuthSession();
      continue;
    }

    break;
  }

  if (response.status === 401) {
    clearSicatSessionStorage();
    redirectToLoginIfNeeded();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }

    throw new Error(detail || `Erro HTTP ${response.status} ao baixar CDF`);
  }

  const disposition = response.headers.get('content-disposition') || '';
  const fileNameMatch = /filename="?([^";]+)"?/i.exec(disposition);
  const fileName = preferredFileName || fileNameMatch?.[1] || `cdf-${documentId}.pdf`;
  const blob = await response.blob();

  return { blob, fileName };
}

export async function downloadManifestDocument(manifestId, documentId, options = {}) {
  const preferredManifestNumber = String(options?.preferredManifestNumber || '').trim();
  const preferredFileName = String(options?.preferredFileName || '').trim();
  const correlationId = buildCorrelationId();
  const url = `${API_BASE_URL}/v1/manifestos/${encodeURIComponent(manifestId)}/documents/${encodeURIComponent(documentId)}`;

  let response = null;
  let attemptedRefresh = false;

  while (true) {
    const token = await getAuthToken({ allowRefresh: true });
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const headers = {
      Accept: 'application/pdf',
      'X-Correlation-Id': correlationId,
      Authorization: `Bearer ${token}`
    };

    response = await fetch(url, {
      method: 'GET',
      headers
    });

    if (response.status === 401 && !attemptedRefresh) {
      attemptedRefresh = true;
      await refreshSicatAuthSession();
      continue;
    }

    break;
  }

  if (response.status === 401) {
    clearSicatSessionStorage();
    redirectToLoginIfNeeded();

    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    throw new Error(detail || `Erro HTTP ${response.status} ao baixar documento`);
  }

  const disposition = response.headers.get('content-disposition') || '';
  const fileNameMatch = /filename="?([^";]+)"?/i.exec(disposition);
  const resolvedPreferredFileName = preferredFileName
    || (preferredManifestNumber ? `mtr_${preferredManifestNumber}.pdf` : '');
  const fileName = resolvedPreferredFileName || fileNameMatch?.[1] || `manifesto-${manifestId}.pdf`;
  const blob = await response.blob();

  return { blob, fileName };
}

export function getCatalog(catalogName, params) {
  return request(`/v1/catalogs/${encodeURIComponent(catalogName)}${toQueryString(params)}`);
}

export function searchPartners(params = {}) {
  return dedupedGet(`/v1/partners/search${toQueryString(buildPartnerSearchQueryParams(params))}`);
}

// SEM `skipAuth`: `/v1/auth/partner-info` passou a exigir sessão SICAT. O único chamador é
// `CetesbAccountSelectionView`, cuja rota `/login/cetesb` já é `requiresSicatAuth: true` — o token
// sempre existe aqui. Sem sessão, a rota é um proxy anônimo de consulta de CNPJ contra a CETESB,
// feito com a CA e o IP do nosso backend.
export function getPartnerInfo(document) {
  return request(`/v1/auth/partner-info${toQueryString({ document })}`);
}

export function createManifest(payload) {
  return request('/v1/manifestos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export function batchCreateManifests(payload) {
  return request('/v1/manifestos/batch-create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export function replicateManifest(id, payload) {
  return request(`/v1/manifestos/${encodeURIComponent(id)}/replicate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export function submitManifest(id, payload) {
  return request(`/v1/manifestos/${encodeURIComponent(id)}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export function batchSubmitManifests(payload) {
  return request('/v1/manifestos/batch-submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export function printManifest(id, payload) {
  return request(`/v1/manifestos/${encodeURIComponent(id)}/print`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });
}

export function cancelManifest(id, payload) {
  return request(`/v1/manifestos/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export function batchCancelManifests(payload) {
  return request('/v1/manifestos/batch-cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export function removeManifest(id) {
  return request(`/v1/manifestos/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

export function getJobById(jobId) {
  return request(`/v1/jobs/${encodeURIComponent(jobId)}`);
}

export function sendConversationTurn(payload, { signal } = {}) {
  // O turno conversacional pode acionar o agente de diagnóstico (loop multi-step com o LLM),
  // levando bem mais que os 20s padrão. Damos folga generosa para não abortar respostas válidas.
  // `signal` permite ao chat cancelar a ESPERA do cliente (botão Parar) — o backend
  // conclui o turno normalmente, mas a UI é liberada na hora.
  return request('/v1/conversations/turns', {
    method: 'POST',
    timeoutMs: 90000,
    ...(signal ? { signal } : {}),
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });
}

// F5: feedback explícito 👍/👎 por resposta da IA.
export function sendConversationFeedback(payload) {
  return request('/v1/conversations/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });
}

export function getConversationArtifactStatus({ artifactId, integrationAccountId, sessionContextId } = {}) {
  const id = String(artifactId || '').trim();
  if (!id) {
    throw new Error('artifactId is required to query conversation artifact status.');
  }

  const params = new URLSearchParams();
  if (integrationAccountId) {
    params.set('integrationAccountId', String(integrationAccountId));
  }
  if (sessionContextId) {
    params.set('sessionContextId', String(sessionContextId));
  }

  const query = params.toString();
  const suffix = query ? `?${query}` : '';
  return request(`/v1/conversations/artifacts/${encodeURIComponent(id)}${suffix}`);
}

function parseContentDispositionFileName(headerValue) {
  const value = String(headerValue || '').trim();
  if (!value) {
    return null;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const simpleMatch = /filename="?([^";]+)"?/i.exec(value);
  return simpleMatch?.[1] ? simpleMatch[1] : null;
}

export async function downloadConversationArtifactContent({ artifactId, integrationAccountId, sessionContextId, fileName } = {}) {
  const id = String(artifactId || '').trim();
  if (!id) {
    throw new Error('artifactId is required to download conversation artifact content.');
  }

  const correlationId = buildCorrelationId('frontend-conv-artifact');
  const token = await resolveRequestAuthToken(false, correlationId);

  const params = new URLSearchParams();
  if (integrationAccountId) {
    params.set('integrationAccountId', String(integrationAccountId));
  }
  if (sessionContextId) {
    params.set('sessionContextId', String(sessionContextId));
  }

  const query = params.toString();
  const suffix = query ? `?${query}` : '';

  const response = await fetch(`${API_BASE_URL}/v1/conversations/artifacts/${encodeURIComponent(id)}/content${suffix}`, {
    method: 'GET',
    headers: buildRequestHeaders(null, correlationId, token, false)
  });

  if (!response.ok) {
    let payload = null;
    try {
      payload = await parseResponsePayload(response);
    } catch {
      payload = null;
    }
    throw buildResponseError(response, payload, response.headers.get('x-correlation-id') || correlationId);
  }

  const blob = await response.blob();
  const headerFileName = parseContentDispositionFileName(response.headers.get('content-disposition'));

  return {
    blob,
    mimeType: response.headers.get('content-type') || blob.type || 'application/octet-stream',
    fileName: String(fileName || headerFileName || `artifact-${id}`).trim()
  };
}

export function listConversationTools() {
  return request('/v1/conversations/tools');
}

export async function streamJobEvents(jobId, { onEvent, onError, signal } = {}) {
  const correlationId = buildCorrelationId('frontend-stream');
  const url = `${API_BASE_URL}/v1/jobs/${encodeURIComponent(jobId)}/events`;

  let response = null;
  let attemptedRefresh = false;

  while (true) {
    const token = await getAuthToken({ allowRefresh: true });
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/x-ndjson',
        'X-Correlation-Id': correlationId,
        Authorization: `Bearer ${token}`
      },
      signal
    });

    if (response.status === 401 && !attemptedRefresh) {
      attemptedRefresh = true;
      await refreshSicatAuthSession();
      continue;
    }

    break;
  }

  if (response.status === 401) {
    clearSicatSessionStorage();
    redirectToLoginIfNeeded();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    throw new Error(detail || `Erro HTTP ${response.status} ao abrir stream de job`);
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    throw new Error('Stream de eventos indisponível no ambiente atual.');
  }

  let active = true;
  const decoder = new TextDecoder();
  let buffer = '';

  const stop = async () => {
    active = false;
    try {
      await reader.cancel();
    } catch {}
  };

  (async () => {
    try {
      while (active) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            onEvent?.(JSON.parse(trimmed));
          } catch (parseError) {
            onError?.(parseError);
          }
        }
      }
    } catch (streamError) {
      if (active) {
        onError?.(streamError);
      }
    }
  })();

  return stop;
}

export function getAuditTrail(correlationId) {
  return request(`/v1/audit/${encodeURIComponent(correlationId)}`, {
    retry: 2,
    timeoutMs: 15000
  });
}

export function getActiveJobs() {
  return request('/v1/health/jobs/active', {
    retry: 2,
    timeoutMs: 15000
  });
}

export function getSystemHealth() {
  return request('/v1/health/system');
}

export function getWorkersHealth() {
  return request('/v1/health/workers');
}

export function getPerformanceMetrics(hoursBack = 24) {
  const query = toQueryString({ hoursBack });
  return request(`/v1/health/metrics/performance${query}`);
}

export function getPerformanceTimeline(hoursBack = 24) {
  const query = toQueryString({ hoursBack });
  return request(`/v1/health/metrics/timeline${query}`);
}

export function getCetesbEndpointMetrics({ hoursBack = 24, limit = 10 } = {}) {
  const query = toQueryString({ hoursBack, limit });
  return request(`/v1/health/metrics/endpoints${query}`);
}

export function getDashboardOverview(params = {}) {
  return request(`/v1/dashboard/overview${toQueryString(params)}`);
}

export function cancelActiveJob(jobId, reason = 'Cancelled manually by operator') {
  return request(`/v1/health/jobs/active/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason })
  });
}

export function removeActiveJob(jobId) {
  return request(`/v1/health/jobs/active/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
}

export function getDLQJobs() {
  return request('/v1/health/jobs/dlq', {
    retry: 2,
    timeoutMs: 15000
  });
}

export function requeueDLQJob(jobId) {
  return request(`/v1/health/jobs/dlq/${encodeURIComponent(jobId)}/requeue`, { method: 'POST' });
}

export function deleteDLQJob(jobId) {
  return request(`/v1/health/jobs/dlq/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
}

export function syncManifests(params = {}) {
  return request(`/v1/manifestos${toQueryString(params)}`);
}

export function sicatLogin(payload) {
  return request('/v1/sicat/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    skipAuth: true
  });
}

export function keycloakLogin(accessToken) {
  return request('/v1/sicat/auth/keycloak', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ accessToken }),
    skipAuth: true
  });
}

export function sicatRegister(payload) {
  return request('/v1/sicat/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    skipAuth: true
  });
}

export function listSicatCetesbAccounts() {
  return request('/v1/sicat/cetesb-accounts');
}

export function addSicatCetesbAccount(payload) {
  return request('/v1/sicat/cetesb-accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export function activateSicatCetesbAccount(accountId) {
  return request(`/v1/sicat/cetesb-accounts/${encodeURIComponent(accountId)}/activate`, {
    method: 'POST'
  });
}

export function removeSicatCetesbAccount(accountId) {
  return request(`/v1/sicat/cetesb-accounts/${encodeURIComponent(accountId)}`, {
    method: 'DELETE'
  });
}

export function getSicatSession() {
  return request('/v1/sicat/session');
}

export function listAdminAccessUsers(params = {}) {
  return request(`/v1/admin/access/users${toQueryString(params)}`);
}

export function getAdminAccessUserById(userId) {
  return request(`/v1/admin/access/users/${encodeURIComponent(userId)}`);
}

export function listAdminAccessRoles() {
  return request('/v1/admin/access/roles');
}

export function listAdminAccessPermissions(params = {}) {
  return request(`/v1/admin/access/permissions${toQueryString(params)}`);
}

export function listAdminAccessSessions(params = {}) {
  return request(`/v1/admin/access/sessions${toQueryString(params)}`);
}

export function grantAdminAccessRole(userId, roleId, payload = {}) {
  return request(`/v1/admin/access/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
}

export function revokeAdminAccessRole(userId, roleId, payload = {}) {
  return request(`/v1/admin/access/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
}

export function resetAdminAccessUserPassword(userId, payload = {}) {
  return request(`/v1/admin/access/users/${encodeURIComponent(userId)}/password/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
}

export function expireAdminAccessUserPassword(userId, payload = {}) {
  return request(`/v1/admin/access/users/${encodeURIComponent(userId)}/password/expire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
}

/**
 * Waiver do escudo anti-bombing do vínculo WhatsApp (domínio explicado em
 * `features/access-admin/shieldWaiverState.js`). Telefone e motivo vão no
 * CORPO — PII em path/query vira log de acesso do Traefik e cabeçalho Referer.
 *
 * contrato pareado com a unidade B1: payload `{ channelType, phone, reason }`,
 * resposta de sucesso com o telefone apenas MASCARADO.
 */
export function grantAdminChannelShieldWaiver(payload = {}) {
  return request('/v1/admin/access/channel-links/shield-waiver', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
}

// =============================================================================
// Centro Operacional SICAT — endpoints operacionais (fase 05-frontend).
// =============================================================================

export function getOperationsOverview() {
  return request('/v1/operations/overview', { retry: 1, timeoutMs: 15000 });
}

export function searchJobs(params = {}) {
  return request(`/v1/jobs/search${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

export function retryJob(jobId, { idempotencyKey } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = String(idempotencyKey);
  }

  return request(`/v1/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: 'POST',
    headers,
    body: JSON.stringify({})
  });
}

export function searchAuditEntries(params = {}) {
  return request(`/v1/audit/search${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

export function getAuditByCorrelationId(correlationId) {
  return request(`/v1/audit/${encodeURIComponent(correlationId)}`, { retry: 1, timeoutMs: 15000 });
}

export function getCetesbAccountsHealth() {
  return request('/v1/cetesb/accounts/health', { retry: 1, timeoutMs: 15000 });
}

export function getCetesbSessionsHealth(params = {}) {
  return request(`/v1/cetesb/sessions/health${toQueryString(params)}`, {
    retry: 1,
    timeoutMs: 15000
  });
}

export function getMtrReports(params = {}) {
  return request(`/v1/reports/mtrs${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

/**
 * Constrói a URL absoluta para download do CSV de relatório de MTR.
 * Útil quando precisamos abrir o download direto via window.open ou anchor.
 */
export function buildMtrReportsExportUrl(params = {}) {
  return `${API_BASE_URL}/v1/reports/mtrs/export${toQueryString(params)}`;
}

/**
 * Faz download do CSV de relatório de MTR. Retorna { blob, fileName }.
 * Trata 413 com mensagem amigável (filtros amplos demais).
 */
export async function downloadMtrReportsCsv(params = {}) {
  const correlationId = buildCorrelationId('frontend-export');
  const url = `${API_BASE_URL}/v1/reports/mtrs/export${toQueryString(params)}`;

  let response = null;
  let attemptedRefresh = false;

  while (true) {
    const token = await getAuthToken({ allowRefresh: true });
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/csv',
        'X-Correlation-Id': correlationId,
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401 && !attemptedRefresh) {
      attemptedRefresh = true;
      await refreshSicatAuthSession();
      continue;
    }

    break;
  }

  if (response.status === 401) {
    clearSicatSessionStorage();
    redirectToLoginIfNeeded();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (response.status === 413) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const error = new Error(
      payload?.detail
      || 'Os filtros retornam mais de 5.000 linhas. Estreite o período ou parceiros e tente novamente.'
    );
    error.code = payload?.code || 'REPORT_EXPORT_LIMIT_EXCEEDED';
    error.status = 413;
    error.correlationId = correlationId;
    throw error;
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    throw new Error(detail || `Erro HTTP ${response.status} ao exportar relatório MTR`);
  }

  const disposition = response.headers.get('content-disposition') || '';
  const fileNameMatch = /filename="?([^";]+)"?/i.exec(disposition);
  const fileName = fileNameMatch?.[1] || `mtr-report-${Date.now()}.csv`;
  const blob = await response.blob();

  return { blob, fileName };
}

// =============================================================================
// DMR — Declaração de Movimentação de Resíduos (cadeia dmr-fluxo-base, fase 07).
// Contrato em openapi/mtr_automacao_openapi_interna.yaml (/v1/dmr/*).
// =============================================================================

function buildDmrCommandHeaders(idempotencyKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = String(idempotencyKey);
  }
  return headers;
}

export function listDmr(params = {}) {
  return request(`/v1/dmr${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

export function listPendingDmr(params = {}) {
  return request(`/v1/dmr/pendentes${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

export function createDmr(payload, { idempotencyKey } = {}) {
  return request('/v1/dmr', {
    method: 'POST',
    headers: buildDmrCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload || {})
  });
}

export function getDmrById(dmrId) {
  return request(`/v1/dmr/${encodeURIComponent(dmrId)}`, { retry: 1, timeoutMs: 15000 });
}

export function deleteDmr(dmrId) {
  return request(`/v1/dmr/${encodeURIComponent(dmrId)}`, { method: 'DELETE' });
}

export function consolidateDmr(dmrId, payload = {}, { idempotencyKey } = {}) {
  return request(`/v1/dmr/${encodeURIComponent(dmrId)}/consolidate`, {
    method: 'POST',
    headers: buildDmrCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload || {})
  });
}

export function submitDmr(dmrId, payload, { idempotencyKey } = {}) {
  return request(`/v1/dmr/${encodeURIComponent(dmrId)}/submit`, {
    method: 'POST',
    headers: buildDmrCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload || {})
  });
}

export function getDmrStatus(dmrId) {
  return request(`/v1/dmr/${encodeURIComponent(dmrId)}/status`, { retry: 1, timeoutMs: 15000 });
}

export function listDmrItems(dmrId) {
  return request(`/v1/dmr/${encodeURIComponent(dmrId)}/items`, { retry: 1, timeoutMs: 15000 });
}

export function addDmrItem(dmrId, payload, { idempotencyKey } = {}) {
  return request(`/v1/dmr/${encodeURIComponent(dmrId)}/items`, {
    method: 'POST',
    headers: buildDmrCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload || {})
  });
}

export function removeDmrItem(dmrId, itemId) {
  return request(
    `/v1/dmr/${encodeURIComponent(dmrId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' }
  );
}

// =============================================================================
// MTR Provisório — cadeia mtr-provisorio-fluxo-base (fase 07-frontend-ux).
// Contrato em openapi/mtr_automacao_openapi_interna.yaml (/v1/mtr-provisorio/*).
// =============================================================================

function buildMtrProvisorioCommandHeaders(idempotencyKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = String(idempotencyKey);
  }
  return headers;
}

export function listMtrProvisorio(params = {}) {
  return request(`/v1/mtr-provisorio${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

export function createMtrProvisorio(payload, { idempotencyKey } = {}) {
  return request('/v1/mtr-provisorio', {
    method: 'POST',
    headers: buildMtrProvisorioCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload || {})
  });
}

export function getMtrProvisorioById(id) {
  return request(`/v1/mtr-provisorio/${encodeURIComponent(id)}`, { retry: 1, timeoutMs: 15000 });
}

export function cancelMtrProvisorio(id) {
  return request(`/v1/mtr-provisorio/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function printMtrProvisorio(id, payload = {}, { idempotencyKey } = {}) {
  return request(`/v1/mtr-provisorio/${encodeURIComponent(id)}/print`, {
    method: 'POST',
    headers: buildMtrProvisorioCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload || {})
  });
}

// =============================================================================
// Transporte — vertical de transporte rodoviário de resíduos (DL-103,
// programa "SICAT Transporte", Onda 1.5/PR-F1 — frontend mínimo). Bounded
// context SEPARADO do MTR ambiental (DL-103) — NÃO reaproveita `manifest-*`.
// Contrato em openapi/mtr_automacao_openapi_interna.yaml (`/v1/transporte/*`,
// tags "Transporte - Regras" / "Transporte - Operações" / "Transporte -
// Conformidade"). Cadastros/operações/conformidade são SEMPRE síncronos na
// Fase A (sem 202/job) — o motor de compliance roda inline no mesmo request.
//
// Tenancy OBRIGATÓRIA: toda leitura passa `integrationAccountId` explícito em
// query — sem "conta ativa da sessão" implícita (molde `listManifests`, que
// filtra client-side; aqui o backend exige o param). As transições
// (submeter-validacao/contratar/reabrir/cancelar) exigem `version` no corpo
// para locking otimista — 409 quando defasada (`TRANSPORT_*` problem codes).
//
// Idempotency-Key: só `POST /v1/transporte/operacoes` (criação — fora do
// escopo deste PR, que é list+detalhe+transições+regras read-only) declara o
// parâmetro no contrato. Nenhuma das rotas usadas abaixo (transições,
// validar-conformidade, regras) o declara — por isso NÃO mandamos o header
// aqui: um Idempotency-Key que o servidor não lê sugere uma garantia que não
// existe (mesmo raciocínio da seção de vínculos de canal, logo abaixo).
// =============================================================================

// Criação do draft da operação (REQ-SICAT-0032/onda F3): contrato mínimo —
// integrationAccountId + route; carga/frete opcionais. Idempotency-Key por
// tentativa (mesmo padrão dos demais comandos da vertical).
export function createTransportOperation(payload, { idempotencyKey } = {}) {
  return request('/v1/transporte/operacoes', {
    method: 'POST',
    headers: buildTransporteCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload)
  });
}

export function listTransportOperations(params = {}) {
  return request(`/v1/transporte/operacoes${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

export function getTransportOperationById(operationId, params = {}) {
  return request(
    `/v1/transporte/operacoes/${encodeURIComponent(operationId)}${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

export function getTransportOperationCompliance(operationId, params = {}) {
  return request(
    `/v1/transporte/operacoes/${encodeURIComponent(operationId)}/conformidade${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

/** Avalia UM gate ad-hoc (`triggeredBy=user`), sem aplicar transição alguma. */
export function validateTransportOperationCompliance(operationId, payload = {}) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/validar-conformidade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/**
 * Orquestra a saída de `draft`: avalia GATE_PROPOSAL e aplica
 * approve_validation (→ ready_for_contract) ou reject_validation (→ blocked)
 * no mesmo request. Resposta: `{ operation, evaluation }`.
 */
export function submitTransportOperationValidation(operationId, payload = {}) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/submeter-validacao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/** Ativa GATE_CONTRACT (ready_for_contract → contracted). Resposta: `{ operation, evaluation }`. */
export function contractTransportOperation(operationId, payload = {}) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/contratar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/** Transição sem gate (blocked → draft) — limpa `blockedReasonCode`. */
export function reopenTransportOperation(operationId, payload = {}) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/reabrir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/** Cancela a partir de qualquer status não-terminal. `reason` é obrigatório no corpo. */
export function cancelTransportOperation(operationId, payload = {}) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/cancelar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function listTransportRules(params = {}) {
  return request(`/v1/transporte/regras${toQueryString(params)}`, { retry: 1, timeoutMs: 15000 });
}

export function getTransportRuleByCode(code, params = {}) {
  return request(
    `/v1/transporte/regras/${encodeURIComponent(code)}${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

export function getTransportRuleHistory(code) {
  return request(`/v1/transporte/regras/${encodeURIComponent(code)}/historico`, { retry: 1, timeoutMs: 15000 });
}

/** Único caminho para `blocking=true` (ou reverter) — sempre exige `reviewNotes` + `version`. */
export function promoteTransportRuleVersion(code, versionLabel, payload = {}) {
  return request(
    `/v1/transporte/regras/${encodeURIComponent(code)}/versoes/${encodeURIComponent(versionLabel)}/promover`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );
}

// -----------------------------------------------------------------------------
// Transporte — PR-H2 (frontend completo). Cabeçalho de comando padrão para as
// rotas assíncronas (202) — `Idempotency-Key` opcional, mesmo contrato do
// `buildMtrProvisorioCommandHeaders`/`buildDmrCommandHeaders` acima.
// -----------------------------------------------------------------------------

function buildTransporteCommandHeaders(idempotencyKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = String(idempotencyKey);
  }
  return headers;
}

// ---- Cadastros: transportadores -------------------------------------------

export function createTransportCarrier(payload, { idempotencyKey } = {}) {
  return request('/v1/transporte/transportadores', {
    method: 'POST',
    headers: buildTransporteCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload)
  });
}

export function listTransportCarriers(params = {}) {
  return request(`/v1/transporte/transportadores${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

export function getTransportCarrierById(partyId, params = {}) {
  return request(
    `/v1/transporte/transportadores/${encodeURIComponent(partyId)}${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

export function updateTransportCarrier(partyId, payload) {
  return request(`/v1/transporte/transportadores/${encodeURIComponent(partyId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/** `strategy: manual` responde 200 síncrono; `open_data` responde 202 (CommandAccepted). */
export function verifyTransportCarrierRntrc(partyId, payload, { idempotencyKey } = {}) {
  return request(`/v1/transporte/transportadores/${encodeURIComponent(partyId)}/verificar-rntrc`, {
    method: 'POST',
    headers: buildTransporteCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload)
  });
}

export function listTransportCarrierRntrcVerifications(partyId, params = {}) {
  return request(
    `/v1/transporte/transportadores/${encodeURIComponent(partyId)}/verificacoes-rntrc${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

export function linkTransportCarrierVehicle(partyId, payload) {
  return request(`/v1/transporte/transportadores/${encodeURIComponent(partyId)}/veiculos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function listTransportCarrierVehicleLinks(partyId, params = {}) {
  return request(
    `/v1/transporte/transportadores/${encodeURIComponent(partyId)}/veiculos${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

// ---- Cadastros: veículos ----------------------------------------------------

export function createTransportVehicle(payload) {
  return request('/v1/transporte/veiculos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function listTransportVehicles(params = {}) {
  return request(`/v1/transporte/veiculos${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

export function getTransportVehicleById(vehicleId, params = {}) {
  return request(
    `/v1/transporte/veiculos/${encodeURIComponent(vehicleId)}${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

export function updateTransportVehicle(vehicleId, payload) {
  return request(`/v1/transporte/veiculos/${encodeURIComponent(vehicleId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// ---- Piso mínimo de frete (MODO SHADOW) ------------------------------------

export function calculateTransportOperationFloor(operationId, payload) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/calcular-piso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function listTransportOperationFloorCalculations(operationId, params = {}) {
  return request(
    `/v1/transporte/operacoes/${encodeURIComponent(operationId)}/calculos-piso${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

/** Catálogo GLOBAL (sem tenancy) de tabelas de piso carregadas — read-only. */
export function listTransportFloorTables() {
  return request('/v1/transporte/piso/tabelas', { retry: 1, timeoutMs: 15000 });
}

// ---- CIOT -------------------------------------------------------------------

export function preValidateTransportOperationCiot(operationId, payload) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/ciot/pre-validar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function requestTransportOperationCiot(operationId, payload, { idempotencyKey } = {}) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/ciot/solicitar`, {
    method: 'POST',
    headers: buildTransporteCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload)
  });
}

export function rectifyTransportOperationCiot(operationId, payload, { idempotencyKey } = {}) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/ciot/retificar`, {
    method: 'POST',
    headers: buildTransporteCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload)
  });
}

export function cancelTransportOperationCiot(operationId, payload, { idempotencyKey } = {}) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/ciot/cancelar`, {
    method: 'POST',
    headers: buildTransporteCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload)
  });
}

export function closeTransportOperationCiot(operationId, payload, { idempotencyKey } = {}) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/ciot/encerrar`, {
    method: 'POST',
    headers: buildTransporteCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload)
  });
}

export function getTransportOperationCiot(operationId, params = {}) {
  return request(
    `/v1/transporte/operacoes/${encodeURIComponent(operationId)}/ciot${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

// ---- VPO (Vale-Pedágio Obrigatório) -----------------------------------------

export function evaluateTransportOperationVpoApplicability(operationId, payload) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/vpo/avaliar-aplicabilidade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function registerTransportOperationVpoAcquisition(operationId, payload) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/vpo/registrar-aquisicao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function acquireTransportOperationVpo(operationId, payload, { idempotencyKey } = {}) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/vpo/adquirir`, {
    method: 'POST',
    headers: buildTransporteCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload)
  });
}

export function getTransportOperationVpo(operationId, params = {}) {
  return request(
    `/v1/transporte/operacoes/${encodeURIComponent(operationId)}/vpo${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

/** Cadastro CONFIGURÁVEL de fornecedoras de VPO — nunca hardcoded na UI. */
export function listTransportVpoProviders() {
  return request('/v1/transporte/vpo/fornecedoras', { retry: 1, timeoutMs: 15000 });
}

// ---- Documentos fiscais (DF-e) ----------------------------------------------

export function importTransportFiscalDocument(payload) {
  return request('/v1/transporte/documentos-fiscais/importar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function linkTransportFiscalDocument(documentId, payload) {
  return request(`/v1/transporte/documentos-fiscais/${encodeURIComponent(documentId)}/vincular`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function unlinkTransportFiscalDocument(documentId, payload) {
  return request(`/v1/transporte/documentos-fiscais/${encodeURIComponent(documentId)}/desvincular`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function revalidateTransportFiscalDocument(documentId, payload) {
  return request(`/v1/transporte/documentos-fiscais/${encodeURIComponent(documentId)}/revalidar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function listTransportOperationFiscalDocuments(operationId, params = {}) {
  return request(
    `/v1/transporte/operacoes/${encodeURIComponent(operationId)}/documentos-fiscais${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

export function getTransportFiscalDocumentById(documentId, params = {}) {
  return request(
    `/v1/transporte/documentos-fiscais/${encodeURIComponent(documentId)}${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

// ---- Seguros (apólices/PGR) --------------------------------------------------

export function createTransportCarrierInsurancePolicy(partyId, payload) {
  return request(`/v1/transporte/transportadores/${encodeURIComponent(partyId)}/apolices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function listTransportCarrierInsurancePolicies(partyId, params = {}) {
  return request(
    `/v1/transporte/transportadores/${encodeURIComponent(partyId)}/apolices${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

export function verifyTransportCarrierInsurancePolicies(partyId, payload) {
  return request(`/v1/transporte/transportadores/${encodeURIComponent(partyId)}/apolices/verificar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function updateTransportCarrierInsurancePolicy(partyId, policyId, payload) {
  return request(
    `/v1/transporte/transportadores/${encodeURIComponent(partyId)}/apolices/${encodeURIComponent(policyId)}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );
}

export function createTransportCarrierPgr(partyId, payload) {
  return request(`/v1/transporte/transportadores/${encodeURIComponent(partyId)}/pgr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function listTransportCarrierPgrs(partyId, params = {}) {
  return request(
    `/v1/transporte/transportadores/${encodeURIComponent(partyId)}/pgr${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

/** Centro Operacional — alertas de apólice vencendo/vencida (Pendências). */
export function listTransportInsuranceExpiryAlerts(params = {}) {
  return request(`/v1/transporte/seguros/vencimentos${toQueryString(params)}`, { retry: 1, timeoutMs: 15000 });
}

// ---- Emissão de DF-e (sandbox-ready) -----------------------------------------

export function requestTransportOperationDfeIssuance(operationId, payload, { idempotencyKey } = {}) {
  return request(`/v1/transporte/operacoes/${encodeURIComponent(operationId)}/emissoes`, {
    method: 'POST',
    headers: buildTransporteCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload)
  });
}

export function listTransportOperationDfeIssuances(operationId, params = {}) {
  return request(
    `/v1/transporte/operacoes/${encodeURIComponent(operationId)}/emissoes${toQueryString(params)}`,
    { retry: 1, timeoutMs: 15000 }
  );
}

export function cancelTransportDfeIssuance(issuanceId, payload, { idempotencyKey } = {}) {
  return request(`/v1/transporte/emissoes/${encodeURIComponent(issuanceId)}/cancelar`, {
    method: 'POST',
    headers: buildTransporteCommandHeaders(idempotencyKey),
    body: JSON.stringify(payload)
  });
}

// ---- Regulatory Watch (PR-H1/PR-H2) — GLOBAL, sem tenancy --------------------

export function listTransportWatchItems(params = {}) {
  return request(`/v1/transporte/watch${toQueryString(params)}`, { retry: 1, timeoutMs: 15000 });
}

export function getTransportWatchItemById(itemId) {
  return request(`/v1/transporte/watch/${encodeURIComponent(itemId)}`, { retry: 1, timeoutMs: 15000 });
}

export function reviewTransportWatchItem(itemId, payload) {
  return request(`/v1/transporte/watch/${encodeURIComponent(itemId)}/revisar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function applyTransportWatchItem(itemId, payload) {
  return request(`/v1/transporte/watch/${encodeURIComponent(itemId)}/aplicar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function triggerTransportWatchCheck({ idempotencyKey } = {}) {
  return request('/v1/transporte/watch/verificar-agora', {
    method: 'POST',
    headers: buildTransporteCommandHeaders(idempotencyKey)
  });
}

// ---- Centro Operacional — visão consolidada (Pendências) --------------------

export function getTransportOperationsOverview(params = {}) {
  return request(`/v1/transporte/operations/overview${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

// =============================================================================
// Vínculos de canal (WhatsApp) — cadeia whatsapp-channel-sicat (fase 02).
//
// Vinculação de telefone ↔ usuário SICAT por OTP SEMPRE iniciado no app: o
// usuário autenticado informa o número, recebe 6 dígitos pelo WhatsApp e
// confirma na tela. A identidade sai do Bearer no backend — nenhuma destas
// chamadas manda `userId`.
//
// O telefone trafega SÓ no corpo do POST de criação; as demais rotas endereçam
// `challengeId`/`linkId`. PII em path/query vira log de acesso do Traefik e
// cabeçalho Referer.
//
// Estas rotas NÃO mandam `Idempotency-Key`: não existe middleware de idempotência
// em /v1/sicat/channel-links, e um header que ninguém lê aparenta uma garantia que
// não existe. A deduplicação real é do servidor — índice único PARCIAL do desafio
// vivo (`conversation_channel_verifications_live_idx`: canal + telefone + usuário
// enquanto `consumed_at is null`) mais os limitadores (cooldown de reenvio, teto de
// envios, teto de vínculos por usuário). `request()` já
// não repete POST/DELETE (`shouldRetryRequest`), então o cliente não gera duplicata
// sozinho.
// =============================================================================

function buildChannelLinkCommandHeaders() {
  return { 'Content-Type': 'application/json' };
}

export function listChannelLinks(params = {}) {
  return request(`/v1/sicat/channel-links${toQueryString(params)}`, { retry: 1, timeoutMs: 15000 });
}

export function startChannelLink(payload) {
  return request('/v1/sicat/channel-links', {
    method: 'POST',
    headers: buildChannelLinkCommandHeaders(),
    body: JSON.stringify(payload || {})
  });
}

export function resendChannelLinkChallenge(challengeId) {
  return request(`/v1/sicat/channel-links/challenges/${encodeURIComponent(challengeId)}/resend`, {
    method: 'POST',
    headers: buildChannelLinkCommandHeaders(),
    body: JSON.stringify({})
  });
}

export function confirmChannelLinkChallenge(challengeId, payload = {}) {
  return request(`/v1/sicat/channel-links/challenges/${encodeURIComponent(challengeId)}/confirm`, {
    method: 'POST',
    headers: buildChannelLinkCommandHeaders(),
    body: JSON.stringify(payload || {})
  });
}

export function cancelChannelLinkChallenge(challengeId, params = {}) {
  return request(
    `/v1/sicat/channel-links/challenges/${encodeURIComponent(challengeId)}${toQueryString(params)}`,
    { method: 'DELETE' }
  );
}

export function deleteChannelLink(linkId) {
  return request(`/v1/sicat/channel-links/${encodeURIComponent(linkId)}`, { method: 'DELETE' });
}

// --- Janela de ação do WhatsApp (step-up do N2, fase 05) ---------------------
//
// A janela é aberta na SESSÃO WEB autenticada — nunca pelo canal. O corpo leva
// só duração e orçamento: telefone e conta CETESB são resolvidos no servidor a
// partir do vínculo `verified` e da conta ativa (nenhum identificador de conta
// sai do cliente). O DTO devolve o telefone MASCARADO; o E.164 cru nunca chega
// aqui. Sem `Idempotency-Key` pelo mesmo motivo das rotas acima: o servidor já
// deduplica (uma janela viva por usuário+telefone) e `request()` não repete
// POST/DELETE.

export function openWhatsAppActionWindow(payload) {
  return request('/v1/sicat/channel-links/whatsapp/action-window', {
    method: 'POST',
    headers: buildChannelLinkCommandHeaders(),
    body: JSON.stringify(payload || {})
  });
}

export function getWhatsAppActionWindow() {
  return request('/v1/sicat/channel-links/whatsapp/action-window', { retry: 1, timeoutMs: 15000 });
}

export function revokeWhatsAppActionWindow(windowId) {
  return request(`/v1/sicat/channel-links/whatsapp/action-window/${encodeURIComponent(windowId)}`, {
    method: 'DELETE'
  });
}

// =============================================================================
// AI Control Center — governança, observabilidade e runtime da IA SICAT.
// Todos os endpoints exigem Bearer admin (o client já injeta o token).
// Contrato em /v1/ai-control/*.
// =============================================================================

function buildAiControlCommandHeaders() {
  return { 'Content-Type': 'application/json' };
}

// --- Visão geral / saúde / settings ---------------------------------------

export function getAiControlOverview() {
  return request('/v1/ai-control/overview', { retry: 1, timeoutMs: 20000 });
}

export function getAiControlHealth() {
  return request('/v1/ai-control/health', { retry: 1, timeoutMs: 15000 });
}

export function getAiControlSettings() {
  return request('/v1/ai-control/settings', { retry: 1, timeoutMs: 15000 });
}

// --- Runtime: tools / agents / policies ------------------------------------

export function listAiControlTools() {
  return request('/v1/ai-control/runtime/tools', { retry: 1, timeoutMs: 20000 });
}

export function getAiControlTool(name) {
  return request(`/v1/ai-control/runtime/tools/${encodeURIComponent(name)}`);
}

export function listAiControlToolVersions(name) {
  return request(`/v1/ai-control/runtime/tools/${encodeURIComponent(name)}/versions`);
}

export function patchAiControlTool(name, body = {}) {
  return request(`/v1/ai-control/runtime/tools/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify(body || {})
  });
}

export function listAiControlAgents() {
  return request('/v1/ai-control/runtime/agents', { retry: 1, timeoutMs: 20000 });
}

export function patchAiControlAgent(name, body = {}) {
  return request(`/v1/ai-control/runtime/agents/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify(body || {})
  });
}

export function listAiControlPolicies() {
  return request('/v1/ai-control/runtime/policies', { retry: 1, timeoutMs: 20000 });
}

export function patchAiControlPolicy(policyId, body = {}) {
  return request(`/v1/ai-control/runtime/policies/${encodeURIComponent(policyId)}`, {
    method: 'PATCH',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify(body || {})
  });
}

// --- Prompts ----------------------------------------------------------------

export function listAiControlPrompts() {
  return request('/v1/ai-control/prompts', { retry: 1, timeoutMs: 20000 });
}

export function getAiControlPrompt(name) {
  return request(`/v1/ai-control/prompts/${encodeURIComponent(name)}`);
}

export function createAiControlPromptVersion(name, body = {}) {
  return request(`/v1/ai-control/prompts/${encodeURIComponent(name)}/versions`, {
    method: 'POST',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify(body || {})
  });
}

export function activateAiControlPrompt(name, body = {}) {
  return request(`/v1/ai-control/prompts/${encodeURIComponent(name)}/activate`, {
    method: 'POST',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify(body || {})
  });
}

export function syncAiControlPrompt(name, body = {}) {
  return request(`/v1/ai-control/prompts/${encodeURIComponent(name)}/sync-langfuse`, {
    method: 'POST',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify(body || {})
  });
}

// --- Knowledge base ---------------------------------------------------------

export function getAiControlKnowledgeSources() {
  return request('/v1/ai-control/knowledge/sources', { retry: 1, timeoutMs: 20000 });
}

export function listAiControlKnowledgeChunks(params = {}) {
  return request(`/v1/ai-control/knowledge/chunks${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

export function testAiControlRetrieval(body = {}) {
  return request('/v1/ai-control/knowledge/test-retrieval', {
    method: 'POST',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify(body || {}),
    timeoutMs: 30000
  });
}

export function setAiControlKnowledgeSourceEnabled(sourceKey, body = {}) {
  return request(`/v1/ai-control/knowledge/sources/${encodeURIComponent(sourceKey)}`, {
    method: 'PATCH',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify(body || {})
  });
}

export function reindexAiControlKnowledge(body = {}) {
  return request('/v1/ai-control/knowledge/reindex', {
    method: 'POST',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify(body || {}),
    timeoutMs: 120000
  });
}

// --- Memória ----------------------------------------------------------------

export function getAiControlMemory(sessionId, params = {}) {
  return request(`/v1/ai-control/memory/${encodeURIComponent(sessionId)}${toQueryString(params)}`, {
    retry: 1,
    timeoutMs: 20000
  });
}

export function getAiControlMemoryHistory(sessionId) {
  return request(`/v1/ai-control/memory/${encodeURIComponent(sessionId)}/history`, {
    retry: 1,
    timeoutMs: 20000
  });
}

export function clearAiControlMemory(sessionId, params = {}, body = {}) {
  return request(`/v1/ai-control/memory/${encodeURIComponent(sessionId)}${toQueryString(params)}`, {
    method: 'DELETE',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify(body || {})
  });
}

export function exportAiControlMemory(sessionId, params = {}) {
  return request(`/v1/ai-control/memory/${encodeURIComponent(sessionId)}/export${toQueryString(params)}`, {
    method: 'POST',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify({})
  });
}

export function rebuildAiControlMemory(sessionId, params = {}) {
  return request(`/v1/ai-control/memory/${encodeURIComponent(sessionId)}/rebuild-summary${toQueryString(params)}`, {
    method: 'POST',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify({})
  });
}

// --- Traces locais ----------------------------------------------------------

export function listAiControlLocalTraces(params = {}) {
  return request(`/v1/ai-control/traces/local${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

export function getAiControlLocalTrace(turnId) {
  return request(`/v1/ai-control/traces/local/${encodeURIComponent(turnId)}`);
}

// --- Langfuse ---------------------------------------------------------------

export function getAiControlLangfuseStatus() {
  return request('/v1/ai-control/langfuse/status', { retry: 1, timeoutMs: 15000 });
}

export function listAiControlLangfuseTraces(params = {}) {
  return request(`/v1/ai-control/langfuse/traces${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

export function getAiControlLangfuseTrace(traceId) {
  return request(`/v1/ai-control/langfuse/traces/${encodeURIComponent(traceId)}`, { retry: 1, timeoutMs: 20000 });
}

export function listAiControlLangfuseObservations(params = {}) {
  return request(`/v1/ai-control/langfuse/observations${toQueryString(params)}`, { retry: 1, timeoutMs: 20000 });
}

export function listAiControlLangfusePrompts() {
  return request('/v1/ai-control/langfuse/prompts', { retry: 1, timeoutMs: 20000 });
}

export function getAiControlLangfuseMetrics() {
  return request('/v1/ai-control/langfuse/metrics', { retry: 1, timeoutMs: 20000 });
}

export function getAiControlDeeplink(traceId) {
  return request(`/v1/ai-control/langfuse/deeplink/${encodeURIComponent(traceId)}`);
}

// --- Evals / Smoke ----------------------------------------------------------

export function listAiControlEvals() {
  return request('/v1/ai-control/evals', { retry: 1, timeoutMs: 20000 });
}

export function runAiControlEval(body = {}) {
  return request('/v1/ai-control/evals/run', {
    method: 'POST',
    headers: buildAiControlCommandHeaders(),
    body: JSON.stringify(body || {}),
    timeoutMs: 120000
  });
}

export function getAiControlEvalRun(runId) {
  return request(`/v1/ai-control/evals/${encodeURIComponent(runId)}`, { retry: 1, timeoutMs: 20000 });
}

// --- SSE: stream de eventos em tempo real -----------------------------------
// Mirror de streamJobEvents, mas parseia frames SSE (separados por "\n\n",
// com linhas "event:" e "data:"). Ignora heartbeats. Chama onEvent({type,at,payload}).

export async function streamAiControlEvents({ onEvent, onError, signal } = {}) {
  const correlationId = buildCorrelationId('frontend-ai-control-stream');
  const url = `${API_BASE_URL}/v1/ai-control/events/stream`;

  let response = null;
  let attemptedRefresh = false;

  while (true) {
    const token = await getAuthToken({ allowRefresh: true });
    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'X-Correlation-Id': correlationId,
        Authorization: `Bearer ${token}`
      },
      signal
    });

    if (response.status === 401 && !attemptedRefresh) {
      attemptedRefresh = true;
      await refreshSicatAuthSession();
      continue;
    }

    break;
  }

  if (response.status === 401) {
    clearSicatSessionStorage();
    redirectToLoginIfNeeded();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    throw new Error(detail || `Erro HTTP ${response.status} ao abrir stream de eventos da IA`);
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    throw new Error('Stream de eventos indisponível no ambiente atual.');
  }

  let active = true;
  const decoder = new TextDecoder();
  let buffer = '';

  const stop = async () => {
    active = false;
    try {
      await reader.cancel();
    } catch {}
  };

  const parseFrame = (frame) => {
    const lines = frame.split('\n');
    let eventName = '';
    const dataParts = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataParts.push(line.slice(5).trim());
      }
    }

    if (eventName === 'heartbeat') {
      return;
    }

    const rawData = dataParts.join('\n');
    let parsed = null;
    if (rawData) {
      try {
        parsed = JSON.parse(rawData);
      } catch {
        parsed = rawData;
      }
    }

    if (parsed && typeof parsed === 'object' && parsed.type) {
      if (parsed.type === 'heartbeat') return;
      onEvent?.({ type: parsed.type, at: parsed.at ?? null, payload: parsed.payload ?? parsed });
      return;
    }

    if (!eventName && parsed == null) {
      return;
    }

    onEvent?.({
      type: eventName || 'message',
      at: (parsed && typeof parsed === 'object' ? parsed.at : null) ?? null,
      payload: parsed && typeof parsed === 'object' && 'payload' in parsed ? parsed.payload : parsed
    });
  };

  (async () => {
    try {
      while (active) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';

        for (const frame of frames) {
          const trimmed = frame.trim();
          if (!trimmed) continue;
          try {
            parseFrame(frame);
          } catch (parseError) {
            onError?.(parseError);
          }
        }
      }
    } catch (streamError) {
      if (active) {
        onError?.(streamError);
      }
    }
  })();

  return stop;
}

export {
  API_BASE_URL,
  SICAT_ACCESS_TOKEN_KEY,
  SICAT_REFRESH_TOKEN_KEY,
  SICAT_EXPIRES_AT_KEY,
  SICAT_USER_KEY,
  SICAT_ACTIVE_ACCOUNT_KEY,
  SICAT_SESSION_CONTEXT_KEY,
  SICAT_INTEGRATION_ACCOUNT_ID_KEY
};
