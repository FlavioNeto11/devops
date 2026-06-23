// test/openapi-validate.test.mjs — testes unitários das funções puras de openapi/validate.mjs.
// Rodam sem Postgres nem I/O — apenas lógica de parse YAML e diff de rotas.
// Exercem o contrato REQ-HELPFLOW-0003 (contract-first, drift bidirecional).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseYaml,
  normalizePath,
  extractDocumentedRoutes,
  extractServerRoutes,
  diffRoutes,
  validateSources,
} from '../openapi/validate.mjs';

// ---------------------------------------------------------------------------
// parseYaml
// ---------------------------------------------------------------------------

test('parseYaml — mapa simples', () => {
  const yaml = 'openapi: 3.1.0\ninfo:\n  title: Test\n  version: 1.0.0\n';
  const r = parseYaml(yaml);
  assert.equal(r.openapi, '3.1.0');
  assert.equal(r.info.title, 'Test');
  assert.equal(r.info.version, '1.0.0');
});

test('parseYaml — paths com parâmetros {id}', () => {
  const yaml = [
    'openapi: 3.1.0',
    'paths:',
    '  /v1/customers:',
    '    get:',
    '      operationId: listCustomers',
    '      responses: { "200": { description: ok } }',
    '    post:',
    '      operationId: createCustomer',
    '      responses: { "200": { description: ok } }',
    '  /v1/customers/{id}:',
    '    get:',
    '      operationId: getCustomer',
    '      responses: { "200": { description: ok } }',
    '    put:',
    '      operationId: updateCustomer',
    '      responses: { "200": { description: ok } }',
    '    delete:',
    '      operationId: deleteCustomer',
    '      responses: { "200": { description: ok } }',
  ].join('\n');
  const r = parseYaml(yaml);
  assert.ok(r.paths['/v1/customers'].get, 'GET /v1/customers documentado');
  assert.ok(r.paths['/v1/customers'].post, 'POST /v1/customers documentado');
  assert.ok(r.paths['/v1/customers/{id}'].get, 'GET /v1/customers/{id} documentado');
  assert.ok(r.paths['/v1/customers/{id}'].put, 'PUT /v1/customers/{id} documentado');
  assert.ok(r.paths['/v1/customers/{id}'].delete, 'DELETE /v1/customers/{id} documentado');
});

test('parseYaml — texto vazio retorna objeto', () => {
  const r = parseYaml('');
  assert.ok(r !== null && typeof r === 'object');
});

// ---------------------------------------------------------------------------
// normalizePath
// ---------------------------------------------------------------------------

test('normalizePath — converte {param} em {}', () => {
  assert.equal(normalizePath('/v1/customers/{id}'), '/v1/customers/{}');
  assert.equal(normalizePath('/v1/jobs/{id}/requeue'), '/v1/jobs/{}/requeue');
  assert.equal(normalizePath('/integrations/{id}/test'), '/integrations/{}/test');
  assert.equal(normalizePath('/health'), '/health');
  assert.equal(normalizePath('/v1/customers'), '/v1/customers');
});

test('normalizePath — múltiplos parâmetros', () => {
  assert.equal(normalizePath('/{org}/{repo}/pulls/{num}'), '/{}/{}/pulls/{}');
});

// ---------------------------------------------------------------------------
// extractDocumentedRoutes
// ---------------------------------------------------------------------------

test('extractDocumentedRoutes — extrai métodos HTTP de paths OpenAPI', () => {
  const openapi = {
    paths: {
      '/v1/customers': { get: { operationId: 'list' }, post: { operationId: 'create' } },
      '/v1/customers/{id}': {
        get: { operationId: 'get' },
        put: { operationId: 'update' },
        delete: { operationId: 'delete' },
      },
    },
  };
  const routes = extractDocumentedRoutes(openapi);
  assert.ok(routes.has('GET /v1/customers'));
  assert.ok(routes.has('POST /v1/customers'));
  assert.ok(routes.has('GET /v1/customers/{}'));
  assert.ok(routes.has('PUT /v1/customers/{}'));
  assert.ok(routes.has('DELETE /v1/customers/{}'));
  assert.equal(routes.size, 5);
});

test('extractDocumentedRoutes — set vazio quando paths ausente', () => {
  assert.equal(extractDocumentedRoutes({}).size, 0);
  assert.equal(extractDocumentedRoutes(null).size, 0);
  assert.equal(extractDocumentedRoutes({ paths: null }).size, 0);
});

test('extractDocumentedRoutes — normaliza {param} para {}', () => {
  const openapi = {
    paths: {
      '/v1/jobs/{id}/requeue': { post: { operationId: 'requeue' } },
    },
  };
  const routes = extractDocumentedRoutes(openapi);
  assert.ok(routes.has('POST /v1/jobs/{}/requeue'));
});

// ---------------------------------------------------------------------------
// extractServerRoutes
// ---------------------------------------------------------------------------

test('extractServerRoutes — extrai rotas app.METHOD do server.js', () => {
  const src = [
    "app.get('/v1/customers', handler);",
    "app.post('/v1/customers', handler);",
    "app.get('/v1/customers/:id', handler);",
    "app.put('/v1/customers/:id', handler);",
    "app.delete('/v1/customers/:id', handler);",
  ].join('\n');
  const routes = extractServerRoutes(src);
  assert.ok(routes.has('GET /v1/customers'));
  assert.ok(routes.has('POST /v1/customers'));
  assert.ok(routes.has('GET /v1/customers/{}'));
  assert.ok(routes.has('PUT /v1/customers/{}'));
  assert.ok(routes.has('DELETE /v1/customers/{}'));
  assert.equal(routes.size, 5);
});

test('extractServerRoutes — converte :param Express para {}', () => {
  const src = "app.post('/v1/jobs/:id/requeue', handler);";
  const routes = extractServerRoutes(src);
  assert.ok(routes.has('POST /v1/jobs/{}/requeue'));
});

test('extractServerRoutes — ignora linhas sem app.METHOD', () => {
  const src = "const x = 1;\n// comentário\napp.use(json());";
  const routes = extractServerRoutes(src);
  assert.equal(routes.size, 0);
});

// ---------------------------------------------------------------------------
// diffRoutes
// ---------------------------------------------------------------------------

test('diffRoutes — ok quando sem drift', () => {
  const s = new Set(['GET /v1/customers', 'POST /v1/customers', 'PUT /v1/customers/{}']);
  const d = new Set(['GET /v1/customers', 'POST /v1/customers', 'PUT /v1/customers/{}']);
  const r = diffRoutes(s, d);
  assert.ok(r.ok);
  assert.equal(r.missingInOpenapi.length, 0);
  assert.equal(r.missingInServer.length, 0);
});

test('diffRoutes — detecta rota implementada mas não documentada', () => {
  const s = new Set(['GET /v1/customers', 'DELETE /v1/customers/{}']);
  const d = new Set(['GET /v1/customers']);
  const r = diffRoutes(s, d);
  assert.ok(!r.ok);
  assert.deepEqual(r.missingInOpenapi, ['DELETE /v1/customers/{}']);
  assert.equal(r.missingInServer.length, 0);
});

test('diffRoutes — detecta rota documentada mas não implementada', () => {
  const s = new Set(['GET /v1/customers']);
  const d = new Set(['GET /v1/customers', 'PUT /v1/customers/{}']);
  const r = diffRoutes(s, d);
  assert.ok(!r.ok);
  assert.equal(r.missingInOpenapi.length, 0);
  assert.deepEqual(r.missingInServer, ['PUT /v1/customers/{}']);
});

test('diffRoutes — detecta drift bidirecional', () => {
  const s = new Set(['GET /v1/customers', 'DELETE /v1/customers/{}']);
  const d = new Set(['GET /v1/customers', 'PUT /v1/customers/{}']);
  const r = diffRoutes(s, d);
  assert.ok(!r.ok);
  assert.deepEqual(r.missingInOpenapi, ['DELETE /v1/customers/{}']);
  assert.deepEqual(r.missingInServer, ['PUT /v1/customers/{}']);
});

// ---------------------------------------------------------------------------
// validateSources — end-to-end sem I/O
// ---------------------------------------------------------------------------

test('validateSources — sem drift (contrato íntegro)', () => {
  const openapiText = [
    'openapi: 3.1.0',
    'info:',
    '  title: Test',
    '  version: 1.0.0',
    'paths:',
    '  /health:',
    '    get:',
    '      operationId: health',
    '      responses: { "200": { description: ok } }',
    '  /v1/customers:',
    '    get:',
    '      operationId: listCustomers',
    '      responses: { "200": { description: ok } }',
    '    post:',
    '      operationId: createCustomer',
    '      responses: { "200": { description: ok } }',
    '  /v1/customers/{id}:',
    '    get:',
    '      operationId: getCustomer',
    '      responses: { "200": { description: ok } }',
    '    put:',
    '      operationId: updateCustomer',
    '      responses: { "200": { description: ok } }',
    '    delete:',
    '      operationId: deleteCustomer',
    '      responses: { "200": { description: ok } }',
  ].join('\n');
  const serverSource = [
    "app.get('/health', handler);",
    "app.get('/v1/customers', handler);",
    "app.post('/v1/customers', handler);",
    "app.get('/v1/customers/:id', handler);",
    "app.put('/v1/customers/:id', handler);",
    "app.delete('/v1/customers/:id', handler);",
  ].join('\n');
  const r = validateSources({ openapiText, serverSource });
  assert.ok(r.ok, 'nenhum drift esperado');
  assert.equal(r.missingInOpenapi.length, 0);
  assert.equal(r.missingInServer.length, 0);
  assert.equal(r.counts.documented, 6);
  assert.equal(r.counts.implemented, 6);
});

test('validateSources — detecta drift: rota implementada faltando no OpenAPI', () => {
  const openapiText = [
    'openapi: 3.1.0',
    'paths:',
    '  /health:',
    '    get:',
    '      operationId: health',
    '      responses: { "200": { description: ok } }',
  ].join('\n');
  const serverSource = [
    "app.get('/health', handler);",
    "app.get('/v1/customers', handler);",
  ].join('\n');
  const r = validateSources({ openapiText, serverSource });
  assert.ok(!r.ok);
  assert.ok(r.missingInOpenapi.includes('GET /v1/customers'));
});

test('validateSources — lança erro quando campo openapi ausente', () => {
  const openapiText = 'title: Test\n';
  const serverSource = "app.get('/health', h);";
  assert.throws(
    () => validateSources({ openapiText, serverSource }),
    /OpenAPI inválido/,
  );
});

test('validateSources — lança erro quando sem paths documentados', () => {
  const openapiText = 'openapi: 3.1.0\ninfo:\n  title: Test\n';
  const serverSource = "app.get('/health', h);";
  assert.throws(
    () => validateSources({ openapiText, serverSource }),
    /sem paths documentados/,
  );
});
