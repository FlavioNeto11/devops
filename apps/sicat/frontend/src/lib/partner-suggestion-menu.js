/**
 * MENU EM BRANCO do combobox de parceiro (filtros de /manifestos).
 *
 * O campo "Transportador" abria um overlay VAZIO — um painel branco de ~64px,
 * sem uma linha de texto, que ainda por cima cobria os chips de período
 * ("Hoje / 7 dias / 30 dias") logo abaixo. Duas causas somadas:
 *
 * 1. `<v-combobox no-data-text="...">` é LETRA MORTA por padrão. A Vuetify
 *    monta o VCombobox com `makeSelectProps({ hideNoData: true })`
 *    (`node_modules/vuetify/lib/components/VCombobox/VCombobox.js`), e o item de
 *    "sem dados" só é renderizado quando `!props.hideNoData`. Ou seja: sem
 *    `:hide-no-data="false"` explícito o texto NUNCA aparece.
 * 2. Com `hideNoData: true` e zero itens, `hasList` fica falso e o menu perde a
 *    lista — mas o menu que JÁ estava aberto (ex.: itens chegaram, a busca
 *    seguinte voltou vazia, ou o operador limpou o campo) não é fechado. Sobra o
 *    VSheet do overlay: o painel branco em branco.
 *
 * Este módulo decide, para um estado de busca, QUAL das três coisas mostrar:
 * nada (não abrir overlay), um aviso ("digite mais caracteres" / "nada
 * encontrado") ou a lista de sugestões. As mensagens saem de
 * `partner-selection-messages.js` — a MESMA fonte do aviso inline e do erro de
 * validação do wizard, para o produto não ter dois vocabulários para o mesmo
 * fato.
 *
 * Módulo PURO (sem Vue, sem DOM) — testado em
 * tests/unit/partner-suggestion-menu.test.js.
 */

import { PARTNER_QUERY_MIN_LENGTH, buildPartnerEmptyText } from './partner-selection-messages.js';
import { pluralOf } from './plural-pt.js';

/**
 * @param {object} input
 * @param {string} input.query        termo digitado no campo
 * @param {string} input.roleLabel    'transportador' | 'destinador'
 * @param {boolean} input.loading     busca em voo
 * @param {number} input.itemCount    sugestões já carregadas
 * @param {number} [input.minLength]  mínimo de caracteres da busca remota
 * @returns {{ hideNoData: boolean, emptyText: string, shouldCloseMenu: boolean }}
 *   `hideNoData` vai direto para `:hide-no-data` do v-combobox: `true` DESLIGA o
 *   overlay (a Vuetify desabilita o menu quando não há itens), `false` liga o
 *   estado vazio com texto real. `shouldCloseMenu` fecha à mão o menu que já
 *   estava aberto quando o estado passa a não ter nada a mostrar.
 */
export function resolvePartnerSuggestionMenu({
  query,
  roleLabel,
  loading = false,
  itemCount = 0,
  minLength = PARTNER_QUERY_MIN_LENGTH
} = {}) {
  const normalizedQuery = String(query ?? '').trim();
  const numericCount = Number(itemCount);
  const count = Number.isFinite(numericCount) && numericCount > 0 ? numericCount : 0;

  // Nada digitado, nada carregado e nada em voo: não há uma única frase honesta
  // para pôr no painel — então não se abre painel nenhum (e os chips de período
  // continuam clicáveis).
  const hasSomethingToShow = count > 0 || Boolean(loading) || normalizedQuery.length > 0;

  const emptyText = loading
    ? `Buscando ${pluralOf(roleLabel)}...`
    : buildPartnerEmptyText({ query: normalizedQuery, roleLabel, minLength });

  return {
    hideNoData: !hasSomethingToShow,
    emptyText,
    shouldCloseMenu: !hasSomethingToShow
  };
}
