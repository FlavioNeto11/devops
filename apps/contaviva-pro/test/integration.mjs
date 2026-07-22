const API = (process.env.BASE_URL || 'http://nvit.localhost/contaviva-pro/api').replace(/\/$/, '');
const H = (extra) => ({ 'Content-Type': 'application/json', ...extra });
const post = (p, b, h) => fetch(API + p, { method: 'POST', headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const put = (p, b, h) => fetch(API + p, { method: 'PUT', headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const del = (p, h) => fetch(API + p, { method: 'DELETE', headers: H(h) }).then((r) => r.status);
const get = (p, h) => fetch(API + p, { headers: H(h) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
ok((await get('/health')).j.status === 'ok', 'health + db (Fastify)');
// --- bloco contas-acesso: autentica ANTES (as rotas de records exigem Bearer) ---
ok((await get('/me')).s === 401, 'auth: /me sem token -> 401');
const email = 'u' + Date.now() + '@local'; const reg = await post('/auth/register', { name: 'Teste', email, password: 'senha12345' });
ok(reg.s === 201 && reg.j.accessToken && reg.j.user.id, 'auth: registro emite tokens');
const tok = reg.j.accessToken; const refresh = reg.j.refreshToken; const auth = { Authorization: 'Bearer ' + tok };
ok((await get('/me', auth)).j.email === email, 'auth: /me com token retorna o usuário');
// records: fechados a anônimo (D9) — precisam do Bearer
ok((await get('/v1/records')).s === 401, 'records: lista sem token -> 401');
ok((await post('/v1/records', { title: 'x' })).s === 401, 'records: cria sem token -> 401');
const r1 = (await post('/v1/records', { title: 'Teste' }, auth)).j; ok(r1.id, 'CRUD cria record (autenticado)');
const r2 = (await post('/v1/records', { title: 'Async' }, auth)).j;
ok((await post('/v1/records/' + r2.id + '/submit', {}, auth)).j.enqueued === true, 'Redis/BullMQ: submit enfileirado');
let a = {}; for (let i = 0; i < 12; i++) { await sleep(3000); a = (await get('/v1/records/' + r2.id, auth)).j; if (a.status === 'submitted' || a.status === 'failed') break; }
ok(a.status === 'submitted', 'BullMQ worker + gateway: record submetido');
// PUT /v1/records/:id (D10) — edita title/external_ref; status NÃO é editável
const e1 = await put('/v1/records/' + r1.id, { title: 'Editado', external_ref: 'REF-1' }, auth);
ok(e1.s === 200 && e1.j.title === 'Editado' && e1.j.external_ref === 'REF-1', 'PUT edita title/external_ref');
ok((await put('/v1/records/' + r1.id, {}, auth)).s === 400, 'PUT: corpo vazio -> 400');
ok((await put('/v1/records/' + r1.id, { title: '   ' }, auth)).s === 400, 'PUT: title vazio -> 400');
ok((await put('/v1/records/999999', { title: 'x' }, auth)).s === 404, 'PUT: inexistente -> 404');
ok((await put('/v1/records/' + r1.id, { title: 'y' })).s === 401, 'PUT: sem token -> 401');
// --- bloco contas-acesso: restante da auth própria ---
ok((await post('/auth/register', { name: 'Dup', email, password: 'senha12345' })).s === 409, 'auth: email duplicado -> 409');
ok((await post('/auth/register', { name: 'Curta', email: 'x' + Date.now() + '@local', password: 'curta' })).s === 400, 'auth: senha curta -> 400');
ok((await post('/auth/login', { email, password: 'errada' })).s === 401, 'auth: senha errada -> 401');
ok((await post('/auth/login', { email, password: 'senha12345' })).s === 200, 'auth: login ok -> 200');
const rf = await post('/auth/refresh', { refreshToken: refresh }); ok(rf.s === 200 && rf.j.accessToken, 'auth: refresh rotaciona');
ok((await post('/auth/refresh', { refreshToken: refresh })).s === 401, 'auth: refresh usado é revogado -> 401');
ok((await get('/v1/users', auth)).s === 403, 'auth: member não lista usuários (403)');
const cfg = await get('/auth/sso/config'); ok(typeof cfg.j.enabled === 'boolean', 'auth: /auth/sso/config público');
console.log(process.exitCode ? 'FALHOU' : 'OK — gymops-style robusto');
