// gateways/esocial-gateway.js — Gateway e-Social: envio de eventos S-1000/S-2000/S-2200.
// Padrão: cetesb-gateway do SICAT — módulo único, retry+backoff, redação de segredos, AppError tipado.
// NUNCA chame e-Social de routes/ ou services/ diretamente — sempre pelo gateway.
import { logExchange } from './gateway-audit.js';

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const DEFAULT_MAX_ATTEMPTS = 3;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function backoffMs(attempt) { return Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt - 1), MAX_BACKOFF_MS); }
function isTransientStatus(s) { return s === 408 || s === 429 || s >= 500; }
function isTransientNetworkError(err) {
  const code = String(err?.code || err?.cause?.code || '').toLowerCase();
  return ['etimedout', 'econnreset', 'econnrefused', 'enotfound'].includes(code)
    || String(err?.message || '').toLowerCase().includes('timeout');
}

const TIPOS_VALIDOS = ['S-1000', 'S-2000', 'S-2200'];

export class ESocialError extends Error {
  constructor(status, title, detail, meta = {}) {
    super(detail);
    this.name = 'ESocialError';
    this.status = status;
    this.title = title;
    this.detail = detail;
    Object.assign(this, meta);
  }
}

class ESocialSandboxGateway {
  async enviarEvento(tipo, payload, opts = {}) {
    if (!TIPOS_VALIDOS.includes(tipo)) {
      throw new ESocialError(400, 'Tipo Inválido', `Tipo de evento "${tipo}" inválido. Use: ${TIPOS_VALIDOS.join(', ')}`,
        { code: 'ESOCIAL_INVALID_TIPO', retryable: false });
    }
    const t0 = Date.now();
    const eventoId = `SBX-${tipo}-${Date.now()}`;
    await logExchange({ gateway: 'esocial-sandbox', method: 'POST', endpoint: `/esocial/eventos/${tipo}`, requestPayload: payload, responseStatus: 200, durationMs: Date.now() - t0, attempts: 1, userId: opts.userId });
    return {
      eventoId,
      tipo,
      status: 'aceito',
      protocolo: `SBX-PROTO-${Date.now()}`,
      mensagem: `Evento ${tipo} aceito pelo sandbox e-Social`,
      sandbox: true,
    };
  }

  async consultarEvento(eventoId, opts = {}) {
    const t0 = Date.now();
    await logExchange({ gateway: 'esocial-sandbox', method: 'GET', endpoint: `/esocial/eventos/${eventoId}`, responseStatus: 200, durationMs: Date.now() - t0, attempts: 1, userId: opts.userId });
    return {
      eventoId,
      status: 'processado',
      mensagem: 'Evento processado com sucesso (sandbox)',
      sandbox: true,
    };
  }
}

class ESocialRealGateway {
  constructor() {
    this.baseUrl = (process.env.ESOCIAL_PROVIDER || '').replace(/\/$/, '');
    this.cert = process.env.ESOCIAL_CERT_PEM || null;
    this.codigoAcesso = process.env.ESOCIAL_CODIGO_ACESSO || null;
  }

  _authHeader() {
    if (!this.cert && !this.codigoAcesso) {
      throw new ESocialError(400, 'Credenciais e-Social Ausentes',
        'Certificado ou código de acesso não configurados. Operação abortada (fail-safe).',
        { code: 'ESOCIAL_NO_CREDENTIALS', retryable: false });
    }
    if (this.codigoAcesso) return 'Bearer ' + this.codigoAcesso;
    return 'Cert ' + this.cert.slice(0, 8) + '...';
  }

  async _request(method, path, body, { userId, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
    const endpoint = `${this.baseUrl}${path}`;
    const auth = this._authHeader();
    const t0 = Date.now();
    let attempt, responseStatus = null, errorCode = null;
    try {
      for (attempt = 1; attempt <= maxAttempts; attempt++) {
        let res;
        try {
          const fetchOpts = {
            method,
            headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(30000),
          };
          if (body) fetchOpts.body = JSON.stringify(body);
          res = await fetch(endpoint, fetchOpts);
        } catch (err) {
          if (isTransientNetworkError(err) && attempt < maxAttempts) { await sleep(backoffMs(attempt)); continue; }
          errorCode = 'ESOCIAL_NETWORK_ERROR';
          throw new ESocialError(502, 'e-Social Network Error', `Falha de rede: ${err.message}`,
            { code: errorCode, retryable: isTransientNetworkError(err) });
        }
        responseStatus = res.status;
        if (isTransientStatus(res.status) && attempt < maxAttempts) { await sleep(backoffMs(attempt)); continue; }
        if (!res.ok) {
          errorCode = 'ESOCIAL_HTTP_ERROR';
          throw new ESocialError(502, 'e-Social HTTP Error', `e-Social retornou ${res.status}`,
            { code: errorCode, remoteStatus: res.status, retryable: false });
        }
        return await res.json();
      }
      errorCode = 'ESOCIAL_RETRY_EXHAUSTED';
      throw new ESocialError(502, 'e-Social Retry Exhausted', `e-Social não respondeu após ${maxAttempts} tentativas`,
        { code: errorCode, retryable: false });
    } finally {
      await logExchange({ gateway: 'esocial-real', method, endpoint, requestPayload: body, responseStatus, durationMs: Date.now() - t0, attempts: attempt || maxAttempts, userId, errorCode });
    }
  }

  async enviarEvento(tipo, payload, opts = {}) {
    if (!TIPOS_VALIDOS.includes(tipo)) {
      throw new ESocialError(400, 'Tipo Inválido', `Tipo de evento "${tipo}" inválido. Use: ${TIPOS_VALIDOS.join(', ')}`,
        { code: 'ESOCIAL_INVALID_TIPO', retryable: false });
    }
    return this._request('POST', `/esocial/eventos/${tipo}`, payload, opts);
  }

  async consultarEvento(eventoId, opts = {}) {
    return this._request('GET', `/esocial/eventos/${eventoId}`, null, opts);
  }
}

export function createESocialGateway() {
  return process.env.ESOCIAL_PROVIDER ? new ESocialRealGateway() : new ESocialSandboxGateway();
}

export function formatESocialError(err) {
  if (!(err instanceof ESocialError)) return null;
  const codeMap = {
    ESOCIAL_NO_CREDENTIALS: { error: 'gateway_esocial_misconfigured', code: 'EXT_MISCONFIGURED', retry_after: null },
    ESOCIAL_NETWORK_ERROR: { error: 'gateway_esocial_timeout', code: 'EXT_TIMEOUT', retry_after: 30 },
    ESOCIAL_RETRY_EXHAUSTED: { error: 'gateway_esocial_unavailable', code: 'EXT_UNAVAILABLE', retry_after: 60 },
    ESOCIAL_HTTP_ERROR: { error: 'gateway_esocial_error', code: 'EXT_HTTP_ERROR', retry_after: 30 },
    ESOCIAL_INVALID_TIPO: { error: 'gateway_esocial_invalid_type', code: 'EXT_BAD_REQUEST', retry_after: null },
  };
  return codeMap[err.code] || { error: 'gateway_esocial_error', code: 'EXT_ERROR', retry_after: 30 };
}

export { TIPOS_VALIDOS };
