import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

test('AC1: openapi.yaml canônico existe em src/openapi/', () => {
  const specPath = path.join(root, 'src/openapi/openapi.yaml');
  assert.ok(fs.existsSync(specPath), 'src/openapi/openapi.yaml não encontrado');

  const spec = YAML.parse(fs.readFileSync(specPath, 'utf-8'));
  assert.equal(spec.openapi, '3.1.0', 'OpenAPI deve ser 3.1.0');
  assert.ok(spec.info?.title, 'info.title obrigatório');
  assert.ok(spec.paths, 'paths obrigatório');

  const required = ['/', '/health', '/v1/records', '/v1/records/{id}', '/v1/records/{id}/submit'];
  for (const route of required) {
    assert.ok(spec.paths[route], `Rota ${route} não documentada`);
  }
});

test('AC2: src/generated/operations.ts existe e exporta OperationDefinition', () => {
  const tsPath = path.join(root, 'src/generated/operations.ts');
  assert.ok(fs.existsSync(tsPath), 'src/generated/operations.ts não encontrado');

  const content = fs.readFileSync(tsPath, 'utf-8');
  assert.ok(content.includes('OperationDefinition'), 'deve exportar OperationDefinition');
  assert.ok(content.includes('export const operations'), 'deve exportar operations');
  assert.ok(content.includes('OperationKey'), 'deve exportar OperationKey');
});

test('AC2: src/generated/operations.js existe e está em sincronia com openapi.yaml', () => {
  const jsPath = path.join(root, 'src/generated/operations.js');
  assert.ok(fs.existsSync(jsPath), 'src/generated/operations.js não encontrado');

  const specPath = path.join(root, 'src/openapi/openapi.yaml');
  const spec = YAML.parse(fs.readFileSync(specPath, 'utf-8'));

  const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
  const specRoutes = new Set();
  for (const [p, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of Object.keys(pathItem)) {
      if (HTTP_METHODS.has(method.toLowerCase())) specRoutes.add(`${method.toLowerCase()} ${p}`);
    }
  }

  const jsContent = fs.readFileSync(jsPath, 'utf-8');
  for (const route of specRoutes) {
    const [method, specPath] = route.split(' ');
    assert.ok(jsContent.includes(`"specPath": "${specPath}"`), `operations.js não contém specPath para ${route}`);
    assert.ok(jsContent.includes(`"method": "${method}"`), `operations.js não contém método para ${route}`);
  }
});

test('AC4: OpenAPI contém exemplos de requisição e resposta', () => {
  const specPath = path.join(root, 'src/openapi/openapi.yaml');
  const spec = YAML.parse(fs.readFileSync(specPath, 'utf-8'));

  let responseExamples = 0;
  let requestExamples = 0;

  for (const pathItem of Object.values(spec.paths || {})) {
    for (const op of Object.values(pathItem)) {
      if (typeof op !== 'object' || !op?.responses) continue;
      if (op.requestBody?.content?.['application/json']?.example) requestExamples++;
      for (const resp of Object.values(op.responses)) {
        if (resp?.content?.['application/json']?.example) responseExamples++;
      }
    }
  }

  assert.ok(responseExamples > 0, `OpenAPI deve ter exemplos de resposta (encontrados: ${responseExamples})`);
  assert.ok(requestExamples > 0, `OpenAPI deve ter exemplos de requisição (encontrados: ${requestExamples})`);
});

test('AC6: POST /v1/records/{id}/submit retorna 202 com schema SubmitAccepted', () => {
  const specPath = path.join(root, 'src/openapi/openapi.yaml');
  const spec = YAML.parse(fs.readFileSync(specPath, 'utf-8'));

  const op = spec.paths?.['/v1/records/{id}/submit']?.post;
  assert.ok(op, 'POST /v1/records/{id}/submit não encontrado no OpenAPI');

  const resp202 = op.responses?.['202'];
  assert.ok(resp202, 'submit deve ter resposta 202');

  const schemaRef = resp202?.content?.['application/json']?.schema?.$ref;
  assert.equal(schemaRef, '#/components/schemas/SubmitAccepted', '202 deve referenciar SubmitAccepted');

  assert.ok(spec.components?.schemas?.SubmitAccepted, 'SubmitAccepted deve existir em components.schemas');
});
