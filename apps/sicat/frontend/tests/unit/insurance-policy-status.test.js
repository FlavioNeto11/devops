/**
 * Fronteiras do helper puro `resolveInsurancePolicyStatus` (onda F7,
 * REQ-SICAT-0028 rev.2 / REQ-SICAT-0037) + as chaves de vigência DERIVADA no
 * domínio `insurance-policy` do status-map.
 *
 * A situação que a tela consolidada mostra NÃO é o status de cadastro
 * (`active`/`cancelled`/`expired_marked`) — é a vigência contra HOJE, com
 * janela de 30 dias. Sem trava aqui, uma apólice `active` vencida há um mês
 * apareceria como "Ativa" verde na lista, que é exatamente o erro que a
 * tela existe para evitar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInsurancePolicyStatus } from '../../src/views/transporte/transporteUiHelpers.js';
import { resolveStatusLabel, resolveStatusTone } from '../../src/lib/status-map.js';

test('apólice com folga é vigente e mantém a contagem no detalhe', () => {
  const result = resolveInsurancePolicyStatus({ status: 'active', daysToExpiry: 200 });
  assert.equal(result.status, 'valid');
  assert.equal(result.label, 'Vigente');
  assert.equal(result.detail, 'Vence em 200 dia(s)');
  assert.equal(result.tone, 'success');
});

test('fronteira da janela: 30 dias já é vencendo, 31 ainda é vigente', () => {
  assert.equal(resolveInsurancePolicyStatus({ status: 'active', daysToExpiry: 30 }).status, 'expiring');
  assert.equal(resolveInsurancePolicyStatus({ status: 'active', daysToExpiry: 31 }).status, 'valid');
});

test('vencendo carrega o rótulo curto no badge e a contagem no detalhe', () => {
  const result = resolveInsurancePolicyStatus({ status: 'active', daysToExpiry: 7 });
  assert.equal(result.label, 'Vencendo');
  assert.equal(result.detail, 'Vence em 7 dia(s)');
  assert.equal(result.tone, 'warning');
});

test('apólice `active` mas com prazo estourado é VENCIDA (o cadastro não manda na vigência)', () => {
  const result = resolveInsurancePolicyStatus({ status: 'active', daysToExpiry: -32 });
  assert.equal(result.status, 'expired');
  assert.equal(result.label, 'Vencida');
  assert.equal(result.detail, 'Vencida há 32 dia(s)');
  assert.equal(result.tone, 'error');
});

test('cancelada não é vencida nem vencendo — é outra categoria', () => {
  const result = resolveInsurancePolicyStatus({ status: 'cancelled', daysToExpiry: 10 });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.label, 'Cancelada');
  assert.equal(result.tone, 'neutral');
});

test('marcada como vencida pelo operador não recalcula pela janela', () => {
  assert.equal(resolveInsurancePolicyStatus({ status: 'expired_marked', daysToExpiry: 300 }).status, 'expired');
});

test('sem daysToExpiry (ou nulo) é desconhecida — nunca lança nem vaza undefined', () => {
  for (const policy of [null, undefined, {}, { status: 'active' }, { status: 'active', daysToExpiry: 'x' }]) {
    const result = resolveInsurancePolicyStatus(policy);
    assert.equal(result.status, 'unknown', `${JSON.stringify(policy)} deveria ser unknown`);
    assert.equal(result.label, 'Vigência desconhecida');
  }
});

test('janela parametrizável (espelha o windowDays da API)', () => {
  assert.equal(resolveInsurancePolicyStatus({ status: 'active', daysToExpiry: 45 }, 60).status, 'expiring');
  assert.equal(resolveInsurancePolicyStatus({ status: 'active', daysToExpiry: 45 }, 10).status, 'valid');
});

test('o domínio insurance-policy cobre cadastro E vigência sem colisão de chaves', () => {
  // Cadastro (enum do contrato).
  assert.equal(resolveStatusTone('insurance-policy', 'active'), 'success');
  assert.equal(resolveStatusLabel('insurance-policy', 'expired_marked'), 'Marcada como vencida');
  // Vigência derivada (o que o helper devolve).
  assert.equal(resolveStatusTone('insurance-policy', 'valid'), 'success');
  assert.equal(resolveStatusTone('insurance-policy', 'expiring'), 'warning');
  assert.equal(resolveStatusTone('insurance-policy', 'expired'), 'error');
  assert.equal(resolveStatusTone('insurance-policy', 'unknown'), 'neutral');
  assert.equal(resolveStatusLabel('insurance-policy', 'valid'), 'Vigente');
  assert.equal(resolveStatusLabel('insurance-policy', 'expiring'), 'Vencendo');
  assert.equal(resolveStatusLabel('insurance-policy', 'expired'), 'Vencida');
});
