// repositories/gateway-audit-repo.js — REQ-STOCKPILOT-0004: trilha de auditoria das trocas com o
// fornecedor externo. Cada troca (tentativa) gera UM registro: timestamp, produto/pedido, outcome
// (success/failure), status_code, payloads SANITIZADOS e erro REDIGIDO. Tudo escopado por tenant_id
// (REQ-STOCKPILOT-0002). `db` é injetável → testável sem Postgres.
import { pool } from '../db.js';
import { redactSecrets, redactString } from '../lib/redact.js';

// Monta o registro de auditoria (função PURA — sem I/O, testável sem Postgres nem rede).
// `audit` traz o contexto da troca (tenant, productId, orderId); payloads e erro são redigidos aqui.
export function buildAuditEntry({ operation = 'submeter_pedido', audit = {}, attempt = null, outcome, statusCode = null, request = {}, response = null, error = null, durationMs = null }) {
  return {
    tenant: String(audit.tenant || 'default'),
    operation,
    productId: audit.productId ?? null,
    orderId: audit.orderId ?? null,
    outcome, // 'success' | 'failure'
    statusCode: statusCode == null ? null : Number(statusCode),
    attempt,
    requestPayload: redactSecrets(request || {}),
    responsePayload: response == null ? null : redactSecrets(response),
    errorRedacted: error == null ? null : redactString(String(error.message || error)),
    durationMs: durationMs == null ? null : Number(durationMs),
  };
}

export async function record(entry, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO gateway_audit
       (tenant_id, operation, product_id, order_id, outcome, status_code, attempt, request_payload, response_payload, error_redacted, duration_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [entry.tenant, entry.operation, entry.productId, entry.orderId, entry.outcome, entry.statusCode,
      entry.attempt, JSON.stringify(entry.requestPayload || {}),
      entry.responsePayload == null ? null : JSON.stringify(entry.responsePayload),
      entry.errorRedacted, entry.durationMs]
  );
  return rows[0];
}

export async function listByTenant(tenant, db = pool, limit = 200) {
  const { rows } = await db.query(
    `SELECT id, tenant_id, operation, product_id, order_id, outcome, status_code, attempt,
            request_payload, response_payload, error_redacted, duration_ms, created_at
     FROM gateway_audit WHERE tenant_id=$1 ORDER BY id DESC LIMIT $2`,
    [tenant, limit]
  );
  return rows;
}
