// notifications-repo.js — REQ-STOCKPILOT-0007: persistência do registro de notificações.
// Um registro por evento; `canais` guarda o desfecho POR canal (sent/failed/skipped). Idempotente
// por `dedupe_key` UNIQUE (reprocessar o mesmo evento atualiza a mesma linha, não duplica).
// Escopo obrigatório por tenant_id (REQ-STOCKPILOT-0002). `db` injetável → testável sem Postgres.
import { pool } from '../db.js';

// Cria (ou recupera) o registro pendente do evento. ON CONFLICT (dedupe_key): retorna a mesma linha
// e incrementa `tentativas` — o mesmo evento reprocessado não gera outra notificação.
export async function upsertPending({ tenant, usuarioId = null, tipo, referenciaId = null, dedupeKey, canais = [] }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO notifications(tenant_id, usuario_id, tipo, referencia_id, dedupe_key, canais, status, tentativas)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,'pending',1)
     ON CONFLICT (dedupe_key) DO UPDATE SET tentativas = notifications.tentativas + 1, updated_at = now()
     RETURNING *`,
    [tenant, usuarioId, tipo, referenciaId, dedupeKey, JSON.stringify(canais)]
  );
  return rows[0];
}

// Grava o desfecho do fan-out: status agregado + resultado por canal (sent/failed/skipped).
export async function markResult(id, { status, canais, tentativas = null }, db = pool) {
  const { rows } = await db.query(
    `UPDATE notifications SET status=$2, canais=$3::jsonb, tentativas=COALESCE($4, tentativas), updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id, status, JSON.stringify(canais), tentativas]
  );
  return rows[0] || null;
}

export async function listByTenant(tenant, db = pool, limit = 200) {
  const { rows } = await db.query(
    `SELECT id, tenant_id, usuario_id, tipo, referencia_id, canais, status, tentativas, created_at, updated_at
     FROM notifications WHERE tenant_id=$1 ORDER BY id DESC LIMIT $2`,
    [tenant, limit]
  );
  return rows;
}
