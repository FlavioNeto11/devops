// REF-HELPFLOW-0006 — Tela Solicitantes (/customers)
// Testes de integração do endpoint /v1/customers que sustenta a tela.
// Exigem BASE_URL apontando para o servidor vivo (skip sem BASE_URL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, LIVE } from './locked/_lib.mjs';

const PUT = (p, b) => fetch(
  (process.env.BASE_URL || 'http://nvit.localhost/helpflow/api').replace(/\/$/, '') + p,
  { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }
).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));

const SKIP = LIVE ? false : 'sem BASE_URL';

test('REF-HELPFLOW-0006: GET /v1/customers retorna lista paginada (estado normal)', { skip: SKIP }, async () => {
  const { s, j } = await get('/v1/customers');
  assert.equal(s, 200, 'status 200');
  assert.ok(Array.isArray(j.data), 'campo data é array');
  assert.ok(typeof j.total === 'number', 'campo total é número');
});

test('REF-HELPFLOW-0006: GET /v1/customers?q= filtra por nome ou email (busca)', { skip: SKIP }, async () => {
  // Cria um solicitante com nome único para buscar
  const unique = 'TestBusca' + Date.now();
  const cr = await post('/v1/customers', { name: unique, email: unique.toLowerCase() + '@test.com' });
  assert.equal(cr.s, 201, 'criação ok');
  const id = cr.j.id;

  try {
    const { s, j } = await get('/v1/customers?q=' + unique);
    assert.equal(s, 200);
    assert.ok(j.data.some((c) => c.id === id), 'busca por nome encontra o registro');
  } finally {
    await del('/v1/customers/' + id);
  }
});

test('REF-HELPFLOW-0006: POST /v1/customers cria solicitante (campos name+email obrigatórios)', { skip: SKIP }, async () => {
  const { s, j } = await post('/v1/customers', { name: 'Maria Teste', email: 'maria.teste@exemplo.com' });
  assert.equal(s, 201, 'HTTP 201');
  assert.ok(j.id, 'retorna id');
  assert.equal(j.name, 'Maria Teste');
  assert.equal(j.email, 'maria.teste@exemplo.com');
  assert.equal(j.status, 'active', 'status padrão active');
  assert.equal(j.vip, false, 'vip padrão false');
  await del('/v1/customers/' + j.id);
});

test('REF-HELPFLOW-0006: POST /v1/customers valida campos obrigatórios (400 sem name/email)', { skip: SKIP }, async () => {
  const r1 = await post('/v1/customers', { email: 'apenas@email.com' });
  assert.equal(r1.s, 400, 'falta name → 400');

  const r2 = await post('/v1/customers', { name: 'Só Nome' });
  assert.equal(r2.s, 400, 'falta email → 400');
});

test('REF-HELPFLOW-0006: GET /v1/customers/:id retorna detalhe do solicitante (navegação /customers/:id)', { skip: SKIP }, async () => {
  const cr = await post('/v1/customers', { name: 'Detalhe Teste', email: 'detalhe.teste@exemplo.com', vip: true });
  assert.equal(cr.s, 201);
  const id = cr.j.id;

  try {
    const { s, j } = await get('/v1/customers/' + id);
    assert.equal(s, 200);
    assert.equal(j.id, id);
    assert.equal(j.name, 'Detalhe Teste');
    assert.equal(j.vip, true);
  } finally {
    await del('/v1/customers/' + id);
  }
});

test('REF-HELPFLOW-0006: GET /v1/customers/:id inexistente retorna 404', { skip: SKIP }, async () => {
  const { s } = await get('/v1/customers/999999999');
  assert.equal(s, 404);
});

test('REF-HELPFLOW-0006: PUT /v1/customers/:id atualiza dados do solicitante', { skip: SKIP }, async () => {
  const cr = await post('/v1/customers', { name: 'Atualizar Teste', email: 'atualizar@exemplo.com' });
  assert.equal(cr.s, 201);
  const id = cr.j.id;

  try {
    const up = await PUT('/v1/customers/' + id, {
      name: 'Atualizar Teste',
      email: 'atualizar@exemplo.com',
      vip: true,
      status: 'inactive',
      phone: '+55 11 99999-0000',
    });
    assert.equal(up.s, 200);
    assert.equal(up.j.vip, true);
    assert.equal(up.j.status, 'inactive');
    assert.equal(up.j.phone, '+55 11 99999-0000');
  } finally {
    await del('/v1/customers/' + id);
  }
});

test('REF-HELPFLOW-0006: GET /v1/customers?status=active filtra por situação', { skip: SKIP }, async () => {
  const { s, j } = await get('/v1/customers?status=active');
  assert.equal(s, 200);
  if (j.data.length > 0) {
    assert.ok(j.data.every((c) => c.status === 'active'), 'todos ativos quando filtro active');
  }
});
