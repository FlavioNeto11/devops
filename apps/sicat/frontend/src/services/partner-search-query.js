/**
 * Montagem da query string de `/v1/partners/search`.
 *
 * Mora num módulo próprio (sem `fetch`, sem `localStorage`) para poder ser
 * testado direto em `tests/unit` — o `api.js` só o consome.
 *
 * HIGIENE: o frontend mandava o MESMO termo em dois parâmetros (`q` e `search`).
 * O backend lê apenas `q` (`backend/src/services/partner-service.ts`: a busca
 * local usa `query.q`, o curto-circuito é `!query.q` e o gateway recebe
 * `q: query.q`) — `search` era ignorado e só engordava a URL e os logs. A
 * montagem aqui é por LISTA BRANCA: parâmetro que o backend não lê não sai
 * daqui, nem que o chamador insista em passá-lo.
 *
 * `sessionContextId` continua na query porque o backend só o aceita assim
 * (`req.query` na rota `/v1/partners/search`); tirá-lo da URL exigiria mudar a
 * superfície HTTP (rota + OpenAPI + operações geradas) em lockstep.
 */
const PARTNER_SEARCH_PARAMS = Object.freeze([
  'integrationAccountId',
  'role',
  'q',
  'code',
  'page',
  'pageSize',
  'sessionContextId'
]);

export function buildPartnerSearchQueryParams(params = {}) {
  const source = params && typeof params === 'object' ? params : {};
  const normalized = {};

  for (const key of PARTNER_SEARCH_PARAMS) {
    normalized[key] = source[key];
  }

  // Retrocompatibilidade de CHAMADOR (não de contrato): telas antigas montam o
  // termo em `search`. Se `q` não veio, aproveitamos o valor — mas ele sai na
  // URL como `q`, nunca duplicado.
  if (normalized.q === undefined || normalized.q === null || normalized.q === '') {
    if (source.search !== undefined && source.search !== null && source.search !== '') {
      normalized.q = source.search;
    }
  }

  return normalized;
}

export const PARTNER_SEARCH_QUERY_PARAMS = PARTNER_SEARCH_PARAMS;
