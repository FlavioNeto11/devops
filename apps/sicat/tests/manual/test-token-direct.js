import { query, pool } from './src/db/pool.js';
import { config } from './src/lib/config.js';

(async () => {
  setConfigOverride('cetesbGatewayMode', 'real');
  setConfigOverride('cetesbBaseUrl', 'https://mtrr.cetesb.sp.gov.br');

  // Fazer login para obter novo token
  console.log('\n🔐 Autenticando...');
  const loginResponse = await fetch('https://mtrr.cetesb.sp.gov.br/api/mtr/carregaDadosLogin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'mtr-automation-node/3.0'
    },
    body: JSON.stringify({
      sistema: 0,
      login: '31913781000139',
      email: 'flavio_padilha_neto@msn.com',
      senha: '2dlzft',
      parCodigo: 176163
    })
  });

  const loginData = await loginResponse.json();
  const newToken = loginData.objetoResposta?.token || loginData.objetoResposta?.jwtToken;

  if (!newToken) {
    console.error('❌ Nenhum token retornado:', JSON.stringify(loginData, null, 2));
    process.exit(1);
  }

  console.log('✅ Token obtido:', newToken.substring(0, 50) + '...');

  // Testar com novo token
  console.log('\n🔍 Testando API com novo token...');
  const testResponse = await fetch(
    'https://mtrr.cetesb.sp.gov.br/api/mtr/pesquisaManifesto/176163/26/8/21-02-2026/08-03-2026/0/all',
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${newToken}`,
        'Accept': 'application/json'
      }
    }
  );

  const testData = await testResponse.json();
  console.log(`Status: ${testResponse.status}`);
  console.log(`Manifestos: ${testData.objetoResposta?.length || 0}`);
  if (testData.objetoResposta?.length > 0) {
    console.log('✅ Manifesto encontrado:', testData.objetoResposta[0].manNumero);
  }

  await pool.end();
})().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});

function setConfigOverride(key, value) {
  // Mock implementation
}
