// repositories/crud-repo.js — fábrica de repositório CRUD fino e tenant-aware. Gerado pela Forge.
// Mantém TODO o SQL fora do server.js (bloco camadas-rigidas): a rota chama o repo, o repo fala com o pool.
// Cada entidade declara sua tabela + colunas gravaveis; aqui ficam list/get/create/update/remove.
import { pool } from '../db.js';
import { colName } from './entities.js';
import { buildFilters } from './filters.js';

export { buildFilters };

export function makeRepo({ table, columns }) {
  // writable: [{ field: 'customerName', col: 'customer_name' }, ...]
  const writable = columns.map((c) => ({ field: c.name, col: colName(c.name) }));
  const fieldVal = (body, w) => (body[w.field] !== undefined ? body[w.field] : body[w.col]);
  const has = (body, w) => fieldVal(body, w) !== undefined;
  const sortable = new Set(['id', 'created_at', 'updated_at', ...writable.map((w) => w.col)]);
  const required = columns.filter((c) => c.required).map((c) => ({ field: c.name, col: colName(c.name) }));

  function validate(body) {
    return required
      .filter((r) => { const v = body[r.field] !== undefined ? body[r.field] : body[r.col]; return v === undefined || v === null || v === ''; })
      .map((r) => r.field);
  }

  async function list(tenantId, { page = 1, pageSize = 20, sort = 'id', dir = 'desc', q = '', status = '' } = {}) {
    const col = sortable.has(sort) ? sort : 'id';
    const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const ps = Math.min(Math.max(Number(pageSize) || 20, 1), 200);
    const pg = Math.max(Number(page) || 1, 1);
    const offset = (pg - 1) * ps;

    const { clauses, params: fp } = buildFilters(columns, writable, q, status);
    const where = clauses.join(' AND ');
    const allFp = [tenantId, ...fp];

    const totalRes = await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, allFp);
    const rowsRes = await pool.query(
      `SELECT * FROM ${table} WHERE ${where} ORDER BY ${col} ${order} LIMIT $${allFp.length + 1} OFFSET $${allFp.length + 2}`,
      [...allFp, ps, offset],
    );
    return { data: rowsRes.rows, total: totalRes.rows[0].n, page: pg, pageSize: ps };
  }

  async function get(tenantId, id) {
    const r = await pool.query(`SELECT * FROM ${table} WHERE tenant_id=$1 AND id=$2`, [tenantId, Number(id)]);
    return r.rows[0] || null;
  }

  async function create(tenantId, body) {
    const sel = writable.filter((w) => has(body, w));
    const params = [tenantId, ...sel.map((w) => fieldVal(body, w))];
    const placeholders = sel.map((_, i) => `$${i + 2}`);
    const sql = `INSERT INTO ${table}(tenant_id${sel.length ? ',' + sel.map((w) => w.col).join(',') : ''}) VALUES ($1${placeholders.length ? ',' + placeholders.join(',') : ''}) RETURNING *`;
    const r = await pool.query(sql, params);
    return r.rows[0];
  }

  async function update(tenantId, id, body) {
    const sel = writable.filter((w) => has(body, w));
    if (!sel.length) return get(tenantId, id);
    const sets = sel.map((w, i) => `${w.col}=$${i + 3}`);
    const params = [tenantId, Number(id), ...sel.map((w) => fieldVal(body, w))];
    const sql = `UPDATE ${table} SET ${sets.join(',')}, updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`;
    const r = await pool.query(sql, params);
    return r.rows[0] || null;
  }

  async function remove(tenantId, id) {
    const r = await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1 AND id=$2 RETURNING id`, [tenantId, Number(id)]);
    return r.rowCount > 0;
  }

  return { table, columns, required, validate, list, get, create, update, remove };
}
