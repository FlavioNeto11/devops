#!/usr/bin/env node
import fs from 'fs';

// Read login HAR file
const harPath = 'c:\\GIT\\PADILHA\\sicat\\docs\\cetesb\\mtr.cetesb.sp.gov.br_login.har';
const harContent = fs.readFileSync(harPath, 'utf8');
const har = JSON.parse(harContent);

console.log('\n=== EXTRACTING REAL LOGIN DATA FROM HAR ===\n');

const entries = har.log.entries || [];

// Find the carregaDadosLogin POST response
const loginEntry = entries.find(e => 
  e.request?.url?.includes('carregaDadosLogin') && 
  e.request?.method === 'POST'
);

if (loginEntry) {
  console.log('✓ Found login response entry');
  
  const responseText = loginEntry.response?.content?.text || '';
  const response = JSON.parse(responseText);
  
  console.log('\n--- RAW RESPONSE ---');
  console.log(JSON.stringify(response, null, 2));
  
  console.log('\n--- EXTRACTED DATA ---');
  
  const objResp = response.objetoResposta || {};
  
  console.log(`\nUser Info:`);
  console.log(`  PAA Codigo: ${objResp.paaCodigo}`);
  console.log(`  PAA Nome: ${objResp.paaNome}`);
  console.log(`  PAR Codigo: ${objResp.parCodigo}`);
  console.log(`  Perfil ID: ${objResp.perfilId}`);
  console.log(`  Token Agro: ${objResp.tokenAgro}`);
  
  // Check for JWT or auth token
  if (objResp.jwtToken) {
    console.log(`\n⭐ JWT TOKEN:\n${objResp.jwtToken}`);
  }
  
  if (objResp.token) {
    console.log(`\n⭐ TOKEN:\n${objResp.token}`);
  }
  
  // Show full objetoResposta
  console.log('\n--- Full objetoResposta object ---');
  Object.keys(objResp).forEach(key => {
    const value = objResp[key];
    if (typeof value === 'string' && value.length > 100) {
      console.log(`${key}: ${value.substring(0, 50)}...`);
    } else {
      console.log(`${key}: ${value}`);
    }
  });
}

// Also look for other auth-related entries
console.log('\n--- OTHER ENTRIES ---');
entries.forEach((entry, idx) => {
  const url = entry.request?.url || '';
  const method = entry.request?.method || '';
  
  if ((url.includes('login') || url.includes('autent') || url.includes('token')) && 
      method !== 'OPTIONS') {
    console.log(`\n[${idx}] ${method} ${url}`);
    console.log(`Status: ${entry.response?.status}`);
    
    const respText = entry.response?.content?.text || '';
    if (respText && respText.length < 500) {
      console.log(`Response: ${respText}`);
    } else if (respText) {
      console.log(`Response (preview): ${respText.substring(0, 300)}...`);
    }
  }
});

console.log('\n=== DONE ===\n');
