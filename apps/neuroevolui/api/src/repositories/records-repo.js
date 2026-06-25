// repositories/records-repo.js — SQL de records concentrado aqui (camadas-rigidas).
import { pool } from '../db.js';

export async function listRecords(tenantId) {
  const r = await pool.query('SELECT * FROM records WHERE tenant_id=$1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 200', [tenantId]);
  return r.rows;
}

export async function createRecord(tenantId, title, createdBy = 'system') {
  const r = await pool.query('INSERT INTO records(tenant_id,title,created_by) VALUES($1,$2,$3) RETURNING *', [tenantId, title, createdBy]);
  return r.rows[0];
}

export async function findRecord(tenantId, id) {
  const r = await pool.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL', [tenantId, Number(id)]);
  return r.rows[0] ?? null;
}

export async function deleteRecord(tenantId, id) {
  await pool.query('UPDATE records SET deleted_at=now(), updated_at=now() WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL', [tenantId, Number(id)]);
}

export async function countRecords() {
  const r = await pool.query('SELECT count(*)::int n FROM records WHERE deleted_at IS NULL');
  return r.rows[0].n;
}

export async function updateRecordStatus(id, status) {
  await pool.query("UPDATE records SET status=$1, updated_at=now() WHERE id=$2", [status, Number(id)]);
}

// Edição dos campos do registro (title / external_ref). COALESCE preserva o valor
// atual quando o campo não é enviado, então a tela pode salvar parcialmente. Escopo
// por tenant + não-excluído (deleted_at IS NULL). Retorna a linha atualizada ou null
// se o registro não existir / estiver fora do tenant / excluído.
export async function updateRecord(tenantId, id, { title, external_ref } = {}) {
  const r = await pool.query(
    `UPDATE records
        SET title = COALESCE($3, title),
            external_ref = COALESCE($4, external_ref),
            updated_at = now()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING *`,
    [tenantId, Number(id), title ?? null, external_ref ?? null]
  );
  return r.rows[0] ?? null;
}
