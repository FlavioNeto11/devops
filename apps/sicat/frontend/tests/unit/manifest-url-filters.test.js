/**
 * A URL DE /manifestos PRECISA CONTAR A VERDADE.
 *
 * Medido em produção: abrir a tela com `?externalStatus=...` deixava o chip em
 * "Todos" (a URL descrevia uma lista e a tela mostrava outra), e parâmetros
 * injetados (`groupId`, `search`, `evil`) sobreviviam a "Limpar filtros" e a
 * novas buscas — sem nunca serem lidos nem descartados.
 *
 * Estes testes travam o contrato escolhido: a URL é fonte de verdade dos filtros,
 * chave desconhecida não sobrevive e valor inválido é ignorado.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANIFEST_DEFAULT_PAGE_SIZE,
  MANIFEST_URL_FILTER_KEYS,
  buildManifestUrlQuery,
  isSameManifestUrlQuery,
  parseManifestUrlFilters,
  sanitizeManifestUrlQuery
} from '../../src/lib/manifest-url-filters.js';
import { MANIFEST_LIST_QUERY_PARAMS } from '../../src/services/manifest-list-query.js';

// --- amarração com a lista branca do backend -------------------------------

test('todo filtro da URL é um parâmetro que o backend realmente lê', () => {
  for (const key of MANIFEST_URL_FILTER_KEYS) {
    assert.ok(
      MANIFEST_LIST_QUERY_PARAMS.includes(key),
      `${key} não está na lista branca de manifest-list-query.js — a URL prometeria um filtro inexistente`
    );
  }
});

test('os nove filtros da tela continuam linkáveis', () => {
  assert.deepEqual([...MANIFEST_URL_FILTER_KEYS].sort(), [
    'carrierQuery',
    'dateFrom',
    'dateTo',
    'externalStatus',
    'manifestNumber',
    'page',
    'pageSize',
    'receiverQuery',
    'status'
  ]);
});

// --- leitura ---------------------------------------------------------------

test('filtro válido na URL vira estado da tela', () => {
  const { filters, unknownKeys, invalidKeys } = parseManifestUrlFilters({
    status: 'draft',
    dateFrom: '01/07/2026',
    dateTo: '31/07/2026',
    page: '3',
    pageSize: '50'
  });

  assert.deepEqual(filters, {
    status: 'draft',
    dateFrom: '01/07/2026',
    dateTo: '31/07/2026',
    page: 3,
    pageSize: 50
  });
  assert.deepEqual(unknownKeys, []);
  assert.deepEqual(invalidKeys, []);
});

test('chave desconhecida é descartada — e denunciada', () => {
  const { filters, unknownKeys } = parseManifestUrlFilters({
    status: 'failed',
    groupId: 'LOTE-9',
    search: 'x',
    evil: '<script>'
  });

  assert.deepEqual(filters, { status: 'failed' });
  // `groupId` é parâmetro de navegação (a tela ainda o consome na mensagem de
  // lote), então não conta como "desconhecido" — mas também não vira filtro.
  assert.deepEqual(unknownKeys.sort(), ['evil', 'search']);
  assert.equal('groupId' in filters, false);
});

test('valor inválido é ignorado em vez de virar filtro fantasma', () => {
  const { filters, invalidKeys } = parseManifestUrlFilters({
    // A varredura mediu exatamente este: a URL dizia AGUARDANDO_BAIXA e o chip
    // ficava em "Todos". Token que não existe nos chips não entra.
    externalStatus: 'AGUARDANDO_BAIXA',
    status: 'sudo',
    dateFrom: '31/02/2026',
    dateTo: '2026-07-01',
    page: '0',
    pageSize: '7'
  });

  assert.deepEqual(filters, {});
  assert.deepEqual(invalidKeys.sort(), ['dateFrom', 'dateTo', 'externalStatus', 'page', 'pageSize', 'status']);
});

test('situação da CETESB é aceita nos valores dos chips (case-insensitive)', () => {
  assert.deepEqual(parseManifestUrlFilters({ externalStatus: 'Salvo' }).filters, { externalStatus: 'salvo' });
  assert.deepEqual(parseManifestUrlFilters({ externalStatus: 'RECEB' }).filters, { externalStatus: 'receb' });
});

test('parâmetro repetido (array) é ambíguo e não vira filtro', () => {
  const { filters, invalidKeys } = parseManifestUrlFilters({ status: ['draft', 'failed'] });
  assert.deepEqual(filters, {});
  assert.deepEqual(invalidKeys, ['status']);
});

test('texto de busca com controle/markup não entra pela barra de endereço', () => {
  assert.deepEqual(parseManifestUrlFilters({ carrierQuery: '<img onerror=1>' }).filters, {});
  assert.deepEqual(parseManifestUrlFilters({ receiverQuery: 'a'.repeat(200) }).filters, {});
  assert.deepEqual(parseManifestUrlFilters({ carrierQuery: '  Transportes ABC  ' }).filters, {
    carrierQuery: 'Transportes ABC'
  });
});

// --- escrita ---------------------------------------------------------------

test('a URL canônica não carrega vazio nem valor padrão', () => {
  const query = buildManifestUrlQuery({
    status: '',
    externalStatus: '',
    manifestNumber: '',
    carrierQuery: '',
    receiverQuery: '',
    dateFrom: '03/08/2026',
    dateTo: '03/08/2026',
    page: 1,
    pageSize: MANIFEST_DEFAULT_PAGE_SIZE
  });

  assert.deepEqual(query, { dateFrom: '03/08/2026', dateTo: '03/08/2026' });
});

test('filtros limpos deixam a URL sem query nenhuma', () => {
  assert.deepEqual(buildManifestUrlQuery({ status: '', page: 1, pageSize: 20 }), {});
});

test('a escrita também recusa valor inválido do estado da tela', () => {
  assert.deepEqual(buildManifestUrlQuery({ status: 'sudo', pageSize: 999 }), {});
});

// --- round-trip ------------------------------------------------------------

test('round-trip: ler a URL e reescrevê-la devolve a mesma coisa', () => {
  const original = {
    status: 'submitted',
    carrierQuery: 'Transportes ABC',
    dateFrom: '01/07/2026',
    dateTo: '31/07/2026',
    page: '2',
    pageSize: '50'
  };

  const canonical = sanitizeManifestUrlQuery(original);
  assert.deepEqual(canonical, original);
  // Idempotente: aplicar de novo não muda mais nada.
  assert.deepEqual(sanitizeManifestUrlQuery(canonical), canonical);
});

test('round-trip limpa o lixo injetado', () => {
  assert.deepEqual(
    sanitizeManifestUrlQuery({ groupId: 'LOTE-9', search: 'x', evil: '1', status: 'draft' }),
    { status: 'draft' }
  );
});

// --- comparação (evita router.replace redundante) --------------------------

test('a URL já canônica não é reescrita', () => {
  assert.equal(isSameManifestUrlQuery({ status: 'draft' }, { status: 'draft' }), true);
  assert.equal(isSameManifestUrlQuery({ page: '2' }, { page: '2' }), true);
  assert.equal(isSameManifestUrlQuery({}, {}), true);
});

test('CONTROLE NEGATIVO: diferença na URL é detectada', () => {
  assert.equal(isSameManifestUrlQuery({ status: 'draft' }, { status: 'failed' }), false);
  assert.equal(isSameManifestUrlQuery({ status: 'draft', evil: '1' }, { status: 'draft' }), false);
  assert.equal(isSameManifestUrlQuery({}, { status: 'draft' }), false);
});
