// integration.mjs — verificador E2E do FieldServe (prova dos blocos robustos).
// BASE_URL = RAIZ da API. Pela borda: http://nvit.localhost/fieldserve/api ; no pod: http://localhost:8080
const API = (process.env.BASE_URL || 'http://nvit.localhost/fieldserve/api').replace(/\/$/, '');
const H = { 'Content-Type': 'application/json' };
const post = (p, b, h = {}) => fetch(API + p, { method: 'POST', headers: { ...H, ...h }, body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const get = (p, h = {}) => fetch(API + p, { headers: h }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const ok = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok  -', msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const health = await get('/health');
ok(health.j.status === 'ok', 'health 200 + db conectado');

const o1 = (await post('/v1/work-orders', { title: 'Reparo da bomba', priority: 'high' })).j;
const o2 = (await post('/v1/work-orders', { title: 'FALHA proposital', priority: 'low' })).j;
ok(o1.id && o2.id, 'CRUD: cria ordens');
await post('/v1/work-orders/' + o1.id + '/submit', {});
await post('/v1/work-orders/' + o2.id + '/submit', {});

let a = {}, b = {};
for (let i = 0; i < 14; i++) { await sleep(3000); a = (await get('/v1/work-orders/' + o1.id)).j; b = (await get('/v1/work-orders/' + o2.id)).j; if (a.status === 'submitted' && b.status === 'failed') break; }
ok(a.status === 'submitted' && a.external_ref, 'fila+gateway: ordem normal submetida (retry no transitório) com external_ref');
ok(b.status === 'failed', 'retry+DLQ: ordem que sempre falha vira failed (esgota tentativas -> DLQ)');

ok((await post('/v1/work-orders/' + o1.id + '/submit', {})).j.enqueued === false, 'idempotência (job_key): reenfileirar não duplica');
const k = 'idem-' + Date.now();
const ka = (await post('/v1/work-orders', { title: 'Idem' }, { 'Idempotency-Key': k })).j;
const kb = (await post('/v1/work-orders', { title: 'Idem' }, { 'Idempotency-Key': k })).j;
ok(ka.id === kb.id, 'idempotência (Idempotency-Key): mesma chave -> mesmo recurso');
ok((await get('/v1/work-orders/' + o1.id, { 'X-Tenant-Id': '2' })).s === 404, 'multi-tenant: outro tenant não vê a ordem (404)');

console.log(process.exitCode ? '\nINTEGRAÇÃO FALHOU' : '\nINTEGRAÇÃO OK — blocos robustos provados');
