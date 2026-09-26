// Domínio de Legacy Asset Recovery (ADR-010) — testes puros, sem banco.
// Numeração = lista obrigatória do Passo 17.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND, TRANSITIONS, STATES, canTransition, isTerminal, claimStage } from '../src/recovery/domain/model.js';
import { toAsset, assertRegisteredAsset, recognizeRight, registerAsset } from '../src/recovery/domain/invariants.js';
import { evaluateAssetGate, satisfiesAssetGate, SOURCES } from '../src/recovery/domain/external-confirmation.js';
import { createValuation, fromPrivateAppraisal, assertDerivationAllowed } from '../src/recovery/domain/valuation.js';
import { createApprovalRequest, review, decide, isApproved } from '../src/recovery/domain/four-eyes.js';
import { assertOriginAcceptsClaims, GATES } from '../src/recovery/domain/governance-gates.js';
import { getOrigin, detectOriginCandidates, ASSET_ORIGINS } from '../src/recovery/domain/asset-origins.js';
import { statement } from '../src/recovery/domain/source-claims.js';
import { collateralPort, custodyPort, settlementPort, regulatedRepresentationPort } from '../src/recovery/ports/index.js';

const U1 = '00000000-0000-0000-0000-00000000000a';
const U2 = '00000000-0000-0000-0000-00000000000b';
const U3 = '00000000-0000-0000-0000-00000000000c';

const cautela = { kind: KIND.legacy_evidence, id: 'ev-1', state: 'CLASSIFIED', documentKind: 'CERTIFICATE', sha256: 'a'.repeat(64) };
const claim = (state = 'VALIDATION_REQUESTED') => ({ kind: KIND.claim, id: 'claim-1', state, assetOriginId: 'BESC' });
const realConfirmation = (over = {}) => ({
  kind: KIND.external_confirmation, id: 'conf-1', state: 'CONFIRMED', source: 'BOOKKEEPER', method: 'OFFICIAL_CORRESPONDENCE',
  purpose: 'RIGHT_RECOGNITION', subjectType: 'claim', subjectId: 'claim-1', externalReference: 'OF-2026-001',
  evidenceId: 'ev-ext-1', evidenceClass: 'EXTERNAL_EVIDENCE', expiresAt: null, ...over,
});

// --- 1. uma cautela não vira Asset ---------------------------------------------------------
test('1. cautela (LegacyEvidence) não vira Asset por nenhum atalho', () => {
  assert.throws(() => toAsset(cautela), { code: 'NO_SHORTCUT_TO_ASSET' });
  assert.throws(() => assertRegisteredAsset(cautela), { code: 'NOT_A_REGISTERED_ASSET' });
  for (const port of [() => collateralPort.proposeGuarantee(cautela), () => custodyPort.openCustody(cautela),
    () => settlementPort.settle(cautela), () => regulatedRepresentationPort.represent(cautela)]) {
    assert.throws(port, { code: 'NOT_A_REGISTERED_ASSET' });
  }
  // nem forjando o kind: sem estado REGISTERED e sem confirmação externa, não passa
  assert.throws(() => assertRegisteredAsset({ ...cautela, kind: KIND.registered_asset }), { code: 'ASSET_NOT_ACTIVE' });
  assert.throws(() => assertRegisteredAsset({ ...cautela, kind: KIND.registered_asset, state: 'REGISTERED' }), { code: 'ASSET_WITHOUT_CONFIRMATION' });
});

// --- 2. um Claim não vira RegisteredAsset --------------------------------------------------
test('2. Claim não vira RegisteredAsset; RecognizedRight também não, sem registro confirmado', () => {
  assert.throws(() => toAsset(claim()), { code: 'NO_SHORTCUT_TO_ASSET' });
  assert.throws(() => collateralPort.proposeGuarantee(claim()), { code: 'NOT_A_REGISTERED_ASSET' });
  const right = recognizeRight({ id: 'rr-1', claim: claim(), confirmation: realConfirmation(), rightKind: 'BOOK_ENTRY_SHARES' });
  assert.equal(right.kind, KIND.recognized_right);
  assert.throws(() => toAsset(right), { code: 'NO_SHORTCUT_TO_ASSET' });
  assert.throws(() => registerAsset({ id: 'ra-1', recognizedRight: right, registrationRequest: null, confirmation: realConfirmation(), accountReference: 'x' }), { code: 'RIGHT_NOT_IN_REGISTRATION' });
  assert.equal(claimStage('RECOGNIZED'), 'CONFIRMED_RIGHT', 'direito confirmado ainda não é ativo registrado');
  assert.equal(claimStage('UNDER_ANALYSIS'), 'POSSIBLE_RIGHT');
});

// --- 3. perícia não confirma titularidade --------------------------------------------------
test('3. perícia privada não confirma titularidade nem reconhece direito', () => {
  const laudo = fromPrivateAppraisal({ subjectType: 'claim', subjectId: 'claim-1', amount: 793.36, author: 'perito privado', evidenceId: 'ev-laudo' });
  assert.equal(laudo.valueType, 'expert_estimate');
  assert.equal(laudo.legalStatus, 'SOURCE_CLAIM');
  assert.equal(laudo.confidence, 0);
  // um "laudo" apresentado como confirmação externa não passa o gate: não é fonte real nem evidência externa
  const laudoComoConfirmacao = realConfirmation({ source: 'SIMULATION', method: 'SIMULATED', evidenceId: 'ev-laudo', evidenceClass: 'LEGACY_EVIDENCE' });
  const g = evaluateAssetGate(laudoComoConfirmacao, { purpose: 'RIGHT_RECOGNITION', subjectType: 'claim', subjectId: 'claim-1' });
  assert.equal(g.ok, false);
  assert.ok(g.reasons.includes('EVIDENCE_NOT_EXTERNAL'));
  assert.throws(() => recognizeRight({ id: 'rr', claim: claim(), confirmation: laudoComoConfirmacao, rightKind: 'BOOK_ENTRY_SHARES' }), { code: 'EXTERNAL_CONFIRMATION_REQUIRED' });
  // e expert_estimate declarado como fato é recusado
  assert.throws(() => createValuation({ ...laudo, legalStatus: 'EXTERNALLY_CONFIRMED' }), { code: 'OPINION_IS_SOURCE_CLAIM' });
});

// --- 4. valuation privado não vira market_value automaticamente ----------------------------
test('4. valuation privado/alegado não vira recognized_value, market_value nem collateral_value', () => {
  const laudo = { ...fromPrivateAppraisal({ subjectType: 'claim', subjectId: 'claim-1', amount: 5200, author: 'perito', evidenceId: 'ev-laudo' }), id: 'val-1' };
  for (const toType of ['recognized_value', 'market_value', 'collateral_value', 'liquidation_value']) {
    assert.throws(() => assertDerivationAllowed(laudo, toType), { code: 'OPINION_CANNOT_BECOME_FACT' }, toType);
  }
  assert.throws(() => createValuation({
    valueType: 'market_value', subjectType: 'registered_asset', subjectId: 'ra-1', amount: 5200, source: 'MARKET_DATA', methodology: 'x',
    author: 'x', effectiveAt: new Date().toISOString(), confidence: 1, legalStatus: 'MARKET_OBSERVED', evidenceId: 'ev',
  }, { derivedFrom: laudo }), { code: 'OPINION_CANNOT_BECOME_FACT' });
  // market_value sobre Claim é recusado mesmo com fonte de mercado
  assert.throws(() => createValuation({
    valueType: 'market_value', subjectType: 'claim', subjectId: 'claim-1', amount: 3.71, source: 'MARKET_DATA', methodology: 'cotação',
    author: 'x', effectiveAt: new Date().toISOString(), confidence: 1, legalStatus: 'MARKET_OBSERVED', evidenceId: 'ev',
  }), { code: 'VALUE_REQUIRES_REGISTERED_ASSET' });
  // recognized_value sem confirmação externa e sem quatro-olhos é recusado
  assert.throws(() => createValuation({
    valueType: 'recognized_value', subjectType: 'claim', subjectId: 'claim-1', amount: 1, source: 'PRIVATE_APPRAISAL', methodology: 'x',
    author: 'x', effectiveAt: new Date().toISOString(), confidence: 1, legalStatus: 'EXTERNALLY_CONFIRMED', evidenceId: 'ev',
  }), { code: 'RECOGNIZED_NEEDS_CONFIRMATION' });
});

// --- 5. SIMULATION não satisfaz ExternalConfirmation ---------------------------------------
test('5. confirmação SIMULATION nunca satisfaz o gate, mesmo CONFIRMED e com evidência externa', () => {
  assert.ok(SOURCES.includes('SIMULATION'));
  const sim = realConfirmation({ source: 'SIMULATION', method: 'SIMULATED' });
  const g = evaluateAssetGate(sim, { purpose: 'RIGHT_RECOGNITION', subjectType: 'claim', subjectId: 'claim-1' });
  assert.equal(g.ok, false);
  assert.ok(g.reasons.includes('SOURCE_NOT_REAL'));
  assert.throws(() => recognizeRight({ id: 'rr', claim: claim(), confirmation: sim, rightKind: 'BOOK_ENTRY_SHARES' }), { code: 'EXTERNAL_CONFIRMATION_REQUIRED' });
  assert.equal(satisfiesAssetGate(realConfirmation(), { purpose: 'RIGHT_RECOGNITION', subjectType: 'claim', subjectId: 'claim-1' }), true);
  // demais motivos de recusa
  const cases = {
    NOT_CONFIRMED: { state: 'PENDING' }, EXPIRED: { expiresAt: '2000-01-01T00:00:00Z' }, NO_EVIDENCE: { evidenceId: null },
    NO_EXTERNAL_REFERENCE: { externalReference: ' ' }, WRONG_PURPOSE: { purpose: 'REGISTRATION' }, SUBJECT_MISMATCH: { subjectId: 'outro' },
    MANUAL_ENTRY_WITHOUT_FOUR_EYES: { method: 'MANUAL_ENTRY' },
  };
  for (const [reason, over] of Object.entries(cases)) {
    const r = evaluateAssetGate(realConfirmation(over), { purpose: 'RIGHT_RECOGNITION', subjectType: 'claim', subjectId: 'claim-1' });
    assert.equal(r.ok, false, reason);
    assert.ok(r.reasons.includes(reason), `${reason} ∉ ${r.reasons}`);
  }
  assert.equal(evaluateAssetGate(null).reasons[0], 'NO_EXTERNAL_CONFIRMATION');
});

// --- 9. criador não aprova o próprio ato sensível ------------------------------------------
test('9. quatro-olhos: quem cria não revisa nem aprova o próprio ato', () => {
  const req = createApprovalRequest({ id: 'ap-1', action: 'ASSET_MANUAL_CONFIRMATION', subjectType: 'external_confirmation', subjectId: 'conf-1', reason: 'extrato recebido por ofício' }, U1);
  assert.throws(() => review(req, U1), { code: 'SELF_REVIEW' });
  assert.throws(() => decide(req, U2, { decision: 'APPROVED' }), { code: 'INVALID_STATE' }, 'não aprova sem revisão');
  const reviewed = review(req, U2);
  assert.throws(() => decide(reviewed, U1, { decision: 'APPROVED' }), { code: 'SELF_APPROVAL' });
  const approved = decide(reviewed, U3, { decision: 'APPROVED' });
  assert.equal(isApproved(approved, { action: 'ASSET_MANUAL_CONFIRMATION', subjectId: 'conf-1' }), true);
  assert.throws(() => decide(approved, U3, { decision: 'REJECTED' }), { code: 'INVALID_STATE' }, 'decisão é final');
  assert.throws(() => createApprovalRequest({ id: 'x', action: 'MARKETPLACE_OPEN', subjectType: 'x', subjectId: 'x', reason: 'abrir o marketplace' }, U1), { code: 'UNKNOWN_ACTION' });
  // a confirmação manual só passa o gate com a aprovação correta
  const manual = realConfirmation({ method: 'MANUAL_ENTRY', approvalId: 'ap-1' });
  assert.equal(satisfiesAssetGate(manual, { purpose: 'RIGHT_RECOGNITION', subjectType: 'claim', subjectId: 'claim-1', approval: approved }), true);
  const selfApproved = { ...approved, approvedBy: U1 };
  assert.equal(satisfiesAssetGate(manual, { purpose: 'RIGHT_RECOGNITION', subjectType: 'claim', subjectId: 'claim-1', approval: selfApproved }), false);
});

// --- 12. claim rejeitado não continua o workflow -------------------------------------------
test('12. claim REJECTED (e WITHDRAWN) é terminal: nenhuma transição sai dele', () => {
  for (const terminal of ['REJECTED', 'WITHDRAWN', 'RECOGNIZED']) {
    assert.equal(isTerminal('claim', terminal), true, terminal);
    for (const to of STATES.claim) assert.equal(canTransition('claim', terminal, to), false, `${terminal} -> ${to}`);
  }
  assert.throws(() => recognizeRight({ id: 'rr', claim: claim('REJECTED'), confirmation: realConfirmation(), rightKind: 'BOOK_ENTRY_SHARES' }), { code: 'CLAIM_CLOSED' });
  // e não se pula etapa: DRAFT não vai direto a RECOGNIZED nem a VALIDATION_REQUESTED
  assert.equal(canTransition('claim', 'DRAFT', 'RECOGNIZED'), false);
  assert.equal(canTransition('claim', 'OPEN', 'VALIDATION_REQUESTED'), false);
  for (const [entity, pairs] of Object.entries(TRANSITIONS)) {
    for (const [f, t] of pairs) {
      assert.ok(STATES[entity].includes(f) && STATES[entity].includes(t), `${entity} ${f}->${t} usa estado conhecido`);
    }
  }
});

// --- 13. registered asset exige external confirmation válida -------------------------------
test('13. RegisteredAsset exige confirmação externa de REGISTRO válida', () => {
  const right = { ...recognizeRight({ id: 'rr-1', claim: claim(), confirmation: realConfirmation(), rightKind: 'BOOK_ENTRY_SHARES', securityRef: 'BBAS3', quantity: 3 }), state: 'REGISTRATION_REQUESTED' };
  const request = { kind: KIND.registration_request, id: 'req-1', recognizedRightId: 'rr-1', state: 'PENDING' };
  const regConf = (over = {}) => realConfirmation({ id: 'conf-reg', purpose: 'REGISTRATION', subjectType: 'registration_request', subjectId: 'req-1', ...over });
  const attempt = (confirmation, extra = {}) => registerAsset({ id: 'ra-1', recognizedRight: right, registrationRequest: request, confirmation, accountReference: 'conta-escritural-123', claim: claim('RECOGNIZED'), ...extra });
  assert.throws(() => attempt(null), { code: 'EXTERNAL_CONFIRMATION_REQUIRED' });
  assert.throws(() => attempt(regConf({ source: 'SIMULATION', method: 'SIMULATED' })), { code: 'EXTERNAL_CONFIRMATION_REQUIRED' });
  assert.throws(() => attempt(regConf({ source: 'COURT', method: 'COURT_SYSTEM' })), { code: 'EXTERNAL_CONFIRMATION_REQUIRED' }, 'tribunal reconhece direito, mas não confirma registro');
  assert.throws(() => attempt(realConfirmation()), { code: 'EXTERNAL_CONFIRMATION_REQUIRED' }, 'confirmação de reconhecimento não vale como registro');
  assert.throws(() => attempt(regConf({ evidenceClass: 'LEGACY_EVIDENCE' })), { code: 'EXTERNAL_CONFIRMATION_REQUIRED' }, 'extrato enviado pelo reclamante não confirma');
  assert.throws(() => attempt(regConf(), { accountReference: '' }), { code: 'ACCOUNT_REFERENCE_REQUIRED' });
  assert.throws(() => registerAsset({ id: 'ra', recognizedRight: { ...right, rightKind: 'LITIGIOUS_CREDIT' }, registrationRequest: request, confirmation: regConf(), accountReference: 'x' }), { code: 'RIGHT_NOT_REGISTRABLE' });
  const asset = attempt(regConf());
  assert.equal(asset.kind, KIND.registered_asset);
  assert.equal(asset.systemOfRecord, 'BOOKKEEPER');
  assert.equal(assertRegisteredAsset(asset), asset);
  // só agora as portas futuras aceitam o sujeito — e mesmo assim não fingem integração
  assert.throws(() => collateralPort.proposeGuarantee(asset), { code: 'NOT_AVAILABLE_IN_PHASE' });
  assert.throws(() => regulatedRepresentationPort.represent(asset), { code: 'CAPABILITY_DISABLED' });
});

// --- origens, gate multi-emissor e fonte das afirmações ------------------------------------
test('BESC é uma origem ACTIVE; demais origens RESEARCH_PENDING sem fatos cadastrados; gate multi-emissor CLOSED', () => {
  assert.equal(GATES.multi_issuer_research_gate.initial, 'CLOSED');
  const besc = getOrigin('BESC');
  assert.equal(besc.status, 'ACTIVE');
  assert.equal(besc.successor.id, 'BB');
  const conv = besc.corporateEvents.find((e) => e.id === 'besc-2009-conversao');
  assert.equal(conv.facts.ratioFrom, '12.13308922');
  assert.equal(besc.corporateEvents.find((e) => e.id === 'besc-1987-grupamento').verificationLevel, 'UNVERIFIED');
  for (const o of ASSET_ORIGINS.filter((x) => x.id !== 'BESC')) {
    assert.equal(o.status, 'RESEARCH_PENDING', o.id);
    assert.equal(o.corporateEvents.length, 0, `${o.id} não pode ter fatos não pesquisados`);
  }
  assert.equal(assertOriginAcceptsClaims('BESC').id, 'BESC');
  assert.throws(() => assertOriginAcceptsClaims('BANESPA'), { code: 'ORIGIN_RESEARCH_PENDING' });
  assert.throws(() => assertOriginAcceptsClaims('NOSSA_CAIXA', { multiIssuerGate: 'OPEN' }), { code: 'ORIGIN_RESEARCH_PENDING' });
  assert.deepEqual(detectOriginCandidates('cautela BANCO DO ESTADO DE SANTA CATARINA 1984').map((c) => c.originId), ['BESC']);
});

test('alegação de petição/material comercial/laudo não pode ser servida como fato da plataforma', () => {
  const s = statement({ id: 's1', text: 'as ações possuem notória liquidez', nature: 'PETITION', attributedTo: 'petição-modelo' });
  assert.equal(s.verification, 'SOURCE_CLAIM');
  assert.match(s.warning, /Alegação de fonte/);
  for (const nature of ['PETITION', 'COMMERCIAL_MATERIAL', 'PRIVATE_APPRAISAL', 'NON_FINAL_COURT_DECISION', 'CONSULTANCY']) {
    assert.throws(() => statement({ id: 'x', text: 't', nature, sourceRef: 'ref', verification: 'PLATFORM_VERIFIED_FACT' }), { code: 'CLAIM_CANNOT_BE_FACT' }, nature);
  }
  const fact = statement({ id: 'f', text: '1 ON BB para 12,13308922 ações BESC', nature: 'PRIMARY_CORPORATE_DOCUMENT', sourceRef: 'Protocolo 11/09/2008 item 5.2' });
  assert.equal(fact.verification, 'PLATFORM_VERIFIED_FACT');
  assert.throws(() => statement({ id: 'f2', text: 't', nature: 'PRIMARY_CORPORATE_DOCUMENT', verification: 'PLATFORM_VERIFIED_FACT' }), { code: 'FACT_NEEDS_SOURCE' });
});
