#!/usr/bin/env node
import http from 'http';
import https from 'https';

const REAL_JWT_TOKEN = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxNzYxNjMsMzMzOTQ4Iiwicm9sZSI6MSwiZXhwIjoxNzcyOTE0OTY4fQ.MDzLkHo3jUw3r6LHucubCnmKZWU6oW-0CuVTMa1V_D-pSkgBtlZ_9GFN8MTM7wTP4XnFErf8rQvHkIZ8QECzFQ';
const CETESB_PARTNER_CODE = '176163';
const CETESB_CARRIER_PARTNER_CODE = '160627';
const CETESB_RECEIVER_PARTNER_CODE = '40110';
const INTEGRATION_ACCOUNT_ID = 'acc-nova-it-test';
const CETESB_PASSWORD = '2dlzft';
const CETESB_LOGIN = '31913781000139';
const CETESB_EMAIL = 'flavio_padilha_neto@msn.com';

console.log('\n╔═══════════════════════════════════════════╗');
console.log('║  MTR Cancellation Test (E2E - Real)      ║');
console.log('╚═══════════════════════════════════════════╝\n');

function httpRequest(method, protocol, host, port, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const allHeaders = {
      'Content-Type': 'application/json',
      'X-Correlation-Id': `test-cancel-${Date.now()}`,
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
    console.log(`✓ Session created: ${sessionId}`);
    console.log(`✓ Account ID: ${sessionRes.body.integrationAccountId}\n`);
    
    // 2. Create manifest
    console.log('2️⃣  Creating manifest (draft)...\n');
    const manifestRes = await httpRequest('POST', 'http', 'localhost', 8080, '/v1/manifestos',
      {
        manifestType: 'I',
        responsibleName: 'Flavio Padilha Neto',
        expeditionDate: '2026-03-09',
        driverName: 'Osvaldo Motorista',
        vehiclePlate: 'ETA26D1',
        state: { code: 26, abbreviation: 'SP' },
        generator: { partnerCode: CETESB_PARTNER_CODE },
        carrier: { partnerCode: CETESB_CARRIER_PARTNER_CODE },
        receiver: { partnerCode: CETESB_RECEIVER_PARTNER_CODE },
        residues: [{
          residue: { code: 731 },
          quantity: 18,
          unit: { code: 'TON' },
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
    
    console.log(`✓ Submit enqueued (202 Accepted)\n`);
    
    // 4. Poll until submitted
    console.log('4️⃣  Polling manifest status (waiting for submitted)...\n');
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
      
      if (status === 'error') {
        throw new Error(`Submit failed with error status`);
      }
    }
    
    if (status !== 'submitted') {
      throw new Error(`Timeout waiting for submitted status. Current: ${status}`);
    }
    
    console.log(`\n✓ Manifest submitted successfully\n`);
    
    // 5. CANCEL manifest
    console.log('5️⃣  Canceling manifest...\n');
    const cancelRes = await httpRequest('POST', 'http', 'localhost', 8080, `/v1/manifestos/${manifestId}/cancel`,
      { 
        sessionContextId: sessionId,
        reason: 'teste automatizado - cancelamento E2E'
      },
      { 'X-Session-Context-Id': sessionId }
    );
    
    if (cancelRes.statusCode !== 202) {
      throw new Error(`Cancel failed: ${cancelRes.statusCode} - ${JSON.stringify(cancelRes.body)}`);
    }
    
    console.log(`✓ Cancel enqueued (202 Accepted)`);
    console.log(`✓ Cancel Job ID: ${cancelRes.body.jobId}\n`);
    
    const cancelJobId = cancelRes.body.jobId;
    
    // 6. Poll until cancelled
    console.log('6️⃣  Polling manifest status (waiting for cancelled)...\n');
    status = 'queued_cancel';
    iteration = 0;
    
    while (iteration < maxIterations && status !== 'cancelled' && status !== 'error') {
      await new Promise(r => setTimeout(r, 2000));
      
      const statusRes = await httpRequest('GET', 'http', 'localhost', 8080, `/v1/manifestos/${manifestId}`,
        null,
        { 'X-Session-Context-Id': sessionId }
      );
      
      status = statusRes.body?.status || 'unknown';
      const externalStatus = statusRes.body?.externalStatus;
      iteration++;
      console.log(`[${iteration}] Status: ${status}, External: ${externalStatus || 'N/A'}`);
      
      if (status === 'error') {
        throw new Error(`Cancel failed with error status`);
      }
    }
    
    if (status !== 'cancelled') {
      throw new Error(`Timeout waiting for cancelled status. Current: ${status}`);
    }
    
    console.log(`\n✓ Manifest cancelled successfully\n`);
    
    // 7. Validate final state
    console.log('7️⃣  Validating final manifest state...\n');
    const finalRes = await httpRequest('GET', 'http', 'localhost', 8080, `/v1/manifestos/${manifestId}`,
      null,
      { 'X-Session-Context-Id': sessionId }
    );
    
    const finalManifest = finalRes.body;
    
    console.log('Final Manifest Data:');
    console.log(JSON.stringify(finalManifest, null, 2));
    
    // Validations
    const validations = {
      status: finalManifest.status === 'cancelled',
      externalStatus: finalManifest.externalStatus === 'cancelado',
      hasExternalId: !!finalManifest.externalId
    };
    
    console.log('\n╔═══════════════════════════════════════════╗');
    console.log('║  VALIDATION RESULTS                       ║');
    console.log('╚═══════════════════════════════════════════╝\n');
    console.log(`✓ Manifest ID: ${manifestId}`);
    console.log(`✓ Cancel Job ID: ${cancelJobId}`);
    console.log(`✓ Final Status: ${finalManifest.status} ${validations.status ? '✅' : '❌'}`);
    console.log(`✓ External Status: ${finalManifest.externalStatus || 'N/A'} ${validations.externalStatus ? '✅' : '❌'}`);
    console.log(`✓ External ID: ${finalManifest.externalId || 'N/A'} ${validations.hasExternalId ? '✅' : '❌'}`);
    
    const allValid = Object.values(validations).every(v => v);
    
    if (!allValid) {
      console.log('\n❌ Some validations failed:');
      Object.entries(validations).forEach(([key, valid]) => {
        if (!valid) console.log(`   - ${key}: FAILED`);
      });
      process.exit(1);
    }
    
    console.log('\n✅ ALL VALIDATIONS PASSED\n');
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║  HANDOFF 4 - E2E CANCEL TEST COMPLETE    ║');
    console.log('╚═══════════════════════════════════════════╝\n');
    
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message, '\n');
    console.error('Stack:', err.stack);
    process.exit(1);
  }
}

test();
