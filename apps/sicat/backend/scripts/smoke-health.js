import process from 'node:process';

const baseUrl = (process.env.SMOKE_BASE_URL || process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

/**
 * Smoke test para os 7 health endpoints do sistema.
 * Valida conectividade, status HTTP e estrutura de resposta.
 */

const ENDPOINTS = [
  { method: 'GET', path: '/v1/ping', expectedStatus: 200, requiredFields: ['status', 'timestamp'] },
  { method: 'GET', path: '/v1/health/system', expectedStatus: 200, requiredFields: ['status', 'version'] },
  { method: 'GET', path: '/v1/health/workers', expectedStatus: 200, requiredFields: ['total', 'healthy'] },
  { method: 'GET', path: '/v1/health/jobs/active', expectedStatus: 200, requiredFields: ['active_jobs', 'queued', 'running'] },
  { method: 'GET', path: '/v1/health/jobs/dlq', expectedStatus: 200, requiredFields: ['dlq_jobs', 'retention_days'] },
  { method: 'GET', path: '/v1/health/metrics/performance', expectedStatus: 200, requiredFields: ['metrics'] },
  { method: 'POST', path: '/v1/maintenance/cleanup', expectedStatus: 202, requiredFields: ['cleaned_count'], body: { retention_days: 30, batch_size: 100 } }
];

async function testEndpoint(endpoint) {
  const url = `${baseUrl}${endpoint.path}`;
  const options = {
    method: endpoint.method,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Correlation-Id': `smoke-${Date.now()}`
    }
  };

  if (endpoint.body) {
    options.body = JSON.stringify(endpoint.body);
  }

  const response = await fetch(url, options);
  const text = await response.text();
  
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (response.status !== endpoint.expectedStatus) {
    throw new Error(
      `${endpoint.method} ${endpoint.path} retornou status ${response.status}, esperado ${endpoint.expectedStatus}`
    );
  }

  // Validar campos obrigatórios
  for (const field of endpoint.requiredFields) {
    if (!(field in body)) {
      throw new Error(
        `${endpoint.method} ${endpoint.path} não retornou campo obrigatório: '${field}'`
      );
    }
  }

  // Validar Content-Type
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error(
      `${endpoint.method} ${endpoint.path} retornou Content-Type inválido: ${contentType}`
    );
  }

  return {
    endpoint: `${endpoint.method} ${endpoint.path}`,
    status: response.status,
    ok: true
  };
}

async function main() {
  console.log('🚀 Iniciando smoke tests de health endpoints...\n');
  console.log(`Base URL: ${baseUrl}\n`);

  const results = [];
  let failed = 0;

  for (const endpoint of ENDPOINTS) {
    try {
      const result = await testEndpoint(endpoint);
      results.push(result);
      console.log(`✅ ${result.endpoint} → ${result.status}`);
    } catch (error) {
      failed++;
      results.push({
        endpoint: `${endpoint.method} ${endpoint.path}`,
        ok: false,
        error: error.message
      });
      console.error(`❌ ${endpoint.method} ${endpoint.path} → ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Resultado: ${results.length - failed}/${results.length} testes passaram`);
  console.log(`${'='.repeat(60)}\n`);

  if (failed > 0) {
    console.error(`❌ ${failed} teste(s) falharam`);
    process.exit(1);
  }

  console.log('✅ Todos os health endpoints operacionais');
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((error) => {
  console.error('❌ Erro fatal no smoke de health:', error.message);
  process.exit(1);
});
