import SwaggerParser from '@apidevtools/swagger-parser';
import path from 'node:path';
import fs from 'node:fs';
import YAML from 'yaml';

const file = path.resolve(process.cwd(), 'src/openapi/openapi.yaml');

function readDoc() {
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function validateContract(doc) {
  // submit endpoint deve retornar 202 com SubmitAccepted
  const submitPath = '/v1/records/{id}/submit';
  const ref = doc?.paths?.[submitPath]?.post?.responses?.['202']?.content?.['application/json']?.schema?.$ref;
  ensure(ref === '#/components/schemas/SubmitAccepted', `${submitPath} POST 202 deve referenciar #/components/schemas/SubmitAccepted`);

  // schemas obrigatórios
  ensure(doc?.components?.schemas?.Problem, 'components.schemas.Problem ausente');
  ensure(doc?.components?.schemas?.SubmitAccepted, 'components.schemas.SubmitAccepted ausente');
  ensure(doc?.components?.schemas?.Record, 'components.schemas.Record ausente');

  // rotas críticas documentadas
  const required = ['/', '/health', '/v1/health/queue', '/v1/records', '/v1/records/{id}', '/v1/records/{id}/submit'];
  for (const route of required) {
    ensure(doc?.paths?.[route], `Rota ${route} não documentada no OpenAPI`);
  }

  // pelo menos um exemplo de resposta
  let hasExample = false;
  for (const pathItem of Object.values(doc?.paths || {})) {
    for (const op of Object.values(pathItem)) {
      if (typeof op !== 'object' || !op?.responses) continue;
      for (const resp of Object.values(op.responses)) {
        if (resp?.content?.['application/json']?.example) { hasExample = true; break; }
      }
      if (hasExample) break;
    }
    if (hasExample) break;
  }
  ensure(hasExample, 'OpenAPI deve ter ao menos um exemplo de resposta (AC4)');
}

try {
  await SwaggerParser.validate(file);
  const doc = readDoc();
  validateContract(doc);
  console.log(`[ok] OpenAPI validado com sucesso: ${file}`);
} catch (error) {
  console.error('[erro] falha ao validar OpenAPI');
  console.error(error.message || error);
  process.exitCode = 1;
}
