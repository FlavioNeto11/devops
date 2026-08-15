/**
 * "Digitou e não escolheu": o aviso inline citava o termo, mas o ERRO da
 * validação continuava genérico ("Selecione o destinador."). Estes testes
 * travam o alinhamento entre as duas mensagens.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTNER_QUERY_MIN_LENGTH,
  buildPartnerEmptyText,
  buildPartnerSelectionError,
  buildPartnerSelectionHint
} from '../../src/lib/partner-selection-messages.js';

test('com termo digitado e nada escolhido, o ERRO cita o termo', () => {
  const error = buildPartnerSelectionError({ query: 'LV', roleLabel: 'destinador', hasSelection: false });
  assert.ok(error.startsWith('"LV" é só o termo da busca'));
  assert.ok(error.includes('nenhum destinador foi selecionado'));
});

test('erro e aviso inline dizem a MESMA coisa quando há termo', () => {
  const input = { query: 'lv ambiental', roleLabel: 'transportador', hasSelection: false };
  assert.equal(buildPartnerSelectionError(input), buildPartnerSelectionHint(input));
});

test('sem termo digitado o erro volta a ser a instrução simples', () => {
  assert.equal(
    buildPartnerSelectionError({ query: '', roleLabel: 'destinador', hasSelection: false }),
    'Selecione o destinador.'
  );
  assert.equal(
    buildPartnerSelectionError({ query: ' L ', roleLabel: 'destinador', hasSelection: false }),
    'Selecione o destinador.'
  );
});

test('com opção selecionada não há erro nem aviso', () => {
  const input = { query: 'LV', roleLabel: 'destinador', hasSelection: true };
  assert.equal(buildPartnerSelectionError(input), '');
  assert.equal(buildPartnerSelectionHint(input), '');
});

test('aviso inline só aparece a partir do mínimo de caracteres', () => {
  assert.equal(PARTNER_QUERY_MIN_LENGTH, 2);
  assert.equal(buildPartnerSelectionHint({ query: 'L', roleLabel: 'destinador', hasSelection: false }), '');
  assert.notEqual(buildPartnerSelectionHint({ query: 'LV', roleLabel: 'destinador', hasSelection: false }), '');
});

test('estado vazio do menu acompanha o mesmo limiar', () => {
  assert.equal(
    buildPartnerEmptyText({ query: 'L', roleLabel: 'destinador' }),
    'Digite pelo menos 2 caracteres para buscar.'
  );
  assert.equal(
    buildPartnerEmptyText({ query: ' LV ', roleLabel: 'destinador' }),
    'Nenhum destinador encontrado para "LV".'
  );
});
