// Testes do extract-backend-contract.mjs — tabela de rotas extraída do backend real
// (modo não-openapi do grounding de contrato). Regras sob teste: extração
// DETERMINÍSTICA de rotas Fastify/Express; campos de body/query por LEITURA CLARA
// (b.campo / destructuring) com uso opaco abrindo o shape (honestidade); campos de
// resposta só quando todo return é literal; enums via CONST.includes(campo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  scanRegions, toTemplate, extractRoutesFromSource, extractBackendContract,
  parseObjectLiteralKeys, collectModuleEnums,
} from './extract-backend-contract.mjs';

// ---- scanner (comentários/strings/templates/regex) ------------------------------------------

test('scanRegions: comentários viram espaço; strings marcadas; ${} de template é código', () => {
  const src = "const a = '/v1/x'; // rota\nconst b = `pre${id}pos`; /* c */ const r = /a\\/b/;";
  const { masked, inString } = scanRegions(src);
  assert.ok(!masked.includes('// rota'), 'comentário de linha removido');
  assert.ok(!masked.includes('/* c */'), 'comentário de bloco removido');
  const litIdx = src.indexOf("'/v1/x'");
  assert.equal(inString[litIdx], 1, 'aspas contam como string');
  const idIdx = src.indexOf('id');
  assert.equal(inString[idIdx], 0, 'código dentro de ${} NÃO é string');
  const regexBody = src.indexOf('a\\/b');
  assert.equal(inString[regexBody], 1, 'corpo de regex literal tratado como não-código');
});

test('toTemplate: :id vira {id}; params coletados', () => {
  assert.deepEqual(toTemplate('/v1/tasks/:id/comments'), { template: '/v1/tasks/{id}/comments', params: ['id'] });
  assert.deepEqual(toTemplate('/health'), { template: '/health', params: [] });
});

test('parseObjectLiteralKeys: chaves top-level; spread abre o shape', () => {
  const src = 'x = { a: 1, b, "c": f(), nested: { deep: 2 } }';
  const { masked, inString } = scanRegions(src);
  const r = parseObjectLiteralKeys(masked, inString, src.indexOf('{'));
  assert.deepEqual(r.keys.sort(), ['a', 'b', 'c', 'nested']);
  assert.equal(r.open, false);
  const src2 = 'x = { a: 1, ...rest }';
  const s2 = scanRegions(src2);
  assert.equal(parseObjectLiteralKeys(s2.masked, s2.inString, src2.indexOf('{')).open, true);
});

// ---- extração de rotas -----------------------------------------------------------------------

const FIXTURE = `
import { pool } from '../db.js';
const STATUS = ['pendente', 'pago', 'cancelado'];
export function registerRoutes(app) {
  app.get('/v1/items', async (req) => {
    const { status, tipo } = req.query || {};
    const { rows } = await pool.query('SELECT 1');
    return { data: rows, total: rows.length };
  });
  app.post('/v1/items', async (req, reply) => {
    const b = req.body || {};
    if (!b.title) { reply.code(400); return { error: { message: 'title obrigatório' } }; }
    if (b.status && !STATUS.includes(b.status)) { reply.code(400); return { error: { message: 'x' } }; }
    reply.code(201); return { id: 1, title: b.title, status: b.status };
  });
  app.patch('/v1/items/:id/status', async (req, reply) => {
    const { novo_status } = req.body || {};
    if (!STATUS.includes(novo_status)) { reply.code(400); return { error: { message: 'x' } }; }
    const { rows } = await pool.query('UPDATE items SET status=$1', [novo_status]);
    return rows[0];
  });
  app.post('/v1/items/bulk', async (req) => {
    const b = req.body || {};
    return await bulkInsert(b); // body inteiro passado adiante => shape ABERTO
  });
  // não é rota: Map.get com 1 arg
  const cache = new Map();
  cache.get('/v1/items');
}
`;

test('rotas: app.<method>(path, handler) extraído; Map.get(1 arg) ignorado; :id normalizado', () => {
  const { routes } = extractRoutesFromSource(FIXTURE, 'routes/items.js');
  const templates = routes.map((r) => r.method.toUpperCase() + ' ' + r.template).sort();
  assert.deepEqual(templates, [
    'GET /v1/items',
    'PATCH /v1/items/{id}/status',
    'POST /v1/items',
    'POST /v1/items/bulk',
  ]);
});

test('campos de body por LEITURA CLARA: b.campo e destructuring; shape fechado', () => {
  const { routes } = extractRoutesFromSource(FIXTURE, 'f.js');
  const post = routes.find((r) => r.method === 'post' && r.template === '/v1/items');
  assert.deepEqual([...post.bodyFields].sort(), ['status', 'title']);
  assert.equal(post.bodyOpen, false, 'só leituras claras => shape FECHADO');
  const patch = routes.find((r) => r.method === 'patch');
  assert.deepEqual([...patch.bodyFields], ['novo_status']);
  assert.equal(patch.bodyOpen, false);
});

test('uso opaco do body (passado inteiro a função) => bodyOpen (ausência não é provável)', () => {
  const { routes } = extractRoutesFromSource(FIXTURE, 'f.js');
  const bulk = routes.find((r) => r.template === '/v1/items/bulk');
  assert.equal(bulk.bodyOpen, true);
});

test('query fields via destructuring de req.query', () => {
  const { routes } = extractRoutesFromSource(FIXTURE, 'f.js');
  const list = routes.find((r) => r.method === 'get');
  assert.deepEqual([...list.queryFields].sort(), ['status', 'tipo']);
});

test('resposta: returns literais => shape FECHADO com as chaves; return rows[0] => ABERTO', () => {
  const { routes } = extractRoutesFromSource(FIXTURE, 'f.js');
  const list = routes.find((r) => r.method === 'get');
  assert.deepEqual([...list.responseFields].sort(), ['data', 'total']);
  assert.equal(list.responseOpen, false);
  const post = routes.find((r) => r.method === 'post' && r.template === '/v1/items');
  assert.ok(post.responseFields.has('id') && post.responseFields.has('error'));
  assert.equal(post.responseOpen, false);
  const patch = routes.find((r) => r.method === 'patch');
  assert.equal(patch.responseOpen, true, 'return rows[0] é opaco');
});

test('resposta: return de const resolvível a literal conta; .join() (string) NÃO abre o shape', () => {
  const src = `
  app.get('/v1/report', async (req, reply) => {
    const report = { gerado_em: 1, resumo: {}, notas: [] };
    if (req.query.format === 'csv') { reply.type('text/csv'); return lines.join('\\n'); }
    return report;
  });`;
  const { routes } = extractRoutesFromSource(src, 'f.js');
  assert.deepEqual([...routes[0].responseFields].sort(), ['gerado_em', 'notas', 'resumo']);
  assert.equal(routes[0].responseOpen, false);
});

test('enums: CONST.includes(<campo do body>) vira enum do campo', () => {
  const { routes } = extractRoutesFromSource(FIXTURE, 'f.js');
  const patch = routes.find((r) => r.method === 'patch');
  assert.deepEqual(patch.enums.novo_status, ['pendente', 'pago', 'cancelado']);
  const post = routes.find((r) => r.method === 'post' && r.template === '/v1/items');
  assert.deepEqual(post.enums.status, ['pendente', 'pago', 'cancelado']);
});

test('collectModuleEnums: só arrays 100% de strings literais valem como enum', () => {
  const src = "const A = ['x', 'y']; const B = ['x', foo()]; const C = [1, 2];";
  const { masked, inString } = scanRegions(src);
  const enums = collectModuleEnums(masked, inString);
  assert.deepEqual(enums.get('A'), ['x', 'y']);
  assert.equal(enums.has('B'), false);
  assert.equal(enums.has('C'), false);
});

test('multipart: detectado por addContentTypeParser no app OU tratamento no handler', () => {
  const withParser = "app.addContentTypeParser('multipart/form-data', h); app.post('/v1/up', async (req) => { return { ok: true }; });";
  assert.equal(extractRoutesFromSource(withParser, 'f.js').fileMultipart, true);
  const inHandler = "app.post('/v1/up', async (req) => { const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data'); return { ok: true }; });";
  const r = extractRoutesFromSource(inHandler, 'f.js');
  assert.equal(r.fileMultipart, false);
  assert.equal(r.routes[0].handlesMultipart, true);
});

test('rota com opts ({ preHandler }) entre path e handler funciona', () => {
  const src = "app.delete('/v1/items/:id', { preHandler: requireRole('admin') }, async (req) => { return { deleted: true }; });";
  const { routes } = extractRoutesFromSource(src, 'f.js');
  assert.equal(routes.length, 1);
  assert.equal(routes[0].template, '/v1/items/{id}');
  assert.equal(routes[0].method, 'delete');
});

// ---- extractBackendContract (diretório) ------------------------------------------------------

test('extractBackendContract: varre src/**, mescla por template, exclui node_modules/vendor', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ebc-'));
  fs.mkdirSync(path.join(tmp, 'routes'));
  fs.mkdirSync(path.join(tmp, 'vendor'));
  fs.writeFileSync(path.join(tmp, 'server.js'), "app.get('/health', async () => ({ status: 'ok' })); app.get('/v1/items', async (req) => ({ data: [] }));");
  fs.writeFileSync(path.join(tmp, 'routes', 'items.js'), "export function r(app) { app.post('/v1/items', async (req) => { const b = req.body || {}; return { id: 1, title: b.title }; }); }");
  fs.writeFileSync(path.join(tmp, 'vendor', 'lib.js'), "app.get('/v1/vendored', async () => ({}));");
  const c = extractBackendContract(tmp);
  const items = c.paths.find((e) => e.template === '/v1/items');
  assert.deepEqual([...items.methods].sort(), ['get', 'post'], 'métodos mesclados de arquivos distintos');
  assert.ok(items.ops.post.bodyFields.has('title'));
  assert.ok(!c.paths.some((e) => e.template === '/v1/vendored'), 'vendor/ excluído');
  assert.ok(c.paths.some((e) => e.template === '/health'));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('SQL: colunas de SELECT/RETURNING/INSERT viram campos (união); SELECT * abre o shape', () => {
  const src = `
  app.get('/v1/audit', async (req) => {
    const { rows } = await pool.query(
      'SELECT id, gateway, t.method, duration_ms AS dur FROM gateway_audit_log t ORDER BY logged_at DESC');
    return { data: rows, count: rows.length };
  });
  app.get('/v1/all', async (req) => {
    const { rows } = await pool.query('SELECT * FROM items');
    return { data: rows };
  });`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ebc-sql-'));
  fs.writeFileSync(path.join(tmp, 'server.js'), src);
  const c = extractBackendContract(tmp);
  const audit = c.paths.find((e) => e.template === '/v1/audit');
  for (const f of ['id', 'gateway', 'method', 'dur', 'data', 'count']) assert.ok(audit.fields.has(f), 'campo ' + f);
  assert.equal(audit.open, false, 'lista de colunas explícita => shape provável');
  const all = c.paths.find((e) => e.template === '/v1/all');
  assert.equal(all.open, true, 'SELECT * => ausência de coluna não é provável');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('resposta: chaves ANINHADAS de literais entram na união refinement-compat (paridade com openapi)', () => {
  const src = `
  app.get('/v1/gw/health', async () => {
    return { gateways: { sefaz: { mode: 'sandbox', cert_configured: false } } };
  });`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ebc-deep-'));
  fs.writeFileSync(path.join(tmp, 'server.js'), src);
  const c = extractBackendContract(tmp);
  const e = c.paths.find((x) => x.template === '/v1/gw/health');
  for (const f of ['gateways', 'sefaz', 'mode', 'cert_configured']) assert.ok(e.fields.has(f), 'campo ' + f);
  assert.deepEqual([...e.ops.get.responseFields], ['gateways'], 'primeiro nível separado p/ o check de leitura das views');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('retorno implícito de arrow (async () => ({...})) conta como resposta FECHADA', () => {
  const src = "app.get('/me', async (req) => ({ email: null, name: null, role: null }));";
  const { routes } = extractRoutesFromSource(src, 'f.js');
  assert.deepEqual([...routes[0].responseFields].sort(), ['email', 'name', 'role']);
  assert.equal(routes[0].responseOpen, false);
});
