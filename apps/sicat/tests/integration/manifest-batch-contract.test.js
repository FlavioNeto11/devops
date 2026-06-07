import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const openapiFile = path.resolve(process.cwd(), 'openapi/mtr_automacao_openapi_interna.yaml');
const examplesDir = path.resolve(process.cwd(), 'examples');

function loadOpenApi() {
  return YAML.parse(fs.readFileSync(openapiFile, 'utf8'));
}

test('Contrato OpenAPI - endpoints de lote de manifestos expostos', () => {
  const doc = loadOpenApi();

  assert.ok(doc?.paths?.['/v1/manifestos/batch-create']?.post, 'Deve expor POST /v1/manifestos/batch-create');
  assert.ok(doc?.paths?.['/v1/manifestos/batch-submit']?.post, 'Deve expor POST /v1/manifestos/batch-submit');
  assert.ok(doc?.paths?.['/v1/manifestos/batch-cancel']?.post, 'Deve expor POST /v1/manifestos/batch-cancel');
  assert.ok(doc?.paths?.['/v1/manifestos/{id}/replicate']?.post, 'Deve expor POST /v1/manifestos/{id}/replicate');
});

test('Contrato OpenAPI - schemas de lote usam respostas agregadas', () => {
  const doc = loadOpenApi();

  const batchCreateSchema = doc?.paths?.['/v1/manifestos/batch-create']?.post?.responses?.['201']?.content?.['application/json']?.schema?.$ref;
  const batchSubmitSchema = doc?.paths?.['/v1/manifestos/batch-submit']?.post?.responses?.['202']?.content?.['application/json']?.schema?.$ref;
  const replicateSchema = doc?.paths?.['/v1/manifestos/{id}/replicate']?.post?.responses?.['201']?.content?.['application/json']?.schema?.$ref;
  const batchCancelSchema = doc?.paths?.['/v1/manifestos/batch-cancel']?.post?.responses?.['202']?.content?.['application/json']?.schema?.$ref;

  assert.strictEqual(batchCreateSchema, '#/components/schemas/ManifestBatchResponse');
  assert.strictEqual(batchSubmitSchema, '#/components/schemas/BatchCommandAccepted');
  assert.strictEqual(replicateSchema, '#/components/schemas/ManifestBatchResponse');
  assert.strictEqual(batchCancelSchema, '#/components/schemas/BatchCommandAccepted');
});

test('Contrato OpenAPI - exemplos de lote possuem campos obrigatórios', () => {
  const files = [
    'post_v1_manifestos_batch-create_response.json',
    'post_v1_manifestos_batch-submit_response.json',
    'post_v1_manifestos_id_replicate_response.json',
    'post_v1_manifestos_batch-cancel_response.json'
  ];

  for (const file of files) {
    const body = JSON.parse(fs.readFileSync(path.join(examplesDir, file), 'utf8'));
    assert.ok(body.groupId, `${file} deve conter groupId`);
    assert.ok(body.operation, `${file} deve conter operation`);
    assert.ok(Number.isInteger(body.total), `${file} deve conter total inteiro`);
    assert.ok(Array.isArray(body.items), `${file} deve conter items[]`);
  }
});
