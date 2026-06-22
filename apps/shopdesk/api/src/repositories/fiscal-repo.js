// repositories/fiscal-repo.js — auditoria de submissões de NF-e (REQ-SHOPDESK-0004).
// Toda emissão à SEFAZ persiste aqui: timestamp, status, protocolo, tentativas.
// Não é um CRUD genérico: só list/get/create (imutável após criação; reprocessar = novo insert).
import { pool } from '../db.js';

const SORT_ALLOW = new Set(['id', 'order_id', 'number', 'status', 'total', 'attempts', 'issued_at', 'created_at']);

// Normaliza status do fiscal-kit (inglês/SEFAZ) → enum PT do domínio da tela.
const STATUS_NORM = {
  authorized: 'autorizada', autorizado: 'autorizada', approved: 'autorizada',
  received: 'processando', processing: 'processando', processando: 'processando',
  queued: 'enfileirada', pending: 'enfileirada', enqueued: 'enfileirada',
  rejected: 'rejeitada', rejeitado: 'rejeitada', denied: 'rejeitada',
  failed: 'dlq', dead: 'dlq',
};
export function normalizeStatus(s) {
  if (!s) return 'enfileirada';
  const k = String(s).toLowerCase();
  return STATUS_NORM[k] || k;
}

export async function list(tenantId, { page = 1, pageSize = 25, sort = 'issued_at', dir = 'desc', q, status } = {}) {
  const col = SORT_ALLOW.has(sort) ? sort : 'issued_at';
  const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const ps = Math.min(Math.max(Number(pageSize) || 25, 1), 200);
  const pg = Math.max(Number(page) || 1, 1);
  const offset = (pg - 1) * ps;

  const conds = ['tenant_id=$1'];
  const params = [tenantId];
  if (status) { params.push(status); conds.push(`status=$${params.length}`); }
  if (q) {
    params.push('%' + q + '%');
    const qi = params.length;
    conds.push(`(order_id ILIKE $${qi} OR number ILIKE $${qi} OR protocol ILIKE $${qi})`);
  }
  const where = conds.join(' AND ');

  const totalRes = await pool.query(`SELECT count(*)::int AS n FROM fiscal_submissions WHERE ${where}`, params);
  const rowsRes = await pool.query(
    `SELECT id, order_id AS "orderId", number, protocol, receipt, total, status, attempts, mode, issued_at AS "issuedAt" FROM fiscal_submissions WHERE ${where} ORDER BY ${col} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, ps, offset],
  );
  return { data: rowsRes.rows, total: totalRes.rows[0].n, page: pg, pageSize: ps };
}

export async function get(tenantId, id) {
  const r = await pool.query(
    `SELECT id, order_id AS "orderId", number, protocol, receipt, total, status, attempts, mode, xml, rejection_reason AS "rejectionReason", issued_at AS "issuedAt", created_at AS "createdAt" FROM fiscal_submissions WHERE tenant_id=$1 AND id=$2`,
    [tenantId, Number(id)],
  );
  return r.rows[0] || null;
}

export async function create(tenantId, data) {
  const r = await pool.query(
    `INSERT INTO fiscal_submissions(tenant_id,order_id,number,protocol,receipt,total,status,attempts,mode,xml,rejection_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, order_id AS "orderId", number, protocol, receipt, total, status, attempts, mode, issued_at AS "issuedAt"`,
    [
      tenantId,
      String(data.orderId || ''),
      data.number || null,
      data.protocol || null,
      data.receipt || null,
      data.total != null ? Number(data.total) : null,
      normalizeStatus(data.status),
      data.attempts != null ? Number(data.attempts) : 1,
      data.mode || null,
      data.xml || null,
      data.rejectionReason || data.reason || null,
    ],
  );
  return r.rows[0];
}
