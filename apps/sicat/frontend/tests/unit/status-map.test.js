/**
 * VOCABULÁRIO DE STATUS — impede status CRU da CETESB vazando para a tela.
 *
 * A CETESB devolve texto livre em pt-BR ('Salvo', 'Recebido', 'Armazenado
 * temporariamente'). Sem o mapa canônico, a lista mostrava 'Salvo' enquanto o
 * filtro da mesma tela chamava o mesmo estado de 'Aguardando baixa' — dois
 * vocabulários para o mesmo status.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveManifestRawSituation,
  resolveManifestSituationLabel,
  resolveManifestStatusTone,
  resolveStatusLabel,
  resolveStatusTone,
  TRANSPORT_OPERATION_STATUS_TONES,
  COMPLIANCE_STATUS_TONES,
  CIOT_STATUS_TONES,
  RNTRC_STATUS_TONES,
  RNTRC_VERIFICATION_TONES,
  VPO_ALLOCATION_TONES,
  FISCAL_VALIDATION_TONES,
  FISCAL_AUTHORIZATION_TONES,
  INSURANCE_POLICY_TONES,
  PGR_STATUS_TONES,
  PISO_TABELA_REVIEW_TONES,
  DFE_ISSUANCE_TONES,
  WATCH_ITEM_TONES
} from '../../src/lib/status-map.js';
import {
  resolveManifestStatusLabel,
  resolveSituationFilterLabel
} from '../../src/features/mtr/list/manifestHelpers.js';

test('chaves REAIS da CETESB viram rótulo canônico', () => {
  const cases = [
    ['Salvo', 'Aguardando baixa'],
    ['salvo', 'Aguardando baixa'],
    ['SALVO', 'Aguardando baixa'],
    ['receb', 'Recebido'],
    ['Recebido', 'Recebido'],
    ['RECEBIDO', 'Recebido'],
    ['Armazenado temporariamente', 'Armazenado temporariamente'],
    ['Em trânsito', 'Em trânsito'],
    ['Cancelado', 'Cancelado'],
    ['Rejeitado', 'Rejeitado']
  ];

  for (const [externalStatus, expected] of cases) {
    assert.equal(
      resolveManifestSituationLabel({ externalStatus }),
      expected,
      `situação "${externalStatus}" deveria virar "${expected}"`
    );
  }
});

test('status INTERNO tem rótulo pt-BR próprio', () => {
  assert.equal(resolveManifestSituationLabel({ status: 'draft' }), 'Rascunho');
  assert.equal(resolveManifestSituationLabel({ status: 'submitted' }), 'Enviado');
  assert.equal(resolveManifestSituationLabel({ status: 'queued' }), 'Na fila');
  assert.equal(resolveManifestSituationLabel({ status: 'processing' }), 'Em processamento');
  assert.equal(resolveManifestSituationLabel({ status: 'cancelled' }), 'Cancelado');
  assert.equal(resolveManifestSituationLabel({ status: 'failed' }), 'Falhou');
  assert.equal(resolveStatusLabel('manifest', 'submitted'), 'Enviado');
  assert.equal(resolveStatusLabel('manifest', 'draft'), 'Rascunho');
});

test('situação da CETESB tem precedência sobre o status interno', () => {
  // Recebido mantém `submitted` internamente — a tela precisa dizer "Recebido".
  const received = { status: 'submitted', externalStatus: 'Recebido' };
  assert.equal(resolveManifestSituationLabel(received), 'Recebido');
  assert.equal(resolveManifestStatusLabel(received), 'Recebido');
  // O termo CRU continua acessível para rastrear com o SIGOR (tooltip).
  assert.equal(resolveManifestRawSituation(received), 'Recebido');
  assert.equal(resolveManifestRawSituation({ status: 'submitted', externalStatus: 'Salvo' }), 'Salvo');
});

test('sem status nenhum, a tela mostra "-" (nunca "undefined")', () => {
  assert.equal(resolveManifestSituationLabel({}), '-');
  assert.equal(resolveManifestSituationLabel({ status: '', externalStatus: '' }), '-');
  assert.equal(resolveManifestSituationLabel(null), '-');
});

test('status desconhecido é humanizado, não vaza chave de máquina', () => {
  assert.equal(resolveManifestSituationLabel({ status: 'pending_submission' }), 'Pending Submission');
  assert.doesNotMatch(resolveManifestSituationLabel({ status: 'algum_estado_novo' }), /_/);
});

test('o filtro fala o MESMO vocabulário da lista', () => {
  // Antes o resumo de "Filtros ativos" mostrava o token cru: situação "receb".
  assert.equal(resolveSituationFilterLabel('', 'receb'), 'Recebido');
  assert.equal(resolveSituationFilterLabel('', 'salvo'), 'Aguardando baixa');
  assert.equal(resolveSituationFilterLabel('draft', ''), 'Rascunho');
  assert.doesNotMatch(resolveSituationFilterLabel('', 'receb'), /receb$/);
});

test('tom do badge acompanha a leitura de relance', () => {
  assert.equal(resolveManifestStatusTone('Recebido'), 'success');
  assert.equal(resolveManifestStatusTone('Salvo'), 'running');
  assert.equal(resolveManifestStatusTone('Armazenado temporariamente'), 'warning');
  assert.equal(resolveManifestStatusTone('Cancelado'), 'neutral');
  assert.equal(resolveManifestStatusTone('draft'), 'neutral');
  assert.equal(resolveManifestStatusTone('failed'), 'error');
  assert.equal(resolveStatusTone('manifest', 'Recebido'), 'success');
});

// ---------------------------------------------------------------------------
// Transporte (DL-103, Onda 1.5/PR-F1) — domínios novos: máquina de estados de
// TransportOperation (13 estados), resultado pós-clamp do motor de compliance
// (PASS/WARN/BLOCK/NOT_APPLICABLE, sempre MAIÚSCULO no contrato) e o
// vocabulário mínimo do CIOT (Fase C, sem UI ainda).
// ---------------------------------------------------------------------------

test('transport-operation: os 13 estados da máquina têm tone e rótulo pt-BR', () => {
  const expectedTones = {
    draft: 'neutral',
    validating: 'running',
    blocked: 'error',
    ready_for_contract: 'neutral',
    contracted: 'success',
    ciot_pending: 'running',
    ciot_registered: 'neutral',
    fiscal_pending: 'running',
    ready_for_release: 'neutral',
    in_transit: 'running',
    completion_pending: 'running',
    completed: 'success',
    cancelled: 'error'
  };

  const states = Object.keys(expectedTones);
  assert.equal(states.length, 13, 'a máquina de estados de TransportOperation tem 13 estados');

  for (const state of states) {
    assert.equal(
      resolveStatusTone('transport-operation', state),
      expectedTones[state],
      `estado "${state}" deveria ter tone "${expectedTones[state]}"`
    );
    const label = resolveStatusLabel('transport-operation', state);
    assert.ok(label && !label.includes('_'), `estado "${state}" precisa de rótulo pt-BR sem underscore ("${label}")`);
  }

  assert.equal(TRANSPORT_OPERATION_STATUS_TONES.blocked, 'error');
  assert.equal(TRANSPORT_OPERATION_STATUS_TONES.completed, 'success');
});

test('compliance: PASS/WARN/BLOCK/NOT_APPLICABLE (contrato em MAIÚSCULO) resolvem tone e rótulo', () => {
  // O contrato (TransporteConformidadeCheckResource.status/overallStatus) devolve
  // sempre em MAIÚSCULO — normalizeKey precisa fazer o lowercase na leitura.
  assert.equal(resolveStatusTone('compliance', 'PASS'), 'success');
  assert.equal(resolveStatusTone('compliance', 'WARN'), 'warning');
  assert.equal(resolveStatusTone('compliance', 'BLOCK'), 'error');
  assert.equal(resolveStatusTone('compliance', 'NOT_APPLICABLE'), 'neutral');

  assert.equal(resolveStatusLabel('compliance', 'PASS'), 'Conforme');
  assert.equal(resolveStatusLabel('compliance', 'WARN'), 'Atenção');
  assert.equal(resolveStatusLabel('compliance', 'BLOCK'), 'Bloqueado');
  assert.equal(resolveStatusLabel('compliance', 'NOT_APPLICABLE'), 'Não aplicável');

  assert.equal(COMPLIANCE_STATUS_TONES.block, 'error');
});

test('ciot: vocabulário mínimo da Fase C tem tone e rótulo pt-BR (sem UI ainda nesta onda)', () => {
  const states = ['pre_validation', 'requested', 'registered', 'rectified', 'closed', 'cancelled', 'rejected', 'blocked'];
  for (const state of states) {
    assert.ok(CIOT_STATUS_TONES[state], `estado "${state}" do CIOT precisa de tone registrado`);
    const label = resolveStatusLabel('ciot', state);
    assert.ok(label && !label.includes('_'), `estado "${state}" do CIOT precisa de rótulo pt-BR sem underscore ("${label}")`);
  }
  assert.equal(resolveStatusTone('ciot', 'registered'), 'success');
  assert.equal(resolveStatusTone('ciot', 'rejected'), 'error');
});

test('ciot: request_unconfirmed (DL-102) nunca é confundido com rejected', () => {
  assert.equal(resolveStatusTone('ciot', 'request_unconfirmed'), 'warning');
  assert.equal(resolveStatusLabel('ciot', 'request_unconfirmed'), 'Solicitação sem confirmação');
});

// ---------------------------------------------------------------------------
// Transporte (PR-H2, frontend completo) — domínios novos: RNTRC (status
// declarado + tentativa de verificação), VPO, fiscal (validação/autorização
// separados), seguros/PGR, tabela de piso e emissão de DF-e sandbox-ready.
// ---------------------------------------------------------------------------

function assertDomainCoverage(domain, tonesMap, { noUnderscoreInLabel = true } = {}) {
  const states = Object.keys(tonesMap);
  assert.ok(states.length > 0, `domínio "${domain}" precisa ter pelo menos um status registrado`);
  for (const state of states) {
    assert.equal(
      resolveStatusTone(domain, state),
      tonesMap[state],
      `estado "${state}" do domínio "${domain}" deveria ter tone "${tonesMap[state]}"`
    );
    const label = resolveStatusLabel(domain, state);
    assert.ok(label, `estado "${state}" do domínio "${domain}" precisa de rótulo`);
    if (noUnderscoreInLabel) {
      assert.ok(!label.includes('_'), `estado "${state}" do domínio "${domain}" vazou underscore no rótulo ("${label}")`);
    }
  }
}

test('rntrc-status: cadastro DECLARADO do transportador (unknown/active/suspended/cancelled/expired)', () => {
  assertDomainCoverage('rntrc-status', RNTRC_STATUS_TONES);
  assert.equal(resolveStatusTone('rntrc-status', 'expired'), 'error');
  assert.equal(resolveStatusLabel('rntrc-status', 'unknown'), 'Não verificado');
});

test('rntrc-verification: desfecho de UMA tentativa (pending/succeeded/failed)', () => {
  assertDomainCoverage('rntrc-verification', RNTRC_VERIFICATION_TONES);
  assert.deepEqual(Object.keys(RNTRC_VERIFICATION_TONES).sort(), ['failed', 'pending', 'succeeded']);
});

test('vpo-allocation: os 7 status do ciclo do VPO (DL-102 em acquisition_unconfirmed)', () => {
  assertDomainCoverage('vpo-allocation', VPO_ALLOCATION_TONES);
  assert.equal(Object.keys(VPO_ALLOCATION_TONES).length, 7);
  assert.equal(resolveStatusTone('vpo-allocation', 'acquisition_unconfirmed'), 'warning');
  assert.equal(resolveStatusTone('vpo-allocation', 'acquired'), 'success');
});

test('fiscal-validation e fiscal-authorization são domínios SEPARADOS (dimensões independentes)', () => {
  assertDomainCoverage('fiscal-validation', FISCAL_VALIDATION_TONES);
  assertDomainCoverage('fiscal-authorization', FISCAL_AUTHORIZATION_TONES);
  assert.equal(resolveStatusTone('fiscal-validation', 'invalid'), 'error');
  assert.equal(resolveStatusTone('fiscal-authorization', 'denied'), 'error');
  // 'cancelled' existe nos dois mapas com tones INDEPENDENTES — prova de que
  // não há vazamento de um domínio para o outro.
  assert.equal(resolveStatusLabel('fiscal-authorization', 'cancelled'), 'Cancelada');
});

test('insurance-policy: status ADMINISTRATIVO (active/cancelled/expired_marked)', () => {
  assertDomainCoverage('insurance-policy', INSURANCE_POLICY_TONES);
  assert.equal(resolveStatusTone('insurance-policy', 'active'), 'success');
  assert.equal(resolveStatusTone('insurance-policy', 'expired_marked'), 'error');
});

test('pgr-status e piso-tabela-review e dfe-issuance e watch-item resolvem tone e rótulo pt-BR', () => {
  assertDomainCoverage('pgr-status', PGR_STATUS_TONES);
  assertDomainCoverage('piso-tabela-review', PISO_TABELA_REVIEW_TONES);
  assertDomainCoverage('dfe-issuance', DFE_ISSUANCE_TONES);
  assertDomainCoverage('watch-item', WATCH_ITEM_TONES);

  assert.equal(Object.keys(DFE_ISSUANCE_TONES).length, 11);
  assert.equal(resolveStatusTone('dfe-issuance', 'submit_unconfirmed'), 'warning');
  assert.equal(resolveStatusTone('dfe-issuance', 'authorized'), 'success');

  assert.equal(Object.keys(WATCH_ITEM_TONES).length, 10);
  assert.equal(resolveStatusTone('watch-item', 'human_review'), 'warning');
  assert.equal(resolveStatusTone('watch-item', 'active_applied'), 'success');
});
