/**
 * PLURAL pt-BR — "manifesto(s)" era o app terceirizando a concordância para o
 * operador. Estes testes travam o vocabulário que aparece nas telas.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { pluralOf, pluralize, pluralizeWithCount } from '../../src/lib/plural-pt.js';

test('pluralize concorda em 0, 1, 2 e muitos', () => {
  assert.equal(pluralize(0, 'manifesto'), 'manifestos');
  assert.equal(pluralize(1, 'manifesto'), 'manifesto');
  assert.equal(pluralize(2, 'manifesto'), 'manifestos');
  assert.equal(pluralize(243, 'manifesto'), 'manifestos');
});

test('vocabulário real das telas (incl. irregulares)', () => {
  assert.equal(pluralize(1, 'item'), 'item');
  assert.equal(pluralize(3, 'item'), 'itens');

  assert.equal(pluralize(1, 'declaração'), 'declaração');
  assert.equal(pluralize(0, 'declaração'), 'declarações');
  assert.equal(pluralize(12, 'declaração'), 'declarações');

  assert.equal(pluralize(1, 'certificado'), 'certificado');
  assert.equal(pluralize(5, 'certificado'), 'certificados');

  assert.equal(pluralize(1, 'selecionado'), 'selecionado');
  assert.equal(pluralize(20, 'selecionado'), 'selecionados');
});

test('plural explícito vence a derivação automática', () => {
  assert.equal(pluralize(2, 'registro local', 'registros locais'), 'registros locais');
  assert.equal(pluralize(1, 'registro local', 'registros locais'), 'registro local');
});

test('pluralOf cobre as regras regulares usadas no SICAT', () => {
  assert.equal(pluralOf('manifesto'), 'manifestos');
  assert.equal(pluralOf('item'), 'itens');
  assert.equal(pluralOf('declaração'), 'declarações');
  assert.equal(pluralOf('local'), 'locais');
  assert.equal(pluralOf('lápis'), 'lápis');
  assert.equal(pluralOf(''), '');
});

test('contagem inválida cai no plural (nunca "1 manifesto" mentiroso)', () => {
  assert.equal(pluralize(null, 'manifesto'), 'manifestos');
  assert.equal(pluralize(undefined, 'manifesto'), 'manifestos');
  assert.equal(pluralize(Number.NaN, 'manifesto'), 'manifestos');
  assert.equal(pluralize(-1, 'manifesto'), 'manifesto');
});

test('pluralizeWithCount junta número e palavra', () => {
  assert.equal(pluralizeWithCount(0, 'manifesto'), '0 manifestos');
  assert.equal(pluralizeWithCount(1, 'manifesto'), '1 manifesto');
  assert.equal(pluralizeWithCount(38, 'manifesto'), '38 manifestos');
  assert.equal(pluralizeWithCount(null, 'declaração'), '0 declarações');
});
