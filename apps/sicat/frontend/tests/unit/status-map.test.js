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
  CIOT_STATUS_TONES
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
