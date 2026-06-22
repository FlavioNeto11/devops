// gateways/gateway.js — ÚNICA porta de saída para o fornecedor externo (REQ-STOCKPILOT-0004).
//
// Resiliência + auditoria (padrão do cetesb-gateway do SICAT):
//  - Timeout configurável (padrão 10s, env EXTERNAL_TIMEOUT_MS).
//  - Retry com backoff exponencial (1s, 2s, 4s, ...; máx 3 tentativas) APENAS em erros transitórios
//    (timeout/rede e 5xx/408/429). 4xx não-transitório falha de imediato (sem retry).
//  - Segredos REDIGIDOS no LOG e na trilha (token/api key → '****'; ver lib/redact.js).
//  - Erros TIPADOS (AppError { code, message, statusCode, originalError } — stack nunca logada).
//  - Cada troca (tentativa) é AUDITADA em gateway_audit, escopada por tenant.
// Rotas/services NUNCA chamam o externo direto — sempre por dispatch().
import { AppError } from '../lib/app-error.js';
import { LOG } from '../lib/redact.js';
import * as auditRepo from '../repositories/gateway-audit-repo.js';

const BASE = process.env.EXTERNAL_BASE_URL || 'http://stockpilot-mock-central:8090';
const TIMEOUT = Number(process.env.EXTERNAL_TIMEOUT_MS) || 10000;
const MAX_ATTEMPTS = Number(process.env.EXTERNAL_MAX_ATTEMPTS) || 3;
const BACKOFF_BASE_MS = Number(process.env.EXTERNAL_BACKOFF_BASE_MS) || 1000;

export { AppError };
// Compat: GatewayError continua exportado como subclasse tipada (chamadas antigas seguem funcionando).
export class GatewayError extends AppError {
  constructor(message, opts = {}) {
    super(message, { code: opts.code || 'GATEWAY_ERROR', statusCode: opts.statusCode || 502, transient: !!opts.transient, originalError: opts.originalError });
    this.name = 'GatewayError';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoffMs = (attemptIndex, base = BACKOFF_BASE_MS) => base * Math.pow(2, attemptIndex);
const isTransientStatus = (s) => s === 408 || s === 429 || s >= 500;

// Submete um pedido de reposição ao fornecedor externo. `opts.audit` traz o contexto auditado
// (tenant, productId, orderId). `fetchImpl`/`auditStore`/`log`/`sleepImpl`/`db` são injetáveis → testável.
export async function dispatch(record, opts = {}) {
  const {
    audit = {},
    operation = 'submeter_pedido',
    maxAttempts = MAX_ATTEMPTS,
    timeout = TIMEOUT,
    baseUrl = BASE,
    fetchImpl = fetch,
    auditStore = auditRepo,
    log = LOG,
    sleepImpl = sleep,
    db = undefined,
  } = opts;

  const request = { id: record.id, title: record.title };
  let last;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      log.info(`troca com fornecedor (tentativa ${attempt}/${maxAttempts})`, { request, audit });
      const r = await fetchImpl(baseUrl + '/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(timeout),
      });
      const durationMs = Date.now() - startedAt;
      const body = await r.json().catch(() => ({}));

      if (r.ok) {
        await safeRecord(auditStore, buildEntry({ operation, audit, attempt, outcome: 'success', statusCode: r.status, request, response: body, durationMs }), db, log);
        return { externalRef: body.ref || ('EXT-' + record.id) };
      }

      const transient = isTransientStatus(r.status);
      last = new AppError('fornecedor respondeu ' + r.status, { code: 'EXTERNAL_HTTP_' + r.status, statusCode: r.status, transient });
      await safeRecord(auditStore, buildEntry({ operation, audit, attempt, outcome: 'failure', statusCode: r.status, request, response: body, error: last, durationMs }), db, log);
      log.warn(`fornecedor respondeu ${r.status} (tentativa ${attempt}/${maxAttempts})`, { audit });
      if (!transient) break; // 4xx não-transitório: falha imediata, sem retry
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      last = new AppError(
        isTimeout ? `timeout ao contatar fornecedor (${timeout}ms)` : 'falha de rede ao contatar fornecedor',
        { code: isTimeout ? 'EXTERNAL_TIMEOUT' : 'EXTERNAL_NETWORK', statusCode: 504, transient: true, originalError: e }
      );
      await safeRecord(auditStore, buildEntry({ operation, audit, attempt, outcome: 'failure', statusCode: null, request, error: last, durationMs }), db, log);
      log.warn(`falha transitória (tentativa ${attempt}/${maxAttempts}): ${last.message}`, { audit });
    }
    if (attempt < maxAttempts) await sleepImpl(backoffMs(attempt - 1));
  }

  throw last || new AppError('falha desconhecida no gateway', { code: 'GATEWAY_ERROR' });
}

const buildEntry = (args) => auditRepo.buildAuditEntry(args);

// Gravação fail-soft: a auditoria NUNCA derruba a troca com o fornecedor (best-effort).
async function safeRecord(store, entry, db, log) {
  try {
    await store.record(entry, db);
  } catch (e) {
    log.warn('falha ao gravar auditoria do gateway: ' + (e?.message || e));
  }
}
