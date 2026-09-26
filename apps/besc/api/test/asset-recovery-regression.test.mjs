// =============================================================================================
// ANTI-EXCALIBUR REGRESSION GATE (ADR-010). Impede que volte qualquer caminho equivalente a
//     LegacyEvidence → perícia → valor → tokens → marketplace.
// Cada teste abaixo afirma a regra DIRETAMENTE (não confia em outro arquivo). Exige Postgres: sem
// Docker nem TEST_PG_ADMIN_URL, o arquivo FALHA (não pula), salvo BESC_TEST_ALLOW_NO_PG=1.
// Se qualquer teste falhar, `npm test` falha e o CI falha.
// =============================================================================================
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDisposablePg, usePgEnv, requirePgOrFail } from '../test-support/pg-docker.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pgInst = await startDisposablePg();
const skip = requirePgOrFail(pgInst);

// ---- ambiente: banco descartável, IdP simulado, besc.json com um caso legado "perfeito" para fraude
const DATA = mkdtempSync(path.join(tmpdir(), 'besc-excalibur-'));
const LEGACY_ID = randomUUID(); const CERT_ID = randomUUID();
let idp;
if (pgInst) {
  usePgEnv(pgInst);
  process.env.DATA_DIR = DATA;
  for (const k of Object.keys(process.env)) if (/^(LEDGER_|BESU_)/.test(k)) delete process.env[k];
  const d = await import('../src/domain.js');
  const documents = d.instantiateDocuments();
  documents.find((x) => x.key === 'besc_share_certificate').attachments = [{ id: CERT_ID, filename: 'cautela.pdf', size: 10, mime: 'application/pdf', ext: '.pdf' }];
  const legacy = {
    id: LEGACY_ID, holder_name: 'Titular Excalibur', holder_type: 'pessoa_fisica', status: 'ready_for_structuring', estimated_value: '75.000.000,00',
    documents, legal: d.instantiateLegal(), tokenization: d.instantiateTokenization(), collateral: d.emptyCollateral(),
    pericia: { ...d.emptyPericia(), active: true, updated_value_pericial: '75.000.000,00', agio: '74.999.999,50', perito: 'Laudo Privado', authenticity_status: 'authentic' },
    lawsuits: [], precedents: [], statusHistory: [],
  };
  mkdirSync(path.join(DATA, 'uploads', LEGACY_ID), { recursive: true });
  writeFileSync(path.join(DATA, 'uploads', LEGACY_ID, `${CERT_ID}.pdf`), 'cautela 1987');
  writeFileSync(path.join(DATA, 'besc.json'), JSON.stringify({ cases: { [LEGACY_ID]: legacy }, library: {}, jurisprudence: {}, glossary: {}, catalogMeta: {} }));
  idp = http.createServer((req, res) => {
    const t = String(req.headers.authorization || '').replace(/^Bearer /, '');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ sub: t, email: `${t}@idp.localhost`, name: t }));
  }).listen(0);
  await new Promise((r) => idp.once('listening', r));
  process.env.KEYCLOAK_USERINFO_URL = `http://127.0.0.1:${idp.address().port}/userinfo`;
}

let server; let base; let db; let admin; let bootReport; const tok = {};
before(async () => {
  if (!pgInst) return;
  const store = await import('../src/store.js');
  await store.init();
  const { bootFoundation } = await import('../src/foundation/index.js');
  assert.equal(await bootFoundation(), true);
  bootReport = await (await import('../src/recovery/index.js')).bootRecovery();
  db = await import('../src/db.js');
  admin = db.getAdminPool();
  const { createAccessToken } = await import('@flavioneto11/oidc-kit');
  for (const [n, role] of [['a', 'manager'], ['b', 'manager'], ['root', 'admin']]) {
    const u = (await db.query(`INSERT INTO users (email, name, approval_status) VALUES ($1,$1,'active') RETURNING id`, [`${n}@excalibur.localhost`])).rows[0];
    await db.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = $2`, [u.id, role]);
    tok[n] = createAccessToken({ sub: u.id }, { secret: process.env.SESSION_SECRET, ttlSeconds: 600, prefix: 'besc_access' });
    if (n === 'a') tok.a2 = createAccessToken({ sub: u.id }, { secret: process.env.SESSION_SECRET, ttlSeconds: 600, prefix: 'besc_access' });
  }
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (!pgInst) return; server?.close(); idp?.close(); await db?.closePools(); await pgInst.stop(); });

const call = async (method, route, { who, body } = {}) => {
  const headers = { 'content-type': 'application/json' };
  if (who) headers.authorization = `Bearer ${tok[who]}`;
  const r = await fetch(base + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const DENIED = /permission denied|must be owner|must be superuser/i;

test('01 · LegacyEvidence nunca é RegisteredAsset (domínio, runtime e trigger)', { skip }, async () => {
  const inv = await import('../src/recovery/domain/invariants.js');
  assert.throws(() => inv.assertRegisteredAsset({ kind: 'LegacyEvidence', id: CERT_ID }));
  assert.throws(() => inv.toAsset({ kind: 'LegacyEvidence', id: CERT_ID }));
  const ev = (await admin.query('SELECT evidence_class FROM evidence WHERE id = $1', [CERT_ID])).rows[0];
  assert.equal(ev.evidence_class, 'LEGACY_EVIDENCE');
  await assert.rejects(() => db.query('INSERT INTO registered_asset DEFAULT VALUES'), DENIED, 'runtime não cria ativo');
  await assert.rejects(() => admin.query(`INSERT INTO registered_asset (recognized_right_id, registration_request_id, external_confirmation_id, security_ref, quantity)
    VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'BBAS3', 1)`), /registered_asset:/, 'o TRIGGER recusa (não a FK): nem o dono cria ativo sem cadeia confirmada');
});

test('02 · expert_estimate nunca vira market_value', { skip }, async () => {
  const { assertDerivationAllowed, createValuation } = await import('../src/recovery/domain/valuation.js');
  assert.throws(() => assertDerivationAllowed({ valueType: 'expert_estimate' }, 'market_value'), /OPINION_CANNOT_BECOME_FACT|não pode originar/);
  assert.throws(() => createValuation({ valueType: 'market_value', subjectType: 'claim', subjectId: LEGACY_ID, amount: 1, source: 'PRIVATE_APPRAISAL', methodology: 'x', author: 'x', effectiveAt: new Date().toISOString(), confidence: 1, legalStatus: 'MARKET_OBSERVED', evidenceId: CERT_ID }));
  const r = await call('POST', `/recovery/claims/${LEGACY_ID}/valuations`, { who: 'a', body: { valueType: 'market_value', amount: '75000000', currency: 'BRL', source: 'MARKET_DATA', methodology: 'x', confidence: '1', legalStatus: 'MARKET_OBSERVED' } });
  assert.equal(r.status, 409);
  await assert.rejects(() => admin.query(`INSERT INTO valuation (value_type, subject_type, subject_id, amount, source, methodology, author, confidence, legal_status, effective_at, evidence_id)
    VALUES ('market_value','claim',$1,1,'MARKET_DATA','x','x',1,'MARKET_OBSERVED',now(),$2)`, [LEGACY_ID, CERT_ID]), 'CHECK valuation_asset_only');
  const types = (await admin.query('SELECT DISTINCT value_type, legal_status FROM valuation')).rows;
  assert.ok(types.every((t) => ['claimed_value', 'expert_estimate'].includes(t.value_type) && t.legal_status === 'SOURCE_CLAIM'), JSON.stringify(types));
});

test('03 · claimed_value nunca vira recognized_value', { skip }, async () => {
  const { assertDerivationAllowed } = await import('../src/recovery/domain/valuation.js');
  assert.throws(() => assertDerivationAllowed({ valueType: 'claimed_value' }, 'recognized_value'));
  const r = await call('POST', `/recovery/claims/${LEGACY_ID}/valuations`, { who: 'a', body: { valueType: 'recognized_value', amount: '1', currency: 'BRL', source: 'EXTERNAL_CONFIRMATION', methodology: 'x', confidence: '1', legalStatus: 'EXTERNALLY_CONFIRMED' } });
  assert.equal(r.status, 409);
  await assert.rejects(() => admin.query(`INSERT INTO valuation (value_type, subject_type, subject_id, amount, source, methodology, author, confidence, legal_status, effective_at)
    VALUES ('recognized_value','claim',$1,1,'CLAIMANT','x','x',1,'SOURCE_CLAIM',now())`, [LEGACY_ID]), 'CHECK valuation_recognized_basis');
});

test('04 · SIMULATION nunca confirma ativo', { skip }, async () => {
  const { evaluateAssetGate } = await import('../src/recovery/domain/external-confirmation.js');
  const g = evaluateAssetGate({ source: 'SIMULATION', method: 'SIMULATED', state: 'CONFIRMED', purpose: 'REGISTRATION', subjectType: 'claim', subjectId: LEGACY_ID, evidence: { evidenceClass: 'EXTERNAL_EVIDENCE' }, externalReference: 'x' },
    { purpose: 'REGISTRATION', subjectType: 'claim', subjectId: LEGACY_ID });
  assert.equal(g.ok, false);
  assert.ok(g.reasons.includes('SOURCE_NOT_REAL') || g.reasons.includes('SIMULATED_METHOD'));
  const ev = (await admin.query(`INSERT INTO evidence (evidence_class, origin, hash_status, sha256) VALUES ('EXTERNAL_EVIDENCE','EXTERNAL_SYSTEM','HASHED',$1) RETURNING id`, [randomUUID().replace(/-/g, '').padEnd(64, 'a')])).rows[0].id;
  const conf = (await admin.query(`INSERT INTO external_confirmation (purpose, subject_type, subject_id, source, method, external_reference, evidence_id)
    VALUES ('RIGHT_RECOGNITION','claim',$1,'SIMULATION','SIMULATED','SIM-1',$2) RETURNING id`, [LEGACY_ID, ev])).rows[0].id;
  for (const [f, t] of [['REQUESTED', 'PENDING'], ['PENDING', 'CONFIRMED']]) {
    await admin.query(`INSERT INTO entity_transition (entity_type, entity_id, from_state, to_state, source, reason) VALUES ('external_confirmation',$1,$2,$3,'test','simulação')`, [conf, f, t]);
  }
  const ok = (await admin.query(`SELECT external_confirmation_satisfies_gate($1,'RIGHT_RECOGNITION','claim',$2) AS ok`, [conf, LEGACY_ID])).rows[0].ok;
  assert.equal(ok, false);
});

test('05 · ledger não é necessário para o boot', { skip }, async () => {
  const { config, legacyLedgerEnv } = await import('../src/config.js');
  assert.deepEqual(legacyLedgerEnv(), [], 'ambiente de teste sem LEDGER_*/BESU_*');
  assert.ok(!Object.keys(config).some((k) => /ledger|besu/i.test(k)));
  assert.equal((await call('GET', '/health')).json.ok, true, 'API no ar sem nenhum nó blockchain');
  const { getLedger } = await import('../src/ledger/port.js');
  const { SimulatedLedgerAdapter } = await import('../src/ledger/simulated.js');
  const { bootMarketplace } = await import('../src/marketplace/index.js');
  process.env.LEDGER_ADAPTER = 'besu'; process.env.BESU_RPC_URL = 'http://127.0.0.1:1';
  try { await bootMarketplace(); } finally { delete process.env.LEDGER_ADAPTER; delete process.env.BESU_RPC_URL; }
  assert.ok(getLedger() instanceof SimulatedLedgerAdapter, 'Besu nunca é armado');
});

test('06 · Besu não é implantado (kustomization lido pelo Argo)', { skip }, async () => {
  const k8s = path.join(HERE, '../../k8s');
  const kust = readFileSync(path.join(k8s, 'kustomization.yaml'), 'utf8');
  const res = [...kust.matchAll(/^\s*-\s*(\S+\.ya?ml)\s*$/gm)].map((m) => m[1]);
  assert.ok(res.length > 0 && !res.some((r) => /besu|ledger/i.test(r)), res.join(','));
  for (const r of res) {
    const live = readFileSync(path.join(k8s, r), 'utf8').split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n');
    assert.ok(!/besu|\b(LEDGER|BESU)_/i.test(live), r);
  }
  assert.ok(readdirSync(path.join(k8s, 'deprecated')).every((f) => !/\.ya?ml$/.test(f)));
});

test('07 · marketplace permanece 410, antes do login e com token de gestor', { skip }, async () => {
  const { FROZEN_ROUTES } = await import('../src/governance/legacy-freeze.js');
  for (const [m, r] of FROZEN_ROUTES) {
    const route = r.replace(/:[a-zA-Z]+/g, 'x');
    for (const who of [undefined, 'a', 'root']) {
      const res = await call(m.toUpperCase(), route, { who, body: m === 'get' ? undefined : { goLive: true } });
      assert.equal(res.status, 410, `${m} ${r} (${who || 'anônimo'})`);
    }
  }
});

test('08 · emissão de token permanece impossível (rota, domínio e banco)', { skip }, async () => {
  assert.equal((await call('POST', '/titles/x/batches', { who: 'root', body: { quantity: 1000 } })).status, 410);
  const { issueBatch } = await import('../src/marketplace/issuance.js');
  const out = await issueBatch('x', { quantity: 1 }, { userId: randomUUID(), role: 'admin' });
  assert.equal(out.status, 403);
  assert.equal(out.body.code, 'CAPABILITY_DISABLED');
  const { CAPABILITIES } = await import('../src/governance/capabilities.js');
  assert.ok(Object.isFrozen(CAPABILITIES) && Object.values(CAPABILITIES).every((v) => v === false));
  await assert.rejects(() => db.query('INSERT INTO token_batch DEFAULT VALUES'), DENIED);
  await assert.rejects(() => db.query('INSERT INTO tokenization_parameter DEFAULT VALUES'), DENIED);
});

test('09 · SSO novo não cria investor', { skip }, async () => {
  const r = await call('POST', '/auth/sso/exchange', { body: { accessToken: 'kc-excalibur' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.user.roles, []);
  const n = (await db.query(`SELECT count(*)::int n FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE u.keycloak_sub = 'kc-excalibur'`)).rows[0].n;
  assert.equal(n, 0);
  assert.equal((await admin.query(`SELECT count(*)::int n FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.key = 'investor'`)).rows[0].n, 0);
});

test('10 · conteúdo não classificado não é público', { skip }, async () => {
  const c = await call('POST', '/library', { who: 'a', body: { title: 'Cautela escaneada', kind: 'outro' } });
  assert.equal((await call('GET', `/library/${c.json.id}`)).status, 404);
  assert.ok(!(await call('GET', '/library')).json.some((it) => it.id === c.json.id));
  const bad = await call('PUT', `/library/${c.json.id}/curation`, { who: 'a', body: { sourceNature: 'UNKNOWN', publication: 'PUBLIC_SAFE', reason: 'tentativa de publicar' } });
  assert.equal(bad.status, 422);
  const { libraryClassification } = await import('../src/reference/content-overlay.js');
  assert.equal(libraryClassification({ id: 'qualquer' }).publication, 'RESTRICTED');
  assert.equal(libraryClassification({ id: 'x', curation: { sourceNature: 'UNKNOWN', publication: 'PUBLIC_SAFE' } }).publication, 'RESTRICTED');
});

test('11 · a mesma identidade não aprova o próprio ato (nem com outro token, nem sendo admin)', { skip }, async () => {
  for (const owner of ['a', 'root']) {
    const req = await call('POST', '/recovery/approvals', { who: owner, body: { action: 'RECOGNIZED_VALUATION', subjectType: 'claim', subjectId: LEGACY_ID, reason: 'reconhecer valor do laudo de 75 mi' } });
    const self = owner === 'a' ? 'a2' : 'root';
    assert.equal((await call('POST', `/recovery/approvals/${req.json.id}/review`, { who: self, body: {} })).status, 403);
    assert.equal((await call('POST', `/recovery/approvals/${req.json.id}/review`, { who: 'b', body: {} })).status, 200);
    assert.equal((await call('POST', `/recovery/approvals/${req.json.id}/decision`, { who: self, body: { decision: 'APPROVED' } })).status, 403);
  }
});

test('12 · runtime da aplicação não consegue TRUNCATE', { skip }, async () => {
  for (const t of ['audit_event', 'entity_transition', 'evidence', 'claim', 'valuation', 'governance_gate', 'registered_asset', 'users']) {
    await assert.rejects(() => db.query(`TRUNCATE ${t} CASCADE`), DENIED, t);
  }
});

test('13 · runtime da aplicação não consegue desabilitar triggers', { skip }, async () => {
  await assert.rejects(() => db.query('ALTER TABLE entity_transition DISABLE TRIGGER ALL'), DENIED);
  await assert.rejects(() => db.query('ALTER TABLE registered_asset DISABLE TRIGGER USER'), DENIED);
  await assert.rejects(() => db.query('DROP TRIGGER entity_transition_guard_trg ON entity_transition'), DENIED);
  await assert.rejects(() => db.query('SET session_replication_role = replica'), DENIED);
  assert.equal((await db.query('SELECT current_user AS u')).rows[0].u, 'besc_app');
});

test('14 · migração é idempotente (schema e boot)', { skip }, async () => {
  assert.equal(bootReport.MIGRATED, 1);
  const { applied } = await (await import('../src/db/migrate.js')).runMigrations();
  assert.deepEqual(applied, []);
  const count = async () => (await admin.query(`SELECT (SELECT count(*) FROM claim) + (SELECT count(*) FROM evidence) + (SELECT count(*) FROM valuation) + (SELECT count(*) FROM entity_transition) AS n`)).rows[0].n;
  const before2 = await count();
  const again = await (await import('../src/recovery/index.js')).bootRecovery();
  assert.equal(again.MIGRATED + again.UPDATED, 0);
  assert.equal(again.ALREADY_MIGRATED, 1);
  assert.equal(await count(), before2);
});

test('15 · nenhuma migration cria RegisteredAsset a partir de caso legado', { skip }, async () => {
  // o caso "perfeito para fraude" (apto, laudo de 75 mi, cautela autêntica) virou só POSSÍVEL DIREITO
  const claim = (await admin.query('SELECT state FROM claim WHERE id = $1', [LEGACY_ID])).rows[0];
  assert.equal(claim.state, 'UNDER_ANALYSIS');
  for (const t of ['recognized_right', 'registration_request', 'registered_asset', 'claim_validation']) {
    assert.equal((await admin.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n, 0, t);
  }
  const vals = (await admin.query('SELECT value_type, legal_status FROM valuation WHERE subject_id = $1', [LEGACY_ID])).rows;
  assert.deepEqual(vals.map((v) => v.value_type).sort(), ['claimed_value', 'expert_estimate']);
  assert.ok(vals.every((v) => v.legal_status === 'SOURCE_CLAIM'));
  // e nenhum arquivo de migration escreve nas tabelas de direito/ativo ou abre gate
  const sqlDir = path.join(HERE, '../sql');
  for (const f of readdirSync(sqlDir).filter((x) => x.endsWith('.sql'))) {
    const sql = readFileSync(path.join(sqlDir, f), 'utf8').replace(/--.*$/gm, '');
    assert.ok(!/INSERT\s+INTO\s+(registered_asset|recognized_right|registration_request|claim_validation|external_confirmation)\b/i.test(sql), `${f} insere em tabela de direito/ativo`);
    assert.ok(!/UPDATE\s+governance_gate/i.test(sql), `${f} altera gate de governança`);
  }
});

test('16 · NO GOVERNANCE MUTATION API IN F1/F2: gates e capacidades só leem, e nascem fechados', { skip }, async () => {
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const r of ['/recovery/gates', '/recovery/gates/multi_issuer_research_gate', '/governance/gates', '/capabilities']) {
      const res = await call(m, r, { who: 'root', body: { state: 'OPEN' } });
      assert.ok([404, 405, 410].includes(res.status), `${m} ${r} → ${res.status}`);
    }
  }
  const { createApp } = await import('../src/app.js');
  const app = createApp();
  const routes = (app._router?.stack || app.router?.stack || []).filter((l) => l.route).flatMap((l) => Object.keys(l.route.methods).map((m) => [m, l.route.path]));
  assert.ok(routes.length > 60, `varredura de rotas vazia (${routes.length})`);
  const mut = routes.filter(([m, p]) => m !== 'get' && /gate|capabilit|governance/i.test(p));
  const { FROZEN_ROUTES } = await import('../src/governance/legacy-freeze.js');
  const frozen = new Set(FROZEN_ROUTES.map(([m, p]) => `${m} ${p}`));
  assert.deepEqual(mut.filter(([m, p]) => !frozen.has(`${m} ${p}`)), [], 'rota de mutação de governança fora do congelamento');
  assert.equal((await admin.query(`SELECT state FROM governance_gate WHERE key = 'multi_issuer_research_gate'`)).rows[0].state, 'CLOSED');
  await assert.rejects(() => db.query(`UPDATE governance_gate SET state = 'OPEN'`), DENIED);
  const cl = await call('POST', '/recovery/claimants', { who: 'a', body: { personType: 'PF', displayName: 'Reclamante Nossa Caixa' } });
  const other = await call('POST', '/recovery/claims', { who: 'a', body: { claimantId: cl.json.id, assetOriginId: 'NOSSA_CAIXA' } });
  assert.equal(other.status, 409, 'gate multi-emissor fechado recusa outra origem');
});

test('17 · rótulo e fonte do valor amarrados ao tipo: alegação nunca vira "confirmado", "mercado" ou "fato"', { skip }, async () => {
  const base = { amount: '75000000', currency: 'BRL', methodology: 'tentativa de rotular alegação', confidence: '1' };
  for (const body of [
    { valueType: 'historical_value', source: 'CORPORATE_DOCUMENT', legalStatus: 'EXTERNALLY_CONFIRMED', evidenceId: CERT_ID },
    { valueType: 'historical_value', source: 'HISTORICAL_QUOTE', legalStatus: 'MARKET_OBSERVED', evidenceId: CERT_ID },
    { valueType: 'claimed_value', source: 'MARKET_DATA', legalStatus: 'SOURCE_CLAIM' },
    { valueType: 'claimed_value', source: 'EXTERNAL_CONFIRMATION', legalStatus: 'SOURCE_CLAIM' },
    { valueType: 'expert_estimate', source: 'EXECUTION', legalStatus: 'SOURCE_CLAIM', evidenceId: CERT_ID },
  ]) {
    const r = await call('POST', `/recovery/claims/${LEGACY_ID}/valuations`, { who: 'a', body: { ...base, ...body } });
    assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(body)} → ${r.status}`);
  }
  await assert.rejects(() => admin.query(`INSERT INTO valuation (value_type, subject_type, subject_id, amount, source, methodology, author, confidence, legal_status, effective_at, evidence_id)
    VALUES ('historical_value','claim',$1,1,'CORPORATE_DOCUMENT','x','x',1,'EXTERNALLY_CONFIRMED',now(),$2)`, [LEGACY_ID, CERT_ID]), /valuation_label_by_type/);
  await assert.rejects(() => admin.query(`INSERT INTO valuation (value_type, subject_type, subject_id, amount, source, methodology, author, confidence, legal_status, effective_at)
    VALUES ('claimed_value','claim',$1,1,'MARKET_DATA','x','x',1,'SOURCE_CLAIM',now())`, [LEGACY_ID]), /valuation_source_by_type/);
});

test('18 · nenhuma evidência é "decisão definitiva" em F1/F2 (trânsito só se verifica na F4)', { skip }, async () => {
  const r = await call('POST', `/recovery/evidence/${CERT_ID}/classifications`, { who: 'a', body: { documentKind: 'COURT_DECISION', sourceNature: 'FINAL_COURT_DECISION', originCandidate: 'BESC', reason: 'tentar marcar como transitado' } });
  assert.ok(r.status >= 400 && r.status < 500, `→ ${r.status}`);
  await assert.rejects(() => admin.query(`INSERT INTO evidence_classification (evidence_id, document_kind, source_nature) VALUES ($1,'COURT_DECISION','FINAL_COURT_DECISION')`, [CERT_ID]),
    /classification_no_final_decision_in_f2/);
  const { SOURCE_NATURES } = await import('../src/recovery/domain/source-claims.js');
  const { statement } = await import('../src/recovery/domain/source-claims.js');
  // sem referência de fonte verificável, nem "decisão definitiva" vira fato da plataforma
  assert.equal(statement({ id: 'x', text: 'y', nature: 'FINAL_COURT_DECISION' }).verification, 'SOURCE_CLAIM');
  assert.equal(SOURCE_NATURES.NON_FINAL_COURT_DECISION.canBeFact, false);
});
