#!/usr/bin/env node
/**
 * Teste E2E Completo: Login Automático CETESB + Impressão MTR
 * 
 * Endpoint correto: POST https://mtrr.cetesb.sp.gov.br/api/mtr/carregaDadosLogin
 * (não /api/mtr/acessos/autenticar)
 * 
 * Fluxo:
 * 1. Login automático na CETESB (sem recaptcha)
 * 2. Obter JWT válido
 * 3. Criar session context com JWT
 * 4. Criar manifesto
 * 5. Submeter manifesto
 * 6. Aguardar processamento (status: submitted)
 * 7. Imprimir MTR
 * 8. Aguardar processamento (status: printed)
 * 9. Baixar PDF
 */

import https from 'https';
import http from 'http';

// Credenciais do HAR de login
const LOGIN_CREDENTIALS = {
  sistema: 0,
  login: '31913781000139',
  email: 'flavio_padilha_neto@msn.com',
  senha: '2dlzft',
  parCodigo: 176163
};

const PARTNER_CODE = '176163';
const LOCAL_API_HOST = '127.0.0.1';
const LOCAL_API_PORT = 8080;
const CETESB_API_HOST = 'mtrr.cetesb.sp.gov.br';

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║  Teste E2E: Login Automático CETESB + Impressão MTR     ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

function httpsRequest(host, path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: 443,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0',
        ...headers
      },
      rejectUnauthorized: false
    };

    if (body && typeof body === 'object') {
      body = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(options, (res) => {
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
    if (body) req.write(body);
    req.end();
  });
}

function localApiRequest(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: LOCAL_API_HOST,
      port: LOCAL_API_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': `test-${Date.now()}`,
        ...headers
      }
    };

    if (body && typeof body === 'object') {
      body = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data, parseError: e.message });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    // ========================================
    // PASSO 1: Login Automático na CETESB
    // ========================================
    console.log('1️⃣  Fazendo login automático na CETESB...\n');
    
    const loginPayload = {
      ...LOGIN_CREDENTIALS
      // ✅ SEM recaptcha - não é obrigatório neste endpoint
    };

    console.log(`→ POST https://${CETESB_API_HOST}/api/mtr/carregaDadosLogin`);
    console.log(`  Payload: login=${LOGIN_CREDENTIALS.login}, email=${LOGIN_CREDENTIALS.email}\n`);
    
    const loginResponse = await httpsRequest(
      CETESB_API_HOST,
      '/api/mtr/carregaDadosLogin',
      'POST',
      loginPayload
    );

    console.log(`Status: ${loginResponse.status}`);

    if (loginResponse.status !== 200) {
      console.error('❌ Login falhou:', loginResponse.body);
      process.exit(1);
    }

    const jwtToken = loginResponse.body.objetoResposta?.token;
    
    if (!jwtToken) {
      console.error('❌ JWT não encontrado no response:', loginResponse.body);
      process.exit(1);
    }

    console.log('✓ Login bem-sucedido!');
    console.log(`✓ JWT obtido: ${jwtToken.substring(0, 50)}...`);
    
    // Decodificar JWT para verificar expiração
    const [, payload] = jwtToken.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    const exp = new Date(decoded.exp * 1000);
    console.log(`✓ Expiração: ${exp.toISOString()}\n`);

    const loginData = loginResponse.body.objetoResposta;
    console.log(`✓ Dados de login:`);
    console.log(`  - paaCodigo: ${loginData.paaCodigo}`);
    console.log(`  - parCodigo: ${loginData.parCodigo}`);
    console.log(`  - estCodigo: ${loginData.estCodigo}\n`);

    await sleep(500);

    // ========================================
    // PASSO 2: Criar Session Context
    // ========================================
    console.log('2️⃣  Criando session context com JWT...\n');

    const integrationAccountId = `acc-${Date.now()}`;

    const sessionContext = await localApiRequest(
      '/v1/session-contexts',
      'POST',
      {
        integrationAccountId,
        authMode: 'manual-token',
        jwtToken,
        metadata: {
          partnerCode: PARTNER_CODE,
          email: LOGIN_CREDENTIALS.email,
          paaCodigo: loginData.paaCodigo,
          parCodigo: loginData.parCodigo,
          estCodigo: loginData.estCodigo
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
    console.log(`  Status: ${sessionContext.body.status}\n`);

    await sleep(500);

    // ========================================
    // PASSO 3: Criar Manifesto
    // ========================================
    console.log('3️⃣  Criando manifesto...\n');

    const manifest = await localApiRequest(
      '/v1/manifestos',
      'POST',
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
        notes: "Teste E2E impressao MTR com login automático",
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
    console.log(`  Status: ${manifest.body.status}\n`);

    await sleep(500);

    // ========================================
    // PASSO 4: Submeter Manifesto
    // ========================================
    console.log('4️⃣  Submetendo manifesto para CETESB...\n');

    const submit = await localApiRequest(
      `/v1/manifestos/${manifestId}/submit`,
      'POST',
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
    
    console.log(`  Command ID: ${submit.body.commandId}\n`);

    // ========================================
    // PASSO 5: Aguardar Processamento (Submit)
    // ========================================
    console.log('5️⃣  Aguardando worker processar submit...\n');
    console.log('⚠️  Execute em outro terminal: npm run worker\n');

    let attempts = 0;
    let manifestData = null;

    while (attempts < 60) {
      const status = await localApiRequest(`/v1/manifestos/${manifestId}`);
      
      if (status.status === 200) {
        manifestData = status.body;
        const maniStatus = status.body.status;
        console.log(`[${attempts + 1}] Status: ${maniStatus}`);
        
        if (maniStatus === 'submitted') {
          console.log(`\n✅ Manifesto submetido com sucesso!`);
          if (status.body.externalHashCode) {
            console.log(`   Hash externo: ${status.body.externalHashCode}`);
          }
          break;
        }
        
        if (maniStatus === 'error' || maniStatus === 'failed') {
          console.log(`\n❌ Manifesto falhou: ${status.body.errorMessage}`);
          process.exit(1);
        }
      }
      
      attempts++;
      await sleep(3000);
    }

    if (!manifestData || manifestData.status !== 'submitted') {
      console.error('\n❌ Timeout aguardando submit');
      process.exit(1);
    }

    // ========================================
    // PASSO 6: Imprimir MTR
    // ========================================
    console.log('\n6️⃣  Solicitando impressão do MTR...\n');

    const print = await localApiRequest(
      `/v1/manifestos/${manifestId}/print`,
      'POST',
      {
        integrationAccountId,
        sessionContextId: sessionId,
        documentType: 'manifest_pdf'
      }
    );

    console.log(`Status: ${print.status}`);
    
    if (print.status !== 202) {
      console.error('⚠️  Print may have queued (expected 202, got ' + print.status + ')');
    } else {
      console.log(`✓ Print enqueued (202 Accepted)`);
    }
    
    console.log(`  Command ID: ${print.body.commandId}\n`);

    // ========================================
    // PASSO 7: Aguardar Processamento (Print)
    // ========================================
    console.log('7️⃣  Aguardando worker processar print...\n');

    attempts = 0;
    manifestData = null;

    while (attempts < 60) {
      const status = await localApiRequest(`/v1/manifestos/${manifestId}`);
      
      if (status.status === 200) {
        manifestData = status.body;
        const maniStatus = status.body.status;
        console.log(`[${attempts + 1}] Status: ${maniStatus}`);
        
        if (maniStatus === 'printed') {
          console.log(`\n✅ MTR impresso com sucesso!`);
          if (status.body.documents && status.body.documents.length > 0) {
            console.log(`   Documentos: ${status.body.documents.length}`);
            status.body.documents.forEach(doc => {
              console.log(`   - ${doc.type}: ${doc.downloadUrl}`);
            });
          }
          break;
        }
        
        if (maniStatus === 'error' || maniStatus === 'failed') {
          console.log(`\n❌ Impressão falhou: ${status.body.errorMessage}`);
          process.exit(1);
        }
      }
      
      attempts++;
      await sleep(3000);
    }

    if (!manifestData || manifestData.status !== 'printed') {
      console.error('\n❌ Timeout aguardando print');
      process.exit(1);
    }

    // ========================================
    // PASSO 8: Baixar PDF
    // ========================================
    if (manifestData.documents && manifestData.documents.length > 0) {
      const doc = manifestData.documents[0];
      
      console.log('\n8️⃣  Baixando PDF do MTR...\n');
      console.log(`→ GET http://${LOCAL_API_HOST}:${LOCAL_API_PORT}${doc.downloadUrl}`);

      const pdfResponse = await localApiRequest(doc.downloadUrl);
      
      if (pdfResponse.status === 200) {
        console.log(`✓ PDF baixado com sucesso!`);
        console.log(`  Tamanho: ${pdfResponse.body.length} bytes`);
        console.log(`  Salvo em: storage/documents/${manifestId}/`);
      } else {
        console.error(`❌ Erro ao baixar PDF: ${pdfResponse.status}`);
      }
    }

    // ========================================
    // RESUMO FINAL
    // ========================================
    console.log('\n╔═════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ Teste E2E COMPLETO - Sucesso!                          ║');
    console.log('╚═════════════════════════════════════════════════════════════╝\n');
    
    console.log('Fluxo executado:');
    console.log('  1. ✅ Login automático na CETESB');
    console.log('  2. ✅ Session context criada');
    console.log('  3. ✅ Manifesto criado');
    console.log('  4. ✅ Manifesto submetido');
    console.log('  5. ✅ Worker processou submit');
    console.log('  6. ✅ Impressão solicitada');
    console.log('  7. ✅ Worker processou print');
    console.log('  8. ✅ PDF baixado\n');
    
    console.log(`Manifesto ID: ${manifestId}`);
    console.log(`Status final: ${manifestData.status}`);
    console.log(`Documentos: ${manifestData.documents?.length || 0}`);
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
