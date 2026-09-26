// Invariantes do domínio de recuperação NO BANCO (sql/0007_asset_recovery.sql). Prova que mesmo
// SQL direto — sem passar pelo serviço — não pula etapas, não cria ativo sem confirmação externa
// real, não apaga história e não aceita auto-aprovação. Postgres descartável (Docker) ou pulado.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startDisposablePg } from '../test-support/pg-docker.mjs';
import { TRANSITIONS } from '../src/recovery/domain/model.js';
import { evaluateAssetGate } from '../src/recovery/domain/external-confirmation.js';

const pgInst = await startDisposablePg();
const skip = pgInst ? false : 'Docker indisponível — teste de banco pulado';
if (pgInst) {
  process.env.DATABASE_URL = pgInst.url;
  process.env.SESSION_SECRET = 'test-secret';
}
let db;
before(async () => {
  if (!pgInst) return;
  db = await import('../src/db.js');
  await (await import('../src/db/migrate.js')).runMigrations();
});
after(async () => {
  if (!pgInst) return;
  await db.getPool()?.end().catch(() => {});
  pgInst.stop();
});

const U1 = randomUUID(); const U2 = randomUUID(); const U3 = randomUUID();
const q = (sql, params) => db.query(sql, params);
const one = async (sql, params) => (await q(sql, params)).rows[0];
const move = (entity, id, from, to, reason = 'transição de teste') => q(
  `INSERT INTO entity_transition (entity_type, entity_id, from_state, to_state, actor_user_id, source, reason) VALUES ($1,$2,$3,$4,$5,'test',$6)`,
  [entity, id, from, to, U1, reason]);
const stateOf = async (table, id) => (await one(`SELECT state FROM ${table} WHERE id = $1`, [id])).state;

async function newClaimant() { return (await one(`INSERT INTO claimant (person_type, display_name) VALUES ('PF','Titular Teste') RETURNING id`)).id; }
async function newClaim(claimantId, origin = 'BESC') {
  return (await one(`INSERT INTO claim (claimant_id, asset_origin_id, claim_kind) VALUES ($1,$2,'BOOK_ENTRY_POSITION') RETURNING id`, [claimantId, origin])).id;
}
async function newEvidence(cls = 'EXTERNAL_EVIDENCE', origin = 'EXTERNAL_SYSTEM') {
  return (await one(`INSERT INTO evidence (evidence_class, origin, hash_status, sha256) VALUES ($1,$2,'HASHED',$3) RETURNING id`,
    [cls, origin, randomUUID().replace(/-/g, '').padEnd(64, '0').slice(0, 64)])).id;
}
async function newConfirmation({ purpose = 'RIGHT_RECOGNITION', subjectType = 'claim', subjectId, source = 'BOOKKEEPER', method = 'FILE', evidenceId, ref = 'OF-1', confirm = true }) {
  const id = (await one(`INSERT INTO external_confirmation (purpose, subject_type, subject_id, source, method, external_reference, evidence_id)
                          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [purpose, subjectType, subjectId, source, method, ref, evidenceId])).id;
  if (confirm) { await move('external_confirmation', id, 'REQUESTED', 'PENDING'); await move('external_confirmation', id, 'PENDING', 'CONFIRMED'); }
  return id;
}
async function claimToValidationRequested(claimId) {
  await move('claim', claimId, 'DRAFT', 'OPEN');
  await move('claim', claimId, 'OPEN', 'UNDER_ANALYSIS');
  await move('claim', claimId, 'UNDER_ANALYSIS', 'VALIDATION_REQUESTED');
}

test('allowed_transition no banco é idêntica ao model.js (sem drift)', { skip }, async () => {
  const rows = (await q(`SELECT entity_type, from_state, to_state FROM allowed_transition`)).rows.map((r) => `${r.entity_type}:${r.from_state}>${r.to_state}`).sort();
  const js = Object.entries(TRANSITIONS).flatMap(([e, p]) => p.map(([f, t]) => `${e}:${f}>${t}`)).sort();
  assert.deepEqual(rows, js);
});

test('multi_issuer_research_gate nasce CLOSED e bloqueia Claim de origem não-BESC', { skip }, async () => {
  assert.equal((await one(`SELECT state FROM governance_gate WHERE key = 'multi_issuer_research_gate'`)).state, 'CLOSED');
  const c = await newClaimant();
  await assert.rejects(() => newClaim(c, 'BANESPA'), /multi_issuer_research_gate CLOSED/);
  assert.ok(await newClaim(c, 'BESC'));
});

test('estado só muda por entity_transition; não se pula etapa; from_state tem de bater', { skip }, async () => {
  const claimId = await newClaim(await newClaimant());
  await assert.rejects(() => q(`UPDATE claim SET state = 'RECOGNIZED' WHERE id = $1`, [claimId]), /só muda por entity_transition/);
  await assert.rejects(() => move('claim', claimId, 'DRAFT', 'RECOGNIZED'), /não é permitida/);
  await assert.rejects(() => move('claim', claimId, 'OPEN', 'UNDER_ANALYSIS'), /está em DRAFT/);
  await move('claim', claimId, 'DRAFT', 'OPEN');
  assert.equal(await stateOf('claim', claimId), 'OPEN');
  await assert.rejects(() => q(`UPDATE claim SET asset_origin_id = 'X' WHERE id = $1`, [claimId]), /imutável/);
  await assert.rejects(() => q(`DELETE FROM claim WHERE id = $1`, [claimId]), /append-only/);
  await assert.rejects(() => q(`UPDATE entity_transition SET reason = 'x'`), /append-only/);
});

test('teste 12 (banco): claim REJECTED não continua o workflow', { skip }, async () => {
  const claimId = await newClaim(await newClaimant());
  await move('claim', claimId, 'DRAFT', 'OPEN');
  await move('claim', claimId, 'OPEN', 'REJECTED', 'documentação incompatível com a cadeia');
  for (const to of ['OPEN', 'UNDER_ANALYSIS', 'VALIDATION_REQUESTED', 'RECOGNIZED', 'LITIGATION']) {
    await assert.rejects(() => move('claim', claimId, 'REJECTED', to), /não é permitida/, to);
  }
});

test('Claim não vira direito reconhecido sem ClaimValidation CONFIRMED com confirmação real', { skip }, async () => {
  const claimId = await newClaim(await newClaimant());
  await claimToValidationRequested(claimId);
  await assert.rejects(() => move('claim', claimId, 'VALIDATION_REQUESTED', 'RECOGNIZED'), /ClaimValidation CONFIRMED/);
  // SIMULATION chega a CONFIRMED na tabela, mas a validação não confirma com ela
  const simEv = await newEvidence();
  const sim = await newConfirmation({ subjectId: claimId, source: 'SIMULATION', method: 'SIMULATED', evidenceId: simEv });
  assert.equal(await stateOf('external_confirmation', sim), 'CONFIRMED');
  const v1 = (await one(`INSERT INTO claim_validation (claim_id, external_confirmation_id) VALUES ($1,$2) RETURNING id`, [claimId, sim])).id;
  await assert.rejects(() => move('claim_validation', v1, 'REQUESTED', 'CONFIRMED'), /SIMULATION não vale/);
  // extrato enviado pelo reclamante (LEGACY_EVIDENCE) também não confirma
  const legacyEv = await newEvidence('LEGACY_EVIDENCE', 'CLAIMANT_UPLOAD');
  const fake = await newConfirmation({ subjectId: claimId, evidenceId: legacyEv, ref: 'extrato-do-reclamante' });
  const v2 = (await one(`INSERT INTO claim_validation (claim_id, external_confirmation_id) VALUES ($1,$2) RETURNING id`, [claimId, fake])).id;
  await assert.rejects(() => move('claim_validation', v2, 'REQUESTED', 'CONFIRMED'), /confirmação externa válida/);
  await assert.rejects(() => q(`INSERT INTO recognized_right (claim_id, claim_validation_id, right_kind) VALUES ($1,$2,'BOOK_ENTRY_SHARES')`, [claimId, v2]), /exige RECOGNIZED/);
});

test('teste 13 (banco): RegisteredAsset exige confirmação externa de REGISTRO válida; caminho completo funciona só com ela', { skip }, async () => {
  const claimId = await newClaim(await newClaimant());
  await claimToValidationRequested(claimId);
  const conf = await newConfirmation({ subjectId: claimId, evidenceId: await newEvidence() });
  const val = (await one(`INSERT INTO claim_validation (claim_id, external_confirmation_id) VALUES ($1,$2) RETURNING id`, [claimId, conf])).id;
  await move('claim_validation', val, 'REQUESTED', 'CONFIRMED');
  await move('claim', claimId, 'VALIDATION_REQUESTED', 'RECOGNIZED');
  const rr = (await one(`INSERT INTO recognized_right (claim_id, claim_validation_id, right_kind, security_ref, quantity) VALUES ($1,$2,'BOOK_ENTRY_SHARES','BBAS3',3) RETURNING id`, [claimId, val])).id;
  // direito reconhecido não é ativo: registro exige pedido + confirmação de registro
  await assert.rejects(() => move('recognized_right', rr, 'RECOGNIZED', 'REGISTERED'), /não é permitida/);
  await move('recognized_right', rr, 'RECOGNIZED', 'REGISTRATION_REQUESTED');
  const req = (await one(`INSERT INTO registration_request (recognized_right_id, target_registry) VALUES ($1,'BOOKKEEPER') RETURNING id`, [rr])).id;
  const insertAsset = (confId) => q(`INSERT INTO registered_asset (recognized_right_id, registration_request_id, external_confirmation_id, system_of_record, account_reference)
                                     VALUES ($1,$2,$3,'x','conta-123')`, [rr, req, confId]);
  const regEv = await newEvidence();
  const bad = {
    simulation: await newConfirmation({ purpose: 'REGISTRATION', subjectType: 'registration_request', subjectId: req, source: 'SIMULATION', method: 'SIMULATED', evidenceId: regEv }),
    court: await newConfirmation({ purpose: 'REGISTRATION', subjectType: 'registration_request', subjectId: req, source: 'COURT', method: 'COURT_SYSTEM', evidenceId: regEv }),
    notConfirmed: await newConfirmation({ purpose: 'REGISTRATION', subjectType: 'registration_request', subjectId: req, evidenceId: regEv, confirm: false }),
    legacyEvidence: await newConfirmation({ purpose: 'REGISTRATION', subjectType: 'registration_request', subjectId: req, evidenceId: await newEvidence('LEGACY_EVIDENCE', 'CLAIMANT_UPLOAD') }),
    recognitionPurpose: conf,
  };
  for (const [label, confId] of Object.entries(bad)) {
    await assert.rejects(() => insertAsset(confId), /NO EXTERNAL CONFIRMATION|UNIQUE|unique/, label);
  }
  const good = await newConfirmation({ purpose: 'REGISTRATION', subjectType: 'registration_request', subjectId: req, evidenceId: regEv, ref: 'extrato-escriturador-2026-09' });
  await insertAsset(good);
  const asset = await one(`SELECT * FROM registered_asset WHERE recognized_right_id = $1`, [rr]);
  assert.equal(asset.system_of_record, 'BOOKKEEPER');
  assert.equal(asset.state, 'REGISTERED');
  await move('recognized_right', rr, 'REGISTRATION_REQUESTED', 'REGISTERED');
  // prova congelada após a decisão
  await assert.rejects(() => q(`UPDATE external_confirmation SET evidence_id = NULL WHERE id = $1`, [good]), /congelada/);
  await assert.rejects(() => q(`DELETE FROM registered_asset WHERE id = $1`, [asset.id]), /append-only/);
});

test('gate SQL e evaluateAssetGate (JS) concordam no mesmo conjunto de casos', { skip }, async () => {
  const claimId = await newClaim(await newClaimant());
  const ext = await newEvidence();
  const leg = await newEvidence('LEGACY_EVIDENCE', 'CLAIMANT_UPLOAD');
  const fixtures = [
    { label: 'real', source: 'BOOKKEEPER', method: 'FILE', evidenceId: ext },
    { label: 'simulation', source: 'SIMULATION', method: 'SIMULATED', evidenceId: ext },
    { label: 'legacy-evidence', source: 'BOOKKEEPER', method: 'FILE', evidenceId: leg },
    { label: 'no-evidence', source: 'COURT', method: 'COURT_SYSTEM', evidenceId: null },
    { label: 'pending', source: 'BOOKKEEPER', method: 'FILE', evidenceId: ext, confirm: false },
    { label: 'manual-no-approval', source: 'SUCCESSOR_ISSUER', method: 'MANUAL_ENTRY', evidenceId: ext },
  ];
  for (const f of fixtures) {
    const id = await newConfirmation({ subjectId: claimId, ...f });
    const row = await one(`SELECT c.*, e.evidence_class FROM external_confirmation c LEFT JOIN evidence e ON e.id = c.evidence_id WHERE c.id = $1`, [id]);
    const sql = (await one(`SELECT external_confirmation_satisfies_gate($1,'RIGHT_RECOGNITION','claim',$2) AS ok`, [id, claimId])).ok;
    const js = evaluateAssetGate({
      id: row.id, state: row.state, source: row.source, method: row.method, purpose: row.purpose, subjectType: row.subject_type,
      subjectId: row.subject_id, externalReference: row.external_reference, evidenceId: row.evidence_id, evidenceClass: row.evidence_class,
      expiresAt: row.expires_at, approvalId: row.approval_id,
    }, { purpose: 'RIGHT_RECOGNITION', subjectType: 'claim', subjectId: claimId }).ok;
    assert.equal(sql, js, `divergência no caso ${f.label}`);
    assert.equal(sql, f.label === 'real', f.label);
  }
});

test('teste 9 (banco): quatro-olhos por CHECK; gate de governança só muda com aprovação GATE_CHANGE, uma vez', { skip }, async () => {
  const ap = (await one(`INSERT INTO approval_request (action, subject_type, subject_id, payload, reason, requested_by)
                         VALUES ('GATE_CHANGE','governance_gate','multi_issuer_research_gate','{"toState":"OPEN"}','teste de mecanismo de quatro-olhos',$1) RETURNING id`, [U1])).id;
  await assert.rejects(() => q(`UPDATE approval_request SET state='IN_REVIEW', reviewed_by=$1, reviewed_at=now() WHERE id=$2`, [U1, ap]), /approval_no_self_review/);
  await q(`UPDATE approval_request SET state='IN_REVIEW', reviewed_by=$1, reviewed_at=now() WHERE id=$2`, [U2, ap]);
  await assert.rejects(() => q(`UPDATE approval_request SET state='APPROVED', decision='APPROVED', approved_by=$1, approved_at=now() WHERE id=$2`, [U1, ap]), /approval_no_self_approval/);
  await assert.rejects(() => q(`UPDATE governance_gate SET state='OPEN' WHERE key='multi_issuer_research_gate'`), /GATE_CHANGE/);
  await assert.rejects(() => q(`UPDATE governance_gate SET state='OPEN', changed_by_approval_id=$1 WHERE key='multi_issuer_research_gate'`, [ap]), /GATE_CHANGE/, 'pedido ainda não aprovado');
  await q(`UPDATE approval_request SET state='APPROVED', decision='APPROVED', approved_by=$1, approved_at=now() WHERE id=$2`, [U3, ap]);
  await assert.rejects(() => q(`UPDATE approval_request SET decision_notes='muda depois' WHERE id=$1`, [ap]), /imutável/);
  await q(`UPDATE governance_gate SET state='OPEN', changed_by_approval_id=$1 WHERE key='multi_issuer_research_gate'`, [ap]);
  await assert.rejects(() => q(`UPDATE governance_gate SET state='CLOSED', changed_by_approval_id=$1 WHERE key='multi_issuer_research_gate'`, [ap]), /GATE_CHANGE|utilizada/);
  await assert.rejects(() => q(`DELETE FROM approval_request WHERE id=$1`, [ap]), /append-only/);
});

test('testes 3/4 (banco): opinião não vira fato; market_value só sobre ativo registrado', { skip }, async () => {
  const claimId = await newClaim(await newClaimant());
  const ev = await newEvidence('LEGACY_EVIDENCE', 'CLAIMANT_UPLOAD');
  await assert.rejects(() => q(`INSERT INTO valuation (value_type, subject_type, subject_id, amount, source, methodology, evidence_id, author, confidence, legal_status, effective_at)
                                 VALUES ('expert_estimate','claim',$1,793.36,'PRIVATE_APPRAISAL','laudo',$2,'perito',0.9,'EXTERNALLY_CONFIRMED',now())`, [claimId, ev]), /valuation_opinion_is_claim/);
  const est = (await one(`INSERT INTO valuation (value_type, subject_type, subject_id, amount, source, methodology, evidence_id, author, confidence, legal_status, effective_at)
                          VALUES ('expert_estimate','claim',$1,793.36,'PRIVATE_APPRAISAL','laudo',$2,'perito',0,'SOURCE_CLAIM',now()) RETURNING id`, [claimId, ev])).id;
  await assert.rejects(() => q(`INSERT INTO valuation (value_type, subject_type, subject_id, amount, source, methodology, evidence_id, author, confidence, legal_status, effective_at)
                                 VALUES ('market_value','claim',$1,3.71,'MARKET_DATA','cotação',$2,'x',1,'MARKET_OBSERVED',now())`, [claimId, ev]), /valuation_asset_only|só existe sobre RegisteredAsset/);
  await assert.rejects(() => q(`INSERT INTO valuation (value_type, subject_type, subject_id, amount, source, methodology, evidence_id, author, confidence, legal_status, effective_at, derived_from_id)
                                 VALUES ('market_value','registered_asset',$1,793.36,'MARKET_DATA','x',$2,'x',1,'MARKET_OBSERVED',now(),$3)`, [randomUUID(), ev, est]), /não pode originar/);
  await assert.rejects(() => q(`UPDATE valuation SET amount = 1 WHERE id = $1`, [est]), /append-only/);
});

test('evidência: conteúdo imutável, sem DELETE, hash único como original (duplicatas explícitas)', { skip }, async () => {
  const sha = 'b'.repeat(64);
  const id = (await one(`INSERT INTO evidence (evidence_class, origin, hash_status, sha256) VALUES ('LEGACY_EVIDENCE','CLAIMANT_UPLOAD','HASHED',$1) RETURNING id`, [sha])).id;
  await assert.rejects(() => q(`INSERT INTO evidence (evidence_class, origin, hash_status, sha256) VALUES ('LEGACY_EVIDENCE','CLAIMANT_UPLOAD','HASHED',$1)`, [sha]), /evidence_sha256_original_uniq/);
  await q(`INSERT INTO evidence (evidence_class, origin, hash_status, sha256, duplicate_of) VALUES ('LEGACY_EVIDENCE','CLAIMANT_UPLOAD','HASHED',$1,$2)`, [sha, id]);
  await assert.rejects(() => q(`UPDATE evidence SET sha256 = $1 WHERE id = $2`, ['c'.repeat(64), id]), /imutável/);
  await assert.rejects(() => q(`DELETE FROM evidence WHERE id = $1`, [id]), /append-only/);
  await assert.rejects(() => q(`INSERT INTO evidence (evidence_class, origin, hash_status) VALUES ('LEGACY_EVIDENCE','CLAIMANT_UPLOAD','HASHED')`), /evidence_hash_consistent/);
});
