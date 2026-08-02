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
  resolveStatusTone
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
