// Passo 14 / testes 10 e 11: histórico não pode ser apagado; correção gera evento novo.
// Roda as migrations 0001–0007 num Postgres descartável e prova a trilha v2 no banco.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { startDisposablePg } from '../test-support/pg-docker.mjs';

const pgInst = await startDisposablePg();
const skip = pgInst ? false : 'Docker indisponível — teste de banco pulado';
if (pgInst) {
  process.env.DATABASE_URL = pgInst.url;
  process.env.SESSION_SECRET = 'test-secret';
}
after(async () => {
  if (!pgInst) return;
  const { getPool } = await import('../src/db.js');
  await getPool()?.end().catch(() => {});
  pgInst.stop();
});

const load = async () => ({
  db: await import('../src/db.js'),
  migrate: await import('../src/db/migrate.js'),
  audit: await import('../src/foundation/audit.js'),
});

test('migrations 0001–0007 aplicam do zero (regressão do schema legado incluída)', { skip }, async () => {
  const { migrate } = await load();
  const { applied } = await migrate.runMigrations();
  for (const f of ['0001_identity_rbac.sql', '0002_audit.sql', '0003_marketplace.sql', '0004_portals.sql', '0005_receita_gate.sql', '0006_audit_v2.sql', '0007_asset_recovery.sql']) {
    assert.ok(applied.includes(f), `${f} deveria ter sido aplicada`);
  }
});

test('cadeia v1 + v2 contínua e verificável no banco', { skip }, async () => {
  const { db, audit } = await load();
  await db.query(`SELECT append_audit_event(now(), NULL, 'system', NULL, 'case.created', 'case', 'c-legacy', '{"k":1}'::jsonb)`);
  await db.tx((c) => audit.appendAuditTx(c, { eventType: 'recovery.claim.created', entityType: 'claim', entityId: '11111111-1111-1111-1111-111111111111', payload: { state: 'DRAFT' }, source: 'test', reason: 'criação de claim de teste' }));
  await db.tx((c) => audit.appendAuditTx(c, { eventType: 'recovery.claim.created', entityType: 'claim', entityId: '22222222-2222-2222-2222-222222222222', payload: {}, source: 'test' }));
  const v = await audit.verifyAuditChain(db.query);
  assert.equal(v.ok, true, JSON.stringify(v));
  assert.ok(v.checked >= 3);
  const { rows } = await db.query(`SELECT schema_version, prev_hash, event_hash FROM audit_event ORDER BY id`);
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].prev_hash, rows[i - 1].event_hash, 'v2 encadeia sobre v1');
  assert.deepEqual(rows.map((r) => r.schema_version), [1, 2, 2]);
});

test('teste 10: histórico não pode ser apagado nem editado (UPDATE, DELETE, TRUNCATE)', { skip }, async () => {
  const { db } = await load();
  await assert.rejects(() => db.query(`UPDATE audit_event SET reason = 'x' WHERE id = 1`), /append-only|imutável/);
  await assert.rejects(() => db.query(`DELETE FROM audit_event WHERE id = 1`), /append-only|imutável/);
  await assert.rejects(() => db.query(`TRUNCATE audit_event CASCADE`), /append-only|imutável/);
  const { rows } = await db.query('SELECT count(*)::int AS n FROM audit_event');
  assert.equal(rows[0].n, 3);
});

test('teste 11: correção gera evento NOVO que aponta o original; o original fica intacto', { skip }, async () => {
  const { db, audit } = await load();
  const orig = (await db.query(`SELECT * FROM audit_event WHERE schema_version = 2 ORDER BY id LIMIT 1`)).rows[0];
  await assert.rejects(
    () => db.tx((c) => audit.appendAuditTx(c, { eventType: 'recovery.claim.created', entityType: 'claim', entityId: orig.entity_id, source: 'test', reason: 'corrigindo sem tipo corrected', correctsEventUid: orig.event_uid })),
    /corrected/,
  );
  await assert.rejects(
    () => db.tx((c) => audit.appendAuditTx(c, { eventType: 'recovery.event.corrected', entityType: 'claim', entityId: orig.entity_id, source: 'test', reason: 'curto', correctsEventUid: orig.event_uid })),
    /motivo/,
  );
  const corr = await db.tx((c) => audit.appendAuditTx(c, {
    eventType: 'recovery.event.corrected', entityType: 'claim', entityId: orig.entity_id, payload: { field: 'state', correctedTo: 'OPEN' },
    source: 'operator', reason: 'estado registrado incorretamente na criação', evidenceRef: 'evidence:abc', correctsEventUid: orig.event_uid,
  }));
  const after = (await db.query(`SELECT * FROM audit_event WHERE id = $1`, [orig.id])).rows[0];
  assert.deepEqual(after, orig, 'o evento original não muda');
  const row = (await db.query(`SELECT * FROM audit_event WHERE event_uid = $1`, [corr.uid])).rows[0];
  assert.equal(row.corrects_event_uid, orig.event_uid);
  assert.equal(row.source, 'operator');
  assert.equal(row.evidence_ref, 'evidence:abc');
  assert.equal((await audit.verifyAuditChain(db.query)).ok, true);
});

test('adulteração (com trigger desligado por superusuário) é detectada pelo verificador', { skip }, async () => {
  const { db, audit } = await load();
  const target = (await db.query(`SELECT id FROM audit_event WHERE schema_version = 2 ORDER BY id LIMIT 1`)).rows[0].id;
  await db.query('ALTER TABLE audit_event DISABLE TRIGGER audit_event_immutable');
  await db.query(`UPDATE audit_event SET reason = NULL WHERE id = $1`, [target]);
  await db.query('ALTER TABLE audit_event ENABLE TRIGGER audit_event_immutable');
  const v = await audit.verifyAuditChain(db.query);
  assert.equal(v.ok, false);
  assert.equal(v.firstBrokenId, Number(target));
  assert.equal(v.problem, 'event_hash', 'apagar o motivo (NULL) muda o hash: NULL e vazio não se confundem');
});
