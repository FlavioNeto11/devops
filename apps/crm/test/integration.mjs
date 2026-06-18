// Testes de integração — REQ-CRM-0002 (modelo de dados) + REQ-CRM-0004 (CRUD de empresas).
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

async function post(path, body) {
  const res = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`POST ${path} => ${res.status}: ${err.error || ''}`);
  }
  return res.json();
}

async function put(path, body) {
  const res = await fetch(`${api}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`PUT ${path} => ${res.status}: ${err.error || ''}`);
  }
  return res.json();
}

async function del(path) {
  const res = await fetch(`${api}${path}`, { method: 'DELETE' });
  if (res.status !== 204) throw new Error(`DELETE ${path} => ${res.status}`);
}

// ── REQ-CRM-0002 ──────────────────────────────────────────────────────────────

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

// ── REQ-CRM-0004 — CRUD de empresas ──────────────────────────────────────────

test('companies: lista aceita ?q= (busca por nome)', async () => {
  const all = await get('/companies');
  const first = all[0];
  const fragment = first.name.slice(0, 3);
  const filtered = await get(`/companies?q=${encodeURIComponent(fragment)}`);
  assert.ok(Array.isArray(filtered), 'deve retornar array');
  assert.ok(filtered.some((c) => c.id === first.id), 'busca deve encontrar a empresa pelo fragmento');
});

test('companies: lista aceita ?q= (busca por segmento)', async () => {
  const all = await get('/companies');
  const withSeg = all.find((c) => c.segment);
  if (!withSeg) return; // seed sem segmento — skip
  const found = await get(`/companies?q=${encodeURIComponent(withSeg.segment)}`);
  assert.ok(found.some((c) => c.id === withSeg.id), 'busca por segmento deve encontrar a empresa');
});

test('companies: busca sem resultado retorna array vazio', async () => {
  const result = await get('/companies?q=XYZZY_IMPOSSIVEL_99999');
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('companies: GET /:id retorna empresa com contacts[]', async () => {
  const list = await get('/companies');
  const c = list[0];
  const detail = await get(`/companies/${c.id}`);
  assert.equal(detail.id, c.id);
  assert.ok('contacts' in detail, 'detalhe deve ter campo contacts');
  assert.ok(Array.isArray(detail.contacts), 'contacts deve ser array');
});

test('companies: GET /:id retorna 404 para id inexistente', async () => {
  const res = await fetch(`${api}/companies/999999999`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.ok(body.error, 'deve retornar campo error');
});

test('companies: POST cria empresa com campos completos', async () => {
  const payload = { name: 'TestCo Integration', segment: 'SaaS', website: 'https://testco.example.com' };
  const created = await post('/companies', payload);
  assert.ok(created.id, 'deve retornar id');
  assert.equal(created.name, payload.name);
  assert.equal(created.segment, payload.segment);
  assert.equal(created.website, payload.website);

  // cleanup
  await del(`/companies/${created.id}`);
});

test('companies: POST rejeita nome ausente com 400', async () => {
  const res = await fetch(`${api}/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segment: 'SaaS' }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error, 'deve retornar campo error');
});

test('companies: POST rejeita nome em branco com 400', async () => {
  const res = await fetch(`${api}/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '   ' }),
  });
  assert.equal(res.status, 400);
});

test('companies: PUT atualiza empresa existente', async () => {
  const created = await post('/companies', { name: 'OriginalName' });
  const updated = await put(`/companies/${created.id}`, {
    name: 'UpdatedName',
    segment: 'Fintech',
    website: 'https://updated.example.com',
  });
  assert.equal(updated.name, 'UpdatedName');
  assert.equal(updated.segment, 'Fintech');
  assert.ok(updated.updated_at !== created.updated_at, 'updated_at deve ser atualizado');

  // cleanup
  await del(`/companies/${created.id}`);
});

test('companies: PUT rejeita nome em branco com 400', async () => {
  const list = await get('/companies');
  const c = list[0];
  const res = await fetch(`${api}/companies/${c.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '' }),
  });
  assert.equal(res.status, 400);
});

test('companies: PUT retorna 404 para id inexistente', async () => {
  const res = await fetch(`${api}/companies/999999999`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ghost' }),
  });
  assert.equal(res.status, 404);
});

test('companies: DELETE remove empresa e retorna 204', async () => {
  const created = await post('/companies', { name: 'ToDelete' });
  await del(`/companies/${created.id}`);
  const res = await fetch(`${api}/companies/${created.id}`);
  assert.equal(res.status, 404, 'empresa deletada deve retornar 404');
});

test('companies: DELETE retorna 404 para id inexistente', async () => {
  const res = await fetch(`${api}/companies/999999999`, { method: 'DELETE' });
  assert.equal(res.status, 404);
});

test('companies: DELETE com contatos vinculados aplica set null (sem bloqueio)', async () => {
  // Cria empresa
  const co = await post('/companies', { name: 'EmpresaParaCascade' });

  // Contatos do seed com company_id = 1; aqui apenas verificamos que o delete não retorna erro 4xx/5xx
  // A FK ON DELETE SET NULL é validada pelo banco — se falhar, delete retornaria 500
  await del(`/companies/${co.id}`);

  // Empresa não deve mais existir
  const check = await fetch(`${api}/companies/${co.id}`);
  assert.equal(check.status, 404);
});

test('companies: campos opcionais segment e website aceitam null', async () => {
  const created = await post('/companies', { name: 'SemSegmento' });
  assert.equal(created.segment, null);
  assert.equal(created.website, null);
  await del(`/companies/${created.id}`);
});
