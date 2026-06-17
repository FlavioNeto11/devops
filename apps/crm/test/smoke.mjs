// Smoke E2E do crm (gerado pelo FORGE; o Claude completa os fluxos CRUD).
// Roda contra a app no ar. Uso: node test/smoke.mjs [baseUrl]
const base = process.argv[2] || 'http://nvit.localhost/crm';
const got = await fetch(base + '/api/health').then(r => r.status).catch(() => 0);
if (got !== 200) { console.error('[smoke] /api/health != 200 (got ' + got + ')'); process.exit(1); }
console.log('[smoke] OK: health 200');
