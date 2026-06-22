// repositories/integration-audit-repo.js — trilha de auditoria do gateway por integração.
// Append-only (camadas-rígidas: SQL só aqui). O corpo (`response`) é gravado JÁ
// REDIGIDO pelo gateway; este repo nunca redige nem expõe segredo cru. As linhas
// devolvidas seguem o contrato fixo consumido pela tela /integrations/:id.
import { pool } from '../db.js';

// Normaliza o corpo para a coluna JSONB: objeto/array passam direto (node-pg
// serializa); string/escalar (resposta texto do externo) vira { text: ... } para
// ser sempre JSON válido. null vira {}.
function jsonbResponse(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  return { text: v };
}

// Registra uma chamada na trilha. `entry` é o veredito redigido vindo de gateway.ping().
export async function record(tenantId, integrationId, entry = {}) {
  const { rows } = await pool.query(
    `INSERT INTO integration_audit (tenant_id, integration_id, method, path, status_code, latency_ms, ok, redacted, response)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, method, path, status_code, latency_ms, ok, redacted, response, created_at`,
    [
      tenantId,
      Number(integrationId),
      entry.method || 'GET',
      entry.target || entry.path || '',
      entry.status_code ?? null,
      entry.latency_ms ?? null,
      entry.ok ?? null,
      entry.redacted ?? true,
      JSON.stringify(jsonbResponse(entry.response)),
    ]
  );
  return rows[0];
}

// Lista a trilha (mais recente primeiro). Contrato fixo por linha:
// { id, method, path, status_code, latency_ms, ok, redacted, response, created_at }.
export async function list(tenantId, integrationId, { pageSize = 50 } = {}) {
  const ps = Math.min(200, Math.max(1, Number(pageSize) || 50));
  const { rows } = await pool.query(
    `SELECT id, method, path, status_code, latency_ms, ok, redacted, response, created_at
     FROM integration_audit WHERE tenant_id=$1 AND integration_id=$2
     ORDER BY created_at DESC, id DESC LIMIT $3`,
    [tenantId, Number(integrationId), ps]
  );
  const totalRes = await pool.query(
    `SELECT count(*)::int AS n FROM integration_audit WHERE tenant_id=$1 AND integration_id=$2`,
    [tenantId, Number(integrationId)]
  );
  return { items: rows, total: totalRes.rows[0].n };
}
