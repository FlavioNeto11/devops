// openapi-json.test.mjs — garante que o contrato é SERVÍVEL como JSON correto (não só válido em disco).
// Cobre o gap do anti-drift: validate.mjs só prova que o YAML casa com as rotas; aqui provamos que o
// parser de servir (openapi-json.mjs) produz o grafo completo com $ref resolvido, e que o openapi.yaml
// real declara as rotas que ENTREGAM o contrato (/v1/openapi.yaml e /v1/openapi.json). Sem Postgres.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseFlow, parseYamlFull, resolveRefs, openapiToJson } from '../openapi/openapi-json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const yamlText = readFileSync(join(here, '../openapi/openapi.yaml'), 'utf8');

test('parseFlow: mapas/listas/escalares de fluxo viram objetos JS tipados', () => {
  assert.deepEqual(parseFlow('{ a: 1, b: "x" }'), { a: 1, b: 'x' });
  assert.deepEqual(parseFlow('[a, b, c]'), ['a', 'b', 'c']);
  assert.deepEqual(parseFlow('{ type: integer, example: 1 }'), { type: 'integer', example: 1 });
  assert.deepEqual(parseFlow('{ s: { nested: true } }'), { s: { nested: true } });
  assert.equal(parseFlow('true'), true);
  assert.equal(parseFlow('42'), 42);
});

test('parseYamlFull: bloco + fluxo aninhados convivem', () => {
  const doc = parseYamlFull('info: { title: "T", version: "1.0.0" }\npaths:\n  /a:\n    get:\n      responses: { "200": { description: ok } }\n');
  assert.deepEqual(doc.info, { title: 'T', version: '1.0.0' });
  assert.equal(doc.paths['/a'].get.responses['200'].description, 'ok');
});

test('resolveRefs: $ref local é resolvido em cópia', () => {
  const resolved = resolveRefs({
    components: { schemas: { X: { type: 'object', properties: { a: { type: 'string' } } } } },
    paths: { '/x': { post: { requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/X' } } } } } } },
  });
  const schema = resolved.paths['/x'].post.requestBody.content['application/json'].schema;
  assert.equal(schema.type, 'object');
  assert.equal(schema.properties.a.type, 'string');
});

test('openapiToJson: o contrato REAL vira JSON completo e servível', () => {
  const doc = openapiToJson(yamlText);
  assert.equal(doc.openapi, '3.1.0', 'campo openapi presente');
  assert.deepEqual(doc.info, { title: 'ShopDesk API', version: '1.0.0' }, 'info parseado (não string)');
  assert.ok(Object.keys(doc.paths).length >= 20, 'muitos paths documentados');

  // a tela DEPENDE de o contrato declarar suas próprias rotas de entrega
  assert.ok(doc.paths['/v1/openapi.yaml'] && doc.paths['/v1/openapi.yaml'].get, 'rota /v1/openapi.yaml documentada');
  assert.ok(doc.paths['/v1/openapi.json'] && doc.paths['/v1/openapi.json'].get, 'rota /v1/openapi.json documentada');

  // operação com corpo: schema resolvido (não $ref, não string)
  const checkout = doc.paths['/v1/checkout'].post;
  const schema = checkout.requestBody.content['application/json'].schema;
  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, ['orderId', 'amount']);
  assert.equal(schema.properties.amount.type, 'number');

  // parâmetros (incluindo headers do contrato) resolvidos como objetos
  const tenant = checkout.parameters.find((p) => p.name === 'X-Tenant-Id');
  assert.ok(tenant, 'X-Tenant-Id presente nos parameters');
  assert.equal(tenant.in, 'header');
  assert.equal(tenant.required, true);
  const idem = checkout.parameters.find((p) => p.name === 'Idempotency-Key');
  assert.ok(idem, 'Idempotency-Key presente no checkout');

  // responses inline viram objetos com description
  assert.equal(doc.paths['/health'].get.responses['200'].description, 'ok');
});
