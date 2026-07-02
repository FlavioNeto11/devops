// gateways/rfb-gateway.js — Gateway RFB (e-CAC): consulta cadastral, submissão de documentos, downloads.
// Padrão: cetesb-gateway do SICAT — módulo único, retry+backoff, redação de segredos, AppError tipado.
// NUNCA chame RFB de routes/ ou services/ diretamente — sempre pelo gateway.
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

export class RfbError extends Error {
  constructor(status, title, detail, meta = {}) {
    super(detail);
    this.name = 'RfbError';
    this.status = status;
    this.title = title;
    this.detail = detail;
    Object.assign(this, meta);
  }
}

class RfbSandboxGateway {
  async consultarCadastral(cnpj, opts = {}) {
    const t0 = Date.now();
    const cnpjLimpo = String(cnpj || '').replace(/\D/g, '');
    await logExchange({ gateway: 'rfb-sandbox', method: 'GET', endpoint: `/ecac/cadastral/${cnpjLimpo}`, responseStatus: 200, durationMs: Date.now() - t0, attempts: 1, userId: opts.userId });
    return {
      cnpj: cnpjLimpo,
      razao_social: 'EMPRESA SANDBOX LTDA',
      situacao_cadastral: 'ATIVA',
      data_abertura: '2020-01-01',
      natureza_juridica: '206-2',
      atividade_principal: [{ codigo: '6920-6/01', descricao: 'Atividades de contabilidade' }],
      sandbox: true,
    };
  }

  async submeterDocumento(doc, opts = {}) {
    const t0 = Date.now();
    await logExchange({ gateway: 'rfb-sandbox', method: 'POST', endpoint: '/ecac/documentos', requestPayload: doc, responseStatus: 200, durationMs: Date.now() - t0, attempts: 1, userId: opts.userId });
    return {
      protocolo: `SBX-RFB-${Date.now()}`,
      status: 'aceito',
      mensagem: 'Documento aceito pelo sandbox RFB',
      sandbox: true,
    };
  }

  async listarDownloads(opts = {}) {
    const t0 = Date.now();
    await logExchange({ gateway: 'rfb-sandbox', method: 'GET', endpoint: '/ecac/downloads', responseStatus: 200, durationMs: Date.now() - t0, attempts: 1, userId: opts.userId });
    return {
      downloads: [
        { id: 'SBX-DL-001', tipo: 'malha_fina', descricao: 'Pendência Sandbox 2024', data: '2024-01-15', tamanho_kb: 42 },
      ],
      sandbox: true,
    };
  }
}

class RfbRealGateway {
  constructor() {
    this.baseUrl = (process.env.RFB_PROVIDER || '').replace(/\/$/, '');
    this.cnj = process.env.RFB_CNJ_LOGIN || null;
    this.pass = process.env.RFB_CNJ_PASS || null;
  }

  _authHeader() {
    if (!this.cnj || !this.pass) {
      throw new RfbError(400, 'Credenciais RFB Ausentes',
        'Login CNJ ou senha não configurados. Operação abortada (fail-safe).',
        { code: 'RFB_NO_CREDENTIALS', retryable: false });
    }
    return 'Basic ' + Buffer.from(`${this.cnj}:${this.pass}`).toString('base64');
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
          errorCode = 'RFB_NETWORK_ERROR';
          throw new RfbError(502, 'RFB Network Error', `Falha de rede: ${err.message}`,
            { code: errorCode, retryable: isTransientNetworkError(err) });
        }
        responseStatus = res.status;
        if (isTransientStatus(res.status) && attempt < maxAttempts) { await sleep(backoffMs(attempt)); continue; }
        if (!res.ok) {
          errorCode = 'RFB_HTTP_ERROR';
          throw new RfbError(502, 'RFB HTTP Error', `RFB retornou ${res.status}`,
            { code: errorCode, remoteStatus: res.status, retryable: false });
        }
        return await res.json();
      }
      errorCode = 'RFB_RETRY_EXHAUSTED';
      throw new RfbError(502, 'RFB Retry Exhausted', `RFB não respondeu após ${maxAttempts} tentativas`,
        { code: errorCode, retryable: false });
    } finally {
      await logExchange({ gateway: 'rfb-real', method, endpoint, requestPayload: body, responseStatus, durationMs: Date.now() - t0, attempts: attempt || maxAttempts, userId, errorCode });
    }
  }

  async consultarCadastral(cnpj, opts = {}) {
    return this._request('GET', `/ecac/cadastral/${String(cnpj).replace(/\D/g, '')}`, null, opts);
  }

  async submeterDocumento(doc, opts = {}) {
    return this._request('POST', '/ecac/documentos', doc, opts);
  }

  async listarDownloads(opts = {}) {
    return this._request('GET', '/ecac/downloads', null, opts);
  }
}

export function createRfbGateway() {
  return process.env.RFB_PROVIDER ? new RfbRealGateway() : new RfbSandboxGateway();
}

export function formatRfbError(err) {
  if (!(err instanceof RfbError)) return null;
  const codeMap = {
    RFB_NO_CREDENTIALS: { error: 'gateway_rfb_misconfigured', code: 'EXT_MISCONFIGURED', retry_after: null },
    RFB_NETWORK_ERROR: { error: 'gateway_rfb_timeout', code: 'EXT_TIMEOUT', retry_after: 30 },
    RFB_RETRY_EXHAUSTED: { error: 'gateway_rfb_unavailable', code: 'EXT_UNAVAILABLE', retry_after: 60 },
    RFB_HTTP_ERROR: { error: 'gateway_rfb_error', code: 'EXT_HTTP_ERROR', retry_after: 30 },
  };
  return codeMap[err.code] || { error: 'gateway_rfb_error', code: 'EXT_ERROR', retry_after: 30 };
}
