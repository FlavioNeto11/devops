/**
 * Fronteiras do helper puro `resolveDriverCnhStatus` (onda F6,
 * REQ-SICAT-0033/0037) + registro do domínio `driver-cnh` no status-map.
 *
 * A decisão válida/vencendo/vencida é do FRONTEND (o contrato só entrega
 * `cnhValidUntil`) — por isso as fronteiras precisam de trava: 30 dias é
 * "vencendo", 31 é "válida", ontem é "vencida" e sem data é "unknown". A
 * `referenceDate` explícita mantém o teste determinístico (nunca `new Date()`
 * dentro da asserção).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDriverCnhStatus } from '../../src/views/transporte/transporteUiHelpers.js';
import { resolveStatusTone, resolveStatusLabel } from '../../src/lib/status-map.js';

const REF = '2026-08-16';

test('CNH com folga (> 30 dias) é válida', () => {
  const result = resolveDriverCnhStatus('2028-05-20', REF);
  assert.equal(result.status, 'valid');
  assert.equal(result.label, 'Válida');
});

test('fronteira de 31 dias ainda é válida (a janela é ≤ 30)', () => {
  const result = resolveDriverCnhStatus('2026-09-16', REF); // 31 dias
  assert.equal(result.status, 'valid');
});

test('fronteira exata de 30 dias já é vencendo', () => {
  const result = resolveDriverCnhStatus('2026-09-15', REF); // 30 dias
  assert.equal(result.status, 'expiring');
  assert.equal(result.label, 'Vence em 30 dia(s)');
});

test('vencendo no dia seguinte informa a contagem', () => {
  const result = resolveDriverCnhStatus('2026-08-17', REF);
  assert.equal(result.status, 'expiring');
  assert.equal(result.label, 'Vence em 1 dia(s)');
});

test('vence HOJE ainda é vencendo (não vencida) e o label diz isso', () => {
  const result = resolveDriverCnhStatus('2026-08-16', REF);
  assert.equal(result.status, 'expiring');
  assert.equal(result.label, 'Vence hoje');
});

test('venceu ontem é vencida, com a contagem de dias', () => {
  const result = resolveDriverCnhStatus('2026-08-15', REF);
  assert.equal(result.status, 'expired');
  assert.equal(result.label, 'Vencida há 1 dia(s)');
});

test('vencida há muito tempo continua vencida', () => {
  const result = resolveDriverCnhStatus('2020-01-01', REF);
  assert.equal(result.status, 'expired');
});

test('sem data (null/undefined/vazio/lixo) é unknown — nunca lança', () => {
  for (const value of [null, undefined, '', '  ', 'não-é-data', '20-05-2028']) {
    const result = resolveDriverCnhStatus(value, REF);
    assert.equal(result.status, 'unknown', `valor ${JSON.stringify(value)} deveria ser unknown`);
    assert.equal(result.label, 'Sem validade informada');
  }
});

test('janela de aviso é parametrizável (GR pode pedir janela diferente)', () => {
  assert.equal(resolveDriverCnhStatus('2026-08-26', REF, 5).status, 'valid'); // 10 dias, janela 5
  assert.equal(resolveDriverCnhStatus('2026-08-20', REF, 5).status, 'expiring'); // 4 dias, janela 5
});

test('o domínio driver-cnh do status-map mapeia os 4 status do helper', () => {
  assert.equal(resolveStatusTone('driver-cnh', 'valid'), 'success');
  assert.equal(resolveStatusTone('driver-cnh', 'expiring'), 'warning');
  assert.equal(resolveStatusTone('driver-cnh', 'expired'), 'error');
  assert.equal(resolveStatusTone('driver-cnh', 'unknown'), 'neutral');
  assert.equal(resolveStatusLabel('driver-cnh', 'valid'), 'Válida');
  assert.equal(resolveStatusLabel('driver-cnh', 'expiring'), 'Vencendo');
  assert.equal(resolveStatusLabel('driver-cnh', 'expired'), 'Vencida');
});
