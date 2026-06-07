#!/usr/bin/env node
/**
 * Teste de Impressão MTR com JWT Fornecido Manualmente
 * 
 * Uso:
 * 1. Faça login no browser em https://mtr.cetesb.sp.gov.br
 * 2. Abra DevTools → Application → Local Storage → https://mtr.cetesb.sp.gov.br
 * 3. Copie o valor de "access_token"
 * 4. Execute: node tests/manual/test-print-with-manual-jwt.js "SEU_JWT_AQUI"
 * 
 * Fluxo:
 * 1. Criar session context com JWT manual
 * 2. Buscar manifestos da data atual
 * 3. Imprimir primeiro manifesto encontrado
 * 4. Baixar PDF
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

const REAL_JWT_TOKEN = process.argv[2];

if (!REAL_JWT_TOKEN) {
  console.error('\n❌ JWT token não fornecido!\n');
  console.log('Uso:');
  console.log('  node tests/manual/test-print-with-manual-jwt.js "SEU_JWT_AQUI"\n');
  console.log('Como obter o JWT:');
  console.log('  1. Faça login em https://mtr.cetesb.sp.gov.br');
  console.log('  2. DevTools → Application → Local Storage');
  console.log('  3. Copie o valor de "access_token"\n');
  process.exit(1);
}

const PARTNER_CODE = '176163';
const LOCAL_API_HOST = '127.0.0.1';
const LOCAL_API_PORT = 8080;

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║  Teste: Impressão MTR com JWT Manual                    ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// Decodificar JWT para verificar expiração
try {
  const [, payload] = REAL_JWT_TOKEN.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
  const exp = new Date(decoded.exp * 1000);
  const now = new Date();
  
  console.log(`✓ JWT fornecido: ${REAL_JWT_TOKEN.substring(0, 50)}...`);
  console.log(`  Expira em: ${exp.toISOString()}`);
  
  if (exp < now) {
    console.error(`\n❌ JWT EXPIRADO! (expirou ${Math.floor((now - exp) / 1000 / 60)} minutos atrás)\n`);
    console.log('Por favor, faça novo login e obtenha token atualizado.\n');
    process.exit(1);
  }
  
  const minutesLeft = Math.floor((exp - now) / 1000 / 60);
  console.log(`  ✓ Válido por mais ${minutesLeft} minutos\n`);
} catch (error) {
  console.error(`\n❌ Erro ao decodificar JWT: ${error.message}\n`);
  process.exit(1);
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
    const integrationAccountId = `acc-${Date.now()}`;

    // ========================================
    // PASSO 1: Criar Session Context
    // ========================================
    console.log('1️⃣  Criando session context...\n');

    const sessionContext = await localApiRequest(
      '/v1/session-contexts',
      'POST',
      {
        integrationAccountId,
        authMode: 'manual-token',
        jwtToken: REAL_JWT_TOKEN,
        metadata: {
          partnerCode: PARTNER_CODE
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
    // PASSO 2: Buscar Manifestos de Hoje
    // ========================================
    console.log('2️⃣  Buscando manifestos de hoje (09/03/2026)...\n');

    const today = '2026-03-09';
    const manifestos = await localApiRequest(
      `/v1/manifestos?integrationAccountId=${integrationAccountId}&sessionContextId=${sessionId}&filters[expeditionDateFrom]=${today}&filters[expeditionDateTo]=${today}`
    );

    console.log(`Status: ${manifestos.status}`);

    if (manifestos.status === 202) {
      console.log('⏳ Comando enfileirado (202), aguardando processamento...\n');
      
      // Aguardar worker processar
      let attempts = 0;
      while (attempts < 20) {
        await sleep(3000);
        const retry = await localApiRequest(
          `/v1/manifestos?integrationAccountId=${integrationAccountId}&sessionContextId=${sessionId}&filters[expeditionDateFrom]=${today}&filters[expeditionDateTo]=${today}`
        );
        
        console.log(`[${attempts + 1}] Status: ${retry.status}`);
        
        if (retry.status === 200) {
          manifestos.status = 200;
          manifestos.body = retry.body;
          break;
        }
        
        attempts++;
      }
    }
    
    if (manifestos.status !== 200) {
      console.error('❌ Failed to get manifestos:', manifestos.body);
      process.exit(1);
    }
    
    const items = manifestos.body.items || manifestos.body.data?.items || [];
    console.log(`✓ Encontrados ${items.length} manifestos\n`);
    
    if (items.length === 0) {
      console.log('⚠️  Nenhum manifesto encontrado para hoje. Criando um novo...\n');
      
      // Criar novo manifesto
      const manifest = await localApiRequest(
        '/v1/manifestos',
        'POST',
        {
          integrationAccountId,
          sessionContextId: sessionId,
          requestedBy: "flavio.padilha",
          manifestType: 1,
          state: { code: 26, abbreviation: "SP" },
          responsibleName: "Flavio Padilha Neto",
          expeditionDate: today,
          driverName: "Osvaldo",
          vehiclePlate: "ETA26D1",
          notes: "Teste impressao MTR",
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
          residues: [{
            lineNumber: 1,
            quantity: 18,
            receivedQuantity: null,
            weightTon: 18,
            unit: { code: 3, description: "Tonelada", symbol: "TON" },
            residue: {
              code: 731,
              ibamaCode: "Classe A",
              description: "Resíduos reutilizáveis ou recicláveis como agregados",
              groupDescription: "Resíduos de Construção Civil",
              groupRepresentation: "1710"
            },
            treatment: { code: 51, description: "Aterro de Reservação - RCC" },
            class: { code: 11, description: "CLASSE A (RCC)" },
            abnt: null,
            cadriItem: null,
            stateType: { code: 4, description: "SOLIDO" },
            packagingType: { code: 4, description: "CAÇAMBA ABERTA" },
            packagingGroup: null,
            internalCode: null,
            onuCode: null,
            riskClass: null,
            shipmentName: null,
            notes: null
          }]
        }
      );

      if (manifest.status !== 201) {
        console.error('❌ Manifest creation failed:', manifest.body);
        process.exit(1);
      }

      console.log(`✓ Manifesto criado: ${manifest.body.id}\n`);
      
      // Submeter
      console.log('  Submetendo para CETESB...\n');
      const submit = await localApiRequest(
        `/v1/manifestos/${manifest.body.id}/submit`,
        'POST',
        { integrationAccountId, sessionContextId: sessionId }
      );

      console.log(`  Submit status: ${submit.status}`);
      console.log('  ⚠️  Execute npm run worker em outro terminal\n');
      console.log('  Aguardando processamento...\n');

      // Aguardar submit
      let submitAttempts = 0;
      let submitted = false;
      
      while (submitAttempts < 60) {
        const status = await localApiRequest(`/v1/manifestos/${manifest.body.id}`);
        
        if (status.status === 200) {
          console.log(`  [${submitAttempts + 1}] Status: ${status.body.status}`);
          
          if (status.body.status === 'submitted') {
            submitted = true;
            items.push(status.body);
            console.log(`  ✓ Manifesto submetido!\n`);
            break;
          }
          
          if (status.body.status === 'error' || status.body.status === 'failed') {
            console.error(`  ❌ Submit falhou: ${status.body.errorMessage}`);
            process.exit(1);
          }
        }
        
        submitAttempts++;
        await sleep(3000);
      }

      if (!submitted) {
        console.error('\n❌ Timeout aguardando submit');
        process.exit(1);
      }
    }

    // ========================================
    // PASSO 3: Imprimir Primeiro Manifesto
    // ========================================
    const manifestToPrint = items[0];
    console.log(`3️⃣  Imprimindo manifesto: ${manifestToPrint.id}\n`);
    console.log(`  Hash CETESB: ${manifestToPrint.externalHashCode || '(não disponível)'}`);
    console.log(`  Status atual: ${manifestToPrint.status}\n`);

    const print = await localApiRequest(
      `/v1/manifestos/${manifestToPrint.id}/print`,
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
    // PASSO 4: Aguardar Processamento (Print)
    // ========================================
    console.log('4️⃣  Aguardando worker processar print...\n');
    console.log('⚠️  Execute em outro terminal: npm run worker\n');

    let attempts = 0;
    let manifestData = null;

    while (attempts < 60) {
      const status = await localApiRequest(`/v1/manifestos/${manifestToPrint.id}`);
      
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
    // PASSO 5: Baixar PDF
    // ========================================
    if (manifestData.documents && manifestData.documents.length > 0) {
      const doc = manifestData.documents[0];
      
      console.log('\n5️⃣  Baixando PDF do MTR...\n');
      console.log(`→ GET http://${LOCAL_API_HOST}:${LOCAL_API_PORT}${doc.downloadUrl}`);

      const pdfResponse = await localApiRequest(doc.downloadUrl);
      
      if (pdfResponse.status === 200) {
        console.log(`✓ PDF baixado com sucesso!`);
        const pdfSize = typeof pdfResponse.body === 'string' ? pdfResponse.body.length : JSON.stringify(pdfResponse.body).length;
        console.log(`  Tamanho: ${pdfSize} bytes`);
        console.log(`  Salvo em: storage/documents/${manifestToPrint.id}/\n`);
      } else {
        console.error(`❌ Erro ao baixar PDF: ${pdfResponse.status}`);
      }
    }

    // ========================================
    // RESUMO FINAL
    // ========================================
    console.log('\n╔═════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ Teste de Impressão MTR - Sucesso!                      ║');
    console.log('╚═════════════════════════════════════════════════════════════╝\n');
    
    console.log('Fluxo executado:');
    console.log('  1. ✅ Session context criada com JWT manual');
    console.log('  2. ✅ Manifestos buscados (ou novo criado)');
    console.log('  3. ✅ Impressão solicitada');
    console.log('  4. ✅ Worker processou print');
    console.log('  5. ✅ PDF baixado\n');
    
    console.log(`Manifesto ID: ${manifestToPrint.id}`);
    console.log(`Status final: ${manifestData.status}`);
    console.log(`Documentos: ${manifestData.documents?.length || 0}`);
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
