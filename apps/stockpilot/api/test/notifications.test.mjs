// notifications.test.mjs — REQ-STOCKPILOT-0007: notificações multi-canal.
// Testes PUROS (sem Postgres nem rede): fan-out pelos canais, DEGRADAÇÃO GRACIOSA (canal sem config
// é pulado sem derrubar os outros / sem erro fatal), status agregado, conteúdo por tipo, emissão dos
// eventos (stock.rupture / reorder.failed) na fila, e o processamento do job pelo worker.
// `channels`/`jobs`/`db`/`notifications`/`fetchImpl` são injetados → não toca infra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTIFY_JOB_TYPE, notifyJobKey, ruptureSpec, reorderFailedSpec,
  fanOut, aggregateStatus, emitEvent, processNotifyJob,
} from '../src/services/notification-service.js';
import { buildMessage } from '../src/lib/notify/templates.js';
import { emailChannel, pushChannel, whatsappChannel, defaultChannels } from '../src/lib/notify/channels.js';
import { autoReorderScan } from '../src/services/reorder-service.js';

// --- fakes ---
function fakeChannel(name, { configured = true, fail = false } = {}) {
  const calls = [];
  return {
    name, calls,
    isConfigured: () => configured,
    deliver: async (msg) => { calls.push(msg); if (fail) throw new Error(name + ' indisponível'); },
  };
}
function makeJobs() {
  const enqueued = [];
  const seen = new Set();
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
function makeNotificationsRepo() {
  const state = { upserts: [], results: [], seq: 0 };
  return {
    state,
    upsertPending: async (n) => { const row = { id: ++state.seq, tentativas: 1, ...n }; state.upserts.push(row); return row; },
    markResult: async (id, r) => { state.results.push({ id, ...r }); return { id, ...r }; },
  };
}

// --- chave/specs (puras) ---
test('notifyJobKey é estável e distingue tipo/tenant/referência', () => {
  assert.equal(notifyJobKey('ruptura', 'acme', 7), 'notify:ruptura:acme:7');
  assert.notEqual(notifyJobKey('ruptura', 'acme', 7), notifyJobKey('falha_pedido', 'acme', 7));
  assert.notEqual(notifyJobKey('ruptura', 'acme', 7), notifyJobKey('ruptura', 'acme', 8));
});

test('ruptureSpec deriva tenant/referência/contexto do produto', () => {
  const spec = ruptureSpec({ id: 5, tenant_id: 'acme', name: 'Álcool 70%', current_stock: 5, min_stock: 50 });
  assert.equal(spec.tipo, 'ruptura');
  assert.equal(spec.tenant, 'acme');
  assert.equal(spec.referenciaId, 5);
  assert.equal(spec.context.productName, 'Álcool 70%');
  assert.equal(spec.context.currentStock, 5);
});

test('reorderFailedSpec usa jobId como referência e carrega o erro', () => {
  const spec = reorderFailedSpec({ tenant: 'acme', orderId: 11, jobId: 99, productName: 'Luvas', error: 'timeout' });
  assert.equal(spec.tipo, 'falha_pedido');
  assert.equal(spec.referenciaId, 99);
  assert.equal(spec.context.orderId, 11);
  assert.equal(spec.context.error, 'timeout');
});

// --- conteúdo (templates) ---
test('buildMessage(ruptura): inclui nome do produto, estoque e ação recomendada', () => {
  const m = buildMessage(ruptureSpec({ id: 5, tenant_id: 'acme', name: 'Álcool 70%', current_stock: 5, min_stock: 50 }));
  assert.match(m.title, /Álcool 70%/);
  assert.match(m.summary, /estoque atual 5/);
  assert.match(m.summary, /mínimo 50/);
  assert.match(m.action, /Repor o estoque/);
  assert.match(m.html, /Álcool 70%/);
  assert.match(m.html, /Ver painel/);
});

test('buildMessage(falha_pedido): inclui o pedido e o erro', () => {
  const m = buildMessage(reorderFailedSpec({ tenant: 'acme', orderId: 11, jobId: 99, productName: 'Luvas', error: 'fornecedor 500' }));
  assert.match(m.title, /Falha no pedido/);
  assert.match(m.html, /#11/);
  assert.match(m.html, /fornecedor 500/);
});

// --- fan-out + degradação graciosa (NÚCLEO do requisito) ---
test('fanOut: todos os canais configurados → todos entregues (sent)', async () => {
  const chs = [fakeChannel('email'), fakeChannel('push'), fakeChannel('whatsapp')];
  const results = await fanOut({ summary: 'x' }, chs);
  assert.deepEqual(results.map((r) => r.status), ['sent', 'sent', 'sent']);
  assert.ok(chs.every((c) => c.calls.length === 1), 'cada canal foi chamado uma vez');
});

test('DEGRADAÇÃO: canal SEM config é PULADO (skipped) sem derrubar os outros', async () => {
  const email = fakeChannel('email', { configured: true });
  const push = fakeChannel('push', { configured: false }); // sem credencial
  const whats = fakeChannel('whatsapp', { configured: true });
  const results = await fanOut({ summary: 'x' }, [email, push, whats]);

  assert.equal(results.find((r) => r.channel === 'email').status, 'sent');
  assert.equal(results.find((r) => r.channel === 'push').status, 'skipped');
  assert.equal(results.find((r) => r.channel === 'push').reason, 'unconfigured');
  assert.equal(results.find((r) => r.channel === 'whatsapp').status, 'sent');
  assert.equal(push.calls.length, 0, 'canal sem config NÃO é chamado');
  assert.equal(email.calls.length, 1);
  assert.equal(whats.calls.length, 1);
});

test('ISOLAMENTO: um canal que falha não derruba os outros (failed isolado)', async () => {
  const email = fakeChannel('email', { fail: true });
  const push = fakeChannel('push');
  const results = await fanOut({ summary: 'x' }, [email, push]);
  assert.equal(results.find((r) => r.channel === 'email').status, 'failed');
  assert.match(results.find((r) => r.channel === 'email').reason, /indisponível/);
  assert.equal(results.find((r) => r.channel === 'push').status, 'sent', 'o outro canal entrega normalmente');
});

test('aggregateStatus: sent se algum entregou; failed se nenhum e algum falhou; skipped se todos pulados', () => {
  assert.equal(aggregateStatus([{ status: 'sent' }, { status: 'failed' }]), 'sent');
  assert.equal(aggregateStatus([{ status: 'failed' }, { status: 'skipped' }]), 'failed');
  assert.equal(aggregateStatus([{ status: 'skipped' }, { status: 'skipped' }]), 'skipped');
});

// --- adapters: degradação por ENV ausente (sem rede) ---
test('adapters sem env → isConfigured()=false (pulados); com webhook → true', () => {
  assert.equal(emailChannel({}).isConfigured(), false);
  assert.equal(pushChannel({}).isConfigured(), false);
  assert.equal(whatsappChannel({}).isConfigured(), false);
  assert.equal(defaultChannels({}).every((c) => !c.isConfigured()), true, 'sem nenhuma config → todos pulados');

  assert.equal(emailChannel({ NOTIFY_EMAIL_WEBHOOK_URL: 'http://wh/email' }).isConfigured(), true);
  assert.equal(pushChannel({ NOTIFY_PUSH_WEBHOOK_URL: 'http://wh/push' }).isConfigured(), true);
  assert.equal(whatsappChannel({ NOTIFY_WHATSAPP_WEBHOOK_URL: 'http://wh/wa' }).isConfigured(), true);
});

test('adapter configurado entrega via fetch (webhook) e lança em não-ok', async () => {
  const sent = [];
  const okFetch = async (url, opts) => { sent.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200 }; };
  const email = emailChannel({ NOTIFY_EMAIL_WEBHOOK_URL: 'http://wh/email', NOTIFY_EMAIL_TO: 'ops@acme' });
  await email.deliver({ subject: 'S', html: '<b>h</b>' }, { fetchImpl: okFetch });
  assert.equal(sent[0].url, 'http://wh/email');
  assert.equal(sent[0].body.to, 'ops@acme');
  assert.equal(sent[0].body.subject, 'S');

  const badFetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(() => email.deliver({ subject: 'S', html: 'h' }, { fetchImpl: badFetch }), /503/);
});

// --- emissão dos eventos na fila ---
test('emitEvent: stock.rupture vira job notify idempotente na fila', async () => {
  const jobs = makeJobs();
  const spec = ruptureSpec({ id: 5, tenant_id: 'acme', name: 'Álcool 70%', current_stock: 5, min_stock: 50 });
  const r = await emitEvent(spec, { jobs });
  assert.equal(r.enqueued, true);
  assert.equal(jobs.enqueued[0].type, NOTIFY_JOB_TYPE);
  assert.equal(jobs.enqueued[0].jobKey, 'notify:ruptura:acme:5');
  assert.deepEqual(jobs.enqueued[0].payload, spec);

  // reenfileirar o MESMO evento é no-op (dedup pela job_key)
  const r2 = await emitEvent(spec, { jobs });
  assert.equal(r2.enqueued, false);
  assert.equal(jobs.seen.size, 1);
});

test('emitEvent: reorder.failed vira job notify com a referência do job', async () => {
  const jobs = makeJobs();
  const spec = reorderFailedSpec({ tenant: 'acme', orderId: 11, jobId: 99, productName: 'Luvas', error: 'x' });
  await emitEvent(spec, { jobs });
  assert.equal(jobs.enqueued[0].jobKey, 'notify:falha_pedido:acme:99');
});

// --- processamento do job (worker) ---
test('processNotifyJob: persiste, faz fan-out e grava o desfecho por canal (status sent)', async () => {
  const notifications = makeNotificationsRepo();
  const channels = [fakeChannel('email'), fakeChannel('push', { configured: false }), fakeChannel('whatsapp')];
  const spec = ruptureSpec({ id: 5, tenant_id: 'acme', name: 'Álcool 70%', current_stock: 5, min_stock: 50 });

  const out = await processNotifyJob(spec, { db: {}, notifications, channels });
  assert.equal(out.status, 'sent');
  assert.equal(notifications.state.upserts.length, 1, 'criou o registro pendente');
  assert.equal(notifications.state.upserts[0].dedupeKey, 'notify:ruptura:acme:5');
  const result = notifications.state.results[0];
  assert.equal(result.status, 'sent');
  assert.equal(result.canais.find((c) => c.channel === 'push').status, 'skipped');
});

test('processNotifyJob: TODOS os canais sem config → status skipped e NÃO lança (degradação graciosa)', async () => {
  const notifications = makeNotificationsRepo();
  const channels = defaultChannels({}); // nenhuma config
  const spec = ruptureSpec({ id: 5, tenant_id: 'acme', name: 'Álcool 70%', current_stock: 5, min_stock: 50 });
  const out = await processNotifyJob(spec, { db: {}, notifications, channels });
  assert.equal(out.status, 'skipped');
  assert.equal(notifications.state.results[0].status, 'skipped');
});

test('processNotifyJob: nenhum entregou e algum falhou → LANÇA (worker reenfileira/DLQ)', async () => {
  const notifications = makeNotificationsRepo();
  const channels = [fakeChannel('email', { fail: true }), fakeChannel('push', { configured: false })];
  const spec = ruptureSpec({ id: 5, tenant_id: 'acme', name: 'Álcool 70%', current_stock: 5, min_stock: 50 });
  await assert.rejects(() => processNotifyJob(spec, { db: {}, notifications, channels }), /falharam/);
  assert.equal(notifications.state.results[0].status, 'failed', 'gravou failed antes de lançar');
});

// --- gancho de evento: a varredura emite ruptura por produto em RUPTURA ---
test('autoReorderScan EMITE notificação de ruptura para cada produto em RUPTURA', async () => {
  const due = [
    { id: 1, tenant_id: 'acme', name: 'Álcool 70%', current_stock: 5, min_stock: 50 },
    { id: 2, tenant_id: 'acme', name: 'Avental', current_stock: 1, min_stock: 30 },
  ];
  const db = { query: async (sql) => (/p\.current_stock < p\.min_stock/.test(sql) ? { rows: due } : { rows: [] }) };
  const emitted = [];
  await autoReorderScan({ db, jobs: makeJobs(), emitNotification: async (spec) => emitted.push(spec) });
  assert.equal(emitted.length, 2);
  assert.deepEqual(emitted.map((e) => e.tipo), ['ruptura', 'ruptura']);
  assert.deepEqual(emitted.map((e) => e.referenciaId), [1, 2]);
});

test('autoReorderScan: falha ao notificar NÃO derruba a varredura (fail-soft)', async () => {
  const due = [{ id: 1, tenant_id: 'acme', name: 'Álcool 70%', current_stock: 5, min_stock: 50 }];
  const db = { query: async (sql) => (/p\.current_stock < p\.min_stock/.test(sql) ? { rows: due } : { rows: [] }) };
  // emitNotification lança — a varredura tem que seguir sem propagar.
  await assert.doesNotReject(() => autoReorderScan({
    db, jobs: makeJobs(), emitNotification: async () => { throw new Error('fila fora'); },
  }));
});
