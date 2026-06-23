// Teste de verificação para REF-HELPFLOW-0019 — Nova política de SLA (/sla-policies/new).
// Valida o contrato backend que a tela SlaPolicyCreateView.vue consome: POST /v1/sla-policies,
// verificação de campos obrigatórios, persistência de business_hours_only e recuperação via GET.
// Executa somente com BASE_URL configurado (ambiente live); ignorado no CI sem infra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, LIVE } from '../locked/_lib.mjs';

const SKIP = LIVE ? false : 'sem BASE_URL (forge-tests)';

test('REF-HELPFLOW-0019: POST /v1/sla-policies cria política com campos do formulário', { skip: SKIP }, async () => {
  const payload = {
    name: 'SLA REF-0019 Teste',
    priority: 'high',
    first_response_mins: 30,
    resolution_mins: 480,
    business_hours_only: true,
    status: 'active',
  };
  const r = await post('/v1/sla-policies', payload);
  assert.equal(r.s, 201, 'deve retornar 201 Created');
  assert.ok(r.j.id, 'resposta deve conter id');
  assert.equal(r.j.name, payload.name);
  assert.equal(r.j.priority, payload.priority);
  assert.equal(Number(r.j.first_response_mins), payload.first_response_mins);
  assert.equal(Number(r.j.resolution_mins), payload.resolution_mins);
  assert.equal(!!r.j.business_hours_only, true, 'business_hours_only deve persistir');

  // Recupera via GET para confirmar persistência (caminho do redirect pós-criação)
  const g = await get('/v1/sla-policies/' + r.j.id);
  assert.equal(g.s, 200);
  assert.equal(g.j.id, r.j.id);
  assert.equal(g.j.priority, 'high');

  // Limpeza (idempotente — 404 é ignorado)
  await del('/v1/sla-policies/' + r.j.id);
});

test('REF-HELPFLOW-0019: POST /v1/sla-policies sem campos obrigatórios retorna 400', { skip: SKIP }, async () => {
  const r = await post('/v1/sla-policies', { status: 'active' });
  assert.equal(r.s, 400, 'campos obrigatórios ausentes devem retornar 400');
  assert.ok(r.j.error && r.j.error.message, 'erro deve conter message');
});

test('REF-HELPFLOW-0019: GET /v1/sla-policies lista retorna array (tela de lista liga à criação)', { skip: SKIP }, async () => {
  const r = await get('/v1/sla-policies');
  assert.equal(r.s, 200);
  assert.ok(Array.isArray(r.j.data), 'deve retornar { data: [] }');
});
