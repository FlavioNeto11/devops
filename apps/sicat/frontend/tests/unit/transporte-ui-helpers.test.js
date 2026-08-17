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
  TRANSPORT_OPERATION_STATUS_OPTIONS,
  ciotAvailableAction,
  ciotEventLabel,
  ciotResponsiblePartyLabel,
  ciotStatusLabel,
  dfeIssuanceEventLabel,
  dfeIssuanceStatusLabel,
  fiscalAuthorizationStatusLabel,
  fiscalDocumentTypeLabel,
  fiscalIssueTone,
  fiscalValidationStatusLabel,
  grSubjectTypeLabel,
  GR_SUBJECT_TYPE_OPTIONS,
  isDfeIssuanceTerminal,
  isGrScreeningValid,
  resolveGrScreeningBadge,
  partyRoleLabel,
  pgrStatusLabel,
  pisoComplianceBadge,
  pisoOutcomeLabel,
  pisoTableCodeLabel,
  pisoTabelaReviewStatusLabel,
  policyStatusLabel,
  policyTypeLabel,
  resolveInsuranceExpiryState,
  rntrcCategoryLabel,
  rntrcResultStatusLabel,
  rntrcStatusLabel,
  rntrcStrategyLabel,
  rntrcVerificationRequestedStatusLabel,
  vehicleLinkTypeLabel,
  vehiclePositionLabel,
  vehicleTypeLabel,
  vpoApplicableLabel,
  vpoAllocationStatusLabel,
  vpoAvailableAction,
  vpoEventLabel,
  vpoEvidenceSourceLabel,
  watchEventLabel,
  watchItemIsApplicable,
  watchItemIsReviewable,
  watchItemStatusLabel
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

// ---------------------------------------------------------------------------
// PR-H2 (frontend completo) — cadastros, CIOT, VPO, fiscal, piso, seguros,
// emissão e Regulatory Watch.
// ---------------------------------------------------------------------------

test('cadastros: rótulos de papel/tipo de veículo/vínculo nunca vazam underscore', () => {
  assert.equal(partyRoleLabel('carrier'), 'Transportador');
  assert.equal(partyRoleLabel('subcontractor'), 'Subcontratado');
  assert.equal(vehicleTypeLabel('semi_trailer'), 'Semirreboque');
  assert.equal(vehicleLinkTypeLabel('rntrc_fleet'), 'Frota RNTRC declarada');
  assert.equal(vehiclePositionLabel('towed_1'), 'Reboque 1');
});

test('RNTRC: status/estratégia/categoria/resultado reaproveitam o status-map ou têm mapa próprio', () => {
  assert.equal(rntrcStatusLabel('expired'), 'Vencido');
  assert.equal(rntrcVerificationRequestedStatusLabel('succeeded'), 'Concluída');
  assert.equal(rntrcStrategyLabel('open_data'), 'Dados abertos (ANTT)');
  assert.equal(rntrcCategoryLabel('ETC'), 'ETC');
  assert.equal(rntrcResultStatusLabel('not_found'), 'Não encontrado');
});

test('CIOT: status/evento/papel e a ação disponível por estado', () => {
  assert.equal(ciotStatusLabel('request_unconfirmed'), 'Solicitação sem confirmação');
  assert.equal(ciotEventLabel('request_dispatched'), 'Solicitação enviada ao provedor');
  assert.equal(ciotResponsiblePartyLabel('subcontractor'), 'Subcontratado');

  assert.equal(ciotAvailableAction(''), 'solicitar');
  assert.equal(ciotAvailableAction('registered'), 'gerenciar');
  assert.equal(ciotAvailableAction('rectified'), 'gerenciar');
  assert.equal(ciotAvailableAction('rejected'), 'solicitar');
  assert.equal(ciotAvailableAction('requested'), null, 'em voo — nenhuma ação nova enquanto não resolve');
  assert.equal(ciotAvailableAction('closed'), null, 'terminal — nada mais a fazer');
});

test('VPO: status/evento/aplicabilidade/evidência e a ação disponível por estado', () => {
  assert.equal(vpoAllocationStatusLabel('acquisition_unconfirmed'), 'Aquisição sem confirmação');
  assert.equal(vpoEventLabel('acquired'), 'VPO adquirido');
  assert.equal(vpoEvidenceSourceLabel('provider'), 'Fornecedora (provedor)');

  assert.equal(vpoApplicableLabel(true), 'Devido');
  assert.equal(vpoApplicableLabel(false), 'Dispensado');
  assert.equal(vpoApplicableLabel(null), 'Indeterminado');

  assert.equal(vpoAvailableAction(''), 'avaliar');
  assert.equal(vpoAvailableAction('pending'), 'avaliar');
  assert.equal(vpoAvailableAction('applicable'), 'adquirir');
  assert.equal(vpoAvailableAction('acquired'), null);
  assert.equal(vpoAvailableAction('not_applicable'), null);
});

test('fiscal: validação e autorização são domínios separados; issue severity vira tone', () => {
  assert.equal(fiscalDocumentTypeLabel('MDFE'), 'MDF-e');
  assert.equal(fiscalValidationStatusLabel('warnings'), 'Com avisos');
  assert.equal(fiscalAuthorizationStatusLabel('denied'), 'Denegada');
  assert.equal(fiscalIssueTone('error'), 'error');
  assert.equal(fiscalIssueTone('warning'), 'warning');
  assert.equal(fiscalIssueTone(''), 'warning', 'severidade desconhecida não vira error');
});

test('emissão DF-e: status/evento e terminalidade', () => {
  assert.equal(dfeIssuanceStatusLabel('submit_unconfirmed'), 'Envio sem confirmação');
  assert.equal(dfeIssuanceEventLabel('imported_to_registry'), 'Importado ao acervo fiscal');
  assert.equal(isDfeIssuanceTerminal('authorized'), true);
  assert.equal(isDfeIssuanceTerminal('rejected'), true);
  assert.equal(isDfeIssuanceTerminal('failed_validation'), true);
  assert.equal(isDfeIssuanceTerminal('cancelled'), true);
  assert.equal(isDfeIssuanceTerminal('submitting'), false);
  assert.equal(isDfeIssuanceTerminal('draft'), false);
});

test('piso: outcome/badge de conformidade (tri-state) e rótulos de tabela', () => {
  assert.equal(pisoOutcomeLabel('missing_coefficients'), 'Sem tabela vigente para os insumos informados');
  assert.deepEqual(pisoComplianceBadge(true), { label: 'Conforme com o piso', tone: 'success' });
  assert.deepEqual(pisoComplianceBadge(false), { label: 'Abaixo do piso', tone: 'error' });
  assert.deepEqual(pisoComplianceBadge(null), { label: 'Não avaliável', tone: 'neutral' });
  assert.equal(pisoTabelaReviewStatusLabel('pending_review'), 'Em revisão');
  assert.equal(pisoTableCodeLabel('A'), 'Tabela A');
});

test('seguros: tipo/status de apólice e PGR', () => {
  assert.equal(policyTypeLabel('RCTR_C'), 'RCTR-C');
  assert.equal(policyStatusLabel('expired_marked'), 'Marcada como vencida');
  assert.equal(pgrStatusLabel('superseded'), 'Substituído');
});

test('resolveInsuranceExpiryState: vigência DERIVADA (independente do status administrativo)', () => {
  assert.deepEqual(
    resolveInsuranceExpiryState({ status: 'active', daysToExpiry: 45 }),
    { state: 'valid', tone: 'success', label: 'Vence em 45 dia(s)' }
  );
  assert.deepEqual(
    resolveInsuranceExpiryState({ status: 'active', daysToExpiry: 10 }),
    { state: 'expiring', tone: 'warning', label: 'Vence em 10 dia(s)' }
  );
  assert.deepEqual(
    resolveInsuranceExpiryState({ status: 'active', daysToExpiry: -5 }),
    { state: 'expired', tone: 'error', label: 'Vencida há 5 dia(s)' }
  );
  // Cancelada não é "vencida" nem "vencendo" — é outra categoria.
  assert.equal(resolveInsuranceExpiryState({ status: 'cancelled', daysToExpiry: 10 }).state, 'cancelled');
  // Já marcada como vencida pelo operador — não recalcula pela janela.
  assert.equal(resolveInsuranceExpiryState({ status: 'expired_marked', daysToExpiry: 200 }).state, 'expired');
  // daysToExpiry ausente/NaN não quebra — "desconhecida", nunca undefined vazando pra tela.
  assert.equal(resolveInsuranceExpiryState({ status: 'active' }).state, 'unknown');
  assert.equal(resolveInsuranceExpiryState(null).state, 'unknown');
  // Janela customizada (windowDays da API, default 30) — 30 é o limite INCLUSIVO.
  assert.equal(resolveInsuranceExpiryState({ status: 'active', daysToExpiry: 30 }, 30).state, 'expiring');
  assert.equal(resolveInsuranceExpiryState({ status: 'active', daysToExpiry: 31 }, 30).state, 'valid');
});

test('GR: o badge achata veredito × ciclo, e o veredito sempre manda', () => {
  assert.deepEqual(GR_SUBJECT_TYPE_OPTIONS.map((option) => option.value), ['driver', 'vehicle']);
  assert.equal(grSubjectTypeLabel('vehicle'), 'Veículo');
  assert.equal(grSubjectTypeLabel(''), '-');

  // O caso que motiva o helper: `status: completed` com veredito REPROVADO —
  // mostrar "Concluída" aqui esconderia exatamente o que impede a viagem.
  assert.deepEqual(
    resolveGrScreeningBadge({ status: 'completed', outcome: 'rejected' }),
    { status: 'rejected', label: 'Reprovado' }
  );
  assert.deepEqual(
    resolveGrScreeningBadge({ status: 'completed', outcome: 'approved' }),
    { status: 'approved', label: 'Aprovado' }
  );
  // Sem veredito ainda, o ciclo é a informação honesta.
  assert.deepEqual(
    resolveGrScreeningBadge({ status: 'request_unconfirmed', outcome: null }),
    { status: 'request_unconfirmed', label: 'Pesquisa sem confirmação' }
  );
  assert.equal(resolveGrScreeningBadge({ status: 'requesting' }).label, 'Pesquisando');
  assert.equal(resolveGrScreeningBadge({ status: 'failed' }).label, 'Falhou');
  assert.equal(resolveGrScreeningBadge({ status: 'completed' }).label, 'Concluída');
});

test('GR: pesquisa vale só se APROVADA e dentro da validade (TR-GR-001)', () => {
  const referenceDate = '2026-08-16';
  assert.equal(isGrScreeningValid({ outcome: 'approved', validUntil: '2026-09-30' }, referenceDate), true);
  // Limite INCLUSIVO: vence hoje, ainda cobre a viagem de hoje.
  assert.equal(isGrScreeningValid({ outcome: 'approved', validUntil: referenceDate }, referenceDate), true);
  assert.equal(isGrScreeningValid({ outcome: 'approved', validUntil: '2026-08-15' }, referenceDate), false);
  // Aprovada sem validade não promete vigência nenhuma — não pode passar por válida.
  assert.equal(isGrScreeningValid({ outcome: 'approved', validUntil: null }, referenceDate), false);
  assert.equal(isGrScreeningValid({ outcome: 'inconclusive', validUntil: '2026-12-31' }, referenceDate), false);
  assert.equal(isGrScreeningValid(null, referenceDate), false);
});

test('Regulatory Watch: status/evento e as guardas de ação por estado', () => {
  assert.equal(watchItemStatusLabel('human_review'), 'Aguardando revisão humana');
  assert.equal(watchEventLabel('active_applied'), 'Aplicado ao catálogo');

  assert.equal(watchItemIsReviewable('human_review'), true);
  assert.equal(watchItemIsReviewable('approved'), false);
  assert.equal(watchItemIsApplicable('approved'), true);
  assert.equal(watchItemIsApplicable('human_review'), false);
});
