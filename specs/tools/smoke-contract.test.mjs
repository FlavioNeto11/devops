// Testes do smoke-contract: funções puras (parse/inferência/extração/resumo) +
// executor HTTP contra um servidor node:http efêmero em memória (sem dependências).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseArgs, inferListPath, extractId, summarize, isLocalBase, runSmoke } from './smoke-contract.mjs';

// ---------------------------------------------------------------------------
// parseArgs (pura)
// ---------------------------------------------------------------------------
test('parseArgs: completo, sem erros; strip de barra final na base', () => {
  const o = parseArgs(['--product', 'shopdesk', '--base', 'http://localhost:18090/', '--list-path', '/v1/records', '--metrics', 'http://localhost:18091/metrics', '--crud', '--run-id', 'r1']);
  assert.deepEqual(o.errors, []);
  assert.equal(o.base, 'http://localhost:18090');
  assert.equal(o.listPath, '/v1/records');
  assert.equal(o.crud, true);
  assert.equal(o.runId, 'r1');
});

test('parseArgs: faltando product/base e flag desconhecida => errors', () => {
  const o = parseArgs(['--foo', 'bar']);
  assert.ok(o.errors.some((e) => /--product/.test(e)));
  assert.ok(o.errors.some((e) => /--base/.test(e)));
  assert.ok(o.errors.some((e) => /flag desconhecida/.test(e)));
});

test('parseArgs: product inválido e list-path sem / => errors', () => {
  const o = parseArgs(['--product', 'X_Bad', '--base', 'http://x', '--list-path', 'v1/records']);
  assert.ok(o.errors.some((e) => /--product/.test(e)));
  assert.ok(o.errors.some((e) => /--list-path/.test(e)));
});

// ---------------------------------------------------------------------------
// inferListPath (pura)
// ---------------------------------------------------------------------------
const SRC_MANY = `
app.get('/health', async () => ({ ok: true }));
app.get('/v1/health/queue', async () => ({}));
app.get('/v1/records', async (req) => ({ data: [] }));
app.get('/v1/consultations', async (req) => ({}));
app.get('/v1/patients', { preHandler: x }, async (req) => ({}));
app.get('/v1/records/:id', async (req) => ({}));
app.get('/v1/users', async () => ({}));
`;

test('inferListPath: prefere a rota canônica /v1/records', () => {
  assert.equal(inferListPath(SRC_MANY), '/v1/records');
});

test('inferListPath: uma única candidata (fora da denylist) => usa-a', () => {
  const src = `app.get('/v1/invoices', async () => ({})); app.get('/v1/health/queue', x); app.get('/v1/users', x);`;
  assert.equal(inferListPath(src), '/v1/invoices');
});

test('inferListPath: ambíguo (2+ candidatas sem records) => null', () => {
  const src = `app.get('/v1/invoices', x); app.get('/v1/clients', x);`;
  assert.equal(inferListPath(src), null);
});

test('inferListPath: só rotas de infra (denylist) ou fonte vazio => null', () => {
  assert.equal(inferListPath(`app.get('/v1/users', x); app.get('/v1/audit', x);`), null);
  assert.equal(inferListPath(''), null);
  assert.equal(inferListPath(null), null);
});

// ---------------------------------------------------------------------------
// extractId / isLocalBase / summarize (puras)
// ---------------------------------------------------------------------------
test('extractId: formatos comuns dos scaffolds', () => {
  assert.equal(extractId({ id: 7 }), 7);
  assert.equal(extractId({ data: { id: 'abc' } }), 'abc');
  assert.equal(extractId({ record: { id: 3 } }), 3);
  assert.equal(extractId({}), null);
  assert.equal(extractId(null), null);
  assert.equal(extractId({ id: { nested: true } }), null);
});

test('isLocalBase: localhost/127.0.0.1 sim; host público/lixo não', () => {
  assert.equal(isLocalBase('http://localhost:18090'), true);
  assert.equal(isLocalBase('http://127.0.0.1:8080'), true);
  assert.equal(isLocalBase('http://nvit.localhost/shopdesk'), false);
  assert.equal(isLocalBase('http://example.com'), false);
  assert.equal(isLocalBase('not-a-url'), false);
});

test('summarize: falha reprova; só warnings não reprovam', () => {
  const withFail = summarize([{ name: 'a', level: 'ok', detail: 'x' }, { name: 'b', level: 'fail', detail: 'y' }]);
  assert.equal(withFail.ok, false);
  const warnsOnly = summarize([{ name: 'a', level: 'ok', detail: 'x' }, { name: 'b', level: 'warn', detail: 'y' }]);
  assert.equal(warnsOnly.ok, true);
  assert.match(warnsOnly.lines.at(-1), /1 warning/);
});

// ---------------------------------------------------------------------------
// Executor HTTP — servidor efêmero em memória (entidade /v1/records)
// ---------------------------------------------------------------------------
function startServer({ healthStatus = 200, postStatus = null, listStatus = 200 } = {}) {
  const store = new Map();
  let seq = 1;
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (code, obj) => {
        res.statusCode = code;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(obj));
      };
      const u = req.url;
      if (req.method === 'GET' && u === '/health') return send(healthStatus, healthStatus === 200 ? { status: 'ok', db: 'connected' } : { error: 'down' });
      if (req.method === 'GET' && u === '/metrics') { res.statusCode = 200; return res.end('# HELP fake_metric x\nfake_metric 1\n'); }
      if (u === '/v1/records' && req.method === 'GET') {
        if (listStatus !== 200) return send(listStatus, { error: { message: 'no' } });
        return send(200, { data: [...store.values()] });
      }
      if (u === '/v1/records' && req.method === 'POST') {
        if (postStatus) return send(postStatus, { error: { message: 'blocked' } });
        const b = JSON.parse(body || '{}');
        const id = seq++;
        store.set(id, { id, ...b });
        return send(201, { id, ...b });
      }
      const m = u.match(/^\/v1\/records\/(\d+)$/);
      if (m) {
        const id = Number(m[1]);
        if (!store.has(id)) return send(404, { error: { message: 'não encontrado' } });
        if (req.method === 'GET') return send(200, store.get(id));
        if (req.method === 'PUT') { store.set(id, { ...store.get(id), ...JSON.parse(body || '{}') }); return send(200, store.get(id)); }
        if (req.method === 'DELETE') { store.delete(id); return send(200, { ok: true }); }
      }
      send(404, { error: { message: 'nf' } });
    });
  });
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => resolve({ srv, store, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

const baseOpts = (base, extra = {}) => ({ product: 'foo', base, timeoutMs: 3000, runId: 'test1', ...extra });

test('executor: read-only feliz (health + metrics + lista explícita) => ok, sem falha', async () => {
  const { srv, base } = await startServer();
  try {
    const { ok, results } = await runSmoke(baseOpts(base, { listPath: '/v1/records', metrics: `${base}/metrics` }));
    assert.equal(ok, true);
    assert.equal(results.find((r) => r.name === 'health').level, 'ok');
    assert.equal(results.find((r) => r.name === 'metrics').level, 'ok');
    assert.equal(results.find((r) => r.name === 'list').level, 'ok');
  } finally { srv.close(); }
});

test('executor: /health 500 => falha crítica (ok=false)', async () => {
  const { srv, base } = await startServer({ healthStatus: 500 });
  try {
    const { ok, results } = await runSmoke(baseOpts(base, { listPath: '/v1/records' }));
    assert.equal(ok, false);
    assert.equal(results.find((r) => r.name === 'health').level, 'fail');
  } finally { srv.close(); }
});

test('executor: lista inferida do fonte do app via deps.readFile', async () => {
  const { srv, base } = await startServer();
  try {
    const { ok, results } = await runSmoke(
      baseOpts(base, { appDir: 'apps/foo' }),
      { readFile: () => SRC_MANY },
    );
    assert.equal(ok, true);
    const list = results.find((r) => r.name === 'list');
    assert.equal(list.level, 'ok');
    assert.match(list.detail, /inferida/);
  } finally { srv.close(); }
});

test('executor: sem list-path e sem inferência => warning de cobertura parcial (não falha)', async () => {
  const { srv, base } = await startServer();
  try {
    const { ok, results } = await runSmoke(baseOpts(base), { readFile: () => null });
    assert.equal(ok, true);
    assert.equal(results.find((r) => r.name === 'list').level, 'warn');
    assert.equal(results.find((r) => r.name === 'metrics').level, 'warn'); // sem --metrics
  } finally { srv.close(); }
});

test('executor: lista protegida (401) => warning, não falha', async () => {
  const { srv, base } = await startServer({ listStatus: 401 });
  try {
    const { ok, results } = await runSmoke(baseOpts(base, { listPath: '/v1/records' }));
    assert.equal(ok, true);
    assert.match(results.find((r) => r.name === 'list').detail, /protegida/);
  } finally { srv.close(); }
});

test('executor: CRUD completo cria->lê->atualiza->apaga e deixa o store limpo', async () => {
  const { srv, store, base } = await startServer();
  try {
    const { ok, results } = await runSmoke(baseOpts(base, { listPath: '/v1/records', crud: true }));
    assert.equal(ok, true);
    for (const name of ['crud-create', 'crud-read', 'crud-update', 'crud-cleanup']) {
      assert.equal(results.find((r) => r.name === name).level, 'ok', `check ${name}`);
    }
    assert.equal(store.size, 0, 'limpeza: nenhum registro de smoke sobrando');
  } finally { srv.close(); }
});

test('executor: CRUD bloqueado por auth (POST 401) => falha clara', async () => {
  const { srv, base } = await startServer({ postStatus: 401 });
  try {
    const { ok, results } = await runSmoke(baseOpts(base, { listPath: '/v1/records', crud: true }));
    assert.equal(ok, false);
    assert.match(results.find((r) => r.name === 'crud-create').detail, /auth/);
  } finally { srv.close(); }
});

test('executor: CRUD recusado quando a base NÃO é localhost (guard-rail de produção)', async () => {
  // stub de fetch: qualquer GET responde 200 JSON — o guard tem que barrar ANTES do POST.
  const stubFetch = async () => ({ status: 200, text: async () => JSON.stringify({ ok: true, data: [] }) });
  const { ok, results } = await runSmoke(
    baseOpts('http://prod.example.com', { listPath: '/v1/records', crud: true, metrics: 'http://prod.example.com/metrics' }),
    { fetchImpl: stubFetch },
  );
  assert.equal(ok, false);
  const crud = results.find((r) => r.name === 'crud');
  assert.match(crud.detail, /recusado/i);
  assert.ok(!results.some((r) => r.name === 'crud-create'), 'nenhum POST foi tentado');
});
