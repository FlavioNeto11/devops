// Teste funcional — REF-HELPFLOW-0018: tela Políticas de SLA (/sla-policies).
// Valida o contrato da API que a tela consome: listagem, criação, busca por nome (?q=)
// e remoção. Não é LOCKED — a especificação da tela pode evoluir sem regenerar suíte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, LIVE } from '../locked/_lib.mjs';

test('REF-HELPFLOW-0018: GET /v1/sla-policies retorna envelope { data, total }', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const r = await get('/v1/sla-policies');
  assert.equal(r.s, 200, 'status 200');
  assert.ok(Array.isArray(r.j.data), 'data é array');
  assert.ok(typeof r.j.total === 'number', 'total é número');
});

test('REF-HELPFLOW-0018: CRUD completo + busca por nome (?q=)', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const nome = 'REF0018-smoke-' + Math.random().toString(36).slice(2, 8);

  // cria
  const cr = await post('/v1/sla-policies', {
    name: nome,
    priority: 'medium',
    first_response_mins: 120,
    resolution_mins: 480,
  });
  assert.equal(cr.s, 201, 'POST /v1/sla-policies retorna 201');
  const id = cr.j.id;
  assert.ok(id != null, 'id gerado pelo servidor');
  assert.equal(cr.j.name, nome, 'name persistido');
  assert.equal(cr.j.priority, 'medium', 'priority persistida');

  // detalhe
  const gr = await get('/v1/sla-policies/' + id);
  assert.equal(gr.s, 200, 'GET /v1/sla-policies/:id retorna 200');
  assert.equal(gr.j.id, id, 'id confere');

  // lista contém o item criado
  const lr = await get('/v1/sla-policies');
  assert.equal(lr.s, 200);
  assert.ok(lr.j.data.some((p) => p.id === id), 'política aparece na listagem');

  // busca por nome (?q=) — deve encontrar o item e não retornar 5xx
  const qr = await get('/v1/sla-policies?q=' + encodeURIComponent(nome));
  assert.equal(qr.s, 200, 'GET /v1/sla-policies?q= retorna 200');
  assert.ok(Array.isArray(qr.j.data), 'data é array no resultado de busca');
  assert.ok(qr.j.data.some((p) => p.id === id), 'busca encontra a política pelo nome');

  // limpa
  const dr = await del('/v1/sla-policies/' + id);
  assert.equal(dr, 204, 'DELETE /v1/sla-policies/:id retorna 204');

  // busca após deleção: não deve retornar o item
  const ar = await get('/v1/sla-policies?q=' + encodeURIComponent(nome));
  assert.equal(ar.s, 200);
  assert.ok(!ar.j.data.some((p) => p.id === id), 'item deletado não aparece na busca');
});

test('REF-HELPFLOW-0018: POST sem campos obrigatórios retorna 400', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const r = await post('/v1/sla-policies', { name: 'incompleta' });
  assert.equal(r.s, 400, 'falta priority/first_response_mins/resolution_mins → 400');
});
