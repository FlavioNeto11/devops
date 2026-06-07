import SwaggerParser from '@apidevtools/swagger-parser';
import path from 'node:path';
import fs from 'node:fs';
import YAML from 'yaml';

const file = path.resolve(process.cwd(), 'openapi/mtr_automacao_openapi_interna.yaml');

function readDoc() {
  const raw = fs.readFileSync(file, 'utf8');
  return YAML.parse(raw);
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateQueueContract(doc) {
  const jobStatusEnum = doc?.components?.schemas?.JobResource?.properties?.status?.enum;
  ensure(Array.isArray(jobStatusEnum), 'components.schemas.JobResource.properties.status.enum ausente');

  for (const requiredStatus of ['queued', 'running', 'retry_wait', 'succeeded', 'failed', 'dlq']) {
    ensure(
      jobStatusEnum.includes(requiredStatus),
      `JobResource.status.enum deve conter '${requiredStatus}'`
    );
  }

  const commandAcceptedRef = '#/components/schemas/CommandAccepted';
  const commandEndpoints = [
    '/v1/manifestos/{id}/submit',
    '/v1/manifestos/{id}/print',
    '/v1/manifestos/{id}/cancel',
    '/v1/catalog-sync',
    '/v1/cadastros'
  ];

  for (const endpoint of commandEndpoints) {
    const ref = doc?.paths?.[endpoint]?.post?.responses?.['202']?.content?.['application/json']?.schema?.$ref;
    ensure(ref === commandAcceptedRef, `${endpoint} deve usar schema CommandAccepted em 202`);
  }

  const jobGetRef = doc?.paths?.['/v1/jobs/{jobId}']?.get?.responses?.['200']?.content?.['application/json']?.schema?.$ref;
  ensure(jobGetRef === '#/components/schemas/JobResource', '/v1/jobs/{jobId} deve usar schema JobResource em 200');
}

try {
  await SwaggerParser.validate(file);
  const doc = readDoc();
  validateQueueContract(doc);
  console.log(`[ok] OpenAPI validado com sucesso: ${file}`);
} catch (error) {
  console.error('[erro] falha ao validar OpenAPI');
  console.error(error);
  process.exitCode = 1;
}
