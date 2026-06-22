// repositories/records-repo.js — SQL de records (camadas rígidas: SQL só no repository). Gerado pela Forge.
import { pool } from '../db.js';

// Listagem por tenant com filtro opcional por status. Máx 200 registros, ordenado por id desc.
export async function list(tenantId, status) {
  const params = [tenantId];
  let sql = 'SELECT * FROM records WHERE tenant_id=$1';
  if (status !== undefined) { params.push(status); sql += ' AND status=$2'; }
  sql += ' ORDER BY id DESC LIMIT 200';
  const { rows } = await pool.query(sql, params);
  return rows;
}

// Agregação por tenant: total + contagem por status presente (open, submitting, submitted, failed).
export async function stats(tenantId) {
  const { rows } = await pool.query('SELECT status, count(*)::int AS n FROM records WHERE tenant_id=$1 GROUP BY status', [tenantId]);
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const total = rows.reduce((acc, r) => acc + r.n, 0);
  return { total, byStatus };
}
