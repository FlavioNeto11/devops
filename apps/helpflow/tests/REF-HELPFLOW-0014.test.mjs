// Testes para REF-HELPFLOW-0014 — Times e Filas
// Verifica o endpoint GET /v1/teams?withMetrics=true (queue_count + avg_sla_mins por time).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, LIVE } from './locked/_lib.mjs';

test('GET /v1/teams?withMetrics=true retorna 200 com envelope data/total', { skip: !LIVE }, async () => {
  const { s, j } = await get('/v1/teams?withMetrics=true');
  assert.equal(s, 200, 'status 200');
  assert.ok(Array.isArray(j.data), 'data é array');
  assert.ok(typeof j.total === 'number', 'total é número');
  assert.ok(j.total >= 0, 'total não negativo');
});

test('GET /v1/teams?withMetrics=true: cada time tem queue_count numérico >= 0', { skip: !LIVE }, async () => {
  const { s, j } = await get('/v1/teams?withMetrics=true');
  assert.equal(s, 200);
  for (const team of j.data) {
    assert.ok('queue_count' in team, `time ${team.id} tem queue_count`);
    assert.ok(typeof team.queue_count === 'number', `queue_count de ${team.id} é número`);
    assert.ok(team.queue_count >= 0, `queue_count de ${team.id} não negativo`);
  }
});

test('GET /v1/teams?withMetrics=true: avg_sla_mins é número ou null', { skip: !LIVE }, async () => {
  const { s, j } = await get('/v1/teams?withMetrics=true');
  assert.equal(s, 200);
  for (const team of j.data) {
    assert.ok('avg_sla_mins' in team, `time ${team.id} tem avg_sla_mins`);
    if (team.avg_sla_mins !== null) {
      assert.ok(!isNaN(Number(team.avg_sla_mins)), `avg_sla_mins de ${team.id} é numérico quando presente`);
    }
  }
});

test('GET /v1/teams?withMetrics=true: queue_count zerado para times sem tickets abertos', { skip: !LIVE }, async () => {
  const { s, j } = await get('/v1/teams?withMetrics=true');
  assert.equal(s, 200);
  // times sem tickets abertos devem ter queue_count=0 (COALESCE no SQL)
  const withoutQueue = j.data.filter((t) => t.queue_count === 0);
  // avg_sla_mins deve ser null quando queue_count=0
  for (const t of withoutQueue) {
    assert.equal(t.avg_sla_mins, null, `avg_sla_mins nulo quando queue_count=0 (time ${t.id})`);
  }
});

test('GET /v1/teams?withMetrics=true respeita pageSize', { skip: !LIVE }, async () => {
  const { s, j } = await get('/v1/teams?withMetrics=true&pageSize=1');
  assert.equal(s, 200);
  assert.ok(j.data.length <= 1, 'pageSize=1 devolve no máximo 1 registro');
  assert.ok(typeof j.total === 'number', 'total presente mesmo com pageSize=1');
});

test('GET /v1/teams sem withMetrics não inclui queue_count', { skip: !LIVE }, async () => {
  const { s, j } = await get('/v1/teams');
  assert.equal(s, 200);
  for (const team of j.data || []) {
    assert.ok(!('queue_count' in team), `sem withMetrics, time ${team.id} não tem queue_count`);
  }
});
