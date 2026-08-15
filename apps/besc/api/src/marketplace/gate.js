// Gate regulatorio (Fase 4 — docs/evolution/10 + ADR-007). Os 7 itens requiresLegal
// viram bloqueantes formais; go_live_enabled e DERIVADO (nunca coluna editavel):
// todos os itens em {satisfied, not_applicable} E o ultimo ato = 'granted'.
import { query, tx } from '../db.js';
import { appendAudit } from '../foundation/audit.js';

export async function gateStatus() {
  const items = (await query(`SELECT * FROM regulatory_gate_item ORDER BY key`)).rows;
  const lastAct = (await query(`SELECT kind, occurred_at FROM regulatory_gate_approval ORDER BY id DESC LIMIT 1`)).rows[0] || null;
  const allOk = items.length === 7 && items.every((i) => ['satisfied', 'not_applicable'].includes(i.status));
  const goLive = allOk && lastAct?.kind === 'granted';
  return { items, allItemsResolved: allOk, lastApproval: lastAct, goLive };
}

export async function setGateItem(key, { status, opinionDocumentRef, professionalName, professionalRegistration, notes }, actor) {
  if (!['pending', 'satisfied', 'not_applicable', 'reopened'].includes(status)) return { status: 400, body: { error: 'status inválido' } };
  if (['satisfied', 'not_applicable'].includes(status) && !professionalName) {
    return { status: 400, body: { error: 'parecer exige o nome do profissional habilitado' } };
  }
  const { rows } = await query(
    `UPDATE regulatory_gate_item SET status = $2, opinion_document_ref = $3, professional_name = $4,
       professional_registration = $5, notes = $6, recorded_by = $7, recorded_at = now()
     WHERE key = $1 RETURNING *`,
    [key, status, opinionDocumentRef || null, professionalName || null, professionalRegistration || null, notes || null, actor.userId]);
  if (!rows.length) return { status: 404, body: { error: 'item do gate não encontrado' } };
  await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'title.updated', entityType: 'regulatory_gate_item', entityId: key, payload: { status, professionalName } });
  return { status: 200, body: rows[0] };
}

// Concede o go-live (ato append-only). Recusa se algum item nao esta resolvido.
export async function grantGoLive(actor) {
  const out = await tx(async (client) => {
    const items = (await client.query(`SELECT key, status FROM regulatory_gate_item`)).rows;
    const allOk = items.length === 7 && items.every((i) => ['satisfied', 'not_applicable'].includes(i.status));
    if (!allOk) return { status: 409, body: { error: 'nem todos os 7 itens regulatórios estão resolvidos (satisfeito/não se aplica) com parecer' } };
    await client.query(
      `INSERT INTO regulatory_gate_approval (kind, item_snapshot, approved_by) VALUES ('granted', $1, $2)`,
      [JSON.stringify(items), actor.userId]);
    await client.query(`INSERT INTO system_parameters (key, value, updated_by) VALUES ('go_live_enabled','true'::jsonb,$1)
                        ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_by = $1, updated_at = now()`, [actor.userId]);
    return { status: 200, body: { goLive: true } };
  });
  if (out.status === 200) await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'title.updated', entityType: 'regulatory_gate', entityId: 'go_live', payload: { kind: 'granted' } });
  return out;
}

export async function revokeGoLive(actor, reason) {
  await tx(async (client) => {
    const items = (await client.query(`SELECT key, status FROM regulatory_gate_item`)).rows;
    await client.query(`INSERT INTO regulatory_gate_approval (kind, item_snapshot, approved_by) VALUES ('revoked', $1, $2)`, [JSON.stringify({ items, reason }), actor.userId]);
    await client.query(`INSERT INTO system_parameters (key, value, updated_by) VALUES ('go_live_enabled','false'::jsonb,$1)
                        ON CONFLICT (key) DO UPDATE SET value = 'false'::jsonb, updated_by = $1, updated_at = now()`, [actor.userId]);
  });
  await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'title.updated', entityType: 'regulatory_gate', entityId: 'go_live', payload: { kind: 'revoked', reason } });
  return { status: 200, body: { goLive: false } };
}
