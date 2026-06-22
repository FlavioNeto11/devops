// reorder.test.mjs — REQ-STOCKPILOT-0003: reposição assíncrona, idempotente e resiliente.
// Testes puros (sem Postgres nem rede): decisão de reposição, chave idempotente, dedup por
// pedido aberto e job_key, e o processamento do job (gateway → delivered). `db`/`jobs`/`dispatch`
// são injetados → não toca infra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldReorder, reorderJobKey, requestReorder, processReorderJob, REORDER_JOB_TYPE,
} from '../src/services/reorder-service.js';

// --- decisão pura ---
test('shouldReorder: estoque < mínimo e sem pedido aberto → repõe', () => {
  assert.equal(shouldReorder({ current_stock: 5, min_stock: 50 }, false), true);
});
test('shouldReorder: estoque < mínimo mas já há pedido aberto → NÃO repõe (não duplica)', () => {
  assert.equal(shouldReorder({ current_stock: 5, min_stock: 50 }, true), false);
});
test('shouldReorder: estoque >= mínimo → não repõe', () => {
  assert.equal(shouldReorder({ current_stock: 60, min_stock: 50 }, false), false);
});
test('shouldReorder: produto inexistente → false', () => {
  assert.equal(shouldReorder(null, false), false);
});

// --- chave idempotente determinística ---
test('reorderJobKey é estável p/ o mesmo (tenant,produto,pedido)', () => {
  assert.equal(reorderJobKey('acme', 7, 101), 'reorder:acme:7:101');
  assert.equal(reorderJobKey('acme', 7, 101), reorderJobKey('acme', 7, 101));
  assert.notEqual(reorderJobKey('acme', 7, 101), reorderJobKey('acme', 7, 102));
});

// --- fakes (sem Postgres) ---
function makeDb({ product = null, openOrder = null } = {}) {
  const state = { product, openOrder, created: [], seq: 100 };
  const db = {
    state,
    query: async (sql, params) => {
      if (/FROM products WHERE id=/.test(sql)) return { rows: state.product ? [state.product] : [] };
      if (/FROM product_orders.*status IN \('pending','processing'\)/s.test(sql)) return { rows: state.openOrder ? [state.openOrder] : [] };
      if (/INSERT INTO product_orders/.test(sql)) {
        const order = { id: ++state.seq, product_id: params[0], tenant_id: params[1], status: 'pending' };
        state.created.push(order);
        state.openOrder = order; // depois de criar, passa a existir pedido aberto (anti-duplicação)
        return { rows: [order] };
      }
      if (/UPDATE product_orders SET status='processing'/.test(sql)) return { rows: [{ id: params[0], status: 'processing' }] };
      if (/UPDATE product_orders SET status='delivered'/.test(sql)) return { rows: [{ id: params[0], status: 'delivered', external_ref: params[2] }] };
      if (/UPDATE product_orders SET status='failed'/.test(sql)) return { rows: [{ id: params[0], status: 'failed' }] };
      return { rows: [] };
    },
  };
  return db;
}

// simula jobs-repo.enqueue com ON CONFLICT (job_key) DO NOTHING: chave repetida → no-op (null).
function makeJobs() {
  const seen = new Set();
  const enqueued = [];
  return {
    enqueued, seen,
    enqueue: async (type, payload, jobKey) => {
      enqueued.push({ type, payload, jobKey });
      if (seen.has(jobKey)) return null;
      seen.add(jobKey);
      return enqueued.length;
    },
  };
}

// --- requestReorder ---
test('requestReorder: produto inexistente → ok:false (não cria pedido nem job)', async () => {
  const db = makeDb({ product: null });
  const jobs = makeJobs();
  const r = await requestReorder(999, 'acme', { db, jobs });
  assert.equal(r.ok, false);
  assert.equal(db.state.created.length, 0);
  assert.equal(jobs.enqueued.length, 0);
});

test('requestReorder: abaixo do mínimo, sem pedido aberto → cria pedido pending + enfileira job', async () => {
  const db = makeDb({ product: { id: 5, name: 'Álcool 70%', current_stock: 5, min_stock: 50 } });
  const jobs = makeJobs();
  const r = await requestReorder(5, 'acme', { db, jobs });
  assert.equal(r.ok, true);
  assert.equal(r.created, true);
  assert.equal(r.deduped, false);
  assert.equal(r.order.status, 'pending');
  assert.equal(db.state.created.length, 1);
  assert.equal(jobs.enqueued.length, 1);
  assert.equal(jobs.enqueued[0].type, REORDER_JOB_TYPE);
  assert.equal(jobs.enqueued[0].jobKey, reorderJobKey('acme', 5, r.order.id));
  assert.deepEqual(jobs.enqueued[0].payload, { orderId: r.order.id, productId: 5, tenant: 'acme' });
});

test('IDEMPOTÊNCIA: duas reposições do mesmo produto → UM pedido e UM job (dedup)', async () => {
  const db = makeDb({ product: { id: 5, name: 'Álcool 70%', current_stock: 5, min_stock: 50 } });
  const jobs = makeJobs();
  const r1 = await requestReorder(5, 'acme', { db, jobs });
  const r2 = await requestReorder(5, 'acme', { db, jobs }); // já há pedido aberto → dedup

  assert.equal(r1.created, true);
  assert.equal(r2.created, false);
  assert.equal(r2.deduped, true);
  assert.equal(r2.order.id, r1.order.id, 'devolve o MESMO recurso');
  assert.equal(db.state.created.length, 1, 'só UM pedido criado');
  assert.equal(jobs.seen.size, 1, 'só UMA job_key efetiva (ON CONFLICT DO NOTHING)');
  assert.equal(new Set(jobs.enqueued.map((e) => e.jobKey)).size, 1, 'mesma job_key nas duas tentativas');
});

test('requestReorder: já com pedido aberto → não cria, reenfileira mesma chave', async () => {
  const db = makeDb({
    product: { id: 5, name: 'Álcool 70%', current_stock: 5, min_stock: 50 },
    openOrder: { id: 77, product_id: 5, tenant_id: 'acme', status: 'pending' },
  });
  const jobs = makeJobs();
  const r = await requestReorder(5, 'acme', { db, jobs });
  assert.equal(r.created, false);
  assert.equal(r.deduped, true);
  assert.equal(r.order.id, 77);
  assert.equal(db.state.created.length, 0);
  assert.equal(jobs.enqueued[0].jobKey, reorderJobKey('acme', 5, 77));
});

// --- processReorderJob (worker) ---
test('processReorderJob: sucesso → marca processing e delivered com external_ref do gateway', async () => {
  const db = makeDb();
  const seenSql = [];
  db.query = (orig => async (sql, params) => { seenSql.push(sql); return orig(sql, params); })(db.query);
  const dispatch = async (rec) => ({ externalRef: 'EXT-' + rec.id });
  const lookupProduct = async () => ({ id: 5, name: 'Álcool 70%' });

  const res = await processReorderJob({ orderId: 101, productId: 5, tenant: 'acme' }, { db, dispatch, lookupProduct });
  assert.equal(res.externalRef, 'EXT-5');
  assert.ok(seenSql.some((s) => /status='processing'/.test(s)), 'marcou processing');
  assert.ok(seenSql.some((s) => /status='delivered'/.test(s)), 'marcou delivered');
});

test('processReorderJob: falha do gateway propaga (worker reenfileira/DLQ) e NÃO marca delivered', async () => {
  const db = makeDb();
  const seenSql = [];
  db.query = (orig => async (sql, params) => { seenSql.push(sql); return orig(sql, params); })(db.query);
  const dispatch = async () => { throw new Error('externo 500'); };
  const lookupProduct = async () => ({ id: 5, name: 'Álcool 70%' });

  await assert.rejects(
    () => processReorderJob({ orderId: 101, productId: 5, tenant: 'acme' }, { db, dispatch, lookupProduct }),
    /externo 500/
  );
  assert.ok(seenSql.some((s) => /status='processing'/.test(s)), 'marcou processing antes de falhar');
  assert.ok(!seenSql.some((s) => /status='delivered'/.test(s)), 'não marcou delivered em falha');
});
