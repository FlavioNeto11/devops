// Instalação do domínio de Legacy Asset Recovery (ADR-010): rotas F2 + boot (migração idempotente
// dos casos legados). Rotas públicas só expõem fatos com fonte (origens, jornada, gates); tudo que
// envolve reclamante, evidência ou reivindicação exige RBAC e a fundação (Postgres).
import path from 'node:path';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as store from '../store.js';
import { authorize } from '../foundation/rbac.js';
import { isDbReady } from '../db.js';
import { config } from '../config.js';
import { createPgRecoveryRepo } from './repo/pg.js';
import { createRecoveryService, F2_CLAIM_DESTINATIONS, F2_EVIDENCE_DESTINATIONS, F2_VALUATION_TYPES } from './service.js';
import { ASSET_ORIGINS } from './domain/asset-origins.js';
import { STATES, JOURNEY, STAGE } from './domain/model.js';
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, CLAIM_KINDS, PERSON_TYPES, LINK_ROLES } from './domain/evidence.js';
import { SOURCE_NATURES } from './domain/source-claims.js';
import { GATES } from './domain/governance-gates.js';
import { ACTIONS as APPROVAL_ACTIONS } from './domain/four-eyes.js';
import { CAPABILITIES } from '../governance/capabilities.js';
import { DomainInvariantError } from './domain/errors.js';

export const EVIDENCE_DIR = path.join(store.DATA_DIR, 'evidence');

let service = null;
export function getRecoveryService() {
  if (!service) service = createRecoveryService({ repo: createPgRecoveryRepo() });
  return service;
}
export function setRecoveryService(s) { service = s; } // testes

// Boot: migra os casos do store JSON para Claimant/Claim/LegacyEvidence. Idempotente (ids
// preservados + legacy_case_id único); fail-soft por caso; nunca derruba o boot.
export async function bootRecovery() {
  const svc = getRecoveryService();
  const report = { MIGRATED: 0, UPDATED: 0, ALREADY_MIGRATED: 0, SKIPPED_SEEDED_CASE: 0, FAILED: 0 };
  const seededCases = config.migrateSeededCases;
  for (const c of store.listCases()) {
    try {
      const r = await svc.migrateLegacyCase(c, {
        seededCases,
        attachmentPath: store.attachmentPath,
        attachmentUri: (caseId, attId, ext) => `uploads/${caseId}/${attId}${ext || ''}`,
      });
      report[r.status] = (report[r.status] || 0) + 1;
    } catch (e) {
      report.FAILED++;
      console.error(`[recovery] migração do caso legado ${c.id} falhou (seguindo):`, e.message);
    }
  }
  console.log(`[recovery] migração LegacyCase -> Claim (casos semeados: ${seededCases}):`, JSON.stringify(report));
  if (report.SKIPPED_SEEDED_CASE) console.warn(`[recovery] ${report.SKIPPED_SEEDED_CASE} caso(s) semeado(s) NÃO migrado(s); decisão do operador: BESC_MIGRATE_SEEDED_CASES=migrate para incluí-los`);
  return report;
}

const actorOf = (req) => ({ userId: req.auth.user.id, role: req.auth.roles[0], ip: req.ip });

// Erro de domínio -> HTTP. Erros de trigger do Postgres (defesa em profundidade) viram 409.
function sendError(res, e) {
  if (e instanceof DomainInvariantError) {
    const status = e.code === 'NOT_FOUND' ? 404
      : e.code === 'NOT_AVAILABLE_IN_PHASE' ? 409
      : ['SELF_REVIEW', 'SELF_APPROVAL'].includes(e.code) ? 403
      : ['ORIGIN_RESEARCH_PENDING', 'MULTI_ISSUER_GATE_CLOSED', 'CLAIM_CLOSED', 'TRANSITION_NOT_ALLOWED', 'STALE_STATE', 'EVIDENCE_ARCHIVED', 'INVALID_STATE'].includes(e.code) ? 409
      : 422;
    return res.status(status).json({ error: e.message, code: e.code, details: e.details });
  }
  if (e && e.code && /^(23|P0)/.test(e.code)) return res.status(409).json({ error: e.message, code: 'DB_INVARIANT' });
  console.error('[recovery] erro inesperado:', e);
  return res.status(500).json({ error: 'erro interno' });
}
const handle = (fn) => async (req, res) => {
  if (!isDbReady()) return res.status(503).json({ error: 'domínio de recuperação indisponível (banco)' });
  try { res.json(await fn(req, res)); } catch (e) { sendError(res, e); }
};

const evidenceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { try { mkdirSync(EVIDENCE_DIR, { recursive: true }); cb(null, EVIDENCE_DIR); } catch (e) { cb(e); } },
    filename: (req, file, cb) => {
      req._evidenceId = randomUUID();
      req._evidenceExt = (path.extname(file.originalname || '') || '').slice(0, 12);
      cb(null, `${req._evidenceId}${req._evidenceExt}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
}).single('file');

export function installRecovery(app) {
  // ---- públicos: vocabulário, jornada, origens com fonte, gates ----
  app.get('/recovery/meta', (req, res) => res.json({
    states: STATES, journey: JOURNEY, stages: STAGE, documentKinds: DOCUMENT_KINDS, documentKindLabels: DOCUMENT_KIND_LABELS,
    claimKinds: CLAIM_KINDS, personTypes: PERSON_TYPES, linkRoles: LINK_ROLES,
    sourceNatures: Object.fromEntries(Object.entries(SOURCE_NATURES).map(([k, v]) => [k, v.label])),
    f2: { claimDestinations: F2_CLAIM_DESTINATIONS, evidenceDestinations: F2_EVIDENCE_DESTINATIONS, valuationTypes: F2_VALUATION_TYPES },
    approvalActions: APPROVAL_ACTIONS,
    gates: Object.fromEntries(Object.entries(GATES).map(([k, g]) => [k, g.initial])),
    multi_issuer_research_gate: GATES.multi_issuer_research_gate.initial,
    capabilities: CAPABILITIES,
    principle: 'Documento antigo não é ativo. Só é ativo registrado o que o system of record jurídico confirma externamente.',
  }));
  app.get('/recovery/origins', (req, res) => res.json(ASSET_ORIGINS));

  // ---- reclamantes e reivindicações ----
  app.get('/recovery/gates', authorize('recovery:read'), handle(() => getRecoveryService().listGates()));
  app.post('/recovery/claimants', authorize('recovery:write'), handle((req) => getRecoveryService().createClaimant(req.body || {}, actorOf(req))));
  app.get('/recovery/claims', authorize('recovery:read'), handle(() => getRecoveryService().listClaims()));
  app.post('/recovery/claims', authorize('recovery:write'), handle((req) => getRecoveryService().createClaim(req.body || {}, actorOf(req))));
  app.get('/recovery/claims/:id', authorize('recovery:read'), handle((req) => getRecoveryService().getClaimView(req.params.id)));
  app.post('/recovery/claims/:id/transitions', authorize('recovery:write'), handle((req) => {
    const b = req.body || {};
    return getRecoveryService().transitionClaim(req.params.id, b.toState, b.reason, actorOf(req));
  }));
  app.post('/recovery/claims/:id/evidence', authorize('recovery:write'), handle((req) => {
    const b = req.body || {};
    return getRecoveryService().linkEvidence(req.params.id, b.evidenceId, b.role || 'SUPPORTING', actorOf(req));
  }));
  app.post('/recovery/claims/:id/valuations', authorize('recovery:write'), handle((req) => getRecoveryService().recordValuation(req.params.id, req.body || {}, actorOf(req))));

  // ---- evidências legadas ----
  app.post('/recovery/evidence', authorize('recovery:write'), (req, res) => {
    if (!isDbReady()) return res.status(503).json({ error: 'domínio de recuperação indisponível (banco)' });
    evidenceUpload(req, res, async (err) => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'arquivo excede 25 MB' : 'falha no upload' });
      if (!req.file) return res.status(400).json({ error: 'nenhum arquivo enviado (campo "file")' });
      try {
        const b = req.body || {};
        const out = await getRecoveryService().ingestEvidence({
          id: req._evidenceId, filePath: req.file.path, storageUri: `evidence/${req._evidenceId}${req._evidenceExt}`,
          originalFilename: req.file.originalname, mime: req.file.mimetype, sizeBytes: req.file.size,
          claimantId: b.claimantId || null, claimId: b.claimId || null, notes: b.notes || '', origin: 'OPERATOR_UPLOAD',
        }, actorOf(req));
        res.status(201).json(out);
      } catch (e) { sendError(res, e); }
    });
  });
  app.get('/recovery/evidence/:id', authorize('recovery:read'), handle((req) => getRecoveryService().getEvidenceView(req.params.id)));
  app.get('/recovery/evidence/:id/file', authorize('recovery:read'), async (req, res) => {
    if (!isDbReady()) return res.status(503).json({ error: 'domínio de recuperação indisponível (banco)' });
    try {
      const { evidence } = await getRecoveryService().getEvidenceView(req.params.id);
      if (!evidence.storageUri) return res.status(404).json({ error: 'arquivo indisponível (FILE_MISSING)' });
      const abs = path.resolve(store.DATA_DIR, evidence.storageUri);
      if (!abs.startsWith(path.resolve(store.DATA_DIR))) return res.status(400).json({ error: 'caminho inválido' });
      res.setHeader('Content-Type', evidence.mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(evidence.originalFilename || evidence.id)}`);
      res.sendFile(abs, (e) => { if (e && !res.headersSent) res.status(404).json({ error: 'arquivo não encontrado' }); });
    } catch (e) { sendError(res, e); }
  });
  app.post('/recovery/evidence/:id/classifications', authorize('recovery:write'), handle((req) => getRecoveryService().classifyEvidence(req.params.id, req.body || {}, actorOf(req))));
  app.post('/recovery/evidence/:id/transitions', authorize('recovery:write'), handle((req) => {
    const b = req.body || {};
    return getRecoveryService().transitionEvidence(req.params.id, b.toState, b.reason, actorOf(req));
  }));

  // ---- quatro-olhos: pedido, revisão, decisão (nenhuma rota APLICA GATE_CHANGE nesta fase) ----
  app.get('/recovery/approvals', authorize('recovery:read'), handle(() => getRecoveryService().listApprovals()));
  app.post('/recovery/approvals', authorize('recovery:write'), handle((req) => getRecoveryService().requestApproval(req.body || {}, actorOf(req))));
  app.post('/recovery/approvals/:id/review', authorize('recovery:approve'), handle((req) => getRecoveryService().reviewApproval(req.params.id, req.body || {}, actorOf(req))));
  app.post('/recovery/approvals/:id/decision', authorize('recovery:approve'), handle((req) => getRecoveryService().decideApproval(req.params.id, req.body || {}, actorOf(req))));
}
