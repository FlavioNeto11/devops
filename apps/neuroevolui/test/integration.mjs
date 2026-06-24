const API = (process.env.BASE_URL || 'http://nvit.localhost/neuroevolui/api').replace(/\/$/, '');
const H = (extra) => ({ 'Content-Type': 'application/json', ...extra });
const post = (p, b, h) => fetch(API + p, { method: 'POST', headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const del = (p, h) => fetch(API + p, { method: 'DELETE', headers: H(h) }).then((r) => r.status);
const get = (p, h) => fetch(API + p, { headers: H(h) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// saúde básica
ok((await get('/health')).j.status === 'ok', 'health + db (Fastify)');

// CRUD base
const r1 = (await post('/v1/records', { title: 'Teste' })).j;
ok(r1.id, 'CRUD cria record');

// REQ-NEUROEVOLUI-0002 AC1: created_by e tenant_id auditáveis na resposta
ok(r1.tenant_id != null, 'AC1: tenant_id presente no record');
ok(r1.created_by != null, 'AC1: created_by presente no record');

// REQ-NEUROEVOLUI-0002 AC4/AC5: papéis em cascata — patient (rank 1) abaixo de clinic_manager (rank 3)
ok(await del('/v1/records/' + r1.id, { 'X-Role': 'patient' }) === 403, 'RBAC: patient não pode deletar (403)');
// professional (rank 2) também abaixo de clinic_manager
ok(await del('/v1/records/' + r1.id, { 'X-Role': 'professional' }) === 403, 'RBAC: professional não pode deletar (403)');
// owner (rank 4) acima de clinic_manager — permite
ok(await del('/v1/records/999999', { 'X-Role': 'owner' }) === 200, 'RBAC: owner pode deletar (200)');
// clinic_manager (rank 3) — mínimo permitido para delete
ok(await del('/v1/records/999998', { 'X-Role': 'clinic_manager' }) === 200, 'RBAC: clinic_manager pode deletar (200)');

// REQ-NEUROEVOLUI-0002 AC2/AC3: isolamento multi-tenant — outro tenant não vê (404)
ok((await get('/v1/records/' + r1.id, { 'X-Tenant-Id': '2' })).s === 404, 'multi-tenant: outro tenant não vê (404)');

// REQ-NEUROEVOLUI-0002 AC6: soft-delete — record deletado some do GET mas dados preservados
const rDel = (await post('/v1/records', { title: 'Para deletar' })).j;
ok(rDel.id, 'soft-delete: record criado');
ok(await del('/v1/records/' + rDel.id, { 'X-Role': 'owner' }) === 200, 'soft-delete: delete retorna 200');
ok((await get('/v1/records/' + rDel.id)).s === 404, 'soft-delete: record deletado some do GET');

// Redis/BullMQ
const r2 = (await post('/v1/records', { title: 'Async' })).j;
ok((await post('/v1/records/' + r2.id + '/submit', {})).j.enqueued === true, 'Redis/BullMQ: submit enfileirado');
let a = {}; for (let i = 0; i < 12; i++) { await sleep(3000); a = (await get('/v1/records/' + r2.id)).j; if (a.status === 'submitted' || a.status === 'failed') break; }
ok(a.status === 'submitted', 'BullMQ worker + gateway: record submetido');

console.log(process.exitCode ? 'FALHOU' : 'OK — gymops-style robusto');
