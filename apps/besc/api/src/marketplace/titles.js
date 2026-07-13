// Servico de titulos: cadastro (gate de elegibilidade a partir do case do store JSON),
// valuation (serie temporal), parametros (versionados, 1 active, fator congelado pos-emissao),
// listing e maquina de estado juridico com cascatas. docs/evolution/02,03,04.
import { createHash, randomUUID } from 'node:crypto';
import { query, tx } from '../db.js';
import * as store from '../store.js';
import { enrichCase } from '../domain.js';
import { appendAudit } from '../foundation/audit.js';
import { getLedger } from '../ledger/port.js';
import { AVAILABLE_STATES, TRANSITIONS, LEGAL_STATUSES, canTransition, cascadeFor } from './states.js';

const ELIGIBLE_CASE_STATUS = new Set(['ready_for_structuring', 'ready_with_caveats']);

function evidenceHash(ev) {
  return createHash('sha256').update(JSON.stringify(ev || {})).digest('hex');
}

// ---------------------------------------------------------------------------
// Cadastro de titulo a partir de um case elegivel
// ---------------------------------------------------------------------------
export async function createTitle({ caseId, label, override = false }, actor) {
  const c = store.getCase(caseId);
  if (!c) return { status: 404, body: { error: 'caso não encontrado' } };
  const enriched = enrichCase(c).case;
  const st = enriched.status;
  if (!ELIGIBLE_CASE_STATUS.has(st)) {
    return { status: 409, body: { error: `caso não elegível (status "${st}"): só "Apto para estruturação" (ou "Apto com ressalvas" com override) originam título` } };
  }
  if (st === 'ready_with_caveats' && !override) {
    return { status: 409, body: { error: 'caso "Apto com ressalvas" exige override explícito do Gestor', requiresOverride: true } };
  }
  const snapshot = {
    caseStatus: st,
    risk: enriched.derived.risk.level,
    docPct: enriched.derived.docPct,
    pendencyCount: enriched.derived.pendencyCount,
    at: new Date().toISOString(),
  };
  const shareQty = parseInt(String(c.share_quantity || '').replace(/[^0-9]/g, ''), 10) || 1;
  const out = await tx(async (client) => {
    const exists = await client.query('SELECT id FROM security_title WHERE case_id = $1', [caseId]);
    if (exists.rows.length) return { status: 409, body: { error: 'este caso já originou um título' } };
    const { rows } = await client.query(
      `INSERT INTO security_title (case_id, label, share_class, share_quantity, eligibility_snapshot, eligibility_override, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [caseId, label || c.holder_name || `Título ${caseId.slice(0, 8)}`, c.share_class || 'unknown', shareQty, JSON.stringify(snapshot), st === 'ready_with_caveats', actor.userId],
    );
    const title = rows[0];
    await client.query(
      `INSERT INTO legal_status_history (title_id, from_status, to_status, reason, source, actor_user_id)
       VALUES ($1, 'none', 'unjudged', 'cadastro do título', 'manual', $2)`,
      [title.id, actor.userId],
    );
    return { status: 201, body: title };
  });
  if (out.status === 201) {
    await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'title.registered', entityType: 'security_title', entityId: out.body.id, payload: { caseId, snapshot } });
  }
  return out;
}

export async function listTitles({ publicView = false } = {}) {
  const { rows } = await query(
    `SELECT t.*,
            title_available(t.legal_status, t.listing_status) AS available,
            (SELECT value_per_share FROM market_valuation v WHERE v.title_id = t.id ORDER BY valuation_date DESC, created_at DESC LIMIT 1) AS latest_valuation,
            (SELECT unit_face_value FROM tokenization_parameter p WHERE p.title_id = t.id AND p.status = 'active') AS active_unit_value,
            (SELECT tokens_per_share FROM tokenization_parameter p WHERE p.title_id = t.id AND p.status = 'active') AS active_tokens_per_share
     FROM security_title t ORDER BY t.created_at DESC`,
  );
  if (publicView) {
    // catalogo publico (teaser): sem case_id, sem snapshot interno
    return rows.filter((t) => t.listing_status === 'listed').map((t) => ({
      id: t.id, label: t.label, share_class: t.share_class, share_quantity: t.share_quantity,
      legal_status: t.legal_status, legal_status_label: LEGAL_STATUSES[t.legal_status],
      available: t.available, active_unit_value: t.active_unit_value,
    }));
  }
  return rows;
}

export async function getTitle(id, { includeHistory = true } = {}) {
  const { rows } = await query(
    `SELECT t.*, title_available(t.legal_status, t.listing_status) AS available FROM security_title t WHERE t.id = $1`, [id]);
  if (!rows.length) return null;
  const title = rows[0];
  const [vals, params, batches, history] = await Promise.all([
    query('SELECT * FROM market_valuation WHERE title_id = $1 ORDER BY valuation_date DESC, created_at DESC', [id]),
    query('SELECT * FROM tokenization_parameter WHERE title_id = $1 ORDER BY version DESC', [id]),
    query('SELECT * FROM token_batch WHERE title_id = $1 ORDER BY created_at DESC', [id]),
    includeHistory ? query('SELECT * FROM legal_status_history WHERE title_id = $1 ORDER BY id DESC', [id]) : Promise.resolve({ rows: [] }),
  ]);
  return { ...title, valuations: vals.rows, parameters: params.rows, batches: batches.rows, legalHistory: history.rows };
}

// ---------------------------------------------------------------------------
// Valuation (serie temporal append-only)
// ---------------------------------------------------------------------------
export async function addValuation(titleId, { valuePerShare, valuationDate, source, evidenceRef, notes }, actor) {
  const v = Number(valuePerShare);
  if (!(v > 0)) return { status: 400, body: { error: 'valuePerShare deve ser > 0' } };
  const { rows } = await query(
    `INSERT INTO market_valuation (title_id, value_per_share, valuation_date, source, evidence_ref, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [titleId, v.toFixed(2), valuationDate || new Date().toISOString().slice(0, 10), source || 'manual', evidenceRef ? JSON.stringify(evidenceRef) : null, notes || null, actor.userId],
  );
  await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'title.updated', entityType: 'security_title', entityId: titleId, payload: { valuation: { valuePerShare: v, valuationDate } } });
  return { status: 201, body: rows[0] };
}

// ---------------------------------------------------------------------------
// Parametro de tokenizacao (versionado). Fator congelado apos a 1a emissao.
// Criar sempre em draft; activate promove e supersede o anterior.
// ---------------------------------------------------------------------------
export async function createParameter(titleId, { tokensPerShare, unitFaceValue, basedOnValuationId }, actor) {
  const tps = parseInt(tokensPerShare, 10);
  const ufv = Number(unitFaceValue);
  if (!(tps > 0)) return { status: 400, body: { error: 'tokensPerShare deve ser > 0' } };
  if (!(ufv > 0)) return { status: 400, body: { error: 'unitFaceValue deve ser > 0' } };
  const out = await tx(async (client) => {
    const hasBatch = await client.query('SELECT 1 FROM token_batch WHERE title_id = $1 LIMIT 1', [titleId]);
    if (hasBatch.rows.length) {
      // fator imutavel pos-emissao: a nova versao TEM que manter tokens_per_share
      const { rows } = await client.query(
        `SELECT tokens_per_share FROM tokenization_parameter WHERE title_id = $1 ORDER BY version DESC LIMIT 1`, [titleId]);
      if (rows.length && rows[0].tokens_per_share !== tps) {
        return { status: 409, body: { error: `fator tokens/ação é imutável após a 1ª emissão (vigente: ${rows[0].tokens_per_share})` } };
      }
    }
    const { rows: verRows } = await client.query('SELECT COALESCE(MAX(version),0)+1 AS v FROM tokenization_parameter WHERE title_id = $1', [titleId]);
    const { rows } = await client.query(
      `INSERT INTO tokenization_parameter (title_id, version, tokens_per_share, unit_face_value, based_on_valuation_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [titleId, verRows[0].v, tps, ufv.toFixed(2), basedOnValuationId || null, actor.userId],
    );
    return { status: 201, body: rows[0] };
  });
  if (out.status === 201) {
    await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'title.updated', entityType: 'tokenization_parameter', entityId: out.body.id, payload: { titleId, version: out.body.version, tokensPerShare: tps, unitFaceValue: ufv } });
  }
  return out;
}

export async function activateParameter(paramId, actor) {
  const out = await tx(async (client) => {
    const { rows } = await client.query('SELECT * FROM tokenization_parameter WHERE id = $1 FOR UPDATE', [paramId]);
    if (!rows.length) return { status: 404, body: { error: 'parâmetro não encontrado' } };
    const p = rows[0];
    if (p.status === 'superseded') return { status: 409, body: { error: 'parâmetro já superseded' } };
    if (p.status === 'active') return { status: 200, body: p };
    await client.query(
      `UPDATE tokenization_parameter SET status = 'superseded', effective_to = now() WHERE title_id = $1 AND status = 'active'`, [p.title_id]);
    const { rows: up } = await client.query(
      `UPDATE tokenization_parameter SET status = 'active', effective_from = now() WHERE id = $1 RETURNING *`, [paramId]);
    return { status: 200, body: up[0], titleId: p.title_id, version: p.version };
  });
  if (out.status === 200 && out.titleId) {
    await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'title.updated', entityType: 'tokenization_parameter', entityId: paramId, payload: { titleId: out.titleId, activatedVersion: out.version } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Listing (publicar/despublicar no catalogo)
// ---------------------------------------------------------------------------
export async function setListing(titleId, listingStatus, actor) {
  if (!['draft', 'listed', 'delisted'].includes(listingStatus)) return { status: 400, body: { error: 'listing_status inválido' } };
  const { rows } = await query('UPDATE security_title SET listing_status = $2, updated_at = now() WHERE id = $1 RETURNING *', [titleId, listingStatus]);
  if (!rows.length) return { status: 404, body: { error: 'título não encontrado' } };
  await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'title.updated', entityType: 'security_title', entityId: titleId, payload: { listing_status: listingStatus } });
  return { status: 200, body: rows[0] };
}

// ---------------------------------------------------------------------------
// Maquina de estado juridico + cascatas
// ---------------------------------------------------------------------------
export async function transitionLegalStatus(titleId, { toStatus, reason, evidenceRef }, actor) {
  if (!LEGAL_STATUSES[toStatus]) return { status: 400, body: { error: 'estado jurídico inválido' } };
  if (!reason || String(reason).trim().length < 3) return { status: 400, body: { error: 'reason (justificativa) é obrigatório' } };
  const ledger = getLedger();
  const out = await tx(async (client) => {
    const { rows } = await client.query('SELECT * FROM security_title WHERE id = $1 FOR UPDATE', [titleId]);
    if (!rows.length) return { status: 404, body: { error: 'título não encontrado' } };
    const title = rows[0];
    const from = title.legal_status;
    if (!canTransition(from, toStatus)) {
      return { status: 409, body: { error: `transição não permitida: ${from} → ${toStatus}`, allowed: TRANSITIONS[from] || [] } };
    }
    await client.query('UPDATE security_title SET legal_status = $2, updated_at = now() WHERE id = $1', [titleId, toStatus]);
    await client.query(
      `INSERT INTO legal_status_history (title_id, from_status, to_status, reason, evidence_ref, source, actor_user_id)
       VALUES ($1,$2,$3,$4,$5,'manual',$6)`,
      [titleId, from, toStatus, reason, evidenceRef ? JSON.stringify(evidenceRef) : null, actor.userId],
    );
    const action = cascadeFor(toStatus);
    let affected = { contracts: 0, leases: 0 };
    const idem = randomUUID();
    if (action === 'suspend' || action === 'defeat' || action === 'freeze_only') {
      await ledger.freezeTitle({ titleId, reasonCode: toStatus === 'defeated' ? 'legal_status_denied' : 'legal_status_suspended', evidenceHash: evidenceHash(evidenceRef), idempotencyKey: idem });
    } else if (action === 'reactivate') {
      await ledger.unfreezeTitle({ titleId, reasonCode: 'legal_status_reactivated', evidenceHash: evidenceHash(evidenceRef), idempotencyKey: idem });
    }
    // cascata: contratos + ALUGUEIS lastreados (I6: aluguel suspenso enquanto o título cai)
    if (action === 'suspend') {
      const r = await client.query(`UPDATE token_contract SET status = 'suspended' WHERE title_id = $1 AND status = 'active' RETURNING id`, [titleId]);
      affected.contracts = r.rowCount;
      const rl = await client.query(`UPDATE lease SET status = 'suspended' WHERE contract_id IN (SELECT id FROM token_contract WHERE title_id = $1) AND status = 'active' RETURNING id`, [titleId]);
      affected.leases = rl.rowCount;
    } else if (action === 'reactivate') {
      const r = await client.query(`UPDATE token_contract SET status = 'active' WHERE title_id = $1 AND status = 'suspended' RETURNING id`, [titleId]);
      affected.contracts = r.rowCount;
      const rl = await client.query(`UPDATE lease SET status = 'active' WHERE contract_id IN (SELECT id FROM token_contract WHERE title_id = $1) AND status = 'suspended' RETURNING id`, [titleId]);
      affected.leases = rl.rowCount;
    } else if (action === 'defeat') {
      // aluguéis do título caído encerram (nada mais devido — write-off)
      await client.query(`UPDATE lease SET status = 'written_off' WHERE contract_id IN (SELECT id FROM token_contract WHERE title_id = $1) AND status IN ('active','suspended')`, [titleId]);
      // contratos entram em suspenso aguardando resolucao do titular (§E.5)
      const r = await client.query(`UPDATE token_contract SET status = 'suspended' WHERE title_id = $1 AND status IN ('active','suspended') RETURNING id`, [titleId]);
      affected.contracts = r.rowCount;
    }
    return { status: 200, body: { title_id: titleId, from, to: toStatus, cascade: action, affected } };
  });
  if (out.status === 200) {
    await appendAudit({ actorUserId: actor.userId, actorRole: actor.role, ip: actor.ip, eventType: 'title.legal_status.changed', entityType: 'security_title', entityId: titleId, payload: out.body });
  }
  return out;
}
