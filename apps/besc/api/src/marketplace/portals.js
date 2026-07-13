// Portais por perfil (Fase 2 — docs/evolution/08). Investidor (onboarding, catalogo,
// dossie allowlist, carteira, contratar/alugar em modo DEMONSTRACAO), auditor
// (advogado/juiz read-only com registro de acesso na trilha + escopo linked), gestor
// (concessao de acesso a auditores). A autoridade e SEMPRE a API.
import { query } from '../db.js';
import * as store from '../store.js';
import { authorize } from '../foundation/rbac.js';
import { appendAudit } from '../foundation/audit.js';
import { contractTokens, listContracts } from './issuance.js';
import { LEGAL_STATUSES } from './states.js';

const actorOf = (req) => ({ userId: req.auth.user.id, role: req.auth.roles[0], ip: req.ip });
const send = (res, out) => res.status(out.status).json(out.body);

export async function goLiveEnabled() {
  const { rows } = await query(`SELECT value FROM system_parameters WHERE key = 'go_live_enabled'`);
  return rows[0]?.value === true;
}

// Dossie PUBLICO do titulo — projecao ALLOWLIST (docs/evolution/08 §4). NUNCA expoe
// PII do titular, notas internas, pendencias, anexos. So o que o Gestor publicou.
async function buildDossier(titleId, { forInvestor = false } = {}) {
  const { rows } = await query(
    `SELECT t.*, title_available(t.legal_status, t.listing_status) AS available FROM security_title t WHERE t.id = $1`, [titleId]);
  if (!rows.length) return null;
  const t = rows[0];
  if (t.listing_status !== 'listed') return null; // so titulos publicados
  const [param, history, valuation] = await Promise.all([
    query(`SELECT tokens_per_share, unit_face_value, currency FROM tokenization_parameter WHERE title_id = $1 AND status = 'active'`, [titleId]),
    query(`SELECT to_status, reason, occurred_at FROM legal_status_history WHERE title_id = $1 ORDER BY id DESC LIMIT 20`, [titleId]),
    query(`SELECT value_per_share, valuation_date, source FROM market_valuation WHERE title_id = $1 ORDER BY valuation_date DESC LIMIT 1`, [titleId]),
  ]);
  // risco vem do case (derivado) — so o nivel, nunca o conteudo do caso
  const c = store.getCase(t.case_id);
  let riskLevel = null;
  try { if (c) riskLevel = (await import('../domain.js')).enrichCase(c).case.derived.risk.level; } catch { /* fail-soft */ }
  // jurisprudencia vinculada (ja publica) — link soft por id, como hoje
  const precedents = (c && Array.isArray(c.precedents)) ? c.precedents.slice(0, 20) : [];
  return {
    id: t.id,
    label: t.label,
    share_class: t.share_class,
    share_quantity: t.share_quantity,
    legal_status: t.legal_status,
    legal_status_label: LEGAL_STATUSES[t.legal_status],
    available: t.available,
    risk_level: riskLevel,
    active_parameter: param.rows[0] || null,   // fator + valor unitario vigente
    latest_valuation: valuation.rows[0] || null,
    legal_timeline: history.rows,
    linked_precedents: precedents,
    // watermark: contratacao real depende do gate regulatorio
    demonstration: !(await goLiveEnabled()),
  };
}

export function installPortals(app) {
  // ---- estado do modo demonstracao (publico) ----
  app.get('/portal/mode', async (req, res) => res.json({ goLive: await goLiveEnabled() }));

  // ---- dossie publico (catalogo 2 niveis: teaser em /marketplace/catalog; dossie aqui) ----
  app.get('/marketplace/titles/:id/dossier', async (req, res) => {
    const d = await buildDossier(req.params.id);
    if (!d) return res.status(404).json({ error: 'título não encontrado ou não publicado' });
    res.json(d);
  });

  // ============ INVESTIDOR ============
  // carteira: contratos do proprio usuario (escopo own imposto pelo servico)
  app.get('/me/wallet', authorize('contracts:read'), async (req, res) => {
    const contracts = await listContracts({ holderUserId: req.auth.user.id });
    res.json({ contracts, demonstration: !(await goLiveEnabled()) });
  });

  // contratar tokens (modo demonstracao ate o go-live; aceita termos versionados)
  app.post('/marketplace/titles/:id/contract', authorize('contracts:contract'), async (req, res) => {
    // exige aceite dos termos ativos (se houver)
    const terms = await query(`SELECT id FROM terms_document WHERE kind = 'investor_terms' AND active LIMIT 1`);
    if (terms.rows.length) {
      const accepted = await query(`SELECT 1 FROM terms_acceptance WHERE user_id = $1 AND terms_id = $2`, [req.auth.user.id, terms.rows[0].id]);
      if (!accepted.rows.length) return res.status(409).json({ error: 'aceite os termos antes de contratar', termsId: terms.rows[0].id });
    }
    // investidor contrata para si (holder = ele mesmo)
    const out = await contractTokens(req.params.id, { quantity: (req.body || {}).quantity, purpose: (req.body || {}).purpose || 'purchase', holderUserId: req.auth.user.id }, actorOf(req));
    send(res, out);
  });

  // termos ativos + aceite
  app.get('/terms/:kind', async (req, res) => {
    const { rows } = await query(`SELECT id, kind, version, title, body FROM terms_document WHERE kind = $1 AND active LIMIT 1`, [req.params.kind]);
    res.json(rows[0] || null);
  });
  app.post('/terms/:id/accept', authorize('contracts:read'), async (req, res) => {
    await query(`INSERT INTO terms_acceptance (user_id, terms_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.auth.user.id, req.params.id]);
    res.json({ ok: true });
  });

  // ============ AUDITOR (advogado/juiz) — read-only com REGISTRO de acesso ============
  // titulos vinculados ao auditor (escopo linked)
  app.get('/audit/titles', authorize('titles:read'), async (req, res) => {
    // gestor (scope all) ve todos; auditor (scope linked) ve so os concedidos
    const scope = req.authz.scope;
    let rows;
    if (scope === 'all') {
      rows = (await query(`SELECT t.id, t.label, t.legal_status, t.listing_status FROM security_title t ORDER BY t.created_at DESC`)).rows;
    } else {
      rows = (await query(
        `SELECT t.id, t.label, t.legal_status, t.listing_status FROM security_title t
         JOIN title_access_grants g ON g.title_id = t.id
         WHERE g.user_id = $1 AND g.revoked_at IS NULL ORDER BY t.created_at DESC`, [req.auth.user.id])).rows;
    }
    res.json(rows);
  });

  // visao de auditoria de um titulo — REGISTRA o acesso na trilha (requisito do plano)
  app.get('/audit/titles/:id', authorize('legal_status:read'), async (req, res) => {
    const scope = req.authz.scope;
    if (scope !== 'all') {
      const g = await query(`SELECT 1 FROM title_access_grants WHERE title_id = $1 AND user_id = $2 AND revoked_at IS NULL`, [req.params.id, req.auth.user.id]);
      if (!g.rows.length) return res.status(403).json({ error: 'sem acesso a este título' });
    }
    const [title, history, contracts] = await Promise.all([
      query(`SELECT id, label, share_class, share_quantity, legal_status, listing_status FROM security_title WHERE id = $1`, [req.params.id]),
      query(`SELECT * FROM legal_status_history WHERE title_id = $1 ORDER BY id DESC`, [req.params.id]),
      query(`SELECT id, contract_number, quantity, unit_face_value_frozen, total_face_value, status, contracted_at FROM token_contract WHERE title_id = $1 ORDER BY contracted_at DESC`, [req.params.id]),
    ]);
    if (!title.rows.length) return res.status(404).json({ error: 'título não encontrado' });
    // toda leitura qualificada vira evento na trilha (audit.access.viewed)
    await appendAudit({ actorUserId: req.auth.user.id, actorRole: req.auth.roles[0], ip: req.ip, eventType: 'audit.access.viewed', entityType: 'security_title', entityId: req.params.id, payload: { view: 'audit_title', scope } });
    res.json({ title: title.rows[0], legalHistory: history.rows, contracts: contracts.rows });
  });

  // ============ GESTOR — concessao de acesso de auditoria ============
  app.post('/titles/:id/grants', authorize('rbac:invite'), async (req, res) => {
    const { userEmail, purpose } = req.body || {};
    if (!userEmail) return res.status(400).json({ error: 'userEmail é obrigatório' });
    const u = await query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [userEmail]);
    if (!u.rows.length) return res.status(404).json({ error: 'usuário não encontrado (convide-o primeiro)' });
    await query(
      `INSERT INTO title_access_grants (title_id, user_id, granted_by, purpose) VALUES ($1,$2,$3,$4)
       ON CONFLICT (title_id, user_id) DO UPDATE SET revoked_at = NULL, purpose = EXCLUDED.purpose`,
      [req.params.id, u.rows[0].id, req.auth.user.id, purpose || 'audit']);
    await appendAudit({ actorUserId: req.auth.user.id, actorRole: req.auth.roles[0], ip: req.ip, eventType: 'rbac.role.granted', entityType: 'title_access_grants', entityId: req.params.id, payload: { userEmail, purpose } });
    res.status(201).json({ ok: true });
  });

  app.delete('/titles/:id/grants/:userId', authorize('rbac:invite'), async (req, res) => {
    await query(`UPDATE title_access_grants SET revoked_at = now() WHERE title_id = $1 AND user_id = $2`, [req.params.id, req.params.userId]);
    await appendAudit({ actorUserId: req.auth.user.id, actorRole: req.auth.roles[0], ip: req.ip, eventType: 'rbac.role.revoked', entityType: 'title_access_grants', entityId: req.params.id, payload: { userId: req.params.userId } });
    res.json({ ok: true });
  });

  app.get('/titles/:id/grants', authorize('rbac:invite'), async (req, res) => {
    const { rows } = await query(
      `SELECT g.user_id, u.email, u.name, g.purpose, g.granted_at, g.revoked_at
       FROM title_access_grants g JOIN users u ON u.id = g.user_id WHERE g.title_id = $1 ORDER BY g.granted_at DESC`, [req.params.id]);
    res.json(rows);
  });
}
