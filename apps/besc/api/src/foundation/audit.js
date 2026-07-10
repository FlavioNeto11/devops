// Trilha de auditoria (Fase 0). Toda escrita passa por append_audit_event (hash-chain
// no banco). Para entidades do store JSON (cases/conteudo) o evento e gravado logo
// apos a mutacao (best-effort com erro VISIVEL no log) — a garantia transacional
// completa chega quando essas entidades migrarem ao Postgres (F5 do plano).
import { createHash } from 'node:crypto';
import { query, isDbReady } from '../db.js';
import { config } from '../config.js';

const hashIp = (ip) => (ip ? createHash('sha256').update(String(ip) + '|' + config.sessionSecret).digest('hex') : null);

// Taxonomia fechada (subset da Fase 0 — docs/evolution/07-trilha-auditoria.md §4).
export const EVENT_TYPES = new Set([
  'auth.login.succeeded', 'auth.login.denied', 'auth.sso.succeeded', 'auth.sso.denied',
  'auth.session.refreshed', 'auth.session.revoked',
  'auth.invitation.created', 'auth.invitation.accepted',
  'rbac.role.created', 'rbac.role.deleted', 'rbac.permissions.changed',
  'rbac.role.granted', 'rbac.role.revoked', 'rbac.user.updated',
  'case.created', 'case.updated', 'case.deleted', 'case.status.changed',
  'content.created', 'content.updated', 'content.deleted',
  'audit.access.viewed',
  // marketplace (Fase 1) — docs/evolution/07 §4
  'title.registered', 'title.updated', 'title.legal_status.changed',
  'token.issuance.requested', 'token.issuance.confirmed', 'token.issuance.failed',
  'token.transfer.requested', 'token.transfer.confirmed', 'token.transfer.failed',
  'token.freeze.confirmed', 'token.unfreeze.confirmed',
  'token.substitution.requested', 'token.substitution.confirmed', 'token.substitution.failed',
]);

export async function appendAudit({ actorUserId = null, actorRole = 'system', ip = null, eventType, entityType, entityId, payload = {}, occurredAt = null }) {
  if (!EVENT_TYPES.has(eventType)) {
    console.error(`[audit] event_type fora da taxonomia: ${eventType}`);
    return null;
  }
  try {
    const { rows } = await query(
      'SELECT append_audit_event($1, $2, $3, $4, $5, $6, $7, $8) AS id',
      [occurredAt, actorUserId, actorRole, hashIp(ip), eventType, entityType, String(entityId), JSON.stringify(payload)],
    );
    return rows[0].id;
  } catch (e) {
    // NUNCA silencioso: a falha fica gritando no log (e o vigia do db derruba `ready`).
    console.error(`[audit] FALHA ao registrar ${eventType} (${entityType}/${entityId}):`, e.message);
    return null;
  }
}

// Mapeia mutacoes das rotas legadas (store JSON) para a taxonomia. Payload minimizado
// (metodo, path, status, ids) — NUNCA corpo da requisicao (PII fica fora da trilha).
const LEGACY_RULES = [
  { re: /^\/cases\/([^/]+)\/status$/, type: 'case.status.changed', entity: 'case' },
  { re: /^\/cases$/, method: 'POST', type: 'case.created', entity: 'case' },
  { re: /^\/cases\/([^/]+)$/, method: 'DELETE', type: 'case.deleted', entity: 'case' },
  { re: /^\/cases\/([^/]+)(\/.*)?$/, type: 'case.updated', entity: 'case' },
  { re: /^\/(library|jurisprudence)$/, method: 'POST', type: 'content.created', entity: 'content' },
  { re: /^\/(library|jurisprudence)\/([^/]+)$/, method: 'DELETE', type: 'content.deleted', entity: 'content' },
  { re: /^\/(library|jurisprudence)\/([^/]+)(\/.*)?$/, type: 'content.updated', entity: 'content' },
];

export function legacyAuditMiddleware() {
  return (req, res, next) => {
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      if (!isDbReady()) { console.error(`[audit] db fora: mutação ${req.method} ${req.path} sem evento`); return; }
      for (const rule of LEGACY_RULES) {
        if (rule.method && rule.method !== req.method) continue;
        const m = req.path.match(rule.re);
        if (!m) continue;
        const entityId = rule.entity === 'case' ? m[1] : (m[2] || m[1]);
        appendAudit({
          actorUserId: req.auth?.user?.id || null,
          actorRole: req.auth?.roles?.[0] || 'anonymous',
          ip: req.ip,
          eventType: rule.type,
          entityType: rule.entity,
          entityId,
          payload: { method: req.method, path: req.path, status: res.statusCode },
        });
        return;
      }
    });
    next();
  };
}

export async function listAuditEvents({ entityType, entityId, eventType, limit = 100, before = null }) {
  const cond = [];
  const params = [];
  const add = (sqlFrag, v) => { params.push(v); cond.push(sqlFrag.replace('?', `$${params.length}`)); };
  if (entityType) add('entity_type = ?', entityType);
  if (entityId) add('entity_id = ?', String(entityId));
  if (eventType) add('event_type = ?', eventType);
  if (before) add('id < ?', before);
  params.push(Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500));
  const sql = `SELECT id, event_uid, occurred_at, recorded_at, actor_user_id, actor_role, event_type,
                      entity_type, entity_id, payload, prev_hash, event_hash
               FROM audit_event ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
               ORDER BY id DESC LIMIT $${params.length}`;
  const { rows } = await query(sql, params);
  return rows;
}
