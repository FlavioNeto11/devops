// ADR-010, hardening P0 — privilégio mínimo do papel de runtime (sql/0008_runtime_role.sql).
// Defesa em profundidade: além dos triggers, o papel com que a API atende requisições NÃO consegue
// truncar, desligar/dropar trigger, alterar schema, mexer em governança, criar ativo nem escrever no
// marketplace. O catálogo de grants é conferido tabela a tabela: migration nova sem grant explícito
// (ou com grant a mais) falha aqui.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDisposablePg, usePgEnv, migrateAndPrepare, requirePgOrFail } from '../test-support/pg-docker.mjs';

const pgInst = await startDisposablePg();
const skip = requirePgOrFail(pgInst);
if (pgInst) usePgEnv(pgInst);

let db;
before(async () => { if (pgInst) db = await migrateAndPrepare(); });
after(async () => { if (!pgInst) return; await db?.closePools(); await pgInst.stop(); });

export const RUNTIME_WRITES = {
  INSERT: ['users', 'user_sessions', 'invitations', 'roles', 'role_permissions', 'user_roles', 'audit_event',
    'claimant', 'evidence', 'evidence_classification', 'claim', 'claim_evidence', 'entity_transition', 'valuation', 'approval_request'],
  UPDATE: ['users', 'user_sessions', 'invitations', 'rbac_meta', 'approval_request'],
  DELETE: ['roles', 'role_permissions', 'user_roles'],
};
const denied = /permission denied|must be owner|must be superuser|not allowed/i;

test('runtime conecta como besc_app, sem superusuário, com credencial própria', { skip }, async () => {
  const r = (await db.query('SELECT current_user AS cu, session_user AS su, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS sup')).rows[0];
  assert.equal(r.cu, 'besc_app');
  assert.equal(r.su, 'besc_app', 'modo login: a sessão é do próprio besc_app');
  assert.equal(r.sup, false);
  assert.equal(db.runtimeRoleInfo().mode, 'login');
});

test('catálogo de grants: SELECT em tudo, escrita só na lista, nunca TRUNCATE/TRIGGER/REFERENCES, nunca dono', { skip }, async () => {
  const { rows } = await db.getAdminPool().query(`
    SELECT c.relname AS t, pg_get_userbyid(c.relowner) AS owner,
           has_table_privilege('besc_app', c.oid, 'SELECT') AS s,
           has_table_privilege('besc_app', c.oid, 'INSERT') AS i,
           has_any_column_privilege('besc_app', c.oid, 'UPDATE') AS u,
           has_table_privilege('besc_app', c.oid, 'DELETE') AS d,
           has_table_privilege('besc_app', c.oid, 'TRUNCATE') AS tr,
           has_table_privilege('besc_app', c.oid, 'TRIGGER') AS tg,
           has_table_privilege('besc_app', c.oid, 'REFERENCES') AS rf
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1`);
  assert.ok(rows.length >= 45, `tabelas: ${rows.length}`);
  for (const r of rows) {
    assert.notEqual(r.owner, 'besc_app', `${r.t} pertence ao runtime`);
    assert.equal(r.s, true, `${r.t} sem SELECT`);
    assert.equal(r.tr || r.tg || r.rf, false, `${r.t} com TRUNCATE/TRIGGER/REFERENCES`);
    assert.equal(r.i, RUNTIME_WRITES.INSERT.includes(r.t), `${r.t}: INSERT inesperado (${r.i})`);
    assert.equal(r.u, RUNTIME_WRITES.UPDATE.includes(r.t), `${r.t}: UPDATE inesperado (${r.u})`);
    assert.equal(r.d, RUNTIME_WRITES.DELETE.includes(r.t), `${r.t}: DELETE inesperado (${r.d})`);
  }
  const schemaCreate = (await db.getAdminPool().query(`SELECT has_schema_privilege('besc_app', 'public', 'CREATE') AS c`)).rows[0].c;
  assert.equal(schemaCreate, false);
});

test('runtime não trunca nenhuma tabela, não altera schema, não desliga nem dropa trigger', { skip }, async () => {
  const tables = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).rows.map((r) => r.tablename);
  for (const t of tables) await assert.rejects(() => db.query(`TRUNCATE ${t} CASCADE`), denied, `TRUNCATE ${t}`);
  await assert.rejects(() => db.query('ALTER TABLE claim DISABLE TRIGGER ALL'), denied);
  await assert.rejects(() => db.query('ALTER TABLE audit_event DISABLE TRIGGER audit_event_immutable'), denied);
  await assert.rejects(() => db.query('DROP TRIGGER entity_transition_apply_trg ON entity_transition'), denied);
  await assert.rejects(() => db.query('ALTER TABLE evidence ADD COLUMN x int'), denied);
  await assert.rejects(() => db.query('CREATE TABLE intruso (id int)'), denied);
  await assert.rejects(() => db.query('CREATE OR REPLACE FUNCTION raise_append_only() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql'), denied);
  await assert.rejects(() => db.query(`SET session_replication_role = replica`), denied, 'desligaria os triggers');
  await assert.rejects(() => db.query('ALTER ROLE besc_app SUPERUSER'), denied);
});

test('runtime não muda estado por fora da transição, não apaga história, não mexe em governança', { skip }, async () => {
  await assert.rejects(() => db.query(`UPDATE claim SET state = 'RECOGNIZED'`), denied);
  await assert.rejects(() => db.query(`UPDATE evidence SET state = 'LINKED'`), denied);
  await assert.rejects(() => db.query(`DELETE FROM entity_transition`), denied);
  await assert.rejects(() => db.query(`DELETE FROM audit_event`), denied);
  await assert.rejects(() => db.query(`UPDATE governance_gate SET state = 'OPEN'`), denied);
  await assert.rejects(() => db.query(`INSERT INTO governance_gate (key, state) VALUES ('x', 'OPEN')`), denied);
  await assert.rejects(() => db.query(`DELETE FROM allowed_transition`), denied);
  await assert.rejects(() => db.query(`UPDATE approval_request SET requested_by = gen_random_uuid()`), denied, 'coluna fora da lista');
});

test('runtime não cria confirmação, direito reconhecido, pedido de registro nem ativo registrado', { skip }, async () => {
  for (const t of ['external_confirmation', 'claim_validation', 'recognized_right', 'registration_request', 'registered_asset']) {
    await assert.rejects(() => db.query(`INSERT INTO ${t} DEFAULT VALUES`), denied, t);
  }
});

test('runtime não escreve em nenhuma tabela do marketplace congelado', { skip }, async () => {
  for (const t of ['security_title', 'token_batch', 'tokenization_parameter', 'token_contract', 'wallet_position', 'wallets',
    'lease', 'fee', 'invoice', 'regulatory_gate_item', 'regulatory_gate_approval', 'title_access_grants', 'terms_acceptance', 'ledger_outbox']) {
    await assert.rejects(() => db.query(`INSERT INTO ${t} DEFAULT VALUES`), denied, t);
    await assert.rejects(() => db.query(`DELETE FROM ${t}`), denied, t);
  }
});

test('modo SET ROLE (sem senha própria): mesmos limites; e REQUIRE recusa esse modo', { skip }, async () => {
  const { config } = await import('../src/config.js');
  const saved = config.dbAppPassword;
  try {
    await db.closePools();
    config.dbAppPassword = '';
    const info = await db.prepareRuntimeRole();
    assert.equal(info.mode, 'set_role');
    const r = (await db.query('SELECT current_user AS cu, session_user AS su')).rows[0];
    assert.equal(r.cu, 'besc_app');
    await assert.rejects(() => db.query('TRUNCATE audit_event'), denied);
    await assert.rejects(() => db.query('ALTER TABLE claim DISABLE TRIGGER ALL'), denied);
    await assert.rejects(() => db.query(`SET session_replication_role = replica`), denied);
    // GAP documentado: neste modo a sessão pertence ao papel de migração; RESET ROLE devolveria os
    // privilégios dele a quem conseguisse executar SQL arbitrário. Por isso produção usa REQUIRE.
    assert.notEqual(r.su, 'besc_app');
    await db.closePools();
    config.requireAppRole = true;
    await assert.rejects(() => db.prepareRuntimeRole(), /BESC_DB_REQUIRE_APP_ROLE/);
  } finally {
    config.requireAppRole = false;
    config.dbAppPassword = saved;
    await db.closePools();
    await db.waitDbReady({ attempts: 3, delayMs: 100 });
    await db.prepareRuntimeRole();
  }
});
