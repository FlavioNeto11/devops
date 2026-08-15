/**
 * MÓDULO CDF — paginação da tela, alvo dos atalhos de período e nomes
 * acessíveis das ações de linha. Estes testes travam:
 *  - o contador nunca inventa faixa nem sai do intervalo real;
 *  - "N dias" INCLUI hoje (mesma conta de /manifestos);
 *  - cada linha tem nome PRÓPRIO (o defeito era 10 "Ver detalhe" iguais);
 *  - as mensagens de intervalo de datas saem acentuadas (pt-BR de verdade).
 *
 * Alguns testes trazem CONTROLE NEGATIVO explícito: provam que a asserção
 * falharia se o defeito voltasse.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CDF_PAGE_SIZE_OPTIONS,
  buildDatePresetTarget,
  clampPage,
  decorateFilterChipLabel,
  formatCandidateDetailLabel,
  formatCandidateSelectionLabel,
  formatCertificateDownloadLabel,
  paginateRows,
  resolveTotalPages,
  shiftIsoDate
} from '../../src/features/cdf/cdfTableState.js';
import { formatPageCounter } from '../../src/lib/pagination-label.js';
import { evaluateDateRange } from '../../src/utils/date-range-validation.js';
import { resolveSelectionState } from '../../src/lib/filter-application-state.js';

const rows = Array.from({ length: 23 }, (_, index) => ({ id: index + 1 }));

test('opções de "Itens por página" são as mesmas da lista de manifestos', () => {
  assert.deepEqual([...CDF_PAGE_SIZE_OPTIONS], [10, 20, 50]);
});

test('total de páginas: lista vazia continua tendo a página 1', () => {
  assert.equal(resolveTotalPages(0, 10), 1);
  assert.equal(resolveTotalPages(23, 10), 3);
  assert.equal(resolveTotalPages(20, 10), 2);
});

test('clampPage nunca devolve página inexistente', () => {
  assert.equal(clampPage(0, 23, 10), 1);
  assert.equal(clampPage(-5, 23, 10), 1);
  assert.equal(clampPage(9, 23, 10), 3);
  assert.equal(clampPage('2', 23, 10), 2);
  // Encolheu a lista (ex.: filtro "só bloqueados"): volta para a última existente.
  assert.equal(clampPage(3, 4, 10), 1);
});

test('paginateRows fatia a página pedida e a última página é parcial', () => {
  assert.deepEqual(paginateRows(rows, { page: 1, pageSize: 10 }).map((row) => row.id).slice(0, 3), [1, 2, 3]);
  assert.equal(paginateRows(rows, { page: 2, pageSize: 10 }).length, 10);
  assert.equal(paginateRows(rows, { page: 3, pageSize: 10 }).length, 3);
  assert.equal(paginateRows(rows, { page: 3, pageSize: 10 })[0].id, 21);
});

test('paginateRows sem tamanho de página devolve a lista inteira (e não a mutila)', () => {
  assert.equal(paginateRows(rows, { page: 1, pageSize: 0 }).length, 23);
  assert.equal(paginateRows(null, { page: 1, pageSize: 10 }).length, 0);
});

test('contador da tela concorda com a fatia mostrada — e diz de QUÊ', () => {
  const pageSize = 10;
  const page = 3;
  const itemsOnPage = paginateRows(rows, { page, pageSize }).length;

  assert.equal(
    formatPageCounter({ page, pageSize, itemsOnPage, total: rows.length, singular: 'certificado' }),
    'Mostrando 21–23 de 23 certificados'
  );

  // Lista vazia: 0–0, com o substantivo (o defeito era "Mostrando 0–0 de 0").
  const emptyLabel = formatPageCounter({ page: 1, pageSize, itemsOnPage: 0, total: 0, singular: 'certificado' });
  assert.equal(emptyLabel, 'Mostrando 0–0 de 0 certificados');
  // CONTROLE NEGATIVO: o formato antigo (sem substantivo) reprova nesta asserção.
  assert.notEqual(emptyLabel, 'Mostrando 0–0 de 0');
});

test('candidatos usam plural irregular explícito ("manifestos candidatos")', () => {
  assert.equal(
    formatPageCounter({ page: 1, pageSize: 10, itemsOnPage: 10, total: 120, singular: 'manifesto candidato', plural: 'manifestos candidatos' }),
    'Mostrando 1–10 de 120 manifestos candidatos'
  );
  assert.equal(
    formatPageCounter({ page: 1, pageSize: 10, itemsOnPage: 1, total: 1, singular: 'manifesto candidato', plural: 'manifestos candidatos' }),
    'Mostrando 1–1 de 1 manifesto candidato'
  );
});

test('shiftIsoDate anda no calendário e rejeita entrada que não é data ISO', () => {
  assert.equal(shiftIsoDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftIsoDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftIsoDate('01/03/2026', -1), '');
  assert.equal(shiftIsoDate('', -1), '');
});

test('atalho de período INCLUI hoje: 30 dias = hoje + 29 anteriores, em pt-BR', () => {
  assert.deepEqual(buildDatePresetTarget({ days: 30, todayIso: '2026-08-03' }), {
    dateFrom: '05/07/2026',
    dateTo: '03/08/2026'
  });
  assert.deepEqual(buildDatePresetTarget({ days: 1, todayIso: '2026-08-03' }), {
    dateFrom: '03/08/2026',
    dateTo: '03/08/2026'
  });
});

test('chip do período só se declara aplicado quando a busca já rodou com ele', () => {
  const todayIso = '2026-08-03';
  const target = buildDatePresetTarget({ days: 7, todayIso });
  const keys = ['dateFrom', 'dateTo'];

  // Clicou no chip, busca ainda não voltou (ou foi abortada): PENDENTE.
  assert.equal(resolveSelectionState(target, { ...target }, null, keys), 'pending');
  // A lista já mostra esse período: APLICADO.
  assert.equal(resolveSelectionState(target, { ...target }, { ...target }, keys), 'applied');
  // Campos apontam para outro período: INATIVO.
  assert.equal(
    resolveSelectionState(target, buildDatePresetTarget({ days: 30, todayIso }), null, keys),
    'idle'
  );
});

test('chip de filtro ativo confessa quando ainda não está valendo', () => {
  assert.equal(decorateFilterChipLabel('De: 05/07/2026', false), 'De: 05/07/2026');
  assert.equal(decorateFilterChipLabel('De: 05/07/2026', true), 'De: 05/07/2026 · ainda não aplicado');
  assert.equal(decorateFilterChipLabel('', true), '');
});

test('cada linha ganha nome PRÓPRIO nas ações', () => {
  assert.equal(formatCandidateSelectionLabel('12345'), 'Selecionar o manifesto 12345');
  assert.equal(formatCandidateDetailLabel('12345'), 'Ver detalhe do manifesto 12345');
  assert.equal(formatCertificateDownloadLabel('CDF-9'), 'Baixar PDF do certificado CDF-9');

  // CONTROLE NEGATIVO: dez linhas não podem colidir no mesmo nome.
  const names = ['111', '222', '333'].map((label) => formatCandidateDetailLabel(label));
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.every((name) => name !== 'Ver detalhe'));
});

test('linha sem número não inventa identificador — assume a falta', () => {
  assert.equal(formatCandidateSelectionLabel(''), 'Selecionar o manifesto sem número');
  // 'manifesto' é o rótulo genérico de fallback da tela: não vira "manifesto manifesto".
  assert.equal(formatCandidateDetailLabel('manifesto'), 'Ver detalhe do manifesto sem número');
  assert.equal(formatCertificateDownloadLabel('-'), 'Baixar PDF do certificado sem código');
});

test('mensagens de intervalo de datas saem acentuadas (pt-BR, não "nao")', () => {
  const inverted = evaluateDateRange({ dateFrom: '10/08/2026', dateTo: '01/08/2026' });
  assert.equal(inverted.isValid, false);
  assert.equal(inverted.errorMessage, 'Data inicial não pode ser maior que Data final.');
  assert.ok(!inverted.errorMessage.includes('nao pode'));

  const tooWide = evaluateDateRange({ dateFrom: '01/01/2026', dateTo: '01/08/2026', maxDays: 31 });
  assert.equal(tooWide.errorMessage, 'O intervalo entre as datas não pode ser maior que 31 dias.');

  const broken = evaluateDateRange({ dateFrom: '99/99/2026', dateTo: '01/08/2026' });
  assert.equal(broken.errorMessage, 'Data inicial inválida. Revise o valor informado.');
});

test('período válido do CDF (até 2 anos) passa e devolve ISO para a API', () => {
  const validation = evaluateDateRange({ dateFrom: '05/07/2026', dateTo: '03/08/2026', maxDays: 731 });
  assert.equal(validation.isValid, true);
  assert.equal(validation.fromIso, '2026-07-05');
  assert.equal(validation.toIso, '2026-08-03');
  assert.equal(validation.spanDays, 30);
});
