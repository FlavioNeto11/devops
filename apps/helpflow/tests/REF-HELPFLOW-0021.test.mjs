// REF-HELPFLOW-0021 — Editar política de SLA: teste de integração da API.
// Ancora: REQ-HELPFLOW-0003 (API contract-first / OpenAPI).
// Valida o fluxo descrito no refinamento: GET pré-carrega dados, PUT persiste
// name/first_response_mins/resolution_mins, GET pós-edição confirma persistência.
// Coerência de prazos (resolution >= first_response) é validação de UI — não de API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, api, LIVE } from './locked/_lib.mjs';

const put = (p, b) =>
  fetch(api + p, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));

test(
  'REF-HELPFLOW-0021: edição de política — atualiza name, first_response_mins e resolution_mins',
  { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' },
  async () => {
    // pré-condição: criar política para editar
    const created = await post('/v1/sla-policies', {
      name: 'SLA Teste Edição',
      priority: 'medium',
      first_response_mins: 60,
      resolution_mins: 480,
      status: 'active',
    });
    assert.equal(created.s, 201, 'POST /v1/sla-policies → 201');
    const id = created.j.id;
    assert.ok(id, 'política criada com id');

    try {
      // estado normal: GET pré-carrega os dados da política (source: api:/sla-policies/:id)
      const before = await get('/v1/sla-policies/' + id);
      assert.equal(before.s, 200, 'GET pré-edição → 200');
      assert.equal(before.j.name, 'SLA Teste Edição');
      assert.equal(Number(before.j.first_response_mins), 60, 'first_response_mins original');
      assert.equal(Number(before.j.resolution_mins), 480, 'resolution_mins original');

      // interação: clicar em salvar → persiste as alterações
      const updated = await put('/v1/sla-policies/' + id, {
        name: 'SLA Teste Editado',
        priority: 'high',
        first_response_mins: 30,
        resolution_mins: 240,
        business_hours_only: true,
        status: 'active',
      });
      assert.equal(updated.s, 200, 'PUT /v1/sla-policies/:id → 200');
      assert.equal(updated.j.name, 'SLA Teste Editado', 'name atualizado na resposta');
      assert.equal(Number(updated.j.first_response_mins), 30, 'first_response_mins atualizado');
      assert.equal(Number(updated.j.resolution_mins), 240, 'resolution_mins atualizado');
      assert.equal(updated.j.priority, 'high', 'priority atualizada');
      assert.equal(updated.j.business_hours_only, true, 'business_hours_only atualizado');

      // resultado: GET pós-edição confirma persistência (redireciona para o detalhe)
      const after = await get('/v1/sla-policies/' + id);
      assert.equal(after.s, 200, 'GET pós-edição → 200');
      assert.equal(after.j.name, 'SLA Teste Editado', 'name persistido');
      assert.equal(Number(after.j.first_response_mins), 30, 'first_response_mins persistido');
      assert.equal(Number(after.j.resolution_mins), 240, 'resolution_mins persistido');
      assert.equal(after.j.priority, 'high', 'priority persistida');
      assert.equal(after.j.business_hours_only, true, 'business_hours_only persistido');

      // estado de erro: id inexistente → 404
      const notFound = await put('/v1/sla-policies/999999999', {
        name: 'x',
        priority: 'low',
        first_response_mins: 1,
        resolution_mins: 1,
      });
      assert.equal(notFound.s, 404, 'PUT id inexistente → 404');
    } finally {
      await del('/v1/sla-policies/' + id);
    }
  },
);

test(
  'REF-HELPFLOW-0021: edição parcial — rename preserva first_response_mins e resolution_mins',
  { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' },
  async () => {
    const created = await post('/v1/sla-policies', {
      name: 'SLA Para Renomear',
      priority: 'urgent',
      first_response_mins: 15,
      resolution_mins: 120,
      status: 'active',
    });
    assert.equal(created.s, 201);
    const id = created.j.id;

    try {
      // PUT com apenas o name diferente — metas devem ser preservadas
      const res = await put('/v1/sla-policies/' + id, {
        name: 'SLA Renomeado',
        priority: 'urgent',
        first_response_mins: 15,
        resolution_mins: 120,
        status: 'active',
      });
      assert.equal(res.s, 200);
      assert.equal(res.j.name, 'SLA Renomeado', 'name atualizado');
      assert.equal(Number(res.j.first_response_mins), 15, 'first_response_mins inalterado');
      assert.equal(Number(res.j.resolution_mins), 120, 'resolution_mins inalterado');
      assert.equal(res.j.priority, 'urgent', 'priority inalterada');
    } finally {
      await del('/v1/sla-policies/' + id);
    }
  },
);

test(
  'REF-HELPFLOW-0021: status inactive — política pode ser inativada via edição',
  { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' },
  async () => {
    const created = await post('/v1/sla-policies', {
      name: 'SLA Para Inativar',
      priority: 'low',
      first_response_mins: 120,
      resolution_mins: 1440,
      status: 'active',
    });
    assert.equal(created.s, 201);
    const id = created.j.id;

    try {
      const res = await put('/v1/sla-policies/' + id, {
        name: 'SLA Para Inativar',
        priority: 'low',
        first_response_mins: 120,
        resolution_mins: 1440,
        status: 'inactive',
      });
      assert.equal(res.s, 200, 'PUT com status inactive → 200');
      assert.equal(res.j.status, 'inactive', 'política inativada');

      const check = await get('/v1/sla-policies/' + id);
      assert.equal(check.j.status, 'inactive', 'status inactive persistido');
    } finally {
      await del('/v1/sla-policies/' + id);
    }
  },
);
