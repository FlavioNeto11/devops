/**
 * FILTROS DE /manifestos NA URL — módulo PURO (sem Vue, sem router, sem DOM).
 *
 * O problema medido: a URL não participava do estado da tela.
 *   - abrir `/manifestos?externalStatus=salvo` mostrava o chip em "Todos"
 *     (a URL descrevia uma coisa e a tela outra);
 *   - parâmetros injetados (`groupId`, `search`, `evil`) SOBREVIVIAM a "Limpar
 *     filtros" e a novas buscas, sem nunca serem lidos nem descartados.
 *
 * CONTRATO ESCOLHIDO: a **URL é fonte de verdade** dos filtros da listagem.
 *   - no mount, o que está na URL é aplicado aos filtros;
 *   - ao aplicar/limpar/paginar, a URL é reescrita com a forma canônica;
 *   - chave desconhecida e valor inválido NÃO sobrevivem: são descartados da URL
 *     (a tela nunca fica descrevendo um filtro que não existe).
 *
 * A lista branca de nomes vem de `services/manifest-list-query.js` — é o mesmo
 * conjunto que o backend realmente lê. Um nome que sai de lá some daqui junto
 * (o teste `manifest-url-filters.test.js` trava essa amarração).
 */

import { MANIFEST_LIST_QUERY_PARAMS } from '../services/manifest-list-query.js';

/**
 * Filtros que o OPERADOR controla na tela — os únicos que fazem sentido na URL.
 * `integrationAccountId`/`sessionContextId` são contexto de sessão (não vão para
 * a barra de endereço), `orderBy`/`forceSync`/`localOnly` não têm controle na UI.
 */
const CANDIDATE_FILTER_KEYS = Object.freeze([
  'status',
  'externalStatus',
  'manifestNumber',
  'carrierQuery',
  'receiverQuery',
  'dateFrom',
  'dateTo',
  'page',
  'pageSize'
]);

/** Interseção com a lista branca do backend: nome que o backend não lê não vira link. */
export const MANIFEST_URL_FILTER_KEYS = Object.freeze(
  CANDIDATE_FILTER_KEYS.filter((key) => MANIFEST_LIST_QUERY_PARAMS.includes(key))
);

/**
 * Parâmetros de NAVEGAÇÃO (não são filtro): a tela os consome uma vez no mount e
 * eles somem da URL na primeira sincronização. Ficam listados para não serem
 * contados como "chave desconhecida" no diagnóstico.
 */
export const MANIFEST_URL_TRANSIENT_KEYS = Object.freeze([
  'refresh',
  'forceSync',
  'integrationAccountId',
  'groupId',
  'batchCreated',
  'count',
  'focus'
]);

/** Status interno do SICAT (espelha os chips de situação de `ManifestsView`). */
export const MANIFEST_STATUS_VALUES = Object.freeze(['draft', 'submitted', 'cancelled', 'failed']);

/** Situação CETESB usada nos chips do destinador (busca ILIKE no backend). */
export const MANIFEST_EXTERNAL_STATUS_VALUES = Object.freeze(['salvo', 'receb', 'cancel']);

/** Opções reais do seletor "Itens por página". */
export const MANIFEST_PAGE_SIZES = Object.freeze([10, 20, 50]);

export const MANIFEST_DEFAULT_PAGE = 1;
export const MANIFEST_DEFAULT_PAGE_SIZE = 20;

const MAX_TEXT_FILTER_LENGTH = 80;
const MAX_PAGE = 10_000;
const BR_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function singleValue(raw) {
  // `?status=a&status=b` chega como array: ambiguidade não vira filtro.
  if (Array.isArray(raw)) {
    return null;
  }

  if (raw === null || raw === undefined || typeof raw === 'object') {
    return null;
  }

  return String(raw);
}

function isValidBrDate(value) {
  const match = BR_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2999) {
    return false;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

const CONTROL_OR_MARKUP = /[\u0000-\u001F\u007F<>]/;

function normalizeText(value) {
  const text = value.trim();
  if (!text || text.length > MAX_TEXT_FILTER_LENGTH) {
    return null;
  }

  // Caractere de controle / markup na barra de endereço não vira filtro de busca.
  if (CONTROL_OR_MARKUP.test(text)) {
    return null;
  }

  return text;
}

function normalizeInteger(value, { min, max }) {
  const text = value.trim();
  if (!/^\d{1,6}$/.test(text)) {
    return null;
  }

  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

/**
 * Normalizadores por chave. Devolver `null` = valor inválido (ignorado E removido
 * da URL); devolver valor = filtro válido.
 */
const NORMALIZERS = Object.freeze({
  status: (value) => {
    const normalized = value.trim().toLowerCase();
    return MANIFEST_STATUS_VALUES.includes(normalized) ? normalized : null;
  },
  externalStatus: (value) => {
    const normalized = value.trim().toLowerCase();
    return MANIFEST_EXTERNAL_STATUS_VALUES.includes(normalized) ? normalized : null;
  },
  manifestNumber: (value) => {
    const text = value.trim();
    return /^[\w./-]{1,40}$/.test(text) ? text : null;
  },
  carrierQuery: normalizeText,
  receiverQuery: normalizeText,
  dateFrom: (value) => (isValidBrDate(value.trim()) ? value.trim() : null),
  dateTo: (value) => (isValidBrDate(value.trim()) ? value.trim() : null),
  page: (value) => normalizeInteger(value, { min: 1, max: MAX_PAGE }),
  pageSize: (value) => {
    const parsed = normalizeInteger(value, { min: 1, max: 1000 });
    return parsed !== null && MANIFEST_PAGE_SIZES.includes(parsed) ? parsed : null;
  }
});

/**
 * Lê a query string da rota.
 *
 * @param {Record<string, unknown>} query
 * @returns {{ filters: Record<string, string|number>, unknownKeys: string[], invalidKeys: string[] }}
 *   `filters` traz SÓ as chaves presentes e válidas (o resto fica no estado atual
 *   da tela); `unknownKeys`/`invalidKeys` existem para diagnóstico e teste.
 */
export function parseManifestUrlFilters(query = {}) {
  const source = query && typeof query === 'object' ? query : {};
  const filters = {};
  const unknownKeys = [];
  const invalidKeys = [];

  for (const key of Object.keys(source)) {
    if (!MANIFEST_URL_FILTER_KEYS.includes(key)) {
      if (!MANIFEST_URL_TRANSIENT_KEYS.includes(key)) {
        unknownKeys.push(key);
      }
      continue;
    }

    const raw = singleValue(source[key]);
    if (raw === null) {
      invalidKeys.push(key);
      continue;
    }

    const normalized = NORMALIZERS[key](raw);
    if (normalized === null) {
      invalidKeys.push(key);
      continue;
    }

    filters[key] = normalized;
  }

  return { filters, unknownKeys, invalidKeys };
}

/**
 * Forma CANÔNICA da URL a partir do estado dos filtros: só chave conhecida, só
 * valor válido, e nada de ruído (vazio e default ficam de fora — `/manifestos`
 * sem query já significa "filtros padrão").
 *
 * @param {Record<string, unknown>} filters
 * @returns {Record<string, string>}
 */
export function buildManifestUrlQuery(filters = {}) {
  const source = filters && typeof filters === 'object' ? filters : {};
  const query = {};

  for (const key of MANIFEST_URL_FILTER_KEYS) {
    const raw = singleValue(source[key]);
    if (raw === null) {
      continue;
    }

    const normalized = NORMALIZERS[key](raw);
    if (normalized === null || normalized === '') {
      continue;
    }

    if (key === 'page' && normalized === MANIFEST_DEFAULT_PAGE) {
      continue;
    }

    if (key === 'pageSize' && normalized === MANIFEST_DEFAULT_PAGE_SIZE) {
      continue;
    }

    query[key] = String(normalized);
  }

  return query;
}

/** Query canônica equivalente a uma URL recebida (round-trip de leitura+escrita). */
export function sanitizeManifestUrlQuery(query = {}) {
  return buildManifestUrlQuery(parseManifestUrlFilters(query).filters);
}

/**
 * A URL já está na forma desejada? Evita `router.replace` redundante (que
 * empilharia navegação a cada busca).
 */
export function isSameManifestUrlQuery(currentQuery = {}, nextQuery = {}) {
  const current = currentQuery && typeof currentQuery === 'object' ? currentQuery : {};
  const next = nextQuery && typeof nextQuery === 'object' ? nextQuery : {};

  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);

  if (currentKeys.length !== nextKeys.length) {
    return false;
  }

  return nextKeys.every((key) => {
    const currentValue = singleValue(current[key]);
    return currentValue !== null && currentValue === String(next[key]);
  });
}
