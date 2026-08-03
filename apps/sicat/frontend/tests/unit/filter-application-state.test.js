/**
 * CHIP QUE ACENDE ANTES DE VALER — o clique pintava o chip e a lista continuava
 * a mesma até "Aplicar filtros". Estes testes travam a distinção entre
 * "selecionado" (pendente) e "valendo" (aplicado).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
