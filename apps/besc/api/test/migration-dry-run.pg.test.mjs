// ADR-010, hardening P1 — DRY RUN da migração de produção, sem cluster.
// Estado anterior simulado: schema 0001–0005 (idêntico ao commit-base 61b8cd6c) com dados de
// identidade/RBAC antigos (papel investor com permissões, trilha v1) + um besc.json representativo
// (casos em todos os status, perícias, valores em pt-BR, anexos reais, duplicata, arquivo ausente,
// id de anexo fora do padrão, id de caso legado, caso do carregador seed-cases).
// Depois: 0006 → 0010 → migração de boot, DUAS vezes. A segunda execução tem de produzir ZERO
// duplicações. Relatório em BESC_DRY_RUN_REPORT (se definido).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDisposablePg, usePgEnv, requirePgOrFail } from '../test-support/pg-docker.mjs';

const pgInst = await startDisposablePg();
const skip = requirePgOrFail(pgInst);
const DATA = mkdtempSync(path.join(tmpdir(), 'besc-dryrun-'));
if (pgInst) { usePgEnv(pgInst); process.env.DATA_DIR = DATA; delete process.env.BESC_MIGRATE_SEEDED_CASES; }
const SQL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql');
const BASE_FILES = ['0001_identity_rbac.sql', '0002_audit.sql', '0003_marketplace.sql', '0004_portals.sql', '0005_receita_gate.sql'];

// ---------- snapshot representativo do besc.json ----------
const docs = (await import('../src/domain.js'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const cases = {}; const files = [];
function mkCase({ id = randomUUID(), status, holder, estimated, pericia, notes = '', attachments = [] }) {
  const documents = docs.instantiateDocuments();
  for (const a of attachments) {
    const d = documents.find((x) => x.key === a.docKey);
    d.attachments = d.attachments || [];
    d.attachments.push({ id: a.id, filename: a.filename, size: a.content ? a.content.length : 0, mime: 'application/pdf', ext: '.pdf', uploadedAt: '2026-08-01T00:00:00Z' });
    if (a.content !== null) files.push({ caseId: id, attId: a.id, content: a.content });
  }
  cases[id] = {
    id, holder_name: holder, holder_type: 'pessoa_fisica', status, estimated_value: estimated, notes,
    share_class: 'PNB', share_quantity: 5264, right_type: 'acionario_remanescente',
    documents, legal: docs.instantiateLegal(), tokenization: docs.instantiateTokenization(), collateral: docs.emptyCollateral(),
    pericia: pericia ? { ...docs.emptyPericia(), active: true, ...pericia } : docs.emptyPericia(),
    lawsuits: [], precedents: [], statusHistory: [], createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
  };
  return id;
}
const same = Buffer.from('cautela BESC 1984 nº 000123 — digitalização');
const C = {
  novo: mkCase({ status: 'new', holder: 'Titular A', estimated: '150.000,00', pericia: { updated_value_pericial: '1.234.567,89', perito: 'Laudo Privado X', agio: '1.000.000,00' },
    attachments: [{ id: randomUUID(), docKey: 'besc_share_certificate', filename: 'cautela.pdf', content: same }, { id: randomUUID(), docKey: 'valuation_report', filename: 'laudo.pdf', content: Buffer.from('laudo') }] }),
  analise: mkCase({ status: 'legal_review', holder: 'Titular B', estimated: 'R$ 10.000',
    attachments: [{ id: randomUUID(), docKey: 'besc_share_certificate', filename: 'copia.pdf', content: same }] }),
  arquivado: mkCase({ status: 'archived', holder: 'Titular C', estimated: '' }),
  inelegivel: mkCase({ status: 'not_eligible', holder: 'Titular D', estimated: 'a combinar' }),
  semeado: mkCase({ status: 'new', holder: 'Parte (Sorocaba/SP)', estimated: '', notes: 'Origem: acervo. [caso-fonte:SP Renata Sorocaba]',
    attachments: [{ id: randomUUID(), docKey: 'sentence', filename: 'sentenca.pdf', content: Buffer.from('sentença') }] }),
  ausente: mkCase({ status: 'docs_incomplete', holder: 'Titular E', estimated: '2.500,50',
    attachments: [{ id: randomUUID(), docKey: 'share_statement', filename: 'extrato.pdf', content: null }] }),
  ressalvas: mkCase({ status: 'ready_with_caveats', holder: 'Titular F', estimated: '99.999,99', pericia: { updated_value_pericial: '500.000,00', perito: '' },
    attachments: [{ id: 'att-legado-1', docKey: 'besc_share_certificate', filename: 'antigo.pdf', content: Buffer.from('id fora do padrão') }] }),
  idLegado: mkCase({ id: 'caso-antigo-8', status: 'awaiting_opinion', holder: 'Titular G', estimated: '1.000,00' }),
};
mkdirSync(DATA, { recursive: true });
writeFileSync(path.join(DATA, 'besc.json'), JSON.stringify({ cases, library: {}, jurisprudence: {}, glossary: {}, catalogMeta: {} }, null, 2));
for (const f of files) { mkdirSync(path.join(DATA, 'uploads', f.caseId), { recursive: true }); writeFileSync(path.join(DATA, 'uploads', f.caseId, `${f.attId}.pdf`), f.content); }
const casesHash = sha(JSON.stringify(cases));
const uploadsBefore = files.map((f) => ({ p: path.join(DATA, 'uploads', f.caseId, `${f.attId}.pdf`), h: sha(f.content) }));

let admin; let db; let store; let recovery; const report = { runs: [] };
const COUNT_TABLES = ['claimant', 'claim', 'evidence', 'evidence_classification', 'claim_evidence', 'entity_transition', 'valuation', 'audit_event',
  'external_confirmation', 'claim_validation', 'recognized_right', 'registration_request', 'registered_asset'];
const counts = async () => Object.fromEntries(await Promise.all(COUNT_TABLES.map(async (t) => [t, (await admin.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n])));

before(async () => {
  if (!pgInst) return;
  const pg = (await import('pg')).default;
  admin = new pg.Pool({ connectionString: pgInst.url, max: 2 });
  // estado anterior: 0001–0005 + dados de identidade antigos
  await admin.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of BASE_FILES) { await admin.query(readFileSync(path.join(SQL_DIR, f), 'utf8')); await admin.query('INSERT INTO schema_migrations (version) VALUES ($1)', [f]); }
  await admin.query(`INSERT INTO permissions (key, label, category, is_sensitive) VALUES ('contracts:read','carteira','investidor',false),('content:read','portal','conteudo',false)`);
  await admin.query(`INSERT INTO roles (key, label, is_system) VALUES ('investor','Investidor',true)`);
  await admin.query(`INSERT INTO role_permissions (role_id, permission_key, scope) SELECT id, 'contracts:read', 'own' FROM roles WHERE key = 'investor'`);
  const u = (await admin.query(`INSERT INTO users (email, name, approval_status) VALUES ('investidor-antigo@dryrun.localhost','Antigo','active') RETURNING id`)).rows[0];
  await admin.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = 'investor'`, [u.id]);
  for (let i = 0; i < 3; i++) await admin.query(`SELECT append_audit_event(now(), NULL, 'system', NULL, 'case.updated', 'case', $1, '{}'::jsonb)`, [`c-${i}`]);
  report.previousUserId = u.id;
  store = await import('../src/store.js');
  await store.init();
  db = await import('../src/db.js');
  recovery = await import('../src/recovery/index.js');
});
after(async () => { if (!pgInst) return; await admin?.end(); await db?.closePools(); await pgInst.stop(); });

async function bootOnce(label) {
  const { bootFoundation } = await import('../src/foundation/index.js');
  await db.closePools();
  assert.equal(await bootFoundation(), true, 'fundação sobe');
  const r = await recovery.bootRecovery();
  const c = await counts();
  report.runs.push({ label, recovery: r, counts: c });
  return { r, c };
}

test('dry run: 0006→0010 aplicam sobre o estado anterior e a 1ª migração de boot preserva tudo', { skip }, async () => {
  const { r, c } = await bootOnce('primeira');
  const applied = (await admin.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map((x) => x.version);
  for (const f of ['0006_audit_v2.sql', '0007_asset_recovery.sql', '0008_runtime_role.sql', '0009_deprecate_investor_role.sql', '0010_claim_validation_phase_guard.sql']) assert.ok(applied.includes(f), f);
  // casos: 8 no snapshot, 1 do carregador seed-cases pulado por padrão (decisão do operador)
  assert.equal(r.MIGRATED, 7);
  assert.equal(r.SKIPPED_SEEDED_CASE, 1);
  assert.equal(r.FAILED, 0);
  assert.equal(c.claim, 7);
  assert.equal(c.claimant, 7);
  // ids preservados: todo caso com UUID vira claim de mesmo id; o id legado fica em legacy_case_id
  for (const [k, id] of Object.entries(C)) {
    if (k === 'semeado') { assert.equal((await admin.query('SELECT count(*)::int n FROM claim WHERE legacy_case_id = $1', [id])).rows[0].n, 0); continue; }
    const row = (await admin.query('SELECT id, state FROM claim WHERE legacy_case_id = $1', [id])).rows[0];
    assert.ok(row, `caso ${k} sem claim`);
    if (k !== 'idLegado') assert.equal(row.id, id, `${k}: id preservado`);
  }
  const st = async (k) => (await admin.query('SELECT state FROM claim WHERE legacy_case_id = $1', [C[k]])).rows[0].state;
  assert.equal(await st('novo'), 'EVIDENCE_GATHERING');
  assert.equal(await st('ausente'), 'EVIDENCE_GATHERING');
  assert.equal(await st('analise'), 'UNDER_ANALYSIS');
  assert.equal(await st('ressalvas'), 'UNDER_ANALYSIS');
  assert.equal(await st('idLegado'), 'UNDER_ANALYSIS');
  assert.equal(await st('arquivado'), 'DRAFT', 'migração não decide por ninguém');
  assert.equal(await st('inelegivel'), 'DRAFT');
  // anexos: 4 com id válido fora do caso semeado; o de id fora do padrão só é contado
  assert.equal(c.evidence, 4);
  for (const f of files.filter((x) => x.caseId !== C.semeado && x.attId !== 'att-legado-1')) {
    const ev = (await admin.query('SELECT id, evidence_class, storage_uri, hash_status, state FROM evidence WHERE id = $1', [f.attId])).rows[0];
    assert.ok(ev, `anexo ${f.attId} perdido`);
    assert.equal(ev.evidence_class, 'LEGACY_EVIDENCE');
    assert.equal(ev.storage_uri, `uploads/${f.caseId}/${f.attId}.pdf`);
  }
  const missing = (await admin.query(`SELECT hash_status FROM evidence WHERE legacy_case_id = $1`, [C.ausente])).rows[0];
  assert.equal(missing.hash_status, 'FILE_MISSING');
  const dup = (await admin.query(`SELECT state, duplicate_of FROM evidence WHERE legacy_case_id = $1`, [C.analise])).rows[0];
  assert.equal(dup.state, 'SUSPECT');
  assert.ok(dup.duplicate_of);
  // valores: só alegações; perícia → expert_estimate; valor estimado → claimed_value
  const vals = (await admin.query(`SELECT v.value_type, v.legal_status, v.source, v.amount::text AS amount, c.legacy_case_id FROM valuation v JOIN claim c ON c.id::text = v.subject_id`)).rows;
  assert.ok(vals.every((v) => ['claimed_value', 'expert_estimate'].includes(v.value_type) && v.legal_status === 'SOURCE_CLAIM'), JSON.stringify(vals));
  const byCase = (k, t) => vals.filter((v) => v.legacy_case_id === C[k] && v.value_type === t);
  assert.equal(byCase('novo', 'expert_estimate')[0].amount, '1234567.89000000');
  assert.equal(byCase('novo', 'expert_estimate')[0].source, 'PRIVATE_APPRAISAL');
  assert.equal(byCase('novo', 'claimed_value')[0].amount, '150000.00000000');
  assert.equal(byCase('ressalvas', 'expert_estimate').length, 1);
  assert.equal(byCase('inelegivel', 'claimed_value').length, 0, 'valor ilegível não vira número');
  // nada vira confirmação, direito reconhecido, pedido de registro nem ativo
  for (const t of ['external_confirmation', 'claim_validation', 'recognized_right', 'registration_request', 'registered_asset']) assert.equal(c[t], 0, t);
  assert.equal((await admin.query(`SELECT count(*)::int n FROM claim WHERE state IN ('VALIDATION_REQUESTED','RECOGNIZED','INCONCLUSIVE')`)).rows[0].n, 0);
  // trilha íntegra, papel antigo sem capacidade, besc.json e anexos intocados
  assert.equal((await admin.query('SELECT * FROM audit_chain_verify(NULL)')).rows[0].first_broken_id, null);
  assert.equal((await admin.query(`SELECT count(*)::int n FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.key = 'investor'`)).rows[0].n, 0);
  // nenhum caso perdido: o store continua com os mesmos 8 casos, conteúdo idêntico ao snapshot
  const onDisk = JSON.parse(readFileSync(path.join(DATA, 'besc.json'), 'utf8')).cases;
  assert.deepEqual(Object.keys(onDisk).sort(), Object.keys(cases).sort());
  assert.equal(sha(JSON.stringify(Object.fromEntries(Object.keys(cases).map((id) => [id, onDisk[id]])))), casesHash, 'casos alterados no besc.json');
  for (const u of uploadsBefore) assert.equal(sha(readFileSync(u.p)), u.h, 'anexo alterado');
});

test('dry run: 2ª execução completa (migrations + boot) produz ZERO duplicações', { skip }, async () => {
  const before2 = report.runs.at(-1).counts;
  const { r, c } = await bootOnce('segunda');
  assert.equal(r.MIGRATED, 0);
  assert.equal(r.UPDATED, 0);
  assert.equal(r.ALREADY_MIGRATED, 7);
  assert.equal(r.SKIPPED_SEEDED_CASE, 1);
  assert.deepEqual(c, before2, 'contagens idênticas: nenhuma linha nova em nenhuma tabela');
  const { applied } = await (await import('../src/db/migrate.js')).runMigrations();
  assert.deepEqual(applied, [], 'migrations idempotentes');
});

test('dry run: decisão explícita do operador inclui o caso semeado, e só uma vez', { skip }, async () => {
  const { config } = await import('../src/config.js');
  config.migrateSeededCases = 'migrate';
  try {
    const { r } = await bootOnce('semeados-incluidos');
    assert.equal(r.MIGRATED, 1);
    const { r: r2, c } = await bootOnce('semeados-incluidos-repeticao');
    assert.equal(r2.MIGRATED, 0);
    assert.equal(r2.ALREADY_MIGRATED, 8);
    assert.equal(c.claim, 8);
    assert.equal(c.registered_asset, 0);
  } finally { config.migrateSeededCases = 'skip'; }
  if (process.env.BESC_DRY_RUN_REPORT) writeFileSync(process.env.BESC_DRY_RUN_REPORT, JSON.stringify(report, null, 2));
  for (const u of uploadsBefore) assert.ok(existsSync(u.p), 'anexo sumiu');
});

test('dry run / rollback: o código antigo ainda grava trilha v1 no schema migrado (papel de migração)', { skip }, async () => {
  // O código do commit-base chama append_audit_event (v1) conectado como POSTGRES_USER.
  await admin.query(`SELECT append_audit_event(now(), NULL, 'system', NULL, 'case.updated', 'case', 'rollback-check', '{}'::jsonb)`);
  assert.equal((await admin.query('SELECT * FROM audit_chain_verify(NULL)')).rows[0].first_broken_id, null);
});
