#!/usr/bin/env node
/**
 * Extrai e valida JWT do HAR de login da CETESB
 */
import fs from 'fs/promises';
import path from 'path';

const harPath = path.join(process.cwd(), 'docs', 'cetesb', 'mtr.cetesb.sp.gov.br_login.har');

try {
  const harContent = await fs.readFile(harPath, 'utf-8');
  const har = JSON.parse(harContent);
  
  // Buscar JWT no response do login
  for (const entry of har.log.entries) {
    if (entry.request.url.includes('/api/mtr/acessos/autenticar')) {
      const responseText = entry.response.content.text;
      if (responseText) {
        const response = JSON.parse(responseText);
        const token = response.objetoResposta?.token;
        
        if (token) {
          console.log('\n✅ JWT encontrado no HAR de login:\n');
          console.log(token);
          
          // Decodificar payload (parte do meio)
          const [, payload] = token.split('.');
          const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
          
          console.log('\n📊 Payload decodificado:');
          console.log(JSON.stringify(decoded, null, 2));
          
          // Verificar expiração
          const exp = new Date(decoded.exp * 1000);
          const now = new Date();
          const isExpired = exp < now;
          
          console.log(`\n⏰ Expiração: ${exp.toISOString()}`);
          console.log(`⏰ Agora: ${now.toISOString()}`);
          console.log(`\n${isExpired ? '❌ Token EXPIRADO' : '✅ Token VÁLIDO'}`);
          
          if (isExpired) {
            const daysAgo = Math.floor((now - exp) / (1000 * 60 * 60 * 24));
            console.log(`   Expirou há ${daysAgo} dias`);
          } else {
            const hoursLeft = Math.floor((exp - now) / (1000 * 60 * 60));
            console.log(`   Válido por mais ${hoursLeft} horas`);
          }
          
          process.exit(isExpired ? 1 : 0);
        }
      }
    }
  }
  
  console.error('❌ JWT não encontrado no HAR');
  process.exit(1);
} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}
