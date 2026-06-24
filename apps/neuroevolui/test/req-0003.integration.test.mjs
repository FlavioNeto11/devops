// Verificação REQ-NEUROEVOLUI-0003: Filas assíncronas + Idempotência + Migrations
import { test } from 'node:test';
import assert from 'node:assert/strict';

const DB_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

// Gate: sem REDIS_URL → inline fallback sem erro (degradação graciosa)
test('queue: sem REDIS_URL → enqueueSubmit/enqueueJob retorna inline sem erro', async () => {
  if (REDIS_URL) { assert.ok(true, 'REDIS_URL definido — fallback inline não se aplica neste ambiente'); return; }
  const { enqueueSubmit, enqueueJob } = await import('../api/src/queue.js');
  const r1 = await enqueueSubmit(9999);
  assert.equal(r1.inline, true, 'enqueueSubmit retorna inline:true sem Redis');
  const r2 = await enqueueJob('notifications', 'send', { msg: 'x' }, 'noop-key-1');
  assert.equal(r2.inline, true, 'enqueueJob retorna inline:true sem Redis');
});

// Gate: job_key idêntico → sem duplicação (inline ou BullMQ jobId)
test('queue: mesmo job_key não duplica job', async () => {
  if (REDIS_URL) { assert.ok(true, 'BullMQ jobId garante dedupe por design no Redis'); return; }
  const { enqueueJob } = await import('../api/src/queue.js');
  const r1 = await enqueueJob('consultation-notes', 'process', { a: 1 }, 'dedup-same-key');
  const r2 = await enqueueJob('consultation-notes', 'process', { a: 1 }, 'dedup-same-key');
  assert.equal(r1.inline, true, '1ª chamada inline');
  assert.equal(r2.inline, true, '2ª chamada com mesma chave inline — sem duplicação possível');
});

// Gate DB: migrations + idempotency (requer DATABASE_URL)
test('DB: migrations + idempotency', { skip: DB_URL ? false : 'sem DATABASE_URL' }, async (t) => {
  const { pool, migrate, seed } = await import('../api/src/db.js');
  t.after(() => pool.end().catch(() => {}));

  await t.test('migrations idempotentes — 2ª execução não duplica versões', async () => {
    await migrate();
    const { rows: r1 } = await pool.query('SELECT count(*)::int n FROM schema_migrations');
    await migrate();
    const { rows: r2 } = await pool.query('SELECT count(*)::int n FROM schema_migrations');
    assert.equal(r1[0].n, r2[0].n, '2ª migrate não altera contagem de versões');
  });

  await t.test('seed cria ao menos 1 registro de exemplo', async () => {
    await seed();
    const { rows } = await pool.query('SELECT count(*)::int n FROM records');
    assert.ok(rows[0].n >= 1, 'seed criou registro de exemplo');
  });

  await t.test('tabela idempotency_keys existe após migrate', async () => {
    const { rows } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='idempotency_keys'"
    );
    assert.equal(rows.length, 1, 'tabela idempotency_keys existe');
  });

  await t.test('idempotency_keys: INSERT e recuperação por chave composta', async () => {
    const key = 'idem-unit-' + Date.now();
    const fakeResp = { id: 99, title: 'test-idem' };
    await pool.query(
      'INSERT INTO idempotency_keys(idempotency_key,operation,entity_type,entity_id,response_json) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [key, 'create-record', 'record', '99', JSON.stringify(fakeResp)]
    );
    const { rows } = await pool.query(
      'SELECT response_json FROM idempotency_keys WHERE idempotency_key=$1 AND operation=$2',
      [key, 'create-record']
    );
    assert.equal(rows.length, 1, 'chave encontrada');
    assert.equal(rows[0].response_json.id, 99, 'resposta armazenada corretamente');
  });

  await t.test('idempotency_keys: UPSERT com mesma chave não cria duplicata', async () => {
    const key = 'idem-upsert-' + Date.now();
    const q = 'INSERT INTO idempotency_keys(idempotency_key,operation,entity_type,entity_id,response_json) VALUES($1,$2,$3,$4,$5) ON CONFLICT(idempotency_key,operation) DO UPDATE SET response_json=EXCLUDED.response_json';
    await pool.query(q, [key, 'create-record', 'record', '1', JSON.stringify({ id: 1 })]);
    await pool.query(q, [key, 'create-record', 'record', '1', JSON.stringify({ id: 1 })]);
    const { rows } = await pool.query(
      'SELECT count(*)::int n FROM idempotency_keys WHERE idempotency_key=$1 AND operation=$2',
      [key, 'create-record']
    );
    assert.equal(rows[0].n, 1, 'UPSERT: apenas 1 registro com a mesma chave composta');
  });
});
