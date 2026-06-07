#!/usr/bin/env node
const jwt = 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxNzYxNjMsMzMzOTQ4Iiwicm9sZSI6MSwiZXhwIjoxNzcyOTE0OTY4fQ.MDzLkHo3jUw3r6LHucubCnmKZWU6oW-0CuVTMa1V_D-pSkgBtlZ_9GFN8MTM7wTP4XnFErf8rQvHkIZ8QECzFQ';

const [,payload] = jwt.split('.');
const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());

console.log('\nJWT Payload:');
console.log(JSON.stringify(decoded, null, 2));

const exp = new Date(decoded.exp * 1000);
const now = new Date();

console.log('\nExpiracao:', exp.toISOString());
console.log('Agora:    ', now.toISOString());

const isExpired = exp < now;
console.log('\n' + (isExpired ? 'Token EXPIRADO' : 'Token VALIDO'));

if (isExpired) {
  const years = Math.floor((now - exp) / (1000 * 60 * 60 * 24 * 365));
  console.log(`   Expirou ha ${years} anos`);
} else {
  const hours = Math.floor((exp - now) / (1000 * 60 * 60));
  console.log(`   Valido por mais ${hours} horas`);
}

process.exit(isExpired ? 1 : 0);
