// repositories/crud-repo.js — CRUD genérico tenant-aware (camadas-rigidas: todo SQL vive aqui).
// Cada entidade declara sua tabela + colunas graváveis; as rotas em server.js ficam finas.
// Gerado para as entidades de domínio do HelpFlow (customers/agents/teams/comments/
// sla-policies/kb-articles/integrations). Segue o estilo da Forge (pool compartilhado).
import { pool } from '../db.js';

// Cria um repositório CRUD para uma tabela. `columns` são as colunas graváveis
// (sem id/tenant_id/created_at/updated_at, que o repo gerencia). `sortable` é a
// allowlist de colunas para ORDER BY (defesa contra injeção via ?sort).
export function makeCrudRepo({ table, columns, sortable, searchable }) {
  const writable = columns;
  const sortCols = new Set([...(sortable || columns), 'id', 'created_at', 'updated_at']);
  // Allowlist de colunas para busca textual (?q=). Vazio = entidade sem busca.
  // Só colunas TEXT da própria tabela entram aqui (defesa contra injeção via nome).
  const searchCols = (searchable || []).filter((c) => columns.includes(c));

  function pickBody(body) {
    const data = {};
    for (const c of writable) if (body && Object.prototype.hasOwnProperty.call(body, c)) data[c] = body[c];
    return data;
  }

  // Monta o predicado de busca textual (ILIKE em qualquer coluna da allowlist).
  // Retorna { clause, params } com placeholders a partir de `startIdx`.
  function buildSearch(q, startIdx) {
    const term = String(q == null ? '' : q).trim();
    if (!term || searchCols.length === 0) return { clause: '', params: [] };
    const like = '%' + term + '%';
    const ors = searchCols.map((c, i) => `${c} ILIKE $${startIdx + i}`);
    return { clause: ' AND (' + ors.join(' OR ') + ')', params: searchCols.map(() => like) };
  }

  return {
    table,
    writable,

    async list(tenantId, { page = 1, pageSize = 20, sort = 'id', dir = 'desc', q } = {}) {
      const p = Math.max(1, Number(page) || 1);
      const ps = Math.min(200, Math.max(1, Number(pageSize) || 20));
      const sortCol = sortCols.has(sort) ? sort : 'id';
      const sortDir = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      const offset = (p - 1) * ps;
      const search = buildSearch(q, 2); // $1 = tenant_id; busca começa em $2
      const totalRes = await pool.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE tenant_id=$1${search.clause}`,
        [tenantId, ...search.params]
      );
      const dataRes = await pool.query(
        `SELECT * FROM ${table} WHERE tenant_id=$1${search.clause} ORDER BY ${sortCol} ${sortDir} LIMIT $${2 + search.params.length} OFFSET $${3 + search.params.length}`,
        [tenantId, ...search.params, ps, offset]
      );
      return { data: dataRes.rows, total: totalRes.rows[0].n, page: p, pageSize: ps };
    },

    async get(tenantId, id) {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE tenant_id=$1 AND id=$2`, [tenantId, Number(id)]);
      return rows[0] || null;
    },

    async create(tenantId, body) {
      const data = pickBody(body);
      const cols = Object.keys(data);
      const vals = Object.values(data);
      const allCols = ['tenant_id', ...cols];
      const placeholders = allCols.map((_, i) => '$' + (i + 1));
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${allCols.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`,
        [tenantId, ...vals]
      );
      return rows[0];
    },

    async update(tenantId, id, body) {
      const data = pickBody(body);
      const cols = Object.keys(data);
      if (cols.length === 0) return this.get(tenantId, id);
      const sets = cols.map((c, i) => `${c}=$${i + 3}`);
      sets.push('updated_at=now()');
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${sets.join(',')} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        [tenantId, Number(id), ...Object.values(data)]
      );
      return rows[0] || null;
    },

    async remove(tenantId, id) {
      const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE tenant_id=$1 AND id=$2`, [tenantId, Number(id)]);
      return rowCount > 0;
    },
  };
}
