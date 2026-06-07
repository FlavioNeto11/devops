#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

// Read login HAR file
const harPath = 'c:\\GIT\\PADILHA\\sicat\\docs\\cetesb\\mtr.cetesb.sp.gov.br_login.har';
const harContent = fs.readFileSync(harPath, 'utf8');
const har = JSON.parse(harContent);

console.log('\n=== HAR LOGIN DATA EXTRACTION ===\n');

// Find entries with login-related endpoints
const entries = har.log.entries || [];
console.log(`Total entries in HAR: ${entries.length}`);

let tokenFound = false;
let foundEntries = [];

entries.forEach((entry, idx) => {
  const url = entry.request?.url || '';
  const method = entry.request?.method || '';
  
  // Look for login-related endpoints
  if (url.includes('login') || url.includes('carrega') || url.includes('autent') || url.includes('session')) {
    foundEntries.push({
      idx,
      url,
      method,
      status: entry.response?.status,
      responseText: entry.response?.content?.text?.substring(0, 500) || ''
    });
  }
});

console.log(`\nFound ${foundEntries.length} login-related entries:\n`);

foundEntries.forEach(entry => {
  console.log(`[${entry.idx}] ${entry.method} ${entry.url}`);
  console.log(`    Status: ${entry.status}`);
  console.log(`    Response preview: ${entry.responseText.substring(0, 100)}...`);
  console.log();
});

// Try to find JWT token in responses
console.log('\n=== Searching for JWT tokens in responses ===\n');

entries.forEach((entry, idx) => {
  const responseText = entry.response?.content?.text || '';
  
  // Look for jwtToken field
  if (responseText.includes('jwtToken') || responseText.includes('token') || responseText.includes('access_token')) {
    try {
      // Try to parse response as JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const response = JSON.parse(jsonMatch[0]);
        
        // Look for tokens
        if (response.jwtToken || response.token || response.access_token || 
            (response.objetoResposta && typeof response.objetoResposta === 'object' && response.objetoResposta.jwtToken)) {
          
          console.log(`Entry ${idx}: ${entry.request?.url}`);
          console.log(`Method: ${entry.request?.method}`);
          console.log(`Status: ${entry.response?.status}`);
          
          // Extract token
          const token = response.jwtToken || response.token || response.access_token || 
                       (response.objetoResposta?.jwtToken);
          
          if (token) {
            console.log(`\n⭐ JWT TOKEN FOUND:\n${token}\n`);
            tokenFound = true;
          }
          
          // Show response structure
          console.log('Response structure:');
          console.log(JSON.stringify(response, null, 2).substring(0, 500));
          console.log('\n---\n');
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
});

if (!tokenFound) {
  console.log('No JWT token found in responses. Showing first few login-related responses:\n');
  
  const loginEntries = entries.filter(e => 
    (e.request?.url || '').includes('login') || 
    (e.request?.url || '').includes('carrega') ||
    (e.response?.status === 200)
  ).slice(0, 3);
  
  loginEntries.forEach((entry, idx) => {
    console.log(`\n[${idx}] ${entry.request?.method} ${entry.request?.url}`);
    const text = entry.response?.content?.text || '';
    console.log('Response (first 500 chars):');
    console.log(text.substring(0, 500));
  });
}

console.log('\n=== Finished ===\n');
