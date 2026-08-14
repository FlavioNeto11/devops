/**
 * Testes do módulo puro views/transporte/transporteUiHelpers.js
 * (programa "SICAT Transporte", Onda 1.5/PR-F1).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cargoRegimeLabel,
  commandLabel,
  complianceAlertTone,
  complianceStatusLabel,
  COMPLIANCE_GATE_OPTIONS,
  COMPLIANCE_GATES,
  formatCurrencyBRL,
  formatDateBR,
  formatDateTimeBR,
  gateLabel,
  implementationStateLabel,
  isRoutedCommand,
  operationStatusLabel,
  REGULATORY_DOMAIN_OPTIONS,
  routedAvailableCommands,
  TRANSPORT_OPERATION_STATUS_OPTIONS
} from '../../src/views/transporte/transporteUiHelpers.js';

test('TRANSPORT_OPERATION_STATUS_OPTIONS tem "Todos" + os 13 estados, sem underscore no rótulo', () => {
  assert.equal(TRANSPORT_OPERATION_STATUS_OPTIONS.length, 14);
  assert.equal(TRANSPORT_OPERATION_STATUS_OPTIONS[0].value, '');
  for (const option of TRANSPORT_OPERATION_STATUS_OPTIONS.slice(1)) {
    assert.ok(option.label && !option.label.includes('_'), `"${option.value}" precisa de rótulo pt-BR ("${option.label}")`);
  }
});

test('operationStatusLabel reaproveita o status-map (mesma fonte do badge)', () => {
  assert.equal(operationStatusLabel('draft'), 'Rascunho');
  assert.equal(operationStatusLabel('ready_for_contract'), 'Pronta para contratar');
  assert.equal(operationStatusLabel('completed'), 'Concluída');
});

test('complianceStatusLabel resolve o vocabulário PASS/WARN/BLOCK/NOT_APPLICABLE', () => {
  assert.equal(complianceStatusLabel('PASS'), 'Conforme');
  assert.equal(complianceStatusLabel('WARN'), 'Atenção');
  assert.equal(complianceStatusLabel('BLOCK'), 'Bloqueado');
  assert.equal(complianceStatusLabel('NOT_APPLICABLE'), 'Não aplicável');
});

test('complianceAlertTone: NOT_APPLICABLE vira "info" (diferente do tone neutro do badge)', () => {
  assert.equal(complianceAlertTone('PASS'), 'success');
  assert.equal(complianceAlertTone('WARN'), 'warning');
  assert.equal(complianceAlertTone('BLOCK'), 'error');
  assert.equal(complianceAlertTone('NOT_APPLICABLE'), 'info');
  assert.equal(complianceAlertTone('pass'), 'success', 'case-insensitive');
  assert.equal(complianceAlertTone(''), 'info', 'sem status conhecido cai em info, não quebra');
});

test('COMPLIANCE_GATES tem os 8 gates do programa, na ordem canônica', () => {
  assert.deepEqual(COMPLIANCE_GATES, [
    'GATE_PROPOSAL', 'GATE_CONTRACT', 'GATE_CIOT', 'GATE_FISCAL',
    'GATE_PRE_BOARDING', 'GATE_RELEASE', 'GATE_IN_TRANSIT', 'GATE_COMPLETION'
  ]);
  assert.equal(COMPLIANCE_GATE_OPTIONS.length, 9);
});

test('gateLabel/regulatoryDomainLabel/implementationStateLabel nunca vazam a chave crua com underscore', () => {
  assert.equal(gateLabel('GATE_CIOT'), 'CIOT');
  assert.equal(gateLabel('GATE_PRE_BOARDING'), 'Pré-embarque');
  assert.equal(implementationStateLabel('AWAITING_REGULATION'), 'Aguardando regulamentação');
  for (const option of REGULATORY_DOMAIN_OPTIONS.slice(1)) {
    assert.ok(option.label, `domínio "${option.value}" precisa de rótulo`);
  }
});

test('comandos roteados: só os 4 com rota HTTP nesta Fase A aparecem', () => {
  assert.equal(isRoutedCommand('submit_validation'), true);
  assert.equal(isRoutedCommand('contract'), true);
  assert.equal(isRoutedCommand('reopen'), true);
  assert.equal(isRoutedCommand('cancel'), true);
  assert.equal(isRoutedCommand('request_ciot'), false, 'CIOT chega na Fase C — sem rota ainda');
  assert.equal(isRoutedCommand('approve_validation'), false, 'acontece DENTRO de submeter-validacao, não é comando standalone');

  assert.equal(commandLabel('submit_validation'), 'Submeter validação');
  assert.equal(commandLabel('contract'), 'Contratar');
});

test('routedAvailableCommands filtra e ordena — ignora comandos sem rota', () => {
  const result = routedAvailableCommands(['cancel', 'submit_validation', 'request_ciot']);
  assert.deepEqual(result, ['submit_validation', 'cancel']);
  assert.deepEqual(routedAvailableCommands([]), []);
  assert.deepEqual(routedAvailableCommands(undefined), []);
});

test('cargoRegimeLabel cobre lotacao/fracionada/unknown e cai em "Não informado"', () => {
  assert.equal(cargoRegimeLabel('lotacao'), 'Lotação');
  assert.equal(cargoRegimeLabel('fracionada'), 'Fracionada');
  assert.equal(cargoRegimeLabel('unknown'), 'Não informado');
  assert.equal(cargoRegimeLabel(''), 'Não informado');
  assert.equal(cargoRegimeLabel(null), 'Não informado');
});

test('formatCurrencyBRL: null/undefined/vazio/NaN viram "-", nunca "R$ NaN"', () => {
  assert.equal(formatCurrencyBRL(null), '-');
  assert.equal(formatCurrencyBRL(undefined), '-');
  assert.equal(formatCurrencyBRL(''), '-');
  assert.equal(formatCurrencyBRL('abc'), '-');
  assert.match(formatCurrencyBRL(3800), /3\.800,00/);
  assert.match(formatCurrencyBRL(0), /0,00/);
});

test('formatDateBR: parse manual evita o bug de fuso (nunca "um dia antes")', () => {
  assert.equal(formatDateBR('2026-08-13'), '13/08/2026');
  assert.equal(formatDateBR('2026-01-01'), '01/01/2026');
  assert.equal(formatDateBR(null), '-');
  assert.equal(formatDateBR(''), '-');
});

test('formatDateTimeBR: timestamp ISO vira string não-vazia; entrada inválida vira "-"', () => {
  const result = formatDateTimeBR('2026-08-13T12:15:00Z');
  assert.notEqual(result, '-');
  assert.ok(result.length > 0);
  assert.equal(formatDateTimeBR(null), '-');
  assert.equal(formatDateTimeBR('not-a-date'), '-');
});
