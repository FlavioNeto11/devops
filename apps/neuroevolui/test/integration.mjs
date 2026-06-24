const API = (process.env.BASE_URL || 'http://nvit.localhost/neuroevolui/api').replace(/\/$/, '');
const H = (extra) => ({ 'Content-Type': 'application/json', ...extra });
const post = (p, b, h) => fetch(API + p, { method: 'POST', headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const del = (p, h) => fetch(API + p, { method: 'DELETE', headers: H(h) }).then((r) => r.status);
const get = (p, h) => fetch(API + p, { headers: H(h) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
ok((await get('/health')).j.status === 'ok', 'health + db (Fastify)');
const r1 = (await post('/v1/records', { title: 'Teste' })).j; ok(r1.id, 'CRUD cria record');
ok(await del('/v1/records/' + r1.id, { 'X-Role': 'member' }) === 403, 'RBAC: member não pode deletar (403)');
ok(await del('/v1/records/999999', { 'X-Role': 'admin' }) === 200, 'RBAC: admin pode deletar (200)');
ok((await get('/v1/records/' + r1.id, { 'X-Tenant-Id': '2' })).s === 404, 'multi-tenant: outro tenant não vê (404)');
const r2 = (await post('/v1/records', { title: 'Async' })).j;
ok((await post('/v1/records/' + r2.id + '/submit', {})).j.enqueued === true, 'Redis/BullMQ: submit enfileirado');
let a = {}; for (let i = 0; i < 12; i++) { await sleep(3000); a = (await get('/v1/records/' + r2.id)).j; if (a.status === 'submitted' || a.status === 'failed') break; }
ok(a.status === 'submitted', 'BullMQ worker + gateway: record submetido');
console.log(process.exitCode ? 'FALHOU' : 'OK — gymops-style robusto');
