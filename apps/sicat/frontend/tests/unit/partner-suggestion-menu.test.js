/**
 * O combobox "Transportador" dos filtros de /manifestos abria um PAINEL EM
 * BRANCO (overlay de ~64px, sem uma linha de texto) que ainda cobria os chips
 * "Hoje / 7 dias / 30 dias". Estes testes travam as três decisões do estado do
 * menu: não abrir quando não há nada a dizer, dizer o que falta quando o termo
 * é curto e dizer que não achou quando a busca rodou vazia.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePartnerSuggestionMenu } from '../../src/lib/partner-suggestion-menu.js';

test('sem termo e sem sugestões o menu NÃO abre (nada a mostrar)', () => {
  const state = resolvePartnerSuggestionMenu({ query: '', roleLabel: 'transportador' });
  assert.equal(state.hideNoData, true);
  assert.equal(state.shouldCloseMenu, true);
});

test('CONTROLE NEGATIVO: com sugestões carregadas o menu continua liberado', () => {
  // Se a regra fechasse o menu por engano aqui, o campo perderia a lista de
  // parceiros — o defeito seria pior que o painel em branco.
  const state = resolvePartnerSuggestionMenu({ query: '', roleLabel: 'transportador', itemCount: 12 });
  assert.equal(state.hideNoData, false);
  assert.equal(state.shouldCloseMenu, false);
});

test('com 1 caractere o painel diz o que falta em vez de ficar vazio', () => {
  const state = resolvePartnerSuggestionMenu({ query: 'L', roleLabel: 'transportador' });
  assert.equal(state.hideNoData, false);
  assert.equal(state.emptyText, 'Digite pelo menos 2 caracteres para buscar.');
});

test('busca feita e zero resultados: texto real citando o termo', () => {
  const state = resolvePartnerSuggestionMenu({ query: ' LV ', roleLabel: 'transportador', itemCount: 0 });
  assert.equal(state.hideNoData, false);
  assert.equal(state.emptyText, 'Nenhum transportador encontrado para "LV".');
  assert.equal(state.shouldCloseMenu, false);
});

test('o mesmo vale para o Destinador (campo gêmeo)', () => {
  const state = resolvePartnerSuggestionMenu({ query: 'ABC', roleLabel: 'destinador' });
  assert.equal(state.emptyText, 'Nenhum destinador encontrado para "ABC".');
});

test('enquanto a busca está em voo o painel não acusa "não encontrado"', () => {
  const state = resolvePartnerSuggestionMenu({ query: 'LV', roleLabel: 'transportador', loading: true });
  assert.equal(state.hideNoData, false);
  assert.equal(state.emptyText, 'Buscando transportadores...');
  assert.equal(state.shouldCloseMenu, false);
});

test('o painel NUNCA fica sem texto quando é aberto', () => {
  const cases = [
    { query: 'L', roleLabel: 'transportador' },
    { query: 'LV', roleLabel: 'transportador' },
    { query: '', roleLabel: 'transportador', itemCount: 3 },
    { query: 'LV', roleLabel: 'transportador', loading: true }
  ];

  for (const input of cases) {
    const state = resolvePartnerSuggestionMenu(input);
    assert.equal(state.hideNoData, false, `deveria abrir para ${JSON.stringify(input)}`);
    assert.notEqual(state.emptyText, '', `texto vazio para ${JSON.stringify(input)}`);
  }
});
