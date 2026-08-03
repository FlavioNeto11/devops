/**
 * HIGIENE DA QUERY STRING de `/v1/partners/search`.
 *
 * O frontend mandava o mesmo termo DUAS vezes (`q=` e `search=`). O backend lê
 * só `q` (`backend/src/services/partner-service.ts`), então `search` era peso
 * morto na URL e nos logs. Estes testes travam a lista branca: nenhum parâmetro
 * fora do que o backend consome pode voltar a sair na URL.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPartnerSearchQueryParams,
  PARTNER_SEARCH_QUERY_PARAMS
} from '../../src/services/partner-search-query.js';

/** Mesma serialização do `toQueryString` do api.js (vazio/nulo não vira parâmetro). */
function toQueryString(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.append(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

test('o termo de busca sai UMA vez, como q — nunca duplicado em search', () => {
  const query = toQueryString(buildPartnerSearchQueryParams({
    integrationAccountId: 'acc_1',
    role: 'transportador',
    q: 'CASAMAX',
    search: 'CASAMAX',
    page: 1,
    pageSize: 20
  }));

  assert.equal((query.match(/(?:\?|&)q=/g) || []).length, 1);
  assert.ok(!query.includes('search='), `search= não pode sair na URL: ${query}`);
  assert.ok(query.includes('q=CASAMAX'));
});

test('chamador que só conhece `search` continua funcionando — vira q', () => {
  const params = buildPartnerSearchQueryParams({
    integrationAccountId: 'acc_1',
    role: 'destinador',
    search: 'MAX AMBIENTAL'
  });

  assert.equal(params.q, 'MAX AMBIENTAL');
  assert.equal(params.search, undefined);
});

test('q explícito ganha de search divergente (não vira dois termos)', () => {
  const params = buildPartnerSearchQueryParams({ q: 'termo-novo', search: 'termo-velho' });
  assert.equal(params.q, 'termo-novo');
  assert.ok(!Object.keys(params).includes('search'));
});

test('parâmetro desconhecido não vaza para a URL (lista branca)', () => {
  const query = toQueryString(buildPartnerSearchQueryParams({
    integrationAccountId: 'acc_1',
    role: 'transportador',
    q: 'ABC',
    // ruído que já apareceu em chamadas antigas / futuras
    search: 'ABC',
    filtro: 'x',
    debug: 'true',
    token: 'nao-deve-vazar'
  }));

  assert.ok(!query.includes('filtro='), query);
  assert.ok(!query.includes('debug='), query);
  assert.ok(!query.includes('token='), query);
});

test('busca por código não arrasta termo textual', () => {
  const params = buildPartnerSearchQueryParams({
    integrationAccountId: 'acc_1',
    role: 'transportador',
    code: 160627
  });

  assert.equal(params.code, 160627);
  assert.equal(params.q, undefined);
  assert.equal(toQueryString(params), '?integrationAccountId=acc_1&role=transportador&code=160627');
});

test('a lista branca é exatamente o que o backend lê', () => {
  assert.deepEqual([...PARTNER_SEARCH_QUERY_PARAMS], [
    'integrationAccountId',
    'role',
    'q',
    'code',
    'page',
    'pageSize',
    'sessionContextId'
  ]);
});

test('entrada inválida não quebra a montagem', () => {
  assert.equal(toQueryString(buildPartnerSearchQueryParams()), '');
  assert.equal(toQueryString(buildPartnerSearchQueryParams(null)), '');
  assert.equal(toQueryString(buildPartnerSearchQueryParams('texto')), '');
});
