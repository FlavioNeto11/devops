// Testes estáticos das funções puras do validador de contrato OpenAPI.
// Rodam sem DB e sem servidor; cobrem o motor do gate contract-openapi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, normalizePath, extractDocumentedRoutes, extractServerRoutes, diffRoutes, validateSources } from '../openapi/validate.mjs';

// ---- normalizePath ----
test('normalizePath: converte {param} → {}', () => {
  assert.equal(normalizePath('/v1/jobs/{id}'), '/v1/jobs/{}');
  assert.equal(normalizePath('/v1/jobs/{id}/requeue'), '/v1/jobs/{}/requeue');
  assert.equal(normalizePath('/v1/health/jobs'), '/v1/health/jobs');
});

// ---- parseYaml ----
test('parseYaml: extrai paths simples', () => {
  const yaml = `openapi: 3.1.0\npaths:\n  /v1/jobs:\n    get:\n      operationId: listJobs\n      responses:\n        "200":\n          description: ok\n`;
  const result = parseYaml(yaml);
  assert.ok(result.paths && result.paths['/v1/jobs'], 'path /v1/jobs presente');
  assert.ok(result.paths['/v1/jobs'].get, 'método get presente');
});

// ---- extractDocumentedRoutes ----
test('extractDocumentedRoutes: extrai rotas da fila', () => {
  const openapi = {
    openapi: '3.1.0',
    paths: {
      '/v1/jobs': { get: { operationId: 'listJobs' } },
      '/v1/jobs/{id}': { get: { operationId: 'getJob' } },
      '/v1/jobs/{id}/requeue': { post: { operationId: 'requeueJob' } },
      '/v1/health/jobs': { get: { operationId: 'healthJobs' } },
    },
  };
  const routes = extractDocumentedRoutes(openapi);
  assert.ok(routes.has('GET /v1/jobs'), 'listJobs documentado');
  assert.ok(routes.has('GET /v1/jobs/{}'), 'getJob documentado');
  assert.ok(routes.has('POST /v1/jobs/{}/requeue'), 'requeueJob documentado');
  assert.ok(routes.has('GET /v1/health/jobs'), 'healthJobs documentado');
  assert.equal(routes.size, 4);
});

// ---- extractServerRoutes ----
test('extractServerRoutes: detecta rotas Express da fila', () => {
  const src = `
app.get('/v1/jobs', wrap(async (req, res) => res.json(await jobsRepo.list(req.query || {}))));
app.get('/v1/jobs/:id', wrap(async (req, res) => { const row = await jobsRepo.get(req.params.id); res.json(row); }));
app.post('/v1/jobs/:id/requeue', wrap(async (req, res) => { const row = await jobsRepo.requeue(req.params.id); res.json(row); }));
app.get('/v1/health/jobs', wrap(async (_q, res) => res.json({ status: 'ok', jobs: await jobsRepo.counts() })));
`;
  const routes = extractServerRoutes(src);
  assert.ok(routes.has('GET /v1/jobs'), 'GET /v1/jobs detectado');
  assert.ok(routes.has('GET /v1/jobs/{}'), 'GET /v1/jobs/:id normalizado');
  assert.ok(routes.has('POST /v1/jobs/{}/requeue'), 'POST requeue normalizado');
  assert.ok(routes.has('GET /v1/health/jobs'), 'GET health/jobs detectado');
});

// ---- diffRoutes ----
test('diffRoutes: sem drift quando sets são iguais', () => {
  const s = new Set(['GET /v1/jobs', 'GET /v1/jobs/{}', 'POST /v1/jobs/{}/requeue']);
  const d = new Set(['GET /v1/jobs', 'GET /v1/jobs/{}', 'POST /v1/jobs/{}/requeue']);
  const result = diffRoutes(s, d);
  assert.ok(result.ok, 'sem drift');
  assert.equal(result.missingInOpenapi.length, 0);
  assert.equal(result.missingInServer.length, 0);
});

test('diffRoutes: detecta rota implementada mas não documentada', () => {
  const server = new Set(['GET /v1/jobs', 'GET /v1/extra']);
  const documented = new Set(['GET /v1/jobs']);
  const result = diffRoutes(server, documented);
  assert.ok(!result.ok);
  assert.ok(result.missingInOpenapi.includes('GET /v1/extra'));
});

test('diffRoutes: detecta rota documentada mas não implementada', () => {
  const server = new Set(['GET /v1/jobs']);
  const documented = new Set(['GET /v1/jobs', 'POST /v1/jobs/{}/requeue']);
  const result = diffRoutes(server, documented);
  assert.ok(!result.ok);
  assert.ok(result.missingInServer.includes('POST /v1/jobs/{}/requeue'));
});

// ---- validateSources: smoke integrado ----
test('validateSources: aceita contrato mínimo válido da fila', () => {
  const openapiText = [
    'openapi: 3.1.0',
    'info:',
    '  title: test',
    '  version: 1.0.0',
    'paths:',
    '  /v1/jobs:',
    '    get:',
    '      operationId: listJobs',
    '      responses:',
    '        "200":',
    '          description: ok',
  ].join('\n');
  const serverSource = `app.get('/v1/jobs', handler);`;
  const result = validateSources({ openapiText, serverSource });
  assert.ok(result.ok, 'contrato mínimo sem drift');
});
