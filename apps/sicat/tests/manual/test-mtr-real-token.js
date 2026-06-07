#!/usr/bin/env node
/**
 * Test: Create MTR with real CETESB authentication
 * Uses real JWT token extracted from HAR file
 */
import http from 'http';
import https from 'https';

// Real JWT token from CETESB login HAR
const REAL_JWT_TOKEN = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxNzYxNjMsMzMzOTQ4Iiwicm9sZSI6MSwiZXhwIjoxNzcyOTE0OTY4fQ.MDzLkHo3jUw3r6LHucubCnmKZWU6oW-0CuVTMa1V_D-pSkgBtlZ_9GFN8MTM7wTP4XnFErf8rQvHkIZ8QECzFQ';
const CETESB_PARTNER_CODE = '176163';
const LOCAL_API_HOST = '127.0.0.1';
const LOCAL_API_PORT = 8080;
const CETESB_API_HOST = 'mtrr.cetesb.sp.gov.br';

console.log('\n╔═══════════════════════════════════════════╗');
console.log('║  MTR Creation Test (Real Auth)            ║');
console.log('╚═══════════════════════════════════════════╝\n');

function httpRequest(method, host, path, body = null, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    // Novo padrão: host pode ser '127.0.0.1' ou 'localhost', porta separada
    let hostname = host;
    let port = LOCAL_API_PORT;
    let protocol = http;
    if (host.includes('cetesb')) {
      protocol = https;
      port = 443;
    }
    if (host.includes(':')) {
      const [h, p] = host.split(':');
      hostname = h;
      port = parseInt(p, 10);
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Correlation-Id': `test-${Date.now()}`,
      ...customHeaders
    };

    if (body && typeof body === 'object') {
      body = JSON.stringify(body);
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const options = {
      hostname,
      port,
      path,
      method,
      headers,
      rejectUnauthorized: false
    };

    console.log(`→ ${method} ${hostname}:${port}${path}`);

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, headers: res.headers, parseError: e.message });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function main() {
  try {
    const integrationAccountId = `acc-${Date.now()}`;

    console.log('\n1️⃣  Creating session context with real JWT token...\n');

    const sessionContext = await httpRequest(
      'POST',
      `${LOCAL_API_HOST}:${LOCAL_API_PORT}`,
      '/v1/session-contexts',
      {
        integrationAccountId,
        authMode: 'manual-token',
        jwtToken: REAL_JWT_TOKEN,
        metadata: {
          partnerCode: CETESB_PARTNER_CODE,
          email: 'flavio_padilha_neto@msn.com',
          paaCodigo: 333948,
          parCodigo: 176163,
          estCodigo: 26
        }
      }
    );
    
    console.log(`Status: ${sessionContext.status}`);
    
    if (sessionContext.status !== 201) {
      console.error('❌ Session context creation failed:', sessionContext.body);
      process.exit(1);
    }
    
    const sessionId = sessionContext.body.id;
    console.log(`✓ Session created: ${sessionId}`);
    console.log(`  Status: ${sessionContext.body.status}`);
    
    // Give it a moment
    await new Promise(r => setTimeout(r, 500));
    
    console.log('\n2️⃣  Creating manifest...\n');
    
    const manifest = await httpRequest(
      'POST',
      `${LOCAL_API_HOST}:${LOCAL_API_PORT}`,
      '/v1/manifestos',
      {
        integrationAccountId,
        sessionContextId: sessionId,
        requestedBy: "flavio.padilha",
        manifestType: 1,
        state: {
          code: 26,
          abbreviation: "SP"
        },
        responsibleName: "Flavio Padilha Neto",
        expeditionDate: new Date().toISOString().split('T')[0],
        driverName: "Osvaldo",
        vehiclePlate: "ETA26D1",
        notes: "",
        hasTemporaryStorage: false,
        hasCadriInResidueList: false,
        generator: {
          partnerCode: 176163,
          description: "Nova IT",
          tradeName: "Nova IT",
          document: "31913781000139",
          registration: "null-null",
          address: {
            street: "DIDIMO VIEIRA DA SILVA",
            number: "507",
            complement: "apt 306",
            district: "VILA FERROVIARIA",
            postalCode: "14802370",
            city: "ARARAQUARA",
            state: "SP"
          }
        },
        carrier: {
          partnerCode: 160627,
          description: "CASAMAX COMERCIAL LTDA.",
          document: "08183516000120",
          address: {
            street: "AVENIDA MANOEL CASANOVA",
            number: "1435",
            complement: "bloco c",
            district: "MEU CANTINHO",
            postalCode: "08664645",
            city: "SUZANO",
            state: "SP"
          }
        },
        receiver: {
          partnerCode: 40110,
          description: "MARDAN FIRE ENGENHARIA, CONSTRUÇÃO E EXTINTORES LTDA.",
          document: "13539643000150",
          registration: "239-542012",
          licenseIssuer: "Estadual",
          licenseNumber: "29008724",
          address: {
            street: "RUA JOAQUIM JOSE FIORAVANTE",
            number: "11",
            district: "VILA ROSINA",
            postalCode: "07749105",
            city: "CAIEIRAS",
            state: "SP"
          }
        },
        residues: [
          {
            lineNumber: 1,
            quantity: 18,
            receivedQuantity: null,
            weightTon: 18,
            unit: {
              code: 3,
              description: "Tonelada",
              symbol: "TON"
            },
            residue: {
              code: 731,
              ibamaCode: "Classe A",
              description: "Resíduos reutilizáveis ou recicláveis como agregados",
              groupDescription: "Resíduos de Construção Civil",
              groupRepresentation: "1710"
            },
            treatment: {
              code: 51,
              description: "Aterro de Reservação - RCC"
            },
            class: {
              code: 11,
              description: "CLASSE A (RCC)"
            },
            abnt: null,
            cadriItem: null,
            stateType: {
              code: 4,
              description: "SOLIDO"
            },
            packagingType: {
              code: 4,
              description: "CAÇAMBA ABERTA"
            },
            packagingGroup: null,
            internalCode: null,
            onuCode: null,
            riskClass: null,
            shipmentName: null,
            notes: null
          }
        ]
      }
    );
    
    console.log(`Status: ${manifest.status}`);
    
    if (manifest.status !== 201) {
      console.error('❌ Manifest creation failed:', manifest.body);
      process.exit(1);
    }
    
    const manifestId = manifest.body.id;
    console.log(`✓ Manifest created: ${manifestId}`);
    console.log(`  Status: ${manifest.body.status}`);
    
    await new Promise(r => setTimeout(r, 500));
    
    console.log('\n3️⃣  Submitting manifest to CETESB...\n');
    
    const submit = await httpRequest(
      'POST',
      `${LOCAL_API_HOST}:${LOCAL_API_PORT}`,
      `/v1/manifestos/${manifestId}/submit`,
      {
        integrationAccountId,
        sessionContextId: sessionId
      }
    );
    
    console.log(`Status: ${submit.status}`);
    
    if (submit.status !== 202) {
      console.error('⚠️  Submit may have queued (expected 202, got ' + submit.status + ')');
    } else {
      console.log(`✓ Submit enqueued (202 Accepted)`);
    }
    
    console.log(`  Command ID: ${submit.body.commandId}`);
    
    await new Promise(r => setTimeout(r, 1000));
    
    console.log('\n4️⃣  Polling manifest status...\n');
    
    let attempts = 0;
    let lastStatus = null;
    
    while (attempts < 30) {
      const status = await httpRequest(
        'GET',
        `${LOCAL_API_HOST}:${LOCAL_API_PORT}`,
        `/v1/manifestos/${manifestId}`
      );
      
      if (status.status === 200) {
        lastStatus = status.body;
        const maniStatus = status.body.status;
        console.log(`[${attempts + 1}] Status: ${maniStatus}`);
        
        if (maniStatus === 'submitted' || maniStatus === 'cancelled' || maniStatus === 'printed') {
          console.log(`\n✅ Final status: ${maniStatus}`);
          break;
        }
        
        if (maniStatus === 'error' || maniStatus === 'failed') {
          console.log(`\n❌ Manifest failed: ${status.body.errorMessage}`);
          break;
        }
      }
      
      attempts++;
      await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log('\n5️⃣  Final Manifest Data:\n');
    
    const final = await httpRequest(
      'GET',
      `${LOCAL_API_HOST}:${LOCAL_API_PORT}`,
      `/v1/manifestos/${manifestId}`
    );
    
    if (final.status === 200) {
      const m = final.body;
      console.log(`ID: ${m.id}`);
      console.log(`Status: ${m.status}`);
      console.log(`Created: ${m.createdAt}`);
      console.log(`Updated: ${m.updatedAt}`);
      
      if (m.cetesb) {
        console.log(`\nCETESB Response:`);
        console.log(`  ID: ${m.cetesb.id}`);
        console.log(`  Status: ${m.cetesb.status}`);
        if (m.cetesb.printUrl) {
          console.log(`  Print URL: ${m.cetesb.printUrl}`);
        }
      }
      
      if (m.jobs && m.jobs.length > 0) {
        console.log(`\nJobs:`);
        m.jobs.forEach(job => {
          console.log(`  - ${job.operation}: ${job.status}`);
          if (job.errorMessage) {
            console.log(`    Error: ${job.errorMessage}`);
          }
        });
      }
    }
    
    console.log('\n╔═════════════════════════════════════════════╗');
    console.log('║  Test Complete                             ║');
    console.log('╚═════════════════════════════════════════════╝\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
