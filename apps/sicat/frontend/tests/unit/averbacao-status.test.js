/**
 * Domínios `averbacao` e `apuracao-periodo` do status-map (ondas F7/F8,
 * REQ-SICAT-0034/0035) + as guardas de ação por estado.
 *
 * O que esta trava protege: os `*_unconfirmed` da DL-102 têm de ser 'warning'.
 * Sem entrada própria eles caem no fallback 'neutral' — cinza, indistinguível
 * de "cancelada" — e o operador deixa de ver que existe averbação possivelmente
 * órfã na seguradora. É o mesmo bug que o `submit_unconfirmed` do manifesto já
 * custou uma vez.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStatusLabel, resolveStatusTone } from '../../src/lib/status-map.js';
import {
  AVERBACAO_PENDING_STATUSES,
  AVERBACAO_STATUS_OPTIONS,
  averbacaoAcceptsMutation,
  averbacaoEventLabel,
  averbacaoStatusLabel,
  apuracaoPeriodoStatusLabel,
  billingBasisLabel,
  buildRecentPeriodOptions,
  formatPeriodMonthBR,
  formatRatePercent,
  isAverbacaoLive,
  isAverbacaoTerminal
} from '../../src/views/transporte/transporteUiHelpers.js';

const ALL_AVERBACAO_STATUSES = [
  'declaring',
  'declared',
  'declare_unconfirmed',
  'rectifying',
  'rectify_unconfirmed',
  'cancelling',
  'cancel_unconfirmed',
  'cancelled',
  'rejected'
];

test('o ciclo em voo é running, o desfecho conhecido fecha em success/neutral/error', () => {
  assert.equal(resolveStatusTone('averbacao', 'declaring'), 'running');
  assert.equal(resolveStatusTone('averbacao', 'rectifying'), 'running');
  assert.equal(resolveStatusTone('averbacao', 'cancelling'), 'running');
  assert.equal(resolveStatusTone('averbacao', 'declared'), 'success');
  assert.equal(resolveStatusTone('averbacao', 'cancelled'), 'neutral');
  assert.equal(resolveStatusTone('averbacao', 'rejected'), 'error');
});

test('TODO status *_unconfirmed é warning — nunca cai no fallback neutral', () => {
  for (const status of ['declare_unconfirmed', 'rectify_unconfirmed', 'cancel_unconfirmed']) {
    assert.equal(
      resolveStatusTone('averbacao', status),
      'warning',
      `${status} precisa de tom próprio: desfecho DESCONHECIDO não pode parecer cancelamento`
    );
  }
});

test('todo status do contrato tem rótulo pt-BR próprio (nenhum humanizado)', () => {
  for (const status of ALL_AVERBACAO_STATUSES) {
    const label = averbacaoStatusLabel(status);
    assert.ok(label, `${status} sem rótulo`);
    assert.doesNotMatch(label, /_/, `${status} caiu no humanizador do fallback: "${label}"`);
  }
  assert.equal(averbacaoStatusLabel('declared'), 'Averbada');
  assert.equal(averbacaoStatusLabel('rejected'), 'Rejeitada pela seguradora');
});

test('as opções do filtro cobrem os 9 status do contrato + "Todos"', () => {
  assert.equal(AVERBACAO_STATUS_OPTIONS.length, ALL_AVERBACAO_STATUSES.length + 1);
  assert.equal(AVERBACAO_STATUS_OPTIONS[0].value, '');
  for (const status of ALL_AVERBACAO_STATUSES) {
    assert.ok(
      AVERBACAO_STATUS_OPTIONS.some((option) => option.value === status),
      `filtro sem a opção ${status}`
    );
  }
});

test('só `declared` aceita retificar/cancelar (o resto responderia 409)', () => {
  assert.equal(averbacaoAcceptsMutation('declared'), true);
  for (const status of ALL_AVERBACAO_STATUSES.filter((entry) => entry !== 'declared')) {
    assert.equal(averbacaoAcceptsMutation(status), false, `${status} não pode oferecer o botão`);
  }
});

test('terminal libera a chave operação×apólice; o resto continua vivo', () => {
  assert.equal(isAverbacaoTerminal('cancelled'), true);
  assert.equal(isAverbacaoTerminal('rejected'), true);
  assert.equal(isAverbacaoTerminal('declared'), false);
  assert.equal(isAverbacaoLive('declared'), true);
  assert.equal(isAverbacaoLive('cancelled'), false);
  assert.equal(isAverbacaoLive(''), false, 'sem status não há averbação viva');
});

test('pendentes da home = em voo inicial + os três sem confirmação', () => {
  assert.deepEqual(
    [...AVERBACAO_PENDING_STATUSES],
    ['declaring', 'declare_unconfirmed', 'rectify_unconfirmed', 'cancel_unconfirmed']
  );
  for (const status of AVERBACAO_PENDING_STATUSES) {
    assert.ok(ALL_AVERBACAO_STATUSES.includes(status), `${status} não existe no contrato`);
  }
});

test('eventos da trilha têm texto próprio; desconhecido é humanizado, nunca vazio', () => {
  assert.equal(averbacaoEventLabel('declared'), 'Averbada na seguradora');
  assert.equal(averbacaoEventLabel('rectify_requested'), 'Retificação solicitada');
  assert.equal(averbacaoEventLabel('evento_novo_do_backend'), 'Evento Novo Do Backend');
  assert.equal(averbacaoEventLabel(''), '-');
});

test('período de apuração: aberto é "em curso" (running), fechado é o desfecho bom', () => {
  assert.equal(resolveStatusTone('apuracao-periodo', 'open'), 'running');
  assert.equal(resolveStatusTone('apuracao-periodo', 'closed'), 'success');
  assert.equal(resolveStatusLabel('apuracao-periodo', 'open'), 'Aberto');
  assert.equal(apuracaoPeriodoStatusLabel('closed'), 'Fechado');
});

test('a base de cobrança é explicada por extenso (é a leitura comercial do mês)', () => {
  assert.equal(billingBasisLabel('premium'), 'Soma dos prêmios averbados');
  assert.equal(billingBasisLabel('minimum'), 'Custo mínimo mensal da apólice');
  assert.equal(billingBasisLabel('qualquer-coisa'), '-');
});

test('formatação de taxa e mês não inventa nem perde dígitos', () => {
  assert.equal(formatRatePercent(0.097), '0,097%');
  assert.equal(formatRatePercent(0), '0%');
  assert.equal(formatRatePercent(null), '-');
  assert.equal(formatPeriodMonthBR('2026-08'), '08/2026');
  assert.equal(formatPeriodMonthBR('lixo'), 'lixo');
});

test('seletor de meses anda para trás e vira o ano sem pular mês', () => {
  const options = buildRecentPeriodOptions('2026-02', 4);
  assert.deepEqual(
    options.map((option) => option.value),
    ['2026-02', '2026-01', '2025-12', '2025-11']
  );
  assert.equal(options[0].label, '02/2026');
  assert.equal(buildRecentPeriodOptions('não-é-mês').length, 0);
  assert.equal(buildRecentPeriodOptions('2026-08', 12).length, 12);
});
