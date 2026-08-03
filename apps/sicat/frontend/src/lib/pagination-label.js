/**
 * CONTADOR DE PAGINAÇÃO — uma frase só para o app inteiro.
 *
 * A mesma informação aparecia em três formatos: o painel dizia "0-0 de 0"
 * (rodapé do Vuetify), /manifestos "Mostrando 1 até 20 de 38 manifestos" e os
 * relatórios "Mostrando 1 até 20 de 243 manifesto(s).". O operador que anda
 * entre as telas relia a mesma frase três vezes.
 *
 * FORMATO CANÔNICO: `Mostrando 1–20 de 38 manifestos`
 * — travessão entre início e fim, substantivo concordado (plural-pt.js), sem
 * ponto final. O rodapé padrão das tabelas (Vuetify) usa a MESMA abertura e o
 * MESMO travessão via `dataFooter.pageText` em plugins/vuetify.js; ali o
 * substantivo não existe porque a tabela genérica não sabe o que ela lista.
 *
 * Módulo PURO (sem Vue, sem DOM) — testado em tests/unit/pagination-label.test.js.
 */

import { pluralize } from './plural-pt.js';

/** Travessão (en dash) — separador canônico da faixa. */
export const RANGE_SEPARATOR = '–';

function toSafeCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric);
}

/**
 * Faixa exibida na página atual a partir da paginação por página.
 * Sem itens na página a faixa é 0–0 (e não "1–0", que já apareceu na tela).
 */
export function resolvePageRange({ page = 1, pageSize = 0, itemsOnPage = 0 } = {}) {
  const safePage = Math.max(1, toSafeCount(page) || 1);
  const safePageSize = toSafeCount(pageSize);
  const safeItems = toSafeCount(itemsOnPage);

  if (!safeItems) {
    return { start: 0, end: 0 };
  }

  const start = (safePage - 1) * safePageSize + 1;
  return { start, end: start + safeItems - 1 };
}

/** Mesma faixa, para listas paginadas por offset/limit (ex.: DMR). */
export function resolveOffsetRange({ offset = 0, limit = 0, itemsOnPage = 0 } = {}) {
  const safeOffset = toSafeCount(offset);
  const safeLimit = toSafeCount(limit);
  const safeItems = toSafeCount(itemsOnPage);

  if (!safeItems) {
    return { start: 0, end: 0 };
  }

  return {
    start: safeOffset + 1,
    end: safeOffset + Math.min(safeItems, safeLimit || safeItems)
  };
}

/**
 * "Mostrando 1–20 de 38 manifestos".
 * `singular` é obrigatório; `plural` só quando irregular (declaração/declarações).
 */
export function formatPaginationCounter({ start, end, total, singular, plural } = {}) {
  const safeTotal = toSafeCount(total);
  const safeStart = toSafeCount(start);
  const safeEnd = Math.max(safeStart, toSafeCount(end));
  const noun = pluralize(safeTotal, singular, plural);
  const suffix = noun ? ` ${noun}` : '';

  return `Mostrando ${safeStart}${RANGE_SEPARATOR}${safeEnd} de ${safeTotal}${suffix}`;
}

/** Atalho: calcula a faixa da página e já devolve a frase canônica. */
export function formatPageCounter({ page, pageSize, itemsOnPage, total, singular, plural } = {}) {
  const range = resolvePageRange({ page, pageSize, itemsOnPage });
  return formatPaginationCounter({ ...range, total, singular, plural });
}
