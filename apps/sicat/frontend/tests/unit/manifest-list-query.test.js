/**
 * FILTRO FANTASMA na listagem de manifestos.
 *
 * A tela mandava `groupId=<lote>` e a API respondia 200 devolvendo TUDO —
 * controle negativo do avaliador, mesma conta/período: sem filtro 219 itens;
 * `groupId=ZZZ-LOTE-9999` → 219 (não filtrou); `carrierQuery=CG ENGENHARIA` →
 * 36; `manifestNumber=999999999999` → 0. A causa está no backend:
 * `buildManifestListFilters` (backend/src/services/manifest-service.ts) NÃO
 * copia `groupId` para os filtros do repositório, então o parâmetro morre no
 * caminho. Estes testes travam a lista branca: parâmetro que o backend não lê
 * não sai na URL.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildManifestListQueryParams,
  MANIFEST_LIST_QUERY_PARAMS
} from '../../src/services/manifest-list-query.js';

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

test('groupId NÃO sai na URL — a listagem não filtra por lote', () => {
  const query = toQueryString(buildManifestListQueryParams({
    integrationAccountId: 'acc_1',
    groupId: 'ZZZ-LOTE-9999',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-03'
  }));

  assert.ok(!query.includes('groupId='), `groupId= não pode sair na URL: ${query}`);
  assert.ok(query.includes('integrationAccountId=acc_1'));
});

test('os filtros que o backend REALMENTE lê continuam saindo', () => {
  const query = toQueryString(buildManifestListQueryParams({
    integrationAccountId: 'acc_1',
    sessionContextId: 'sess_1',
    status: 'draft',
    externalStatus: 'receb',
    manifestNumber: '260012603974',
    carrierQuery: 'CG ENGENHARIA',
    receiverQuery: 'MAX AMBIENTAL',
    dateFrom: '2026-07-01',
    dateTo: '2026-07-31',
    page: 2,
    pageSize: 50
  }));

  for (const expected of [
    'integrationAccountId=acc_1',
    'sessionContextId=sess_1',
    'status=draft',
    'externalStatus=receb',
    'manifestNumber=260012603974',
    'carrierQuery=CG+ENGENHARIA',
    'receiverQuery=MAX+AMBIENTAL',
    'dateFrom=2026-07-01',
    'dateTo=2026-07-31',
    'page=2',
    'pageSize=50'
  ]) {
    assert.ok(query.includes(expected), `faltou ${expected} em ${query}`);
  }
});

test('flags de sincronização (forceSync/localOnly) sobrevivem à lista branca', () => {
  const query = toQueryString(buildManifestListQueryParams({
    integrationAccountId: 'acc_1',
    forceSync: true,
    localOnly: true
  }));

  assert.ok(query.includes('forceSync=true'), query);
  assert.ok(query.includes('localOnly=true'), query);
});

test('parâmetro desconhecido não vaza para a URL (lista branca)', () => {
  const query = toQueryString(buildManifestListQueryParams({
    integrationAccountId: 'acc_1',
    grupo: 'grp_123',
    batchId: 'grp_123',
    groupCode: 'grp_123',
    debug: 'true',
    token: 'nao-deve-vazar'
  }));

  assert.ok(!query.includes('grupo='), query);
  assert.ok(!query.includes('batchId='), query);
  assert.ok(!query.includes('groupCode='), query);
  assert.ok(!query.includes('debug='), query);
  assert.ok(!query.includes('token='), query);
});

test('a lista branca é exatamente o que o backend lê em GET /v1/manifestos', () => {
  assert.deepEqual([...MANIFEST_LIST_QUERY_PARAMS], [
    'integrationAccountId',
    'sessionContextId',
    'status',
    'externalStatus',
    'dateFrom',
    'dateTo',
    'generatorCode',
    'carrierCode',
    'receiverCode',
    'manifestNumber',
    'carrierQuery',
    'receiverQuery',
    'orderBy',
    'page',
    'pageSize',
    'forceSync',
    'localOnly'
  ]);
});

test('entrada inválida não quebra a montagem', () => {
  assert.equal(toQueryString(buildManifestListQueryParams()), '');
  assert.equal(toQueryString(buildManifestListQueryParams(null)), '');
  assert.equal(toQueryString(buildManifestListQueryParams('texto')), '');
});
