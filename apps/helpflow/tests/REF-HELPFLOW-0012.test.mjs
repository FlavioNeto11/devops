// Testes para REF-HELPFLOW-0012 — Detalhe do agente
// Valida o endpoint GET /v1/agents/:id/tickets (sub-recurso de domínio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post, del, LIVE } from './locked/_lib.mjs';

test('REF-HELPFLOW-0012: GET /v1/agents/:id/tickets retorna 404 para agente inexistente', { skip: LIVE ? false : 'sem BASE_URL (apenas LIVE)' }, async () => {
  const r = await get('/v1/agents/99999999/tickets');
  assert.equal(r.s, 404, 'deve retornar 404 para agente não encontrado');
  assert.ok(r.j.error, 'deve ter objeto error no corpo');
});

test('REF-HELPFLOW-0012: GET /v1/agents/:id/tickets retorna chamados atribuídos ao agente', { skip: LIVE ? false : 'sem BASE_URL (apenas LIVE)' }, async () => {
  const ag = await post('/v1/agents', { name: 'Agente REF-0012', email: 'ref0012@helpflow.test', role: 'agent' });
  assert.equal(ag.s, 201, 'cria agente');
  const agentId = ag.j.id;

  const tkt1 = await post('/v1/tickets', { subject: 'Chamado A REF-0012', priority: 'medium', status: 'open', assignee_id: agentId });
  assert.equal(tkt1.s, 201, 'cria ticket 1 atribuído ao agente');
  const tkt2 = await post('/v1/tickets', { subject: 'Chamado B REF-0012', priority: 'high', status: 'in_progress', assignee_id: agentId });
  assert.equal(tkt2.s, 201, 'cria ticket 2 atribuído ao agente');

  const r = await get('/v1/agents/' + agentId + '/tickets');
  assert.equal(r.s, 200, 'endpoint responde 200');
  assert.ok(Array.isArray(r.j.data), 'resposta tem .data como array');
  assert.ok(typeof r.j.total === 'number', 'resposta tem .total numérico');
  assert.equal(r.j.data.length, 2, 'retorna exatamente 2 chamados');
  assert.ok(r.j.data.some((t) => t.id === tkt1.j.id), 'chamado 1 está presente');
  assert.ok(r.j.data.some((t) => t.id === tkt2.j.id), 'chamado 2 está presente');
  assert.ok(r.j.data.every((t) => Number(t.assignee_id) === Number(agentId)), 'todos os tickets pertencem ao agente');

  // cleanup
  await del('/v1/tickets/' + tkt1.j.id);
  await del('/v1/tickets/' + tkt2.j.id);
  await del('/v1/agents/' + agentId);
});

test('REF-HELPFLOW-0012: GET /v1/agents/:id/tickets retorna vazio quando agente sem chamados', { skip: LIVE ? false : 'sem BASE_URL (apenas LIVE)' }, async () => {
  const ag = await post('/v1/agents', { name: 'Agente Sem Chamados REF-0012', email: 'ref0012none@helpflow.test', role: 'agent' });
  assert.equal(ag.s, 201);
  const agentId = ag.j.id;

  const r = await get('/v1/agents/' + agentId + '/tickets');
  assert.equal(r.s, 200, 'endpoint responde 200');
  assert.deepEqual(r.j.data, [], 'data é array vazio');
  assert.equal(r.j.total, 0, 'total é 0');

  await del('/v1/agents/' + agentId);
});

test('REF-HELPFLOW-0012: GET /v1/agents/:id/tickets não inclui chamados de outros agentes', { skip: LIVE ? false : 'sem BASE_URL (apenas LIVE)' }, async () => {
  const ag1 = await post('/v1/agents', { name: 'Agente 1 REF-0012', email: 'ref0012ag1@helpflow.test', role: 'agent' });
  const ag2 = await post('/v1/agents', { name: 'Agente 2 REF-0012', email: 'ref0012ag2@helpflow.test', role: 'agent' });
  assert.equal(ag1.s, 201); assert.equal(ag2.s, 201);

  const tkt1 = await post('/v1/tickets', { subject: 'Ticket agente 1', priority: 'medium', status: 'open', assignee_id: ag1.j.id });
  const tkt2 = await post('/v1/tickets', { subject: 'Ticket agente 2', priority: 'medium', status: 'open', assignee_id: ag2.j.id });
  assert.equal(tkt1.s, 201); assert.equal(tkt2.s, 201);

  const r = await get('/v1/agents/' + ag1.j.id + '/tickets');
  assert.equal(r.s, 200);
  assert.equal(r.j.data.length, 1, 'retorna apenas o chamado do agente 1');
  assert.equal(r.j.data[0].id, tkt1.j.id, 'o chamado pertence ao agente correto');
  assert.ok(!r.j.data.some((t) => t.id === tkt2.j.id), 'chamado do agente 2 não aparece');

  // cleanup
  await del('/v1/tickets/' + tkt1.j.id);
  await del('/v1/tickets/' + tkt2.j.id);
  await del('/v1/agents/' + ag1.j.id);
  await del('/v1/agents/' + ag2.j.id);
});
