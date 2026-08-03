/**
 * "DIGITEI, LOGO ESCOLHI" — a confusão que fazia sair MTR com o destinador
 * errado. No autocomplete o texto digitado é só BUSCA; enquanto não houver
 * clique/Enter numa opção, nada está selecionado.
 *
 * O campo já avisava isso inline, mas a VALIDAÇÃO continuava dizendo o genérico
 * "Selecione o destinador." — quem digitou "LV" e parou lia uma mensagem que
 * não descreve o seu caso (ele acha que selecionou). Aqui as duas mensagens
 * saem da MESMA fonte: com termo digitado, ambas citam o termo.
 *
 * Módulo PURO (sem Vue, sem DOM) — testado em tests/unit/partner-selection-messages.test.js.
 */

/** Mínimo de caracteres para a busca de parceiro valer como termo. */
export const PARTNER_QUERY_MIN_LENGTH = 2;

function normalizeQuery(query) {
  return String(query ?? '').trim();
}

function hasSearchTerm(query, minLength) {
  const min = Number.isFinite(Number(minLength)) ? Number(minLength) : PARTNER_QUERY_MIN_LENGTH;
  return normalizeQuery(query).length >= min;
}

/**
 * Aviso inline do campo: vazio quando já há seleção OU quando ainda não há
 * termo de busca suficiente (não se acusa quem não digitou nada).
 */
export function buildPartnerSelectionHint({ query, roleLabel, hasSelection, minLength } = {}) {
  if (hasSelection) {
    return '';
  }

  if (!hasSearchTerm(query, minLength)) {
    return '';
  }

  return `"${normalizeQuery(query)}" é só o termo da busca — nenhum ${roleLabel} foi selecionado. Clique na opção desejada (ou use as setas e Enter).`;
}

/**
 * Erro de validação do campo. Com termo digitado e nada escolhido, diz
 * exatamente isso (mesma frase do aviso inline); sem termo, pede a escolha.
 */
export function buildPartnerSelectionError({ query, roleLabel, hasSelection, minLength } = {}) {
  if (hasSelection) {
    return '';
  }

  return buildPartnerSelectionHint({ query, roleLabel, hasSelection, minLength })
    || `Selecione o ${roleLabel}.`;
}

/**
 * Estado vazio do menu: com menos de `minLength` caracteres pede mais texto;
 * com a busca feita e zero resultados, diz que não encontrou (citando o termo).
 */
export function buildPartnerEmptyText({ query, roleLabel, minLength } = {}) {
  const min = Number.isFinite(Number(minLength)) ? Number(minLength) : PARTNER_QUERY_MIN_LENGTH;

  if (!hasSearchTerm(query, min)) {
    return `Digite pelo menos ${min} caracteres para buscar.`;
  }

  return `Nenhum ${roleLabel} encontrado para "${normalizeQuery(query)}".`;
}
