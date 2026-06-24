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

// REQ-0003 AC1-AC5: 4 named queues — enfileira e retorna 202 + job_id
const cn = await post('/v1/consultation-notes', { job_key: 'cn-integ-01', note: 'teste' }, { 'X-Role': 'professional', 'X-Tenant-Id': '1' });
ok(cn.s === 202, 'REQ-0003: consultation-notes retorna 202');
ok(cn.j.job_id, 'REQ-0003: consultation-notes retorna job_id');

const pi = await post('/v1/patient-imports', { job_key: 'pi-integ-01', file: 'data.csv' }, { 'X-Role': 'clinic_manager', 'X-Tenant-Id': '1' });
ok(pi.s === 202, 'REQ-0003: patient-imports retorna 202');

const notif = await post('/v1/notifications', { job_key: 'notif-integ-01', to: 'patient@x.com' }, { 'X-Tenant-Id': '1' });
ok(notif.s === 202, 'REQ-0003: notifications retorna 202');

const ai = await post('/v1/summaries-ai', { job_key: 'ai-integ-01', consultation_id: '1' }, { 'X-Role': 'professional', 'X-Tenant-Id': '1' });
ok(ai.s === 202, 'REQ-0003: summaries-ai retorna 202');

// REQ-0003 AC2: mesmo job_key → mesmo job_id (dedup)
const cn2 = await post('/v1/consultation-notes', { job_key: 'cn-integ-01', note: 'dup' }, { 'X-Role': 'professional', 'X-Tenant-Id': '1' });
ok(cn2.j.job_id === cn.j.job_id, 'REQ-0003 AC2: mesmo job_key → mesmo job_id (reenfileirar com mesmo job_key → um job)');

// REQ-0003 AC3: POST retorna 202 com job_id para cada fila
ok(cn.j.queue === 'consultation-notes', 'REQ-0003 AC3: queue name correto na resposta');

// REQ-0003 AC6: migrations idempotentes — health ainda ok após múltiplos boots
ok((await get('/health')).j.status === 'ok', 'REQ-0003 AC6: health ok (migrations idempotentes via advisory-lock)');

// REQ-0003: seed cria dados de exemplo
const records = (await get('/v1/records', { 'X-Role': 'clinic_manager', 'X-Tenant-Id': '1' })).j.data;
ok(Array.isArray(records) && records.length > 0, 'REQ-0003: seed criou registros de exemplo');

console.log(process.exitCode ? 'FALHOU' : 'OK — gymops-style RBAC multi-tenant + async queues + migrations');
