#!/usr/bin/env node

/**
 * Script para testar criação de MTR real na CETESB
 * 
 * Uso:
 *   node test-real-mtr-creation.js "usuario_cetesb" "senha_cetesb" "recaptcha_token"
 * 
 * Ou com variáveis de ambiente:
 *   $env:CETESB_USERNAME = "usuario"
 *   $env:CETESB_PASSWORD = "senha"
 *   $env:RECAPTCHA_TOKEN = "token"
 *   node test-real-mtr-creation.js
 */

import http from 'node:http';

const API_BASE = 'http://localhost:8081';
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30;

// Dados do teste - empresa real válida para teste
// Estes são dados de teste na CETESB
const TEST_DATA = {
  integrationAccountId: 'test-account-001',
  generator: {
    partnerCode: '1234567890123', // CNPJ válido de teste
    description: 'Empresa Geradora de Testes LTDA',
    stateCode: 26,
    document: '12.345.678/0001-23'
  },
  carrier: {
    partnerCode: '9876543210987', // CNPJ válido de teste
    description: 'Transportadora de Testes LTDA',
    stateCode: 26,
    document: '98.765.432/0001-87'
  },
  receiver: {
    partnerCode: '1111111111111', // CNPJ válido de teste
    description: 'Destinadora de Testes LTDA',
    stateCode: 26,
    document: '11.111.111/0001-11'
  },
  responsibleName: 'Responsável Teste',
  manifestType: 'transporte',
  expeditionDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
  state: {
    code: 26,
    abbreviation: 'SP'
  },
  driverName: 'João Silva Teste',
  vehiclePlate: 'ABC1234',
  residues: [
    {
      residue: { code: '010201', description: 'Resíduo de teste' },
      unit: { code: 'kg', description: 'Quilograma' },
      treatment: { code: '00', description: 'Não aplicável' },
      class: { code: 'I', description: 'Classe I' },
      quantity: 100
    }
  ]
};

async function httpRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': `corr-${Date.now()}`,
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createSessionContext(username, password, recaptchaToken, integrationAccountId) {
  console.log('\n🔐 Obtendo JWT token via login real...');
  
  // Primeiro, fazer login real na CETESB para obter token
  const loginResponse = await httpRequest('POST', '/v1/auth/login', {
    document: username,
    password: password,
    recaptchaToken: recaptchaToken || 'dummy-token-for-testing'
  });

  if (loginResponse.status !== 200) {
    throw new Error(`Falha ao fazer login: ${loginResponse.status} - ${JSON.stringify(loginResponse.body)}`);
  }

  const loginData = loginResponse.body;
  console.log(`✅ Login realizado`);
  console.log(`   JWT token obtido`);
  console.log(`   Parceiro: ${loginData.partner?.description}`);
  console.log(`   Partner Code: ${loginData.partner?.partnerCode}`);

  // Agora criar session context com o token obtido
  console.log('\n📋 Criando session context com token obtido...');
  
  const response = await httpRequest('POST', '/v1/session-contexts', {
    integrationAccountId,
    authMode: 'manual-token',
    jwtToken: loginData.token,
    metadata: {
      stateCode: 26,
      partnerCode: loginData.partner?.partnerCode || 176163
    }
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Falha ao criar session context: ${response.status} - ${JSON.stringify(response.body)}`);
  }

  const sessionContext = response.body;
  console.log(`✅ Session context criado: ${sessionContext.id}`);
  console.log(`   Status: ${sessionContext.status}`);
  if (sessionContext.jwtToken) {
    console.log(`   JWT obtido (${sessionContext.jwtToken.substring(0, 20)}...)`);
  }
  
  return sessionContext;
}

async function createManifest(sessionContextId, integrationAccountId) {
  console.log('\n📝 Criando manifesto com dados de teste...');
  
  const manifest = {
    ...TEST_DATA,
    integrationAccountId,
    sessionContextId
  };

  const response = await httpRequest('POST', '/v1/manifestos', manifest);

  if (response.status !== 201) {
    throw new Error(`Falha ao criar manifesto: ${response.status} - ${JSON.stringify(response.body)}`);
  }

  const created = response.body;
  console.log(`✅ Manifesto criado localmente: ${created.id}`);
  console.log(`   Status: ${created.status}`);
  
  return created;
}

async function submitManifest(manifestId, sessionContextId) {
  console.log('\n🚀 Enviando manifesto para CETESB...');
  
  const response = await httpRequest('POST', `/v1/manifestos/${manifestId}/submit`, {
    sessionContextId
  });

  if (![200, 201, 202].includes(response.status)) {
    throw new Error(`Falha ao enviar manifesto: ${response.status} - ${JSON.stringify(response.body)}`);
  }

  const result = response.body;
  console.log(`✅ Manifesto enviado (status ${response.status})`);
  console.log(`   Command ID: ${result.commandId}`);
  console.log(`   Job ID: ${result.jobId}`);
  
  return result;
}

async function pollManifestStatus(manifestId, maxAttempts = POLL_MAX_ATTEMPTS) {
  console.log(`\n⏳ Aguardando processamento do manifesto (${maxAttempts} tentativas)...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    
    const response = await httpRequest('GET', `/v1/manifestos/${manifestId}`);
    
    if (response.status !== 200) {
      throw new Error(`Falha ao consultar manifesto: ${response.status}`);
    }

    const manifest = response.body;
    process.stdout.write(`   [${attempt}/${maxAttempts}] Status: ${manifest.status}`);

    if (manifest.status === 'submitted') {
      console.log(' ✅\n');
      return manifest;
    } else if (manifest.status === 'failed') {
      console.log(' ❌\n');
      throw new Error(`Manifesto falhou no processamento: ${JSON.stringify(manifest)}`);
    } else if (manifest.status === 'retry_wait') {
      console.log(' (aguardando retry)');
    } else {
      console.log(' (processando)');
    }
  }

  throw new Error('Timeout aguardando submission do manifesto');
}

async function displayManifestInfo(manifest) {
  console.log('\n✨ Manifesto final:');
  console.log(`   ID: ${manifest.id}`);
  console.log(`   Status Interno: ${manifest.status}`);
  console.log(`   Status Externo: ${manifest.externalStatus}`);
  
  if (manifest.externalReference) {
    console.log(`   Número CETESB: ${manifest.externalReference.manNumero}`);
    console.log(`   Código CETESB: ${manifest.externalReference.manCodigo}`);
  }

  if (manifest.externalHashCode) {
    console.log(`   Hash CETESB: ${manifest.externalHashCode}`);
  }

  console.log(`\n🌐 Para verificar na plataforma CETESB:`);
  console.log(`   URL: https://mtr.cetesb.sp.gov.br/`);
  console.log(`   Procure pelo número: ${manifest.externalReference?.manNumero || manifest.id}`);
  console.log(`   Ou código: ${manifest.externalReference?.manCodigo || 'N/A'}`);
}

async function main() {
  try {
    console.log('\n🎯 TESTE DE CRIAÇÃO DE MTR NA CETESB REAL\n');
    console.log('='.repeat(50));

    // Obter credenciais
    const username = process.argv[2] || process.env.CETESB_USERNAME;
    const password = process.argv[3] || process.env.CETESB_PASSWORD;
    const recaptchaToken = process.argv[4] || process.env.RECAPTCHA_TOKEN;

    if (!username || !password) {
      throw new Error(
        'Credenciais CETESB não fornecidas.\n\n' +
        'Use:\n' +
        '  node test-real-mtr-creation.js "usuario" "senha" "recaptcha_token"\n\n' +
        'Ou defina variáveis de ambiente:\n' +
        '  $env:CETESB_USERNAME = "usuario"\n' +
        '  $env:CETESB_PASSWORD = "senha"\n' +
        '  $env:RECAPTCHA_TOKEN = "token"\n' +
        '  node test-real-mtr-creation.js'
      );
    }

    console.log(`✓ Credenciais obtidas`);
    console.log(`✓ API URL: ${API_BASE}`);
    console.log(`✓ Modo: CETESB REAL`);

    // 1. Criar integration account e session context
    const integrationAccountId = `acc-${Date.now()}`;
    console.log(`✓ Integration Account ID: ${integrationAccountId}`);

    const sessionContext = await createSessionContext(username, password, recaptchaToken, integrationAccountId);

    // 2. Criar manifesto
    const manifest = await createManifest(sessionContext.id, integrationAccountId);

    // 3. Enviar para CETESB
    const submitted = await submitManifest(manifest.id, sessionContext.id);

    // 4. Aguardar processamento
    const finalManifest = await pollManifestStatus(manifest.id);

    // 5. Exibir resultado
    await displayManifestInfo(finalManifest);

    console.log('\n' + '='.repeat(50));
    console.log('✅ TESTE CONCLUÍDO COM SUCESSO!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error('\n' + '='.repeat(50) + '\n');
    process.exit(1);
  }
}

main();
