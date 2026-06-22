// openapi-contract.test.mjs — testa o validador de contrato (REQ-STOCKPILOT-0006)
// SEM Postgres e SEM rede: usa as funções puras + os arquivos reais do disco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  parseYaml,
  extractDocumentedRoutes,
  extractServerRoutes,
  diffRoutes,
  validateSources,
  validateFiles,
} from '../openapi/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const openapiPath = resolve(here, '..', 'openapi', 'openapi.yaml');
const serverPath = resolve(here, '..', 'src', 'server.js');

test('parseYaml lê o OpenAPI canônico e expõe paths + schemas', () => {
  const doc = parseYaml(readFileSync(openapiPath, 'utf8'));
  assert.equal(doc.openapi, '3.1.0');
  assert.ok(doc.paths && typeof doc.paths === 'object');
  assert.ok(doc.paths['/v1/products'], 'deve documentar /v1/products');
  assert.ok(doc.paths['/v1/products'].get, '/v1/products deve ter GET');
  // schemas exigidos pelo requisito
  const schemas = doc.components.schemas;
  for (const s of ['Product', 'Order', 'AuditEntry', 'Error']) {
    assert.ok(schemas[s], `schema ${s} deve existir`);
  }
  // Product.status com enum OK/ALERTA/RUPTURA
  assert.deepEqual(schemas.Product.properties.status.enum, ['OK', 'ALERTA', 'RUPTURA']);
});

test('o contrato real está SINCRONIZADO com o server.js (sem drift)', () => {
  const r = validateFiles({ openapiPath, serverPath });
  assert.equal(r.ok, true, 'drift inesperado: ' + JSON.stringify({
    missingInOpenapi: r.missingInOpenapi,
    missingInServer: r.missingInServer,
  }, null, 2));
  // sanidade: as rotas-chave do requisito estão cobertas
  const documented = extractDocumentedRoutes(parseYaml(readFileSync(openapiPath, 'utf8')));
  for (const route of [
    'GET /health',
    'GET /v1/products',
    'POST /v1/products/{}/order',
    'POST /v1/products/{}/reorder',
    'GET /v1/orders',
    'GET /v1/alerts',
    'GET /v1/audit',
  ]) {
    assert.ok(documented.has(route), `OpenAPI deve documentar ${route}`);
  }
});

test('extractServerRoutes captura app.get/app.post e converte :param → {}', () => {
  const src = `
    app.get('/health', wrap(h));
    app.post('/v1/products/:id/order', requireAuth, wrap(h));
    app.get('/v1/orders', wrap(h));
  `;
  const routes = extractServerRoutes(src);
  assert.ok(routes.has('GET /health'));
  assert.ok(routes.has('POST /v1/products/{}/order'));
  assert.ok(routes.has('GET /v1/orders'));
});

test('DRIFT: rota implementada mas NÃO documentada FALHA', () => {
  const openapiText = readFileSync(openapiPath, 'utf8');
  // server com uma rota nova que não está no OpenAPI
  const serverSource = `
    app.get('/health', wrap(h));
    app.get('/v1/products', requireAuth, wrap(h));
    app.post('/v1/products/:id/order', requireAuth, wrap(h));
    app.post('/v1/products/:id/reorder', requireAuth, wrap(h));
    app.get('/v1/orders', requireAuth, wrap(h));
    app.get('/v1/alerts', requireAuth, wrap(h));
    app.get('/v1/audit', requireAuth, wrap(h));
    app.get('/', (q, r) => r.json({}));
    app.get('/v1/health/jobs', wrap(h));
    app.get('/v1/records', wrap(h));
    app.get('/v1/records/:id', wrap(h));
    app.post('/v1/records', wrap(h));
    app.post('/v1/records/:id/submit', wrap(h));
    app.post('/v1/products/:id/teleport', wrap(h));  // <-- rota fantasma
  `;
  const r = validateSources({ openapiText, serverSource });
  assert.equal(r.ok, false);
  assert.ok(r.missingInOpenapi.includes('POST /v1/products/{}/teleport'));
});

test('DRIFT: rota documentada mas NÃO implementada FALHA', () => {
  const openapiText = readFileSync(openapiPath, 'utf8');
  // server sem a rota /v1/audit (documentada no OpenAPI)
  const serverSource = `
    app.get('/', (q, r) => r.json({}));
    app.get('/health', wrap(h));
    app.get('/v1/health/jobs', wrap(h));
    app.get('/v1/records', wrap(h));
    app.get('/v1/records/:id', wrap(h));
    app.post('/v1/records', wrap(h));
    app.post('/v1/records/:id/submit', wrap(h));
    app.get('/v1/products', requireAuth, wrap(h));
    app.post('/v1/products/:id/order', requireAuth, wrap(h));
    app.post('/v1/products/:id/reorder', requireAuth, wrap(h));
    app.get('/v1/orders', requireAuth, wrap(h));
    app.get('/v1/alerts', requireAuth, wrap(h));
  `;
  const r = validateSources({ openapiText, serverSource });
  assert.equal(r.ok, false);
  assert.ok(r.missingInServer.includes('GET /v1/audit'));
});

test('diffRoutes detecta divergência em ambas as direções', () => {
  const server = new Set(['GET /a', 'POST /b']);
  const documented = new Set(['GET /a', 'GET /c']);
  const r = diffRoutes(server, documented);
  assert.deepEqual(r.missingInOpenapi, ['POST /b']);
  assert.deepEqual(r.missingInServer, ['GET /c']);
  assert.equal(r.ok, false);
});
