// Testes de integração — REF-SHOPDESK-0009: Editar Pedido (/orders/:id/edit).
// Verifica o contrato de backend que sustenta a tela: GET carrega o pedido, PUT persiste as edições.
// Skipped quando BASE_URL não está definida (ambiente de CI sem backend ativo).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const API = (process.env.BASE_URL || 'http://nvit.localhost/shopdesk/api').replace(/\/$/, '');
const LIVE = !!process.env.BASE_URL;
const H = { 'Content-Type': 'application/json' };
const get = (p) => fetch(API + p, { headers: H }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const post = (p, b) => fetch(API + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const put = (p, b) => fetch(API + p, { method: 'PUT', headers: H, body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));

test('REF-SHOPDESK-0009 — carrega pedido para edição (GET /v1/orders/:id)', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const created = await post('/v1/orders', { code: 'TST-EDIT-001', customerName: 'Cliente Teste', total: 150, status: 'pago' });
  assert.equal(created.s, 201, 'criação retorna 201');
  const id = created.j.id;
  assert.ok(id, 'pedido criado com id');

  const r = await get('/v1/orders/' + id);
  assert.equal(r.s, 200, 'GET retorna 200');
  assert.equal(r.j.id, id, 'mesmo id');
  assert.equal(r.j.customer_name, 'Cliente Teste', 'nome do cliente presente');
});

test('REF-SHOPDESK-0009 — salva edições via PUT e persiste campos editáveis', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const created = await post('/v1/orders', { code: 'TST-EDIT-002', customerName: 'Nome Original', total: 200, status: 'pago' });
  assert.equal(created.s, 201);
  const id = created.j.id;

  const updated = await put('/v1/orders/' + id, {
    customerName: 'Nome Editado',
    customerEmail: 'editado@exemplo.com',
    shippingAddress: 'Rua das Flores, 42, São Paulo — SP, 01310-100',
    trackingCode: 'BR999888777BR',
    status: 'enviado',
  });
  assert.equal(updated.s, 200, 'PUT retorna 200');
  assert.equal(updated.j.customer_name, 'Nome Editado', 'nome atualizado');
  assert.equal(updated.j.customer_email, 'editado@exemplo.com', 'email atualizado');
  assert.equal(updated.j.tracking_code, 'BR999888777BR', 'rastreio atualizado');
  assert.equal(updated.j.status, 'enviado', 'status atualizado');
  assert.equal(updated.j.shipping_address, 'Rua das Flores, 42, São Paulo — SP, 01310-100', 'endereço atualizado');
});

test('REF-SHOPDESK-0009 — GET 404 para pedido inexistente → empty-state esperado', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const r = await get('/v1/orders/999999999');
  assert.equal(r.s, 404, 'retorna 404 para id inexistente');
});

test('REF-SHOPDESK-0009 — PUT em pedido inexistente retorna 404', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const r = await put('/v1/orders/999999999', { customerName: 'X', status: 'pago' });
  assert.equal(r.s, 404, 'PUT em id inexistente retorna 404');
});
