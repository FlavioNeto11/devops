// channels-repo.js — REQ-STOCKPILOT-0007: CRUD de canais de notificação (assinaturas de webhook).
// Cada canal declara o tipo (email/push/whatsapp), o webhook de entrega, os eventos assinados
// (ruptura/falha_pedido) e se está habilitado; `last_status` guarda o último desfecho da entrega.
// Complementa o fan-out de notificações (lib/notify/channels.js) com a configuração persistida.
// Toda query é OBRIGATORIAMENTE escopada por tenant_id (REQ-STOCKPILOT-0002). `db` injetável p/ testes.
import { pool } from '../db.js';

const SORTABLE = new Set(['id', 'channel', 'events', 'enabled', 'last_status', 'updated_at']);
const CHANNELS = new Set(['email', 'push', 'whatsapp']);
const EVENTS = new Set(['ruptura', 'falha_pedido']);
const STATUSES = new Set(['sent', 'failed', 'skipped']);

export function parseListParams(q = {}) {
  const page = Math.max(1, Number.parseInt(q.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(q.pageSize, 10) || 50));
  const sort = SORTABLE.has(String(q.sort)) ? String(q.sort) : 'id';
  const dir = String(q.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { page, pageSize, sort, dir, offset: (page - 1) * pageSize };
}

export async function list(tenant, params = {}, db = pool) {
  const { page, pageSize, sort, dir, offset } = parseListParams(params);
  const { rows: cnt } = await db.query('SELECT count(*)::int AS n FROM channels WHERE tenant_id=$1', [tenant]);
  const { rows } = await db.query(
    `SELECT id, tenant_id, channel, webhook_url, events, enabled, last_status, created_at, updated_at
       FROM channels WHERE tenant_id=$1 ORDER BY ${sort} ${dir} LIMIT $2 OFFSET $3`,
    [tenant, pageSize, offset]
  );
  return { data: rows, total: cnt[0].n, page, pageSize };
}

export async function findById(id, tenant, db = pool) {
  const { rows } = await db.query('SELECT * FROM channels WHERE id=$1 AND tenant_id=$2', [id, tenant]);
  return rows[0] || null;
}

// Validação mínima dos campos required (REQ: channel, webhook_url, enabled).
export function validate(body = {}, { partial = false } = {}) {
  const errs = [];
  const has = (k) => body[k] !== undefined && body[k] !== null && String(body[k]).trim() !== '';
  if (!partial || 'channel' in body) {
    if (!has('channel')) errs.push('channel obrigatório');
    else if (!CHANNELS.has(String(body.channel))) errs.push('channel inválido (email|push|whatsapp)');
  }
  if (!partial || 'webhook_url' in body) { if (!has('webhook_url')) errs.push('webhook_url obrigatório'); }
  if (!partial || 'enabled' in body) { if (body.enabled === undefined || body.enabled === null) errs.push('enabled obrigatório'); }
  if ('events' in body && body.events != null && String(body.events).trim() !== '' && !EVENTS.has(String(body.events))) {
    errs.push('events inválido (ruptura|falha_pedido)');
  }
  if ('last_status' in body && body.last_status != null && String(body.last_status).trim() !== '' && !STATUSES.has(String(body.last_status))) {
    errs.push('last_status inválido (sent|failed|skipped)');
  }
  return errs;
}

export async function create(body, tenant, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO channels(tenant_id, channel, webhook_url, events, enabled, last_status)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tenant, body.channel, body.webhook_url,
      body.events ?? null,
      body.enabled === false ? false : Boolean(body.enabled),
      body.last_status ?? null]
  );
  return rows[0];
}

export async function update(id, body, tenant, db = pool) {
  const cols = [];
  const vals = [];
  let i = 1;
  for (const k of ['channel', 'webhook_url', 'events', 'enabled', 'last_status']) {
    if (k in body) {
      cols.push(`${k}=$${i++}`);
      if (k === 'enabled') vals.push(Boolean(body[k]));
      else vals.push(body[k]);
    }
  }
  if (cols.length === 0) return findById(id, tenant, db);
  vals.push(id, tenant);
  const { rows } = await db.query(
    `UPDATE channels SET ${cols.join(', ')}, updated_at=now() WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`,
    vals
  );
  return rows[0] || null;
}

export async function remove(id, tenant, db = pool) {
  const { rows } = await db.query('DELETE FROM channels WHERE id=$1 AND tenant_id=$2 RETURNING id', [id, tenant]);
  return rows[0] || null;
}
