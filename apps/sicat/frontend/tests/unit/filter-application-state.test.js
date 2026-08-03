/**
 * CHIP QUE ACENDE ANTES DE VALER — o clique pintava o chip e a lista continuava
 * a mesma até "Aplicar filtros". Estes testes travam a distinção entre
 * "selecionado" (pendente) e "valendo" (aplicado).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFilterApplicationTracker,
  filtersMatch,
  hasPendingFilterChanges,
  normalizeFilterValue,
  pendingFilterKeys,
  resolveSelectionState,
  snapshotFilters
} from '../../src/lib/filter-application-state.js';

const KEYS = ['status', 'externalStatus'];

test('normalizeFilterValue trata vazio de todo jeito', () => {
  assert.equal(normalizeFilterValue(null), '');
  assert.equal(normalizeFilterValue(undefined), '');
  assert.equal(normalizeFilterValue('  '), '');
  assert.equal(normalizeFilterValue(' receb '), 'receb');
  assert.equal(normalizeFilterValue(20), '20');
});

test('chip clicado e ainda não buscado fica PENDENTE', () => {
  const chip = { status: '', externalStatus: 'receb' };
  const current = { status: '', externalStatus: 'receb' };
  const applied = { status: '', externalStatus: '' };

  assert.equal(resolveSelectionState(chip, current, applied, KEYS), 'pending');
});

test('depois da busca com o mesmo valor o chip fica APLICADO', () => {
  const chip = { status: '', externalStatus: 'receb' };
  const current = { status: '', externalStatus: 'receb' };
  const applied = { status: '', externalStatus: 'receb' };

  assert.equal(resolveSelectionState(chip, current, applied, KEYS), 'applied');
});

test('chip que não corresponde aos campos fica IDLE', () => {
  const chip = { status: 'failed', externalStatus: '' };
  const current = { status: '', externalStatus: 'receb' };
  const applied = { status: '', externalStatus: 'receb' };

  assert.equal(resolveSelectionState(chip, current, applied, KEYS), 'idle');
});

test('sem busca nenhuma (applied nulo) nada pode se dizer aplicado', () => {
  const chip = { status: '', externalStatus: '' };
  const current = { status: '', externalStatus: '' };

  assert.equal(resolveSelectionState(chip, current, null, KEYS), 'pending');
});

test('pendências listam só as chaves alteradas desde a última busca', () => {
  const current = { status: 'draft', externalStatus: '', manifestNumber: '2600' };
  const applied = { status: 'draft', externalStatus: '', manifestNumber: '' };
  const keys = ['status', 'externalStatus', 'manifestNumber'];

  assert.deepEqual(pendingFilterKeys(current, applied, keys), ['manifestNumber']);
  assert.equal(hasPendingFilterChanges(current, applied, keys), true);
  assert.equal(hasPendingFilterChanges(applied, applied, keys), false);
});

test('sem busca nenhuma, filtro preenchido já conta como pendente', () => {
  const current = { status: 'draft', externalStatus: '' };
  assert.deepEqual(pendingFilterKeys(current, null, KEYS), ['status']);
  assert.deepEqual(pendingFilterKeys({ status: '', externalStatus: '' }, null, KEYS), []);
});

test('filtersMatch ignora espaços e tipos, e nunca casa com snapshot ausente', () => {
  assert.equal(filtersMatch({ status: ' draft ' }, { status: 'draft' }, ['status']), true);
  assert.equal(filtersMatch({ pageSize: 20 }, { pageSize: '20' }, ['pageSize']), true);
  assert.equal(filtersMatch({ status: 'draft' }, null, ['status']), false);
});

test('snapshotFilters congela só as chaves observadas, normalizadas', () => {
  const snapshot = snapshotFilters({ status: ' draft ', externalStatus: null, page: 3 }, KEYS);
  assert.deepEqual(snapshot, { status: 'draft', externalStatus: '' });
});

/*
 * CORRIDA ENTRE CLIQUES DE CHIP — clicar "Recebidos" e, 250 ms depois,
 * "Cancelados" deixava o chip novo com o relógio de "pendente" para sempre: o
 * reconciliador antigo só olhava o loading da lista e nunca fotografava a
 * segunda busca. Os testes abaixo travam o sequenciamento por token.
 */

test('busca única converge para APPLIED', () => {
  const tracker = createFilterApplicationTracker(KEYS);
  const filters = { status: '', externalStatus: 'receb' };

  const requestId = tracker.begin(filters);
  assert.equal(tracker.appliedFilters(), null, 'antes de voltar, nada está aplicado');
  assert.equal(tracker.settle(requestId), true);
  assert.deepEqual(tracker.appliedFilters(), { status: '', externalStatus: 'receb' });
  assert.equal(resolveSelectionState(filters, filters, tracker.appliedFilters(), KEYS), 'applied');
});

test('resposta SUPERADA é descartada: só a requisição mais recente aplica', () => {
  const tracker = createFilterApplicationTracker(KEYS);

  const recebidos = tracker.begin({ status: '', externalStatus: 'receb' });
  const cancelados = tracker.begin({ status: '', externalStatus: 'cancel' });

  // A primeira busca (já superada) volta primeiro — não pode promover nada.
  assert.equal(tracker.settle(recebidos), false);
  assert.equal(tracker.appliedFilters(), null);

  assert.equal(tracker.settle(cancelados), true);
  assert.deepEqual(tracker.appliedFilters(), { status: '', externalStatus: 'cancel' });
});

test('resposta FORA DE ORDEM não sobrescreve a mais recente', () => {
  const tracker = createFilterApplicationTracker(KEYS);

  const recebidos = tracker.begin({ status: '', externalStatus: 'receb' });
  const cancelados = tracker.begin({ status: '', externalStatus: 'cancel' });

  // A mais nova volta antes; a antiga chega depois e tenta "voltar no tempo".
  assert.equal(tracker.settle(cancelados), true);
  assert.equal(tracker.settle(recebidos), false);
  assert.deepEqual(tracker.appliedFilters(), { status: '', externalStatus: 'cancel' });
});

test('o chip clicado converge de PENDING para APPLIED quando a busca dele volta', () => {
  const tracker = createFilterApplicationTracker(KEYS);
  const cancelledChip = { status: '', externalStatus: 'cancel' };
  const filters = { status: '', externalStatus: 'receb' };

  const recebidos = tracker.begin(filters);

  // Clique em "Cancelados" com a busca de "Recebidos" ainda em voo.
  filters.externalStatus = 'cancel';
  assert.equal(resolveSelectionState(cancelledChip, filters, tracker.appliedFilters(), KEYS), 'pending');

  tracker.settle(recebidos);
  assert.equal(
    resolveSelectionState(cancelledChip, filters, tracker.appliedFilters(), KEYS),
    'pending',
    'a resposta antiga não pode acender o chip novo'
  );

  const cancelados = tracker.begin(filters);
  assert.equal(tracker.settle(cancelados), true);
  assert.equal(resolveSelectionState(cancelledChip, filters, tracker.appliedFilters(), KEYS), 'applied');
});

test('liquidar duas vezes (ou um id desconhecido) não muda o aplicado', () => {
  const tracker = createFilterApplicationTracker(KEYS);
  const requestId = tracker.begin({ status: 'draft', externalStatus: '' });

  assert.equal(tracker.settle(requestId), true);
  assert.equal(tracker.settle(requestId), false, 'a segunda liquidação é ruído');
  assert.equal(tracker.settle(9999), false, 'id que nunca existiu não aplica nada');
  assert.deepEqual(tracker.appliedFilters(), { status: 'draft', externalStatus: '' });
});

test('nenhuma busca fica pendurada depois de liquidada', () => {
  const tracker = createFilterApplicationTracker(KEYS);

  const first = tracker.begin({ status: '', externalStatus: 'receb' });
  const second = tracker.begin({ status: '', externalStatus: 'cancel' });
  assert.equal(tracker.inFlightCount(), 2);

  tracker.settle(first);
  tracker.settle(second);
  assert.equal(tracker.inFlightCount(), 0);
});

test('o snapshot congela o instante do disparo, não a edição posterior', () => {
  const tracker = createFilterApplicationTracker(KEYS);
  const filters = { status: '', externalStatus: 'receb' };

  const requestId = tracker.begin(filters);
  filters.externalStatus = 'cancel';
  tracker.settle(requestId);

  assert.deepEqual(
    tracker.appliedFilters(),
    { status: '', externalStatus: 'receb' },
    'o aplicado é o que a busca levou, não o que o campo mostra agora'
  );
});
