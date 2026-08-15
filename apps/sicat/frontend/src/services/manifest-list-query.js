/**
 * Montagem da query string de `GET /v1/manifestos` (listagem de manifestos).
 *
 * Mora num módulo próprio (sem `fetch`, sem `localStorage`) para poder ser
 * testado direto em `tests/unit` — o `api.js` só o consome. Mesmo padrão de
 * `partner-search-query.js`.
 *
 * FILTRO FANTASMA. A tela mandava `groupId=<lote>` e a API respondia 200
 * devolvendo TUDO: o parâmetro era inerte. A rota
 * (`backend/src/routes/api-routes.ts`, `GET /v1/manifestos`) entrega `req.query`
 * cru para `listManifests`, que monta os filtros do banco em
 * `buildManifestListFilters` (`backend/src/services/manifest-service.ts`) — e ali
 * `groupId` simplesmente NÃO é copiado. O repositório até sabe filtrar por lote
 * (`manifest-repo.ts`: `coalesce(payload -> 'batch' ->> 'groupId', '') = $n`),
 * mas o valor nunca chega até ele. Enquanto o serviço não repassar o parâmetro,
 * mandá-lo é prometer um filtro que não existe.
 *
 * A montagem é por LISTA BRANCA: parâmetro que o backend não lê não sai daqui,
 * nem que o chamador insista em passá-lo. A lista abaixo é exatamente o conjunto
 * que `listManifests` consome de `queryString`.
 */
const MANIFEST_LIST_PARAMS = Object.freeze([
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

export function buildManifestListQueryParams(params = {}) {
  const source = params && typeof params === 'object' ? params : {};
  const normalized = {};

  for (const key of MANIFEST_LIST_PARAMS) {
    normalized[key] = source[key];
  }

  return normalized;
}

export const MANIFEST_LIST_QUERY_PARAMS = MANIFEST_LIST_PARAMS;
