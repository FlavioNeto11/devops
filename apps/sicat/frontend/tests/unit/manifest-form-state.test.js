/**
 * DEFAULTS DO WIZARD DE MTR.
 *
 * MTR é documento regulatório: quantidade e peso NASCEM VAZIOS. Um default de
 * `1` faz o operador desatento declarar "1 tonelada" sem perceber. Este teste
 * prende o estado inicial e a regra "tem de ser maior que zero".
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyManifestForm,
  resolveMeasureErrors,
  toNumber
} from '../../src/features/mtr/create/manifestFormState.js';

test('quantidade e peso nascem VAZIOS (null), nunca pré-preenchidos', () => {
  const form = createEmptyManifestForm();

  assert.equal(form.quantity, null, 'quantidade não pode nascer com valor');
  assert.equal(form.weightTon, null, 'peso não pode nascer com valor');
  // Blindagem contra "voltar a 1/0/string vazia disfarçada de número".
  assert.notEqual(form.quantity, 1);
  assert.notEqual(form.weightTon, 1);
  assert.notEqual(form.quantity, 0);
  assert.notEqual(form.weightTon, 0);
});

test('demais campos do resíduo e participantes nascem vazios', () => {
  const form = createEmptyManifestForm();

  for (const field of [
    'integrationAccountId',
    'responsibleName',
    'driverName',
    'vehiclePlate',
    'notes',
    'unitCode',
    'residueCode',
    'treatmentCode',
    'classCode',
    'stateTypeCode',
    'packagingTypeCode'
  ]) {
    assert.equal(form[field], '', `${field} deveria nascer vazio`);
  }

  assert.equal(form.hasTemporaryStorage, false);
  assert.equal(form.hasCadriInResidueList, false);
  // Lote: 1 é o caso único (não é medida declarada à CETESB).
  assert.equal(form.batchCount, 1);
  // Data de expedição nasce com HOJE em dd/mm/yyyy (caso real dominante).
  assert.match(form.expeditionDate, /^\d{2}\/\d{2}\/\d{4}$/);
});

test('cada chamada devolve um estado NOVO (sem vazar entre wizards)', () => {
  const first = createEmptyManifestForm();
  first.quantity = 12;
  const second = createEmptyManifestForm();

  assert.equal(second.quantity, null);
  assert.notEqual(first, second);
});

test('estado inicial é INVÁLIDO: pede quantidade e peso', () => {
  const errors = resolveMeasureErrors(createEmptyManifestForm());

  assert.match(errors.quantity, /Informe a quantidade/i);
  assert.match(errors.weightTon, /Informe o peso/i);
});

test('validação exige valor MAIOR QUE ZERO', () => {
  for (const invalid of [0, '0', -1, '-2,5'.replace(',', '.')]) {
    const errors = resolveMeasureErrors({ quantity: invalid, weightTon: invalid });
    assert.match(errors.quantity, /maior que zero/i, `quantidade ${invalid} deveria ser recusada`);
    assert.match(errors.weightTon, /maior que zero/i, `peso ${invalid} deveria ser recusado`);
  }
});

test('vazio e zero têm mensagens diferentes', () => {
  const empty = resolveMeasureErrors({ quantity: '', weightTon: null });
  const zero = resolveMeasureErrors({ quantity: 0, weightTon: 0 });

  assert.notEqual(empty.quantity, zero.quantity);
  assert.notEqual(empty.weightTon, zero.weightTon);
});

test('valores positivos passam (inclusive fração)', () => {
  const errors = resolveMeasureErrors({ quantity: 0.001, weightTon: '2.5' });

  assert.equal(errors.quantity, '');
  assert.equal(errors.weightTon, '');
});

test('lixo digitado não vira número', () => {
  assert.equal(toNumber('abc'), null);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('   '), null);
  assert.equal(toNumber(null), null);
  assert.equal(toNumber(undefined), null);
  assert.equal(toNumber(Number.NaN), null);
  assert.equal(toNumber('7'), 7);
  assert.equal(toNumber(0), 0);

  const errors = resolveMeasureErrors({ quantity: 'abc', weightTon: 'dez' });
  assert.match(errors.quantity, /Informe a quantidade/i);
  assert.match(errors.weightTon, /Informe o peso/i);
});
