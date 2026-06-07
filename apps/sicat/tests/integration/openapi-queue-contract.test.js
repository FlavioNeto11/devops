import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const openapiFile = path.resolve(process.cwd(), 'openapi/mtr_automacao_openapi_interna.yaml');
const examplesDir = path.resolve(process.cwd(), 'examples');

function loadOpenApi() {
  const raw = fs.readFileSync(openapiFile, 'utf8');
  return YAML.parse(raw);
}

test('Contrato OpenAPI - JobResource.status cobre retry_wait e dlq', () => {
  const doc = loadOpenApi();
  const enumValues = doc?.components?.schemas?.JobResource?.properties?.status?.enum;

  assert.ok(Array.isArray(enumValues), 'JobResource.status.enum deve existir');
  for (const required of ['queued', 'running', 'retry_wait', 'succeeded', 'failed', 'dlq']) {
    assert.ok(enumValues.includes(required), `Enum de JobResource.status deve conter ${required}`);
  }
});

test('Contrato OpenAPI - CommandAccepted mantém padrão assíncrono', () => {
  const doc = loadOpenApi();

  const commandStatusEnum = doc?.components?.schemas?.CommandAccepted?.properties?.status?.enum;
  assert.ok(Array.isArray(commandStatusEnum), 'CommandAccepted.status.enum deve existir');
  assert.ok(commandStatusEnum.includes('queued'), 'CommandAccepted.status deve aceitar queued');

  const commandEndpoints = [
    '/v1/manifestos/{id}/submit',
    '/v1/manifestos/{id}/print',
    '/v1/manifestos/{id}/cancel',
    '/v1/catalog-sync',
    '/v1/cadastros'
  ];

  for (const endpoint of commandEndpoints) {
    const schemaRef = doc?.paths?.[endpoint]?.post?.responses?.['202']?.content?.['application/json']?.schema?.$ref;
    assert.strictEqual(
      schemaRef,
      '#/components/schemas/CommandAccepted',
      `${endpoint} deve responder 202 com schema CommandAccepted`
    );
  }
});

test('Contrato OpenAPI - exemplo de job é compatível com enum de status', () => {
  const doc = loadOpenApi();
  const enumValues = doc?.components?.schemas?.JobResource?.properties?.status?.enum || [];

  const filePath = path.join(examplesDir, 'get_v1_jobs_jobId_response.json');
  const example = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  assert.ok(example.jobId, 'Exemplo de job deve ter jobId');
  assert.ok(example.correlationId, 'Exemplo de job deve ter correlationId');
  assert.ok(example.links?.audit, 'Exemplo de job deve ter link de auditoria');
  assert.ok(enumValues.includes(example.status), `Status do exemplo (${example.status}) deve existir no enum`);
});

test('Contrato OpenAPI - exemplos de comando mantêm campos obrigatórios', () => {
  const files = [
    'post_v1_manifestos_id_submit_response.json',
    'post_v1_manifestos_id_cancel_response.json',
    'post_v1_catalog-sync_response.json'
  ];

  for (const file of files) {
    const body = JSON.parse(fs.readFileSync(path.join(examplesDir, file), 'utf8'));

    assert.ok(body.commandId, `${file} deve conter commandId`);
    assert.ok(body.jobId, `${file} deve conter jobId`);
    assert.ok(body.correlationId, `${file} deve conter correlationId`);
    assert.ok(body.submittedAt, `${file} deve conter submittedAt`);
    assert.ok(body.links?.job, `${file} deve conter links.job`);
    assert.ok(body.links?.entity, `${file} deve conter links.entity`);
    assert.ok(body.links?.audit, `${file} deve conter links.audit`);
  }
});
