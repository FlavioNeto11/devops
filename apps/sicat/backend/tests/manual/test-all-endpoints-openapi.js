// Teste abrangente de TODOS os endpoints OpenAPI
// DL-031 - Validação completa da API

import http from 'http';

const BASE_URL = 'http://127.0.0.1:8080';
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  details: []
};

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 8080,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': `test-${Date.now()}`,
        ...headers
      }
    };

    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        let data = null;
        try {
          data = JSON.parse(text);
        } catch (e) {
          // Non-JSON response
        }
        resolve({ status: res.statusCode, headers: res.headers, data, text });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function testEndpoint(name, method, path, expectedStatus, body = null, description = '') {
  results.total++;
  console.log(`\n[${results.total}] Testing: ${method} ${path}`);
  if (description) console.log(`    ${description}`);

  try {
    const res = await request(method, path, body);
    const passed = res.status === expectedStatus;
    
    if (passed) {
      results.passed++;
      console.log(`    ✅ PASSED (${res.status})`);
    } else {
      results.failed++;
      console.log(`    ❌ FAILED (expected ${expectedStatus}, got ${res.status})`);
      if (res.data) console.log(`    Response:`, JSON.stringify(res.data, null, 2).substring(0, 200));
    }

    results.details.push({ name, method, path, expected: expectedStatus, actual: res.status, passed });
  } catch (error) {
    results.failed++;
    console.log(`    ❌ ERROR: ${error.message}`);
    results.details.push({ name, method, path, expected: expectedStatus, actual: 'ERROR', passed: false, error: error.message });
  }
}

function skip(name, reason) {
  results.total++;
  results.skipped++;
  console.log(`\n[${results.total}] ⏭️  SKIPPED: ${name}`);
  console.log(`    Reason: ${reason}`);
  results.details.push({ name, skipped: true, reason });
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('🧪 TESTE ABRANGENTE DE ENDPOINTS OPENAPI');
  console.log('DL-031 - Validação completa da API');
  console.log('='.repeat(80));

  // ========================================
  // HEALTH & OBSERVABILITY (sem autenticação)
  // ========================================
  console.log('\n📊 HEALTH & OBSERVABILITY');
  
  await testEndpoint('Ping', 'GET', '/v1/ping', 200, null, 'Liveness probe');
  await testEndpoint('Health System', 'GET', '/v1/health/system', 200, null, 'System health overview');
  await testEndpoint('Health Workers', 'GET', '/v1/health/workers', 200, null, 'Worker status');
  await testEndpoint('Health Jobs Active', 'GET', '/v1/health/jobs/active', 200, null, 'Active jobs summary');
  await testEndpoint('Health Jobs DLQ', 'GET', '/v1/health/jobs/dlq', 200, null, 'Dead letter queue stats');
  await testEndpoint('Health Metrics Performance', 'GET', '/v1/health/metrics/performance', 200, null, 'Performance metrics');
  await testEndpoint('Maintenance Cleanup', 'POST', '/v1/maintenance/cleanup', 202, {}, 'Trigger async cleanup');

  // ========================================
  // OPENAPI SPEC
  // ========================================
  console.log('\n📄 OPENAPI SPEC');
  
  await testEndpoint('OpenAPI JSON', 'GET', '/openapi.json', 200, null, 'OpenAPI schema');
  await testEndpoint('Swagger UI (redirect)', 'GET', '/docs', 301, null, 'Swagger UI redirect');

  // ========================================
  // AUTHENTICATION (POST /v1/auth/login precisa credentials reais)
  // ========================================
  console.log('\n🔐 AUTHENTICATION');
  
  skip('POST /v1/auth/login', 'Requires real CETESB credentials (document, password, parCodigo)');
  skip('GET /v1/auth/partner-info', 'Requires valid session context with auth');

  // ========================================
  // SESSION CONTEXTS (sem endpoint de listagem no contrato)
  // ========================================
  console.log('\n🔑 SESSION CONTEXTS');
  
  skip('GET /v1/session-contexts', 'Route de listagem não existe no contrato (apenas POST e GET /:id)');
  skip('POST /v1/session-contexts', 'Requires integrationAccountId + credentials');
  skip('GET /v1/session-contexts/{id}', 'Requires existing session context ID');

  // ========================================
  // CATALOGS (GET pode funcionar, POST precisa sessionContext)
  // ========================================
  console.log('\n📚 CATALOGS');
  
  await testEndpoint('Get Catalog (not found)', 'GET', '/v1/catalogs/states', 404, null, 'Catalog not synced yet');
  skip('POST /v1/catalog-sync', 'Requires sessionContextId for auth');

  // ========================================
  // PARTNERS (GET exige integrationAccountId e role)
  // ========================================
  console.log('\n👥 PARTNERS');
  
  await testEndpoint('Search Partners (missing required params)', 'GET', '/v1/partners/search', 400, null, 'integrationAccountId and role are required');
  await testEndpoint('Search Partners (with required params)', 'GET', '/v1/partners/search?integrationAccountId=test&role=transportador', 200, null, 'Should return paged response');

  // ========================================
  // CADASTROS (POST/GET precisam de dados reais ou IDs)
  // ========================================
  console.log('\n📋 CADASTROS');
  
  skip('POST /v1/cadastros', 'Requires sessionContextId + enterprise payload');
  skip('GET /v1/cadastros/{id}', 'Requires existing cadastro ID');

  // ========================================
  // MANIFESTOS (POST/GET precisam dados reais)
  // ========================================
  console.log('\n📦 MANIFESTOS');
  
  await testEndpoint('List Manifestos (missing integrationAccountId)', 'GET', '/v1/manifestos', 400, null, 'integrationAccountId required');
  await testEndpoint('List Manifestos (with integrationAccountId)', 'GET', '/v1/manifestos?integrationAccountId=test', 200, null, 'Should return empty array');
  skip('POST /v1/manifestos', 'Requires sessionContextId + full manifest payload');
  skip('GET /v1/manifestos/{id}', 'Requires existing manifesto ID');
  skip('POST /v1/manifestos/{id}/submit', 'Requires existing manifesto ID');
  skip('POST /v1/manifestos/{id}/print', 'Requires existing manifesto ID');
  skip('POST /v1/manifestos/{id}/cancel', 'Requires existing manifesto ID + reason');
  skip('GET /v1/manifestos/{id}/documents/{documentId}', 'Requires existing manifesto + document IDs');

  // ========================================
  // JOBS (GET precisa jobId)
  // ========================================
  console.log('\n⚙️  JOBS');
  
  skip('GET /v1/jobs/{jobId}', 'Requires existing job ID');

  // ========================================
  // AUDIT (GET precisa correlationId)
  // ========================================
  console.log('\n🔍 AUDIT');
  
  skip('GET /v1/audit/{correlationId}', 'Requires existing correlation ID');

  // ========================================
  // RESULTADOS
  // ========================================
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESULTADOS');
  console.log('='.repeat(80));
  console.log(`Total:    ${results.total}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  
  const coverage = ((results.passed / (results.total - results.skipped)) * 100).toFixed(1);
  console.log(`\n📈 Cobertura: ${coverage}% (${results.passed}/${results.total - results.skipped} testáveis)`);

  console.log('\n📋 DETALHES:');
  results.details.forEach((detail, idx) => {
    if (detail.skipped) {
      console.log(`  ${idx + 1}. ⏭️  ${detail.name} - ${detail.reason}`);
    } else {
      const icon = detail.passed ? '✅' : '❌';
      console.log(`  ${idx + 1}. ${icon} ${detail.name} - ${detail.method} ${detail.path} (expected ${detail.expected}, got ${detail.actual})`);
    }
  });

  console.log('\n' + '='.repeat(80));
  if (results.failed === 0) {
    console.log('✅ TODOS OS TESTES TESTÁVEIS PASSARAM!');
  } else {
    console.log(`❌ ${results.failed} TESTES FALHARAM`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
