#!/usr/bin/env node
import { createCetesbGateway } from './src/gateways/cetesb-gateway.js';

// Forçar modo real
process.env.CETESB_GATEWAY_MODE = 'real';

const gateway = createCetesbGateway();

console.log('\n🔐 Testando login CETESB direto...\n');

try {
  const result = await gateway.bootstrapSession({
    partnerCode: '176163',
    partnerDocument: '31913781000139',
    email: 'flavio_padilha_neto@msn.com',
    password: '2dlzft',
    metadata: {
      partnerCode: '176163',
      login: '31913781000139',
      email: 'flavio_padilha_neto@msn.com',
      password: '2dlzft',
      system: 0
    }
  });

  console.log('✅ LOGIN SUCESSO!');
  console.log('Token:', result.token.substring(0, 50) + '...');
  console.log('Expira em:', result.expiresAt);
  console.log('Partner Code:', result.authPayload?.parCodigo);
  console.log('User:', result.authPayload?.paaNome);
  
} catch (error) {
  console.error('\n❌ ERRO:', error.message);
  if (error.extras?.remoteBody) {
    console.error('\nCETESB Response Body:');
    console.error(JSON.stringify(error.extras.remoteBody, null, 2));
  }
  if (error.extras?.cause) {
    console.error('\nCause:', error.extras.cause);
  }
  process.exit(1);
}
