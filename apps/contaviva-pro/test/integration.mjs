const API = (process.env.BASE_URL || 'http://nvit.localhost/contaviva-pro/api').replace(/\/$/, '');
const H = (extra) => ({ 'Content-Type': 'application/json', ...extra });
const post = (p, b, h) => fetch(API + p, { method: 'POST', headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const del = (p, h) => fetch(API + p, { method: 'DELETE', headers: H(h) }).then((r) => r.status);
const get = (p, h) => fetch(API + p, { headers: H(h) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
ok((await get('/health')).j.status === 'ok', 'health + db (Fastify)');
const r1 = (await post('/v1/records', { title: 'Teste' })).j; ok(r1.id, 'CRUD cria record');
const r2 = (await post('/v1/records', { title: 'Async' })).j;
ok((await post('/v1/records/' + r2.id + '/submit', {})).j.enqueued === true, 'Redis/BullMQ: submit enfileirado');
let a = {}; for (let i = 0; i < 12; i++) { await sleep(3000); a = (await get('/v1/records/' + r2.id)).j; if (a.status === 'submitted' || a.status === 'failed') break; }
ok(a.status === 'submitted', 'BullMQ worker + gateway: record submetido');
// --- bloco contas-acesso: auth própria ---
ok((await get('/me')).s === 401, 'auth: /me sem token -> 401');
const email = 'u' + Date.now() + '@local'; const reg = await post('/auth/register', { name: 'Teste', email, password: 'senha12345' });
ok(reg.s === 201 && reg.j.accessToken && reg.j.user.id, 'auth: registro emite tokens');
const tok = reg.j.accessToken; const refresh = reg.j.refreshToken; const auth = { Authorization: 'Bearer ' + tok };
ok((await get('/me', auth)).j.email === email, 'auth: /me com token retorna o usuário');
ok((await post('/auth/register', { name: 'Dup', email, password: 'senha12345' })).s === 409, 'auth: email duplicado -> 409');
ok((await post('/auth/register', { name: 'Curta', email: 'x' + Date.now() + '@local', password: 'curta' })).s === 400, 'auth: senha curta -> 400');
ok((await post('/auth/login', { email, password: 'errada' })).s === 401, 'auth: senha errada -> 401');
ok((await post('/auth/login', { email, password: 'senha12345' })).s === 200, 'auth: login ok -> 200');
const rf = await post('/auth/refresh', { refreshToken: refresh }); ok(rf.s === 200 && rf.j.accessToken, 'auth: refresh rotaciona');
ok((await post('/auth/refresh', { refreshToken: refresh })).s === 401, 'auth: refresh usado é revogado -> 401');
ok((await get('/v1/users', auth)).s === 403, 'auth: member não lista usuários (403)');
const cfg = await get('/auth/sso/config'); ok(typeof cfg.j.enabled === 'boolean', 'auth: /auth/sso/config público');
console.log(process.exitCode ? 'FALHOU' : 'OK — gymops-style robusto');
