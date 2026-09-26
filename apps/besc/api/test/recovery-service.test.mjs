// Contrato do serviço de recuperação (F2): o MESMO roteiro roda contra o repositório em memória
// (sempre) e contra o Postgres descartável (quando há Docker). Inclui a migração dos casos legados.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startDisposablePg } from '../test-support/pg-docker.mjs';
import { createMemoryRecoveryRepo } from '../src/recovery/repo/memory.js';
import { createRecoveryService, parseBRL } from '../src/recovery/service.js';

const pgInst = await startDisposablePg();
if (pgInst) { process.env.DATABASE_URL = pgInst.url; process.env.SESSION_SECRET = 'test-secret'; }
let pgRepo = null;
if (pgInst) {
  await (await import('../src/db/migrate.js')).runMigrations();
  pgRepo = (await import('../src/recovery/repo/pg.js')).createPgRecoveryRepo();
}
after(async () => {
  if (!pgInst) return;
  await (await import('../src/db.js')).getPool()?.end().catch(() => {});
  pgInst.stop();
});

const dir = mkdtempSync(path.join(tmpdir(), 'besc-recovery-'));
const file = (name, content) => { const p = path.join(dir, `${randomUUID()}-${name}`); writeFileSync(p, content); return p; };
const A = { userId: randomUUID(), role: 'manager' };
const B = { userId: randomUUID(), role: 'manager' };
const C = { userId: randomUUID(), role: 'admin' };
const code = (c) => ({ code: c });

const REPOS = [['memória', () => createMemoryRecoveryRepo()], ['postgres', () => pgRepo]];

for (const [label, makeRepo] of REPOS) {
  const skip = label === 'postgres' && !pgInst ? 'Docker indisponível — contrato Postgres pulado' : false;

  test(`[${label}] jornada F2: evidência, classificação, vínculo e limites da fase`, { skip }, async () => {
    const svc = createRecoveryService({ repo: makeRepo() });
    const cert = `CT-${randomUUID().slice(0, 8)}`;
    const holder = await svc.createClaimant({ personType: 'PF', displayName: 'Titular A' }, A);
    const claim = await svc.createClaim({ claimantId: holder.id, claimKind: 'UNCONVERTED_POSITION' }, A);
    assert.equal(claim.state, 'OPEN');

    // upload: hash + origem candidata por heurística (candidato, nunca fato)
    const content = `cautela ${randomUUID()}`;
    const up1 = await svc.ingestEvidence({ id: randomUUID(), filePath: file('cautela.pdf', content), originalFilename: 'Cautela BESC 1984.pdf', claimId: claim.id }, A);
    assert.equal(up1.evidence.hashStatus, 'HASHED');
    assert.equal(up1.evidence.state, 'RECEIVED');
    assert.deepEqual(up1.originCandidates.map((o) => o.originId), ['BESC']);
    // o mesmo arquivo de novo: duplicata explícita e suspeita (antifraude: documento já usado)
    const up2 = await svc.ingestEvidence({ id: randomUUID(), filePath: file('copia.pdf', content), originalFilename: 'copia.pdf', claimId: claim.id }, A);
    assert.equal(up2.duplicateOf, up1.evidence.id);
    assert.equal(up2.evidence.state, 'SUSPECT');

    // classificar; reclassificar exige motivo e cria nova linha (correção = evento novo)
    const c1 = await svc.classifyEvidence(up1.evidence.id, { documentKind: 'CERTIFICATE', sourceNature: 'PRIMARY_CORPORATE_DOCUMENT', originCandidate: 'BESC', certificateNumber: cert, quantityWritten: '1.000.000' }, A);
    assert.equal(c1.state, 'LINKED');
    await assert.rejects(() => svc.classifyEvidence(up1.evidence.id, { documentKind: 'OLD_STATEMENT', sourceNature: 'UNKNOWN' }, A), code('REASON_REQUIRED'));
    const c2 = await svc.classifyEvidence(up1.evidence.id, { documentKind: 'CERTIFICATE', sourceNature: 'PRIMARY_CORPORATE_DOCUMENT', originCandidate: 'BESC', certificateNumber: cert, reason: 'quantidade transcrita errada na primeira leitura' }, A);
    assert.equal(c2.classification.supersedesId, c1.classification.id);
    // laudo privado nunca é classificado como fonte primária
    await assert.rejects(() => svc.classifyEvidence(up2.evidence.id, { documentKind: 'PRIVATE_APPRAISAL', sourceNature: 'PRIMARY_CORPORATE_DOCUMENT' }, A), code('APPRAISAL_NATURE'));

    // mesmo número de cautela apresentado por OUTRO reclamante -> SUSPECT
    const holder2 = await svc.createClaimant({ personType: 'PJ', displayName: 'Empresa B' }, B);
    const claim2 = await svc.createClaim({ claimantId: holder2.id }, B);
    const up3 = await svc.ingestEvidence({ id: randomUUID(), filePath: file('outra.pdf', `outra ${randomUUID()}`), originalFilename: 'outra.pdf', claimId: claim2.id }, B);
    const c3 = await svc.classifyEvidence(up3.evidence.id, { documentKind: 'CERTIFICATE', sourceNature: 'PRIMARY_CORPORATE_DOCUMENT', originCandidate: 'BESC', certificateNumber: cert }, B);
    assert.equal(c3.state, 'SUSPECT');

    // transições: F2 permite análise; RECOGNIZED/VALIDATION_REQUESTED exigem F4
    await svc.transitionClaim(claim.id, 'UNDER_ANALYSIS', 'análise da cadeia documental iniciada', A);
    await assert.rejects(() => svc.transitionClaim(claim.id, 'RECOGNIZED', 'o laudo diz que vale muito', A), code('NOT_AVAILABLE_IN_PHASE'));
    await assert.rejects(() => svc.transitionClaim(claim.id, 'VALIDATION_REQUESTED', 'pedir confirmação ao escriturador', A), code('NOT_AVAILABLE_IN_PHASE'));
    await assert.rejects(() => svc.transitionClaim(claim.id, 'LITIGATION', 'curto', A), code('REASON_REQUIRED'));

    // valuation: opinião entra como SOURCE_CLAIM; tipos de ativo exigem fases futuras
    const v = await svc.recordValuation(claim.id, { valueType: 'expert_estimate', amount: 793.36, source: 'PRIVATE_APPRAISAL', methodology: 'laudo apresentado pelo reclamante', author: 'perito privado', confidence: 0, legalStatus: 'SOURCE_CLAIM', evidenceId: up1.evidence.id }, A);
    assert.equal(v.legalStatus, 'SOURCE_CLAIM');
    await assert.rejects(() => svc.recordValuation(claim.id, { valueType: 'market_value', amount: 3.71 }, A), code('NOT_AVAILABLE_IN_PHASE'));
    await assert.rejects(() => svc.recordValuation(claim.id, { valueType: 'expert_estimate', amount: 1, source: 'PRIVATE_APPRAISAL', methodology: 'x', author: 'x', confidence: 1, legalStatus: 'EXTERNALLY_CONFIRMED', evidenceId: up1.evidence.id }, A), code('OPINION_IS_SOURCE_CLAIM'));

    // visão: possível direito; F3–F5 marcados como não disponíveis, nunca simulados
    const view = await svc.getClaimView(claim.id);
    assert.equal(view.claim.stage, 'POSSIBLE_RIGHT');
    assert.equal(view.claim.stageLabel, 'POSSÍVEL DIREITO');
    for (const step of view.journey.filter((s) => s.phase !== 'F2')) assert.equal(step.status, 'NOT_AVAILABLE_IN_PHASE', step.key);
    assert.ok(view.missingEvidence.some((m) => m.key === 'bookkeeper_statement' && m.phase === 'F4'));
    assert.equal(view.origin.id, 'BESC');
    assert.ok(!view.allowedTransitions.includes('RECOGNIZED'));

    // origem não pesquisada é recusada; claim rejeitado não continua
    await assert.rejects(() => svc.createClaim({ claimantId: holder.id, assetOriginId: 'BANESPA' }, A), code('ORIGIN_RESEARCH_PENDING'));
    await svc.transitionClaim(claim2.id, 'REJECTED', 'cautela em nome de terceiro sem cadeia de cessão', B);
    await assert.rejects(() => svc.transitionClaim(claim2.id, 'UNDER_ANALYSIS', 'tentar reabrir sem novo claim', B), code('CLAIM_CLOSED'));
    await assert.rejects(() => svc.linkEvidence(claim2.id, up1.evidence.id, 'SUPPORTING', B), code('CLAIM_CLOSED'));
  });

  test(`[${label}] quatro-olhos: pedido, revisão por outro, decisão por outro`, { skip }, async () => {
    const svc = createRecoveryService({ repo: makeRepo() });
    const req = await svc.requestApproval({ action: 'CHAIN_OF_TITLE_CHANGE', subjectType: 'claim', subjectId: randomUUID(), reason: 'ajuste do elo de sucessão por formal de partilha' }, A);
    await assert.rejects(() => svc.reviewApproval(req.id, {}, A), code('SELF_REVIEW'));
    await svc.reviewApproval(req.id, { notes: 'documentos conferidos' }, B);
    await assert.rejects(() => svc.decideApproval(req.id, { decision: 'APPROVED' }, A), code('SELF_APPROVAL'));
    const done = await svc.decideApproval(req.id, { decision: 'APPROVED' }, C);
    assert.equal(done.decision, 'APPROVED');
    await assert.rejects(() => svc.decideApproval(req.id, { decision: 'REJECTED' }, B), code('INVALID_STATE'));
  });

  test(`[${label}] migração LegacyCase: ids preservados, arquivo ausente, demo pulado, idempotente, sem decisão de domínio`, { skip }, async () => {
    const svc = createRecoveryService({ repo: makeRepo() });
    const files = mkdtempSync(path.join(tmpdir(), 'besc-legacy-'));
    const caseId = randomUUID(); const attPresent = randomUUID(); const attMissing = randomUUID();
    writeFileSync(path.join(files, `${attPresent}.pdf`), `cautela legada ${randomUUID()}`);
    const opts = { attachmentPath: (cid, aid, ext) => path.join(files, `${aid}${ext || ''}`), attachmentUri: (cid, aid, ext) => `uploads/${cid}/${aid}${ext || ''}` };
    const legacy = {
      id: caseId, holder_name: 'Titular Legado', holder_type: 'espolio', status: 'ready_for_structuring', right_type: 'acionario_remanescente',
      share_class: 'PNB', share_quantity: '51.516', estimated_value: 'R$ 40.870.733,76',
      pericia: { updated_value_pericial: 'R$ 793,36', perito: 'Perito X' },
      documents: [
        { key: 'besc_share_certificate', attachments: [{ id: attPresent, filename: 'cautela.pdf', ext: '.pdf', mime: 'application/pdf', size: 10 }] },
        { key: 'valuation_report', attachments: [{ id: attMissing, filename: 'laudo.pdf', ext: '.pdf', mime: 'application/pdf', size: 10 }] },
      ],
    };
    const r1 = await svc.migrateLegacyCase(legacy, opts);
    assert.equal(r1.status, 'MIGRATED');
    assert.equal(r1.claimId, caseId, 'id do caso preservado no claim');
    assert.equal(r1.counts.filesMissing, 1);
    const view = await svc.getClaimView(caseId);
    assert.equal(view.claim.state, 'UNDER_ANALYSIS', 'ready_for_structuring vira análise, nunca direito reconhecido');
    assert.equal(view.claim.stage, 'POSSIBLE_RIGHT');
    const ids = view.evidence.map((e) => e.id).sort();
    assert.deepEqual(ids, [attPresent, attMissing].sort(), 'ids dos anexos preservados');
    const missing = view.evidence.find((e) => e.id === attMissing);
    assert.equal(missing.hashStatus, 'FILE_MISSING');
    assert.equal(view.evidence.find((e) => e.id === attMissing).classification.sourceNature, 'PRIVATE_APPRAISAL');
    const est = view.valuations.find((x) => x.valueType === 'expert_estimate');
    assert.equal(Number(est.amount), 793.36);
    assert.equal(est.legalStatus, 'SOURCE_CLAIM');
    assert.equal(Number(view.valuations.find((x) => x.valueType === 'claimed_value').amount), 40870733.76);
    const r2 = await svc.migrateLegacyCase(legacy, opts);
    assert.equal(r2.status, 'ALREADY_MIGRATED');
    // anexo novo no caso legado depois da migração: re-rodar pega só ele
    const attNew = randomUUID();
    writeFileSync(path.join(files, `${attNew}.pdf`), `novo ${randomUUID()}`);
    legacy.documents[0].attachments.push({ id: attNew, filename: 'nova.pdf', ext: '.pdf' });
    const r3 = await svc.migrateLegacyCase(legacy, opts);
    assert.equal(r3.status, 'UPDATED');
    assert.equal(r3.counts.evidence, 1);
    // arquivado e não apto ficam em DRAFT (a migração não decide por ninguém)
    for (const status of ['archived', 'not_eligible']) {
      const id = randomUUID();
      const r = await svc.migrateLegacyCase({ id, holder_name: 'X', status, documents: [] }, opts);
      assert.equal((await svc.getClaimView(r.claimId)).claim.state, 'DRAFT', status);
    }
    // caso de demonstração semeado com nomes de partes públicas: não migra (LGPD)
    const demo = await svc.migrateLegacyCase({ id: randomUUID(), holder_name: 'Parte Pública (MT)', notes: '[caso-fonte:MT Valter Rossari]', documents: [] }, opts);
    assert.equal(demo.status, 'SKIPPED_DEMO_SEED');
  });
}

test('parseBRL: lê valores pt-BR e nunca inventa zero', () => {
  assert.equal(parseBRL('R$ 1.234,56'), 1234.56);
  assert.equal(parseBRL('793,36'), 793.36);
  assert.equal(parseBRL('abc'), null);
  assert.equal(parseBRL(''), null);
  assert.equal(parseBRL('0'), null);
});
