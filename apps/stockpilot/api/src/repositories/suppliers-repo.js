// suppliers-repo.js — REQ-STOCKPILOT-0004: CRUD de fornecedores (gateway externo configurável).
// Cada fornecedor declara o endpoint do gateway + tipo de auth + política de timeout/retry. Os
// SEGREDOS de autenticação (api_key/token) NÃO vivem aqui — só a forma (auth_type) e a URL; as
// credenciais são injetadas via env/Sealed Secrets na hora da troca (REQ-STOCKPILOT-0004).
// Toda query é OBRIGATORIAMENTE escopada por tenant_id (REQ-STOCKPILOT-0002). `db` injetável p/ testes.
import { pool } from '../db.js';

const SORTABLE = new Set(['id', 'name', 'auth_type', 'timeout_ms', 'max_retries', 'active', 'created_at']);
const AUTH_TYPES = new Set(['api_key', 'bearer', 'basic', 'none']);

// Normaliza paginação/ordenação a partir da query string (defensivo: clampa e usa allowlist de colunas).
export function parseListParams(q = {}) {
  const page = Math.max(1, Number.parseInt(q.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(q.pageSize, 10) || 50));
  const sort = SORTABLE.has(String(q.sort)) ? String(q.sort) : 'id';
  const dir = String(q.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { page, pageSize, sort, dir, offset: (page - 1) * pageSize };
}

export async function list(tenant, params = {}, db = pool) {
  const { page, pageSize, sort, dir, offset } = parseListParams(params);
  const { rows: cnt } = await db.query('SELECT count(*)::int AS n FROM suppliers WHERE tenant_id=$1', [tenant]);
  const { rows } = await db.query(
    `SELECT id, tenant_id, name, gateway_url, auth_type, timeout_ms, max_retries, active, notes, created_at, updated_at
       FROM suppliers WHERE tenant_id=$1 ORDER BY ${sort} ${dir} LIMIT $2 OFFSET $3`,
    [tenant, pageSize, offset]
  );
  return { data: rows, total: cnt[0].n, page, pageSize };
}

export async function findById(id, tenant, db = pool) {
  const { rows } = await db.query('SELECT * FROM suppliers WHERE id=$1 AND tenant_id=$2', [id, tenant]);
  return rows[0] || null;
}

// Validação mínima dos campos required (REQ: name, gateway_url, auth_type, active).
// Retorna a lista de erros (vazia = ok) — a rota decide o 400.
export function validate(body = {}, { partial = false } = {}) {
  const errs = [];
  const has = (k) => body[k] !== undefined && body[k] !== null && String(body[k]).trim() !== '';
  if (!partial || 'name' in body) { if (!has('name')) errs.push('name obrigatório'); }
  if (!partial || 'gateway_url' in body) { if (!has('gateway_url')) errs.push('gateway_url obrigatório'); }
  if (!partial || 'auth_type' in body) {
    if (!has('auth_type')) errs.push('auth_type obrigatório');
    else if (!AUTH_TYPES.has(String(body.auth_type))) errs.push('auth_type inválido (api_key|bearer|basic|none)');
  }
  if (!partial || 'active' in body) { if (body.active === undefined || body.active === null) errs.push('active obrigatório'); }
  return errs;
}

export async function create(body, tenant, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO suppliers(tenant_id, name, gateway_url, auth_type, timeout_ms, max_retries, active, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [tenant, body.name, body.gateway_url, body.auth_type,
      body.timeout_ms == null ? null : Number(body.timeout_ms),
      body.max_retries == null ? null : Number(body.max_retries),
      body.active === false ? false : Boolean(body.active),
      body.notes ?? null]
  );
  return rows[0];
}

// Update parcial: só altera as colunas presentes no body (sempre escopado por tenant).
export async function update(id, body, tenant, db = pool) {
  const cols = [];
  const vals = [];
  let i = 1;
  for (const k of ['name', 'gateway_url', 'auth_type', 'timeout_ms', 'max_retries', 'active', 'notes']) {
    if (k in body) {
      cols.push(`${k}=$${i++}`);
      if (k === 'timeout_ms' || k === 'max_retries') vals.push(body[k] == null ? null : Number(body[k]));
      else if (k === 'active') vals.push(Boolean(body[k]));
      else vals.push(body[k]);
    }
  }
  if (cols.length === 0) return findById(id, tenant, db);
  vals.push(id, tenant);
  const { rows } = await db.query(
    `UPDATE suppliers SET ${cols.join(', ')}, updated_at=now() WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`,
    vals
  );
  return rows[0] || null;
}

export async function remove(id, tenant, db = pool) {
  const { rows } = await db.query('DELETE FROM suppliers WHERE id=$1 AND tenant_id=$2 RETURNING id', [id, tenant]);
  return rows[0] || null;
}
