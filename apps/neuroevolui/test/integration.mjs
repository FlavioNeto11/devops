const API = (process.env.BASE_URL || 'http://nvit.localhost/neuroevolui/api').replace(/\/$/, '');
const H = (extra) => ({ 'Content-Type': 'application/json', ...extra });
const post = (p, b, h) => fetch(API + p, { method: 'POST', headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const del = (p, h) => fetch(API + p, { method: 'DELETE', headers: H(h) }).then((r) => r.status);
const get = (p, h) => fetch(API + p, { headers: H(h) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ok((await get('/health')).j.status === 'ok', 'health + db (Fastify)');

// AC1/AC2: professional cria record com created_by e tenant_id
const rPro = (await post('/v1/records', { title: 'Teste' }, { 'X-Role': 'professional', 'X-Tenant-Id': '1' })).j;
ok(rPro.id, 'CRUD: professional cria record');
ok(rPro.created_by, 'AC1: created_by preenchido na criação');
ok(rPro.tenant_id === 1, 'AC2: tenant_id da sessão gravado no recurso');

// AC3: cross-tenant não vê o recurso (404)
ok((await get('/v1/records/' + rPro.id, { 'X-Tenant-Id': '2' })).s === 404, 'AC3: outro tenant não vê (404)');

// AC4: papéis em cascata — patient não pode deletar (403)
ok(await del('/v1/records/' + rPro.id, { 'X-Role': 'patient' }) === 403, 'AC4: patient não pode deletar (403)');
// professional não pode deletar (403)
ok(await del('/v1/records/' + rPro.id, { 'X-Role': 'professional' }) === 403, 'AC4: professional não pode deletar (403)');
// clinic_manager pode deletar (200, soft-delete)
ok(await del('/v1/records/' + rPro.id, { 'X-Role': 'clinic_manager' }) === 200, 'AC4: clinic_manager pode deletar (200)');

// AC5/AC6: após deleção o recurso não aparece mais (soft-delete)
ok((await get('/v1/records/' + rPro.id, { 'X-Role': 'professional' })).s === 404, 'AC6: soft-delete: record não aparece após deleção');

// AC4: patient não pode criar record (403)
ok((await post('/v1/records', { title: 'patient-test' }, { 'X-Role': 'patient' })).s === 403, 'AC4: patient não pode criar record (403)');

// AC4: owner herda clinic_manager — pode criar e deletar
const rOwner = (await post('/v1/records', { title: 'Owner' }, { 'X-Role': 'owner' })).j;
ok(rOwner.id, 'AC4: owner cria record (herda professional)');
ok(await del('/v1/records/' + rOwner.id, { 'X-Role': 'owner' }) === 200, 'AC4: owner pode deletar (herda clinic_manager)');

// AC2/BullMQ: submit enfileirado pelo professional
const rAsync = (await post('/v1/records', { title: 'Async' }, { 'X-Role': 'professional' })).j;
ok(rAsync.id, 'professional cria record para submit');
ok((await post('/v1/records/' + rAsync.id + '/submit', {}, { 'X-Role': 'professional' })).j.enqueued === true, 'Redis/BullMQ: submit enfileirado');
let a = {}; for (let i = 0; i < 12; i++) { await sleep(3000); a = (await get('/v1/records/' + rAsync.id, { 'X-Role': 'professional' })).j; if (a.status === 'submitted' || a.status === 'failed') break; }
ok(a.status === 'submitted', 'BullMQ worker + gateway: record submetido');

console.log(process.exitCode ? 'FALHOU' : 'OK — gymops-style RBAC multi-tenant');
