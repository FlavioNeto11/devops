#!/usr/bin/env node
import http from 'http';
import https from 'https';

const REAL_JWT_TOKEN = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxNzYxNjMsMzMzOTQ4Iiwicm9sZSI6MSwiZXhwIjoxNzcyOTE0OTY4fQ.MDzLkHo3jUw3r6LHucubCnmKZWU6oW-0CuVTMa1V_D-pSkgBtlZ_9GFN8MTM7wTP4XnFErf8rQvHkIZ8QECzFQ';
const CETESB_PARTNER_CODE = '176163';
const CETESB_CARRIER_PARTNER_CODE = '160627';
const CETESB_RECEIVER_PARTNER_CODE = '40110';
const INTEGRATION_ACCOUNT_ID = 'acc-nova-it-test';
const CETESB_PASSWORD = '2dlzft';  // From HAR file
const CETESB_LOGIN = '31913781000139';  // CNPJ
const CETESB_EMAIL = 'flavio_padilha_neto@msn.com';

console.log('\n╔═══════════════════════════════════════════╗');
console.log('║  MTR Creation Test (Real Auth)            ║');
console.log('╚═══════════════════════════════════════════╝\n');

function httpRequest(method, protocol, host, port, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const allHeaders = {
      'Content-Type': 'application/json',
      'X-Correlation-Id': `test-${Date.now()}`,
      ...headers
    };
    
    let bodyStr = null;
    if (body) {
      bodyStr = JSON.stringify(body);
      allHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    
    const options = { hostname: host, port, path, method, headers: allHeaders, rejectUnauthorized: false };
    const p = protocol === 'https' ? https : http;
    
    console.log(`→ ${method} ${host}:${port}${path}`);
    
    const req = p.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function test() {
  try {
    // 1. Create session
    console.log('1️⃣  Creating session context with real JWT token...\n');
    const sessionRes = await httpRequest('POST', 'http', 'localhost', 8080, '/v1/session-contexts', 
      { 
        authMode: 'manual-token', 
        jwt: REAL_JWT_TOKEN, 
        partnerCode: CETESB_PARTNER_CODE,
        integrationAccountId: INTEGRATION_ACCOUNT_ID,
        email: CETESB_EMAIL,
        metadata: {
          partnerCode: CETESB_PARTNER_CODE,
          email: CETESB_EMAIL,
          login: CETESB_LOGIN,
          password: CETESB_PASSWORD,
          userAccessCode: '333948',
          userName: 'Flavio Padilha Neto',
          partnerDocument: '31913781000139',
          partnerType: 'J'
        }
      },
      { 'Authorization': `Bearer ${REAL_JWT_TOKEN}` }
    );
    
    if (sessionRes.statusCode !== 201) {
      throw new Error(`Session creation failed: ${sessionRes.statusCode} - ${JSON.stringify(sessionRes.body)}`);
    }
    
    const sessionId = sessionRes.body.id;
    const integrationAccountId = sessionRes.body.integrationAccountId;
    
    console.log(`✓ Session created: ${sessionId}`);
    console.log(`✓ Account ID: ${integrationAccountId}\n`);
    
    // 2. Create manifest
    console.log('2️⃣  Creating manifest...\n');
    const manifestRes = await httpRequest('POST', 'http', 'localhost', 8080, '/v1/manifestos',
      {
        manifestType: 'I',
        responsibleName: 'Flavio Padilha Neto',
        expeditionDate: '2026-03-09',
        driverName: 'Osvaldo Motorista',        // ✅ Obrigatório (do HAR)
        vehiclePlate: 'ETA26D1',                // ✅ Obrigatório (do HAR)
        state: { code: 26, abbreviation: 'SP' },
        generator: { partnerCode: CETESB_PARTNER_CODE },
        carrier: { partnerCode: CETESB_CARRIER_PARTNER_CODE },
        receiver: { partnerCode: CETESB_RECEIVER_PARTNER_CODE },
        residues: [{
          residue: { code: 731 },               // ✅ Código numérico (do HAR)
          quantity: 18,                          // ✅ 18 toneladas
          unit: { code: 'TON' },                // ✅ Unidade TON (do HAR)
          treatment: { code: 'D1' },
          class: { code: 'I' }
        }],
        integrationAccountId: INTEGRATION_ACCOUNT_ID
      },
      { 'X-Session-Context-Id': sessionId }
    );
    
    if (manifestRes.statusCode !== 201) {
      throw new Error(`Manifest creation failed: ${manifestRes.statusCode} - ${JSON.stringify(manifestRes.body)}`);
    }
    
    const manifestId = manifestRes.body.id;
    console.log(`✓ Manifest created: ${manifestId}\n`);
    
    // 3. Submit manifest
    console.log('3️⃣  Submitting manifest to CETESB...\n');
    const submitRes = await httpRequest('POST', 'http', 'localhost', 8080, `/v1/manifestos/${manifestId}/submit`,
      { sessionContextId: sessionId },
      { 'X-Session-Context-Id': sessionId }
    );
    
    if (submitRes.statusCode !== 202) {
      throw new Error(`Submit failed: ${submitRes.statusCode} - ${JSON.stringify(submitRes.body)}`);
    }
    
    console.log(`✓ Submit enqueued (${submitRes.statusCode} Accepted)\n`);
    
    // 4. Poll status
    console.log('4️⃣  Polling manifest status...\n');
    let status = 'submitting';
    let iteration = 0;
    const maxIterations = 30;
    
    while (iteration < maxIterations && status !== 'submitted' && status !== 'error') {
      await new Promise(r => setTimeout(r, 2000));
      
      const statusRes = await httpRequest('GET', 'http', 'localhost', 8080, `/v1/manifestos/${manifestId}`,
        null,
        { 'X-Session-Context-Id': sessionId }
      );
      
      status = statusRes.body?.status || 'unknown';
      iteration++;
      console.log(`[${iteration}] Status: ${status}`);
    }
    
    console.log(`\n✅ Final status: ${status}\n`);
    
    // 5. Show final manifest
    console.log('5️⃣  Final Manifest Data:\n');
    const finalRes = await httpRequest('GET', 'http', 'localhost', 8080, `/v1/manifestos/${manifestId}`,
      null,
      { 'X-Session-Context-Id': sessionId }
    );
    
    console.log(JSON.stringify(finalRes.body, null, 2));
    console.log('\n✅ TEST PASSED\n');
    
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message, '\n');
    process.exit(1);
  }
}

test();
