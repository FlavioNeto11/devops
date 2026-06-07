#!/usr/bin/env node
import http from 'http';

const MANIFEST_ID = 'man_4c68344b9b8b0f1bb9d1e048f3';  // Manifesto já submetido (antigo)

console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║  Test: Cancel Existing MTR (already indexed)        ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

function httpRequest(method, host, port, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const allHeaders = {
      'Content-Type': 'application/json',
      'X-Correlation-Id': `test-cancel-existing-${Date.now()}`,
      ...headers
    };
    
    let bodyStr = null;
    if (body) {
      bodyStr = JSON.stringify(body);
      allHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    
    const options = { hostname: host, port, path, method, headers: allHeaders };
    
    console.log(`→ ${method} ${host}:${port}${path}`);
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
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
    // 1. Get manifest details
    console.log(`1️⃣  Getting manifest ${MANIFEST_ID}...\n`);
    const getRes = await httpRequest('GET', 'localhost', 8080, `/v1/manifestos/${MANIFEST_ID}`);
    
    if (getRes.statusCode !== 200) {
      throw new Error(`Failed to get manifest: ${getRes.statusCode}`);
    }
    
    const sessionId = getRes.body.sessionContextId;
    console.log(`✓ Manifest found`);
    console.log(`✓ Session: ${sessionId}`);
    console.log(`✓ Status: ${getRes.body.status}\n`);
    
    // 2. Cancel
    console.log('2️⃣  Canceling manifest...\n');
    const cancelRes = await httpRequest('POST', 'localhost', 8080, `/v1/manifestos/${MANIFEST_ID}/cancel`,
      {
        sessionContextId: sessionId,
        reason: 'teste de cancelamento de MTR já indexado na CETESB'
      },
      { 'X-Session-Context-Id': sessionId }
    );
    
    if (cancelRes.statusCode !== 202) {
      throw new Error(`Cancel failed: ${cancelRes.statusCode} - ${JSON.stringify(cancelRes.body)}`);
    }
    
    console.log(`✓ Cancel enqueued (202)`);
    console.log(`✓ Job ID: ${cancelRes.body.jobId}\n`);
    
    // 3. Poll
    console.log('3️⃣  Polling status...\n');
    let status = 'cancelling';
    let iteration = 0;
    const maxIterations = 30;
    
    while (iteration < maxIterations && status !== 'cancelled' && status !== 'error') {
      await new Promise(r => setTimeout(r, 2000));
      
      const statusRes = await httpRequest('GET', 'localhost', 8080, `/v1/manifestos/${MANIFEST_ID}`,
        null,
        { 'X-Session-Context-Id': sessionId }
      );
      
      status = statusRes.body?.status || 'unknown';
      const externalStatus = statusRes.body?.externalStatus;
      iteration++;
      console.log(`[${iteration}] Status: ${status}, External: ${externalStatus || 'N/A'}`);
    }
    
    console.log(`\n✅ Final status: ${status}\n`);
    
    if (status !== 'cancelled') {
      throw new Error(`Expected 'cancelled' but got '${status}'`);
    }
    
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  ✅  CANCEL TEST PASSED                              ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');
    
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message, '\n');
    process.exit(1);
  }
}

test();
