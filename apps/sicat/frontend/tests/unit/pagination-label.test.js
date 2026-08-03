/**
 * CONTADOR ÚNICO — três formatos da mesma frase conviviam no app. Estes testes
 * travam o formato canônico "Mostrando X–Y de N <substantivo>".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANGE_SEPARATOR,
  formatPageCounter,
  formatPaginationCounter,
  resolveOffsetRange,
  resolvePageRange
} from '../../src/lib/pagination-label.js';

test('formato canônico: travessão, substantivo concordado e sem ponto final', () => {
  const label = formatPaginationCounter({ start: 1, end: 20, total: 38, singular: 'manifesto' });
  assert.equal(label, 'Mostrando 1–20 de 38 manifestos');
  assert.equal(RANGE_SEPARATOR, '–');
  assert.ok(!label.endsWith('.'));
});

test('total 1 usa o singular', () => {
  assert.equal(
    formatPaginationCounter({ start: 1, end: 1, total: 1, singular: 'manifesto' }),
    'Mostrando 1–1 de 1 manifesto'
  );
});

test('lista vazia não inventa faixa', () => {
  assert.equal(
    formatPaginationCounter({ start: 0, end: 0, total: 0, singular: 'manifesto' }),
    'Mostrando 0–0 de 0 manifestos'
  );
});

test('substantivo irregular vem explícito', () => {
  assert.equal(
    formatPaginationCounter({ start: 1, end: 20, total: 243, singular: 'declaração', plural: 'declarações' }),
    'Mostrando 1–20 de 243 declarações'
  );
});

test('resolvePageRange calcula a faixa da página atual', () => {
  assert.deepEqual(resolvePageRange({ page: 1, pageSize: 20, itemsOnPage: 20 }), { start: 1, end: 20 });
  assert.deepEqual(resolvePageRange({ page: 2, pageSize: 20, itemsOnPage: 18 }), { start: 21, end: 38 });
  assert.deepEqual(resolvePageRange({ page: 3, pageSize: 20, itemsOnPage: 0 }), { start: 0, end: 0 });
  assert.deepEqual(resolvePageRange(), { start: 0, end: 0 });
});

test('resolveOffsetRange cobre listas por offset/limit', () => {
  assert.deepEqual(resolveOffsetRange({ offset: 0, limit: 50, itemsOnPage: 12 }), { start: 1, end: 12 });
  assert.deepEqual(resolveOffsetRange({ offset: 50, limit: 50, itemsOnPage: 50 }), { start: 51, end: 100 });
  assert.deepEqual(resolveOffsetRange({ offset: 50, limit: 50, itemsOnPage: 0 }), { start: 0, end: 0 });
});

test('formatPageCounter combina faixa e frase', () => {
  assert.equal(
    formatPageCounter({ page: 2, pageSize: 20, itemsOnPage: 18, total: 38, singular: 'manifesto' }),
    'Mostrando 21–38 de 38 manifestos'
  );
  assert.equal(
    formatPageCounter({ page: 1, pageSize: 20, itemsOnPage: 0, total: 0, singular: 'manifesto' }),
    'Mostrando 0–0 de 0 manifestos'
  );
});
