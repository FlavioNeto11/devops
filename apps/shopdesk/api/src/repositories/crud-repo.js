// repositories/crud-repo.js — fábrica de repositório CRUD fino e tenant-aware. Gerado pela Forge.
// Mantém TODO o SQL fora do server.js (bloco camadas-rigidas): a rota chama o repo, o repo fala com o pool.
// Cada entidade declara sua tabela + colunas gravaveis; aqui ficam list/get/create/update/remove.
import { pool } from '../db.js';
import { colName } from './entities.js';

// Colunas de ordenação seguras por tabela são derivadas das colunas gravaveis + id/created_at/updated_at.
// (allowlist evita SQL injection no ?sort sem precisar de query builder externo.)
// As rotas/repos aceitam o nome do campo em camelCase (do contrato) E em snake_case (coluna física):
// internamente tudo vira snake_case via colName().
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

  async function list(tenantId, { page = 1, pageSize = 20, sort = 'id', dir = 'desc', q, ...rest } = {}) {
    const col = sortable.has(sort) ? sort : 'id';
    const order = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const ps = Math.min(Math.max(Number(pageSize) || 20, 1), 200);
    const pg = Math.max(Number(page) || 1, 1);
    const offset = (pg - 1) * ps;

    // Build WHERE conditions (tenant isolation always first).
    const conds = ['tenant_id=$1'];
    const qp = [tenantId];

    // q: ILIKE search across all text/longtext columns (name, sku, description, etc.).
    if (q && String(q).trim()) {
      const textCols = writable
        .filter((w) => {
          const c = columns.find((x) => x.name === w.field);
          return c && (c.type === 'text' || c.type === 'longtext');
        })
        .map((w) => w.col);
      if (textCols.length) {
        qp.push('%' + String(q).trim() + '%');
        const idx = qp.length;
        conds.push('(' + textCols.map((c) => `${c} ILIKE $${idx}`).join(' OR ') + ')');
      }
    }

    // Exact-match filters for any param that matches a known writable column.
    for (const [key, val] of Object.entries(rest)) {
      if (val === undefined || val === null || val === '') continue;
      const w = writable.find((x) => x.col === key || x.field === key);
      if (!w) continue;
      const colDef = columns.find((c) => c.name === w.field);
      const typed =
        colDef && colDef.type === 'boolean'
          ? val === 'true' || val === true || val === '1'
          : val;
      qp.push(typed);
      conds.push(`${w.col}=$${qp.length}`);
    }

    const where = conds.join(' AND ');
    const totalRes = await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, qp);
    const rowsRes = await pool.query(
      `SELECT * FROM ${table} WHERE ${where} ORDER BY ${col} ${order} LIMIT $${qp.length + 1} OFFSET $${qp.length + 2}`,
      [...qp, ps, offset],
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
