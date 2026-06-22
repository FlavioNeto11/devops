// repositories/records-repo.js — SQL de records (camadas rígidas: SQL só no repository). Gerado pela Forge.
import { pool } from '../db.js';

// Agregação por tenant: total + contagem por status presente (open, submitting, submitted, failed).
export async function stats(tenantId) {
  const { rows } = await pool.query('SELECT status, count(*)::int AS n FROM records WHERE tenant_id=$1 GROUP BY status', [tenantId]);
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const total = rows.reduce((acc, r) => acc + r.n, 0);
  return { total, byStatus };
}
