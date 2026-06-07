import process from 'node:process';

const baseUrl = (process.env.SMOKE_BASE_URL || process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

async function fetchAndValidate(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Falha em ${path}: HTTP ${response.status}`);
  }

  if (path.endsWith('.json')) {
    JSON.parse(text);
  }

  if (!text || text.length < 100) {
    throw new Error(`Conteúdo inesperado em ${path}`);
  }

  return { path, status: response.status, bytes: Buffer.byteLength(text) };
}

async function main() {
  const results = [];
  results.push(await fetchAndValidate('/openapi.yaml'));
  await fetchAndValidate('/openapi.json');

  const openapiJsonResponse = await fetch(`${baseUrl}/openapi.json`);
  const doc = await openapiJsonResponse.json();

  const statusEnum = doc?.components?.schemas?.JobResource?.properties?.status?.enum || [];
  for (const requiredStatus of ['queued', 'running', 'retry_wait', 'succeeded', 'failed', 'dlq']) {
    if (!statusEnum.includes(requiredStatus)) {
      throw new Error(`OpenAPI inválida: JobResource.status.enum sem '${requiredStatus}'`);
    }
  }

  const commandRef = '#/components/schemas/CommandAccepted';
  const commandEndpoints = [
    '/v1/manifestos/{id}/submit',
    '/v1/manifestos/{id}/print',
    '/v1/manifestos/{id}/cancel',
    '/v1/catalog-sync',
    '/v1/cadastros'
  ];

  for (const endpoint of commandEndpoints) {
    const ref = doc?.paths?.[endpoint]?.post?.responses?.['202']?.content?.['application/json']?.schema?.$ref;
    if (ref !== commandRef) {
      throw new Error(`OpenAPI inválida: ${endpoint} deve usar CommandAccepted em 202`);
    }
  }

  results.push({
    path: '/openapi.json',
    status: 200,
    checks: {
      jobStatusEnum: statusEnum,
      commandEndpointsChecked: commandEndpoints.length
    }
  });

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error('Erro no smoke de openapi:', error);
  process.exit(1);
});
