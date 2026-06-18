// Testes de integração para REQ-CRM-0002 — modelo de dados e persistência.
// Uso: BASE_URL=http://nvit.localhost/crm node test/integration.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

const base = process.env.BASE_URL || 'http://nvit.localhost/crm';
const api = `${base}/api`;

async function get(path) {
  const res = await fetch(`${api}${path}`);
  if (!res.ok) throw new Error(`GET ${path} => ${res.status}`);
  return res.json();
}

test('health: API responde e DB está conectado', async () => {
  const body = await get('/health');
  assert.equal(body.status, 'ok');
  assert.equal(body.db, 'connected');
});

test('companies: ao menos 2 empresas no seed', async () => {
  const rows = await get('/companies');
  assert.ok(Array.isArray(rows), 'deve retornar array');
  assert.ok(rows.length >= 2, `esperado >= 2 empresas, obtido ${rows.length}`);
  for (const c of rows) {
    assert.ok(c.id,   'empresa deve ter id');
    assert.ok(c.name, 'empresa deve ter name');
  }
});

test('contacts: ao menos 3 contatos no seed', async () => {
  const rows = await get('/contacts');
  assert.ok(Array.isArray(rows), 'deve retornar array');
  assert.ok(rows.length >= 3, `esperado >= 3 contatos, obtido ${rows.length}`);
  for (const c of rows) {
    assert.ok(c.id,   'contato deve ter id');
    assert.ok(c.name, 'contato deve ter name');
    assert.ok('company_id' in c, 'contato deve expor company_id (FK opcional)');
  }
});

test('deals: ao menos 2 negócios com stage válido', async () => {
  const rows = await get('/deals');
  assert.ok(Array.isArray(rows), 'deve retornar array');
  assert.ok(rows.length >= 2, `esperado >= 2 negócios, obtido ${rows.length}`);
  const valid = new Set(['lead', 'qualified', 'proposal', 'won', 'lost']);
  for (const d of rows) {
    assert.ok(d.id,    'deal deve ter id');
    assert.ok(d.title, 'deal deve ter title');
    assert.ok(valid.has(d.stage), `stage "${d.stage}" fora do enum permitido`);
    assert.ok('amount' in d,     'deal deve expor amount');
  }
});
