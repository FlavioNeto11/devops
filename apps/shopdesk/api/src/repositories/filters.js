// filters.js — funções puras de construção de WHERE para o CRUD genérico.
// Sem dependência de Postgres; importável em testes de unidade sem pool.
export function buildFilters(columns, writable, q, status) {
  const clauses = ['tenant_id=$1'];
  const params = [];

  if (q && String(q).trim()) {
    const textCols = writable
      .filter((w) => {
        const c = columns.find((x) => x.name === w.field);
        return c && (c.type === 'text' || c.type === 'longtext');
      })
      .map((w) => w.col);
    if (textCols.length) {
      const safe = String(q).trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      params.push('%' + safe + '%');
      const n = params.length + 1; // $1 = tenantId; filtro extra começa em $2
      clauses.push('(' + textCols.map((c) => `${c} ILIKE $${n}`).join(' OR ') + ')');
    }
  }

  if (status && String(status).trim() && columns.some((c) => c.name === 'status')) {
    params.push(String(status).trim());
    const n = params.length + 1;
    clauses.push(`status=$${n}`);
  }

  return { clauses, params };
}
