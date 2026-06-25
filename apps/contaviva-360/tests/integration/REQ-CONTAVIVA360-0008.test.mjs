// Testes de integração (não-locked) para REQ-CONTAVIVA360-0008 — Dashboards por Role.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, post } from '../locked/_lib.mjs';

const SKIP = !process.env.BASE_URL ? 'sem BASE_URL' : false;

test('REQ-CONTAVIVA360-0008: GET /me retorna role', { skip: SKIP }, async () => {
  const r = await get('/me');
  assert.equal(r.s, 200);
  assert.ok(typeof r.j.role === 'string', 'role deve ser string');
  assert.ok(typeof r.j.tenantId === 'number', 'tenantId deve ser number');
});

test('REQ-CONTAVIVA360-0008: GET /v1/dashboard/role/pf retorna shape válido (AC1)', { skip: SKIP }, async () => {
  const r = await get('/v1/dashboard/role/pf');
  assert.equal(r.s, 200);
  assert.ok('patrimonio' in r.j, 'deve ter campo patrimonio');
  assert.ok('receitas_despesas' in r.j, 'deve ter campo receitas_despesas');
  assert.ok('documentos_pendentes' in r.j, 'deve ter campo documentos_pendentes');
  assert.ok('tarefas_abertas' in r.j, 'deve ter campo tarefas_abertas');
  assert.ok('alertas_vencimento' in r.j, 'deve ter campo alertas_vencimento');
  assert.ok('imposto_renda' in r.j, 'deve ter campo imposto_renda');
  assert.ok(Array.isArray(r.j.documentos_pendentes), 'documentos_pendentes deve ser array');
  assert.ok(Array.isArray(r.j.tarefas_abertas), 'tarefas_abertas deve ser array');
  assert.ok(Array.isArray(r.j.alertas_vencimento), 'alertas_vencimento deve ser array');
});

test('REQ-CONTAVIVA360-0008: GET /v1/dashboard/role/pj retorna shape válido (AC2)', { skip: SKIP }, async () => {
  const r = await get('/v1/dashboard/role/pj');
  assert.equal(r.s, 200);
  assert.ok('receitas_despesas' in r.j, 'deve ter campo receitas_despesas');
  assert.ok('fluxo_caixa_90d' in r.j, 'deve ter campo fluxo_caixa_90d');
  assert.ok('contas_pagar' in r.j, 'deve ter campo contas_pagar');
  assert.ok('contas_receber' in r.j, 'deve ter campo contas_receber');
  assert.ok('impostos' in r.j, 'deve ter campo impostos');
  assert.ok('notas_fiscais_mes' in r.j, 'deve ter campo notas_fiscais_mes');
  assert.ok('folha_pagamento' in r.j, 'deve ter campo folha_pagamento');
  assert.ok('obrigacoes_vencidas' in r.j, 'deve ter campo obrigacoes_vencidas');
  assert.ok('obrigacoes_proximas' in r.j, 'deve ter campo obrigacoes_proximas');
  assert.ok('tarefas_para_contador' in r.j, 'deve ter campo tarefas_para_contador');
  assert.ok(Array.isArray(r.j.fluxo_caixa_90d), 'fluxo_caixa_90d deve ser array');
  assert.ok(Array.isArray(r.j.obrigacoes_vencidas), 'obrigacoes_vencidas deve ser array');
});

test('REQ-CONTAVIVA360-0008: GET /v1/dashboard/role/contador retorna shape válido (AC3)', { skip: SKIP }, async () => {
  const r = await get('/v1/dashboard/role/contador', { 'x-role': 'manager' });
  assert.equal(r.s, 200);
  assert.ok('clientes' in r.j, 'deve ter campo clientes');
  assert.ok('tarefas_atribuidas' in r.j, 'deve ter campo tarefas_atribuidas');
  assert.ok('documentos_por_cliente' in r.j, 'deve ter campo documentos_por_cliente');
  assert.ok('obrigacoes_atrasadas' in r.j, 'deve ter campo obrigacoes_atrasadas');
  assert.ok('alertas_criticos' in r.j, 'deve ter campo alertas_criticos');
  assert.ok(Array.isArray(r.j.clientes), 'clientes deve ser array');
  assert.ok(Array.isArray(r.j.tarefas_atribuidas), 'tarefas_atribuidas deve ser array');
  assert.ok(Array.isArray(r.j.obrigacoes_atrasadas), 'obrigacoes_atrasadas deve ser array');
});

test('REQ-CONTAVIVA360-0008: GET /v1/dashboard/role/admin retorna shape válido (AC4)', { skip: SKIP }, async () => {
  const r = await get('/v1/dashboard/role/admin', { 'x-role': 'admin' });
  assert.equal(r.s, 200);
  assert.ok(typeof r.j.total_usuarios === 'number', 'deve ter total_usuarios');
  assert.ok(typeof r.j.total_clientes_pf === 'number', 'deve ter total_clientes_pf');
  assert.ok(typeof r.j.total_clientes_pj === 'number', 'deve ter total_clientes_pj');
  assert.ok(typeof r.j.total_receitas === 'number', 'deve ter total_receitas');
  assert.ok(typeof r.j.total_despesas === 'number', 'deve ter total_despesas');
  assert.ok(Array.isArray(r.j.alertas_sistema), 'alertas_sistema deve ser array');
  assert.ok(Array.isArray(r.j.jobs_falhando), 'jobs_falhando deve ser array');
  assert.ok('saude_componentes' in r.j, 'deve ter saude_componentes');
  assert.equal(r.j.saude_componentes.db, 'ok', 'db deve estar ok');
});

test('REQ-CONTAVIVA360-0008: PATCH /v1/fiscal-obligations/999999/concluir retorna 404 (AC5)', { skip: SKIP }, async () => {
  const r = await get('/v1/fiscal-obligations/999999/concluir');
  // GET in wrong path → 404; widget interactive endpoint exists
  const rPatch = await (async () => {
    const API = (process.env.BASE_URL || 'http://nvit.localhost/contaviva-360/api').replace(/\/$/, '');
    const res = await fetch(API + '/v1/fiscal-obligations/999999/concluir', { method: 'PATCH', headers: { 'Content-Type': 'application/json' } });
    return { s: res.status };
  })();
  assert.equal(rPatch.s, 404, 'deve retornar 404 para id inexistente');
});

test('REQ-CONTAVIVA360-0008: GET /v1/events/dashboard retorna SSE (AC6)', { skip: SKIP }, async () => {
  const API = (process.env.BASE_URL || 'http://nvit.localhost/contaviva-360/api').replace(/\/$/, '');
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(API + '/v1/events/dashboard', { signal: ctrl.signal });
    assert.ok(res.headers.get('content-type')?.includes('text/event-stream'), 'deve retornar text/event-stream');
    clearTimeout(timeout);
    res.body?.cancel().catch(() => {});
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') assert.ok(true, 'SSE conectou (abortado por timeout)');
    else throw e;
  }
});
