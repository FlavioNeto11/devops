const API = (process.env.BASE_URL || 'http://nvit.localhost/opsboard/api').replace(/\/$/, '');
const post = (p, b) => fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const get = (p) => fetch(API + p).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
ok((await get('/health')).j.status === 'ok', 'health + db');
const r1 = (await post('/v1/records', { title: 'Teste' })).j; ok(r1.id, 'CRUD cria record');
await post('/v1/records/' + r1.id + '/submit', {});
let a = {}; for (let i = 0; i < 12; i++) { await sleep(3000); a = (await get('/v1/records/' + r1.id)).j; if (a.status === 'submitted' || a.status === 'failed') break; }
ok(a.status === 'submitted', 'fila+gateway: record submetido (retry no transitório)');
const stats = await get('/v1/records/stats');
ok(stats.s === 200 && typeof stats.j.total === 'number' && stats.j.byStatus && typeof stats.j.byStatus === 'object', 'stats: 200 com { total, byStatus }');
ok(stats.j.total >= 1 && (stats.j.byStatus.submitted || 0) >= 1, 'stats: agrega contagem por status presente');
ok((await get('/v1/records/stats')).j.error === undefined, "stats: rota resolve antes de /:id (não 404 tratando 'stats' como id)");
console.log(process.exitCode ? 'FALHOU' : 'OK — robusto');
