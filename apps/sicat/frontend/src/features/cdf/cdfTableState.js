/**
 * MÓDULO CDF — paginação local das tabelas e nomes acessíveis de linha.
 *
 * Duas dívidas do módulo de certificados vivem aqui:
 *
 * 1. CONTADOR SEM SUBSTANTIVO. As tabelas de `/cdf` e `/cdf/novo` deixavam o
 *    rodapé genérico do Vuetify escrever "Mostrando 0–0 de 0" — zero de quê? A
 *    paginação passa a ser da TELA (as duas listas já vêm inteiras da API), o
 *    rodapé genérico é desligado e o contador sai por `lib/pagination-label.js`
 *    com o substantivo certo (certificados / manifestos candidatos).
 *
 * 2. AÇÃO DE LINHA SEM NOME PRÓPRIO. Dez checkboxes sem nome acessível e dez
 *    botões chamados todos "Ver detalhe": para quem navega por lista de links
 *    ou por voz, as dez linhas eram indistinguíveis. Os nomes saem daqui, com
 *    o número do manifesto/certificado embutido.
 *
 * Módulo PURO (sem Vue, sem DOM) — testado em tests/unit/cdf-table-state.test.js.
 */

import { isoDateToBrDate } from '../../utils/date-format.js';

/** Mesmas opções de "Itens por página" da lista de manifestos. */
export const CDF_PAGE_SIZE_OPTIONS = Object.freeze([10, 20, 50]);

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toPositiveInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

/** Quantas páginas a lista tem. Lista vazia continua tendo 1 página (a página 1). */
export function resolveTotalPages(totalItems, pageSize) {
  const total = toPositiveInteger(totalItems, 0);
  const size = toPositiveInteger(pageSize, 0);

  if (!total || !size) {
    return 1;
  }

  return Math.ceil(total / size);
}

/** Página existente mais próxima da pedida — nunca 0, nunca além da última. */
export function clampPage(page, totalItems, pageSize) {
  const lastPage = resolveTotalPages(totalItems, pageSize);
  const requested = toPositiveInteger(page, 1);
  return Math.min(Math.max(1, requested), lastPage);
}

/** Fatia da página atual. `pageSize` ausente/<=0 devolve a lista inteira. */
export function paginateRows(rows, { page = 1, pageSize = 0 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const size = toPositiveInteger(pageSize, 0);

  if (!size) {
    return [...list];
  }

  const safePage = clampPage(page, list.length, size);
  const start = (safePage - 1) * size;
  return list.slice(start, start + size);
}

/** Soma dias a uma data ISO (yyyy-mm-dd). Meio-dia evita pulo de dia por fuso. */
export function shiftIsoDate(isoDate, days) {
  const raw = String(isoDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return '';
  }

  const base = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(base.getTime())) {
    return '';
  }

  base.setDate(base.getDate() + (Number(days) || 0));
  return `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(base.getDate())}`;
}

/**
 * Par de datas (formato BR) que um atalho de período representa. "N dias"
 * INCLUI hoje — 30 dias = hoje + 29 anteriores, igual a /manifestos.
 */
export function buildDatePresetTarget({ days, todayIso } = {}) {
  const span = Math.max(1, toPositiveInteger(days, 1));
  const dateTo = isoDateToBrDate(todayIso) || '';
  const dateFrom = isoDateToBrDate(shiftIsoDate(todayIso, -(span - 1))) || dateTo;

  return { dateFrom, dateTo };
}

/**
 * Chip de filtro ativo que ainda não valeu na busca não pode se apresentar como
 * se valesse — o sufixo diz a verdade em texto (o chip do painel não tem tom).
 */
export function decorateFilterChipLabel(label, isPending = false) {
  const text = String(label || '').trim();
  if (!text) {
    return '';
  }

  return isPending ? `${text} · ainda não aplicado` : text;
}

function describeManifest(manifestLabel) {
  const label = String(manifestLabel || '').trim();
  return label && label.toLowerCase() !== 'manifesto' ? `manifesto ${label}` : 'manifesto sem número';
}

/** Nome acessível do checkbox da linha ("Selecionar o manifesto 12345"). */
export function formatCandidateSelectionLabel(manifestLabel) {
  return `Selecionar o ${describeManifest(manifestLabel)}`;
}

/** Nome acessível do link de detalhe ("Ver detalhe do manifesto 12345"). */
export function formatCandidateDetailLabel(manifestLabel) {
  return `Ver detalhe do ${describeManifest(manifestLabel)}`;
}

/** Nome acessível do botão de download ("Baixar PDF do certificado ABC-1"). */
export function formatCertificateDownloadLabel(certificateCode) {
  const code = String(certificateCode || '').trim();
  return code && code !== '-'
    ? `Baixar PDF do certificado ${code}`
    : 'Baixar PDF do certificado sem código';
}
