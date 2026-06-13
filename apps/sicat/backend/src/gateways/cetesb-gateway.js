import https from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { config } from '../lib/config.js';
import { AppError } from '../lib/problem.js';
import { nowIso } from '../lib/time.js';
import { getJwtExpirationIso, isJwtExpiring } from '../lib/jwt.js';
import { findSessionContextById, findLatestActiveSessionContextByIntegrationAccount, updateSessionContext } from '../repositories/session-context-repo.js';
import { findIntegrationAccountById } from '../repositories/integration-account-repo.js';
import { findById as findSicatCetesbAccountById } from '../repositories/sicat-cetesb-account-repo.js';
import { decryptSecret } from '../lib/sicat-security.js';
import { validateManifestPayload, normalizeExpeditionDate } from '../lib/validators/manifest-validator.js';

const CATALOG_ENDPOINTS = {
  states: { method: 'GET', path: () => '/api/estados', auth: false, mapper: mapStates },
  cities: { method: 'GET', path: ({ stateCode }) => `/api/cidades/${stateCode}`, auth: false, mapper: mapCities },
  partnerTypes: { method: 'GET', path: () => '/api/parceiroTipoParceiros', auth: false, mapper: mapPartnerTypes },
  classes: { method: 'GET', path: () => '/api/classes', auth: false, mapper: mapClasses },
  issuingAuthorities: { method: 'GET', path: () => '/api/orgaoEmissor', auth: false, mapper: mapIssuingAuthorities },
  units: { method: 'GET', path: () => '/api/unidades', auth: true, mapper: mapUnits },
  residueTreatments: { method: 'GET', path: () => '/api/residuo/tratamento', auth: false, mapper: mapResidueTreatments },
  residueStates: { method: 'GET', path: () => '/api/residuo/tipoEstado', auth: false, mapper: mapResidueStates },
  packagingGroups: { method: 'GET', path: () => '/api/residuo/grupoEmbalagem', auth: false, mapper: mapPackagingGroups },
  residueClasses: { method: 'GET', path: () => '/api/residuo/residuoClasse', auth: false, mapper: mapResidueClasses },
  abnt: { method: 'GET', path: () => '/api/residuo/abnt', auth: false, mapper: mapAbnt },
  generatorAbnt: { method: 'GET', path: ({ partnerCode }) => `/api/residuo/pesquisaAbntGerador/${partnerCode}`, auth: false, mapper: mapAbnt },
  residueSearch: { method: 'GET', path: ({ seedTerm }) => `/api/residuo/pesquisa/${encodeURIComponent(seedTerm)}`, auth: false, mapper: mapResidueSearch },
  packagingTypes: { method: 'GET', path: ({ tieCodigo }) => `/api/residuo/tipoAcondicionamento/${tieCodigo}`, auth: false, mapper: mapPackagingTypes }
};

const DATE_BR_REGEX = /^(\d{2})-(\d{2})-(\d{4})$/;
const DATE_ISO_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIGITS_ONLY_REGEX = /\D/g;
const BUSINESS_SENSITIVE_KEY_TOKENS = ['authorization', 'token', 'cookie', 'senha', 'password', 'recaptcha', 'assinatura', 'email', 'cpf', 'cnpj', 'hash', 'nome', 'cargo', 'registro', 'endereco', 'bairro', 'cep', 'cidade', 'logradouro', 'complemento'];
const BUSINESS_SENSITIVE_EXACT_KEYS = new Set(['pardescricao', 'parnomefantasia', 'remobservacao', 'cerobservacao']);
// Numeric/path literals below are preserved exactly as observed in HARs; their semantics are intentionally not inferred here.
const RECEIPT_MANIFEST_SEARCH_SEGMENTS = Object.freeze({ tipoManifesto: 9, statusFilter: 0, kind: 'all' });
const CDF_RECEIVED_MANIFEST_SEARCH_SEGMENTS = Object.freeze({ tipoManifesto: 9, statusFilter: 0 });
const CDF_CERTIFICATE_SEARCH_SEGMENTS = Object.freeze({ tipoCertificado: 9, statusFilter: 0, kind: 'all' });

function defaultHeaders() {
  return {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    Connection: 'keep-alive',
    DNT: '1',
    Origin: config.cetesbPortalOrigin,
    Referer: config.cetesbPortalReferer,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent': config.cetesbUserAgent,
    'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"'
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.trunc(parsed);
}

function isTransientHttpStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function isTransientNetworkError(error) {
  const name = String(error?.name || '').toLowerCase();
  const code = String(error?.code || error?.cause?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (name === 'aborterror' || name === 'timeouterror') return true;
  if (code && ['etimedout', 'econnreset', 'econnrefused', 'enotfound', 'eai_again', 'und_err_connect_timeout'].includes(code)) return true;
  return message.includes('timeout') || message.includes('timed out') || message.includes('network');
}

function calculateRetryBackoffMs(attempt) {
  const baseMs = Math.max(0, Number(config.cetesbRetryBackoffBaseMs || 0));
  const maxMs = Math.max(baseMs, Number(config.cetesbRetryBackoffMaxMs || baseMs));
  if (baseMs === 0) return 0;
  const exponentialFactor = 2 ** Math.max(0, attempt - 1);
  return Math.min(maxMs, baseMs * exponentialFactor);
}

function sanitizeCatalogError(error) {
  if (error instanceof AppError) {
    return {
      title: error.title,
      detail: error.detail,
      status: error.status,
      code: error.code || null
    };
  }

  return {
    title: 'Catalog Sync Error',
    detail: error?.message || 'Falha ao consultar catálogo na CETESB.',
    status: 502,
    code: null
  };
}

function redactObject(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(redactObject);
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (['senha', 'password', 'recaptcha', 'jwtToken', 'token', 'x-access-token', 'authorization'].includes(key)) {
      out[key] = '***';
      continue;
    }
    out[key] = redactObject(entry);
  }
  return out;
}

function sanitizeHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const normalized = key.toLowerCase();
    if (normalized === 'authorization' || normalized === 'x-access-token') {
      out[normalized] = '***';
    } else {
      out[normalized] = value;
    }
  }
  return out;
}

function buildCookieHeader(setCookieHeader) {
  let values = [];
  if (Array.isArray(setCookieHeader)) {
    values = setCookieHeader;
  } else if (setCookieHeader) {
    values = [setCookieHeader];
  }
  if (!values.length) return null;
  const pairs = values
    .map((entry) => String(entry || '').split(';')[0].trim())
    .filter(Boolean);
  if (!pairs.length) return null;
  return pairs.join('; ');
}

function unwrapApiBody(payload) {
  if (payload && typeof payload === 'object' && 'erro' in payload && payload.erro) {
    throw new AppError(502, 'CETESB Gateway Error', payload.mensagem || 'Resposta de erro retornada pela CETESB.', {
      code: 'CETESB_REMOTE_ERROR',
      remotePayload: redactObject(payload)
    });
  }
  return payload;
}

function ensurePathValue(name, value) {
  if (value == null || value === '') {
    throw new AppError(400, 'Bad Request', `Valor obrigatório ausente para catálogo dependente de parâmetro: ${name}.`);
  }
  return value;
}

function formatDateBr(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function normalizeDateForCetesb(value, fallbackDate) {
  if (!value) return formatDateBr(fallbackDate);
  const normalized = String(value).trim();
  const direct = DATE_BR_REGEX.exec(normalized);
  if (direct) return normalized;
  const iso = DATE_ISO_REGEX.exec(normalized);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return formatDateBr(parsed);
  return formatDateBr(fallbackDate);
}

function parseDateBrToUtc(value) {
  const match = DATE_BR_REGEX.exec(String(value || '').trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function enumerateDateRangeBr(dateFromBr, dateToBr) {
  const start = parseDateBrToUtc(dateFromBr);
  const end = parseDateBrToUtc(dateToBr);
  if (!start || !end) return [];

  const rangeStart = start.getTime() <= end.getTime() ? start : end;
  const rangeEnd = start.getTime() <= end.getTime() ? end : start;
  const days = [];
  let cursor = new Date(rangeStart);

  while (cursor.getTime() <= rangeEnd.getTime()) {
    days.push(formatDateBr(cursor));
    cursor = addDays(cursor, 1);
  }

  return days;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86_400_000);
}

function resolveManifestSearchTipo(accountType, fallbackTipo = 8) {
  const normalizedAccountType = String(accountType || '').trim().toLowerCase();

  if (normalizedAccountType === 'receiver') {
    return 9;
  }

  if (normalizedAccountType === 'carrier') {
    return 5;
  }

  if (normalizedAccountType === 'generator') {
    return 8;
  }

  return fallbackTipo;
}

function isLikelyDocument(value) {
  return /^\d{11,14}$/.test(String(value || '').replaceAll(DIGITS_ONLY_REGEX, ''));
}

function normalizeDocumentDigits(value) {
  return String(value || '').replaceAll(DIGITS_ONLY_REGEX, '');
}

function toOptionalString(value) {
  return value == null ? '' : String(value);
}

function toOptionalGroup(value) {
  return value == null ? null : String(value);
}

function toParsedInteger(value) {
  if (value == null || value === '') return null;
  return typeof value === 'number' ? value : Number.parseInt(value, 10);
}

function toNumericCatalogCode(value) {
  return Number.isFinite(Number(value)) ? Number(value) : value;
}

function extractApiItems(payload) {
  if (Array.isArray(payload?.objetoResposta)) {
    return payload.objetoResposta;
  }
  if (payload?.objetoResposta) {
    return [payload.objetoResposta];
  }
  return [];
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function looksLikeBase64Payload(value) {
  const normalized = String(value || '').trim();
  if (normalized.length < 80) return false;
  if (normalized.startsWith('data:')) return true;
  return /^[A-Za-z0-9+/=\r\n]+$/.test(normalized);
}

function shouldRedactBusinessKey(key) {
  const normalized = String(key || '').trim().toLowerCase();
  if (!normalized) return false;
  if (BUSINESS_SENSITIVE_EXACT_KEYS.has(normalized)) return true;
  return BUSINESS_SENSITIVE_KEY_TOKENS.some((token) => normalized.includes(token));
}

function sanitizeBusinessPayload(value, parentKey = '') {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeBusinessPayload(entry, parentKey));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (shouldRedactBusinessKey(key)) {
        out[key] = '***';
        continue;
      }
      out[key] = sanitizeBusinessPayload(entry, key);
    }
    return out;
  }
  if (typeof value === 'string') {
    if (shouldRedactBusinessKey(parentKey) || looksLikeBase64Payload(value)) {
      return '***';
    }
  }
  return value;
}

function buildGatewayAuditEndpoint(path) {
  return new URL(path, config.cetesbBaseUrl).toString();
}

function buildJsonOperationExchange({ exchange, auditPath, requestBody = null, envelope, data }) {
  const endpoint = buildGatewayAuditEndpoint(auditPath);
  return {
    ...exchange,
    request: {
      ...exchange.request,
      endpoint,
      sanitizedBody: sanitizeBusinessPayload(requestBody || {})
    },
    response: {
      ...exchange.response,
      endpoint,
      sanitizedBody: sanitizeBusinessPayload(envelope),
      data
    }
  };
}

function buildBufferOperationExchange({ exchange, auditPath, requestBody = null }) {
  const endpoint = buildGatewayAuditEndpoint(auditPath);
  const pdfBuffer = exchange?.response?.data;
  return {
    ...exchange,
    request: {
      ...exchange.request,
      endpoint,
      sanitizedBody: sanitizeBusinessPayload(requestBody || {})
    },
    response: {
      ...exchange.response,
      endpoint,
      sanitizedBody: {
        contentType: exchange?.response?.sanitizedHeaders?.['content-type'] || exchange?.response?.sanitizedHeaders?.['Content-Type'] || 'application/pdf',
        size: Buffer.isBuffer(pdfBuffer) ? pdfBuffer.length : Number(pdfBuffer?.length || 0)
      },
      data: {
        pdfBuffer
      }
    }
  };
}

function safeObjectSpread(value) {
  return value && typeof value === 'object' ? value : undefined;
}

function parseJsonPayload(text) {
  if (!text) {
    return { data: null, responseSnippet: null };
  }

  const responseSnippet = text.slice(0, 200);
  try {
    return { data: JSON.parse(text), responseSnippet };
  } catch {
    return { data: null, responseSnippet };
  }
}

function createNonJsonResponseError({ method, path, statusCode, headers, responseSnippet, attempt, maxAttempts }) {
  return new AppError(502, 'CETESB Gateway Error', `A CETESB retornou payload não JSON para ${method} ${path}.`, {
    code: 'CETESB_NON_JSON_RESPONSE',
    remoteStatus: statusCode,
    contentType: headers['content-type'] || null,
    responseSnippet,
    attempt,
    maxAttempts
  });
}

function buildRemoteBodySnapshot(responseType, responseData, responseHeaders, responseSnippet) {
  if (responseType !== 'json') {
    return { contentType: responseHeaders['content-type'] || null };
  }

  if (responseData == null) {
    return {
      contentType: responseHeaders['content-type'] || null,
      responseSnippet
    };
  }

  return redactObject(responseData);
}

function calculateResidueWeightTon(line = {}) {
  if (line.weightTon != null) {
    return line.weightTon;
  }
  if (!line.quantity) {
    return null;
  }

  const unitCode = line.unit?.code;
  const unitSymbol = String(line.unit?.symbol || line.unit?.shortName || '').toUpperCase();
  const unitCodeText = String(unitCode || '').toUpperCase();
  const isTon = unitCode === 3 || unitCodeText === '3' || unitCodeText === 'TON' || unitSymbol === 'TON';
  const isKg = unitCodeText === 'KG' || unitSymbol === 'KG';

  if (isTon) {
    return Number.parseFloat(line.quantity);
  }
  if (isKg) {
    return Number.parseFloat((line.quantity / 1000).toFixed(3));
  }
  return null;
}

function buildResidueEntry(line = {}) {
  return {
    resCodigo: toParsedInteger(line.residue?.code),
    resCodigoIbama: line.residue?.ibamaCode ?? null,
    resDescricao: line.residue?.description ?? null,
    grrDescricao: line.residue?.groupDescription ?? null,
    grrRepresentacao: line.residue?.groupRepresentation ?? null
  };
}

function findCatalogItem(items, candidate, aliases = []) {
  if (!Array.isArray(items) || !items.length) return null;

  const all = [candidate, ...aliases]
    .filter((value) => value != null && String(value).trim() !== '')
    .map((value) => String(value).trim().toUpperCase());
  if (!all.length) return null;

  for (const item of items) {
    const keys = new Set(
      [item.code, item.shortName, item.name]
        .filter((value) => value != null && String(value).trim() !== '')
        .map((value) => String(value).trim().toUpperCase())
    );
    if (all.some((needle) => keys.has(needle))) {
      return item;
    }
  }

  return items.find((item) => {
    const name = String(item.name || '').toUpperCase();
    return all.some((needle) => name.includes(needle));
  }) || null;
}

function buildReferenceCode(group) {
  return Number.isFinite(Number(group)) ? Number(group) : group;
}

function buildStateLikePayload(item) {
  return {
    code: toNumericCatalogCode(item.code),
    description: item.name ?? null,
    referenceCode: buildReferenceCode(item.group)
  };
}

function buildCatalogContext(byName) {
  return {
    units: byName.units || [],
    treatments: byName.residueTreatments || [],
    residueClasses: byName.residueClasses || [],
    residueStates: byName.residueStates || [],
    packagingTypes: byName.packagingTypes || [],
    residueSearch: byName.residueSearch || []
  };
}

function applyResidueCatalogDefaults(nextLine, defaultStateType, defaultPackagingType) {
  if (!nextLine.stateType && defaultStateType) {
    nextLine.stateType = buildStateLikePayload(defaultStateType);
  }

  if (!nextLine.packagingType && defaultPackagingType) {
    nextLine.packagingType = buildStateLikePayload(defaultPackagingType);
  }
}

function enforceKnownRccCombination(nextLine, defaultStateType, defaultPackagingType) {
  const normalizedClassCode = Number(nextLine?.class?.code || 0);
  const normalizedTreatmentCode = Number(nextLine?.treatment?.code || 0);
  const normalizedStateCode = Number(nextLine?.stateType?.code || 0);
  const normalizedPackagingCode = Number(nextLine?.packagingType?.code || 0);
  const isKnownRccFlow = normalizedClassCode === 11 && normalizedTreatmentCode === 51;
  const shouldForceKnownRccCombination = isKnownRccFlow && (normalizedStateCode !== 4 || normalizedPackagingCode !== 4);

  if (!shouldForceKnownRccCombination) {
    return;
  }

  if (defaultStateType) {
    nextLine.stateType = buildStateLikePayload(defaultStateType);
  }
  if (defaultPackagingType) {
    nextLine.packagingType = buildStateLikePayload(defaultPackagingType);
  }
}

function enrichResidueLine(line, catalogContext, defaults) {
  const nextLine = { ...line };

  const unitCode = line?.unit?.code ?? line?.unit?.symbol;
  const unitItem = findCatalogItem(catalogContext.units, unitCode, [String(unitCode || '').toUpperCase()]);
  if (unitItem) {
    nextLine.unit = {
      code: toNumericCatalogCode(unitItem.code),
      description: unitItem.name ?? line?.unit?.description ?? null,
      symbol: unitItem.shortName ?? line?.unit?.symbol ?? null
    };
  }

  const treatmentCode = line?.treatment?.code;
  let treatmentItem = findCatalogItem(catalogContext.treatments, treatmentCode, [String(treatmentCode || '').toUpperCase()]);
  if (!treatmentItem && String(treatmentCode || '').toUpperCase() === 'D1') {
    treatmentItem = catalogContext.treatments.find((item) => Number(item.code) === 51) || findCatalogItem(catalogContext.treatments, null, ['ATERRO', 'RCC']);
  }
  if (treatmentItem) {
    nextLine.treatment = {
      code: toNumericCatalogCode(treatmentItem.code),
      description: treatmentItem.name ?? line?.treatment?.description ?? null
    };
  }

  const classCode = line?.class?.code;
  let classItem = findCatalogItem(catalogContext.residueClasses, classCode, [String(classCode || '').toUpperCase()]);
  if (!classItem && String(classCode || '').toUpperCase() === 'I') {
    classItem = catalogContext.residueClasses.find((item) => Number(item.code) === 11) || findCatalogItem(catalogContext.residueClasses, null, ['CLASSE A']);
  }
  if (classItem) {
    nextLine.class = {
      code: toNumericCatalogCode(classItem.code),
      description: classItem.name ?? line?.class?.description ?? null
    };
  }

  const residueCode = line?.residue?.code;
  const residueItem = findCatalogItem(catalogContext.residueSearch, residueCode, [String(residueCode || '').toUpperCase()]);
  if (residueItem) {
    nextLine.residue = {
      code: toNumericCatalogCode(residueItem.code),
      ibamaCode: line?.residue?.ibamaCode ?? residueItem.shortName ?? null,
      description: line?.residue?.description ?? residueItem.name ?? null,
      groupDescription: line?.residue?.groupDescription ?? residueItem.group ?? null,
      groupRepresentation: line?.residue?.groupRepresentation ?? residueItem?.raw?.grrRepresentacao ?? null
    };
  }

  applyResidueCatalogDefaults(nextLine, defaults.defaultStateType, defaults.defaultPackagingType);
  enforceKnownRccCombination(nextLine, defaults.defaultStateType, defaults.defaultPackagingType);
  return nextLine;
}

function getRemoteStatus(error) {
  if (!(error instanceof AppError)) {
    return 0;
  }
  return Number(error.remoteStatus || error.statusCode || error.status || 0);
}

function isRetryableAttemptError(error, retryableStatuses = [401, 403, 404]) {
  const isGatewayError = error instanceof AppError && error.code === 'CETESB_HTTP_ERROR';
  const isAuthError = error instanceof AppError && error.code === 'CETESB_AUTH_FAILED';
  return isAuthError || (isGatewayError && retryableStatuses.includes(getRemoteStatus(error)));
}

function buildSubmitAttemptDefinitions(token, cookieHeader = null) {
  const cookieHeaders = cookieHeader ? { Cookie: cookieHeader } : {};
  return [
    {
      mode: 'authorization',
      args: {
        auth: false,
        headers: {
          ...cookieHeaders,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      }
    },
    {
      mode: 'both',
      args: { auth: true, token, headers: cookieHeaders }
    },
    {
      mode: 'x-access-token',
      args: {
        auth: false,
        headers: {
          ...cookieHeaders,
          ...(token ? { 'x-access-token': token } : {})
        }
      }
    },
    {
      mode: 'none',
      args: { auth: false, headers: cookieHeaders }
    }
  ];
}

function buildCancelAttemptDefinitions(token, cookieHeader = null) {
  const cookieHeaders = cookieHeader ? { Cookie: cookieHeader } : {};
  const contentType = { 'Content-Type': 'application/json;charset=UTF-8' };
  return [
    {
      mode: 'x-access-token',
      args: {
        auth: false,
        headers: {
          ...contentType,
          ...cookieHeaders,
          ...(token ? { 'x-access-token': token } : {})
        }
      }
    },
    {
      mode: 'authorization',
      args: {
        auth: false,
        headers: {
          ...contentType,
          ...cookieHeaders,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      }
    },
    {
      mode: 'both',
      args: {
        auth: true,
        token,
        headers: {
          ...contentType,
          ...cookieHeaders
        }
      }
    }
  ];
}

function buildHttpsRequestOptions(url, method, headers) {
  return {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method,
    headers,
    timeout: config.cetesbRequestTimeoutMs,
    rejectUnauthorized: true,
    checkServerIdentity
  };
}

function parseHttpsResponse({ res, buffer, responseType, method, path, attempt, maxAttempts, startedAt }) {
  const latencyMs = Date.now() - startedAt;
  const responseHeaders = res.headers;

  if (responseType === 'buffer') {
    return { statusCode: res.statusCode, headers: responseHeaders, data: buffer, latencyMs };
  }

  const text = buffer.toString('utf-8');
  const { data: jsonData, responseSnippet } = parseJsonPayload(text);
  if (text && jsonData == null && res.statusCode >= 200 && res.statusCode < 300) {
    throw createNonJsonResponseError({
      method,
      path,
      statusCode: res.statusCode,
      headers: responseHeaders,
      responseSnippet,
      attempt,
      maxAttempts
    });
  }

  return { statusCode: res.statusCode, headers: responseHeaders, data: jsonData, responseSnippet, latencyMs };
}

function performHttpsRequest({ url, method, requestHeaders, bodyStr, responseType, path, attempt, maxAttempts, startedAt }) {
  return new Promise((resolve, reject) => {
    const req = https.request(buildHttpsRequestOptions(url, method, requestHeaders), (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(parseHttpsResponse({
            res,
            buffer: Buffer.concat(chunks),
            responseType,
            method,
            path,
            attempt,
            maxAttempts,
            startedAt
          }));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${config.cetesbRequestTimeoutMs}ms`));
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function validateHttpsStatus({ statusCode, method, path, attempt, maxAttempts, responseHeaders, responseData, responseSnippet, responseType }) {
  if (statusCode === 401 || statusCode === 403) {
    throw new AppError(502, 'CETESB Authentication Error', `A CETESB retornou ${statusCode} para ${method} ${path}.`, {
      code: 'CETESB_AUTH_FAILED',
      remoteStatus: statusCode,
      attempt,
      maxAttempts
    });
  }

  if (statusCode >= 200 && statusCode < 300) {
    return;
  }

  const remoteDetail = buildRemoteFailureDetail(responseType, responseData, responseSnippet);
  throw new AppError(502, 'CETESB Gateway Error', `A CETESB retornou ${statusCode} para ${method} ${path}.${remoteDetail ? ` Resposta: ${remoteDetail}` : ''}`, {
    code: 'CETESB_HTTP_ERROR',
    remoteStatus: statusCode,
    attempt,
    maxAttempts,
    remoteBody: buildRemoteBodySnapshot(responseType, responseData, responseHeaders, responseSnippet)
  });
}

// Detalhe curto e legível da resposta remota para compor a mensagem de erro
// (vai para lastErrorMessage/DLQ): JSON usa `mensagem` da CETESB; HTML (ex.:
// página de erro do Tomcat) é despido de tags e truncado.
function buildRemoteFailureDetail(responseType, responseData, responseSnippet) {
  if (responseType === 'json' && responseData && typeof responseData.mensagem === 'string' && responseData.mensagem.trim()) {
    return responseData.mensagem.trim().slice(0, 220);
  }
  const snippet = typeof responseSnippet === 'string'
    ? responseSnippet.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  return snippet ? snippet.slice(0, 220) : '';
}

function buildGatewayExchange({ url, method, attempt, maxAttempts, requestHeaders, body, statusCode, responseHeaders, responseData, responseType, latencyMs }) {
  return {
    request: {
      endpoint: url.toString(),
      httpMethod: method,
      attempt,
      maxAttempts,
      sanitizedHeaders: sanitizeHeaders(requestHeaders),
      sanitizedBody: redactObject(body || {})
    },
    response: {
      endpoint: url.toString(),
      httpMethod: method,
      httpStatus: statusCode,
      latencyMs,
      attempt,
      maxAttempts,
      sanitizedHeaders: sanitizeHeaders(responseHeaders),
      sanitizedBody: responseType === 'json'
        ? redactObject(responseData)
        : { contentType: responseHeaders['content-type'] || null, size: responseData.length },
      data: responseData
    }
  };
}

function buildManifestItemKey(item) {
  const hash = String(item?.manHashCode || '').trim();
  if (hash) return `hash:${hash}`;

  const manCodigo = item?.manCodigo == null ? '' : String(item.manCodigo).trim();
  const manNumero = item?.manNumero == null ? '' : String(item.manNumero).trim();
  if (manCodigo || manNumero) {
    return `code:${manCodigo}|number:${manNumero}`;
  }

  return JSON.stringify(item || {});
}

function isCancelledManifestState(state) {
  const statusCode = Number(state?.simCodigo || 0);
  const statusText = String(state?.simDescricao || '').trim().toLowerCase();
  return statusCode === 4 || statusText.includes('cancel');
}

function buildCancelNotConfirmedError(lastKnownStatus = null) {
  const normalizedStatus = String(lastKnownStatus || '').trim();
  const detail = normalizedStatus
    ? `CETESB ainda não confirmou o cancelamento do manifesto. O status remoto continua "${normalizedStatus}".`
    : 'CETESB ainda não confirmou o cancelamento do manifesto.';

  return new AppError(503, 'Cancel Not Confirmed', detail, {
    code: 'MANIFEST_CANCEL_NOT_CONFIRMED'
  });
}

function isNotFoundGatewayError(error) {
  return error instanceof AppError && error.code === 'CETESB_HTTP_ERROR' && getRemoteStatus(error) === 404;
}

function isRefreshableSessionError(error) {
  return error instanceof AppError && (error.code === 'CETESB_AUTH_FAILED' || [401, 403].includes(getRemoteStatus(error)));
}

function isTransientManifestSearchError(error) {
  return error instanceof AppError
    && ['CETESB_RETRY_EXHAUSTED', 'CETESB_NETWORK_ERROR', 'CETESB_GATEWAY_ERROR'].includes(error.code);
}

function isServerGatewayError(error) {
  return error instanceof AppError && error.code === 'CETESB_HTTP_ERROR' && getRemoteStatus(error) >= 500;
}

async function executeRequestAttempt({ url, method, path, body, requestHeaders, bodyStr, responseType, attempt, maxAttempts }) {
  const startedAt = Date.now();
  const data = await performHttpsRequest({
    url,
    method,
    requestHeaders,
    bodyStr,
    responseType,
    path,
    attempt,
    maxAttempts,
    startedAt
  });

  const { statusCode, headers: responseHeaders, data: responseData, responseSnippet, latencyMs } = data;
  const shouldRetryStatus = isTransientHttpStatus(statusCode) && attempt < maxAttempts && (statusCode < 200 || statusCode >= 300);
  if (shouldRetryStatus) {
    return { retry: true };
  }

  validateHttpsStatus({
    statusCode,
    method,
    path,
    attempt,
    maxAttempts,
    responseHeaders,
    responseData,
    responseSnippet,
    responseType
  });

  return {
    retry: false,
    exchange: buildGatewayExchange({
      url,
      method,
      attempt,
      maxAttempts,
      requestHeaders,
      body,
      statusCode,
      responseHeaders,
      responseData,
      responseType,
      latencyMs
    })
  };
}

async function refreshSessionAfterError(gateway, sessionContext, error) {
  if (!isRefreshableSessionError(error) || !sessionContext?.id) {
    return { sessionContext, refreshed: false };
  }

  return {
    sessionContext: await gateway.ensureAuthForSession(sessionContext.id, { forceRefresh: true }),
    refreshed: true
  };
}

async function executeRawRequestWithRetries(context, attempt = 1) {
  try {
    const attemptResult = await executeRequestAttempt({ ...context, attempt, maxAttempts: context.maxAttempts });
    if (!attemptResult.retry) {
      return attemptResult.exchange;
    }
  } catch (error) {
    const transient = isTransientNetworkError(error);
    if (!transient || attempt >= context.maxAttempts) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, 'CETESB Gateway Error', `Falha de rede ao chamar CETESB para ${context.method} ${context.path}.`, {
        code: 'CETESB_NETWORK_ERROR',
        attempt,
        maxAttempts: context.maxAttempts,
        transient,
        cause: String(error?.message || error)
      });
    }
  }

  if (attempt >= context.maxAttempts) {
    throw new AppError(502, 'CETESB Gateway Error', `Não foi possível concluir ${context.method} ${context.path} na CETESB após ${context.maxAttempts} tentativas.`, {
      code: 'CETESB_RETRY_EXHAUSTED',
      maxAttempts: context.maxAttempts
    });
  }

  await sleep(calculateRetryBackoffMs(attempt));
  return executeRawRequestWithRetries(context, attempt + 1);
}

async function resolveCancelExternalReferenceRecursive(gateway, { manifest, sessionContext, externalReference, extraAudits, delays, attempt = 0 }) {
  if ((externalReference?.manCodigo && externalReference?.manNumero) || !manifest.externalHashCode || attempt >= delays.length) {
    return { activeSessionContext: sessionContext, externalReference, extraAudits };
  }

  try {
    const lookup = await gateway.lookupManifestByHash(manifest, sessionContext);
    if (lookup?.item) {
      if (lookup.exchange) extraAudits.push(lookup.exchange);
      return {
        activeSessionContext: sessionContext,
        externalReference: { manCodigo: lookup.item.manCodigo, manNumero: lookup.item.manNumero },
        extraAudits
      };
    }
  } catch (error) {
    const refreshed = await refreshSessionAfterError(gateway, sessionContext, error);
    if (refreshed.refreshed) {
      return resolveCancelExternalReferenceRecursive(gateway, {
        manifest,
        sessionContext: refreshed.sessionContext,
        externalReference,
        extraAudits,
        delays,
        attempt
      });
    }
    if (!isNotFoundGatewayError(error)) {
      throw error;
    }
  }

  if (attempt < (delays.length - 1)) {
    console.warn(`[cancelManifest] Lookup retornou 404 (tentativa ${attempt + 1}/${delays.length}), aguardando ${delays[attempt]}ms...`);
    await sleep(delays[attempt]);
  }

  return resolveCancelExternalReferenceRecursive(gateway, {
    manifest,
    sessionContext,
    externalReference,
    extraAudits,
    delays,
    attempt: attempt + 1
  });
}

async function verifyCancelledManifestByLookup(gateway, { manifest, sessionContext, externalReference, extraAudits, delays, lastKnownRemoteStatus = null, attempt = 0 }) {
  if (attempt >= delays.length) {
    throw buildCancelNotConfirmedError(lastKnownRemoteStatus);
  }

  try {
    const lookup = await gateway.lookupManifestByHash(manifest, sessionContext);
    if (lookup?.exchange) {
      extraAudits.push(lookup.exchange);
    }

    const lookupItem = lookup?.item || null;
    const nextStatus = lookupItem?.situacaoManifesto?.simDescricao || lastKnownRemoteStatus;
    if (lookupItem && isCancelledManifestState(lookupItem.situacaoManifesto)) {
      return { verifiedManifest: lookupItem, sessionContext };
    }

    if (attempt < (delays.length - 1)) {
      await sleep(delays[attempt]);
    }

    return verifyCancelledManifestByLookup(gateway, {
      manifest,
      sessionContext,
      externalReference,
      extraAudits,
      delays,
      lastKnownRemoteStatus: nextStatus,
      attempt: attempt + 1
    });
  } catch (error) {
    const refreshed = await refreshSessionAfterError(gateway, sessionContext, error);
    if (refreshed.refreshed) {
      return verifyCancelledManifestByLookup(gateway, {
        manifest,
        sessionContext: refreshed.sessionContext,
        externalReference,
        extraAudits,
        delays,
        lastKnownRemoteStatus,
        attempt
      });
    }
    if (!isNotFoundGatewayError(error)) {
      throw error;
    }

    if (attempt < (delays.length - 1)) {
      await sleep(delays[attempt]);
    }

    return verifyCancelledManifestByLookup(gateway, {
      manifest,
      sessionContext,
      externalReference,
      extraAudits,
      delays,
      lastKnownRemoteStatus,
      attempt: attempt + 1
    });
  }
}

async function executeManifestSearchWindowWithRecovery(gateway, context, window, state, options) {
  const execution = await gateway.executeManifestSearchWindow({
    effectivePartnerCode: context.effectivePartnerCode,
    stateCode: context.stateCode,
    tipoManifesto: context.tipoManifesto,
    dateFrom: window.dateFrom,
    dateTo: window.dateTo,
    statusFilter: context.effectiveStatusFilter,
    kindCandidates: context.kindCandidates,
    token: state.tokenForSearch,
    correlationId: options.correlationId
  });

  if (execution.exchange || !execution.lastError) {
    return { execution, state };
  }

  if (isNotFoundGatewayError(execution.lastError)) {
    return {
      execution,
      state: {
        ...state,
        skippedWindows: [...state.skippedWindows, { dateFrom: window.dateFrom, dateTo: window.dateTo, remoteStatus: getRemoteStatus(execution.lastError), reason: 'not-found' }]
      }
    };
  }

  const shouldRefresh = (isServerGatewayError(execution.lastError) || isTransientManifestSearchError(execution.lastError))
    && !options.jwtToken
    && !state.refreshedAfter500
    && Boolean(options.sessionContext?.id || options.sessionContextId);
  if (shouldRefresh) {
    const refreshed = await gateway.ensureAuthForSession(options.sessionContext?.id || options.sessionContextId, { forceRefresh: true });
    if (refreshed?.jwtToken) {
      return executeManifestSearchWindowWithRecovery(gateway, context, window, {
        ...state,
        tokenForSearch: refreshed.jwtToken,
        refreshedAfter500: true
      }, options);
    }
  }

  if (isServerGatewayError(execution.lastError) || isTransientManifestSearchError(execution.lastError)) {
    return {
      execution,
      state: {
        ...state,
        skippedWindows: [...state.skippedWindows, {
          dateFrom: window.dateFrom,
          dateTo: window.dateTo,
          remoteStatus: getRemoteStatus(execution.lastError) || null,
          reason: isTransientManifestSearchError(execution.lastError) ? 'transient-gateway-error' : 'server-error'
        }]
      }
    };
  }

  throw execution.lastError;
}

async function collectManifestSearchResultsRecursive(gateway, context, options, state, windowIndex = 0) {
  if (windowIndex >= context.dateWindows.length) {
    return state;
  }

  const window = context.dateWindows[windowIndex];
  const result = await executeManifestSearchWindowWithRecovery(gateway, context, window, state, options);
  const nextState = { ...result.state };

  if (result.execution.exchange) {
    const payload = unwrapApiBody(result.execution.exchange.response.data);
    const windowItems = payload?.objetoResposta || [];
    nextState.aggregatedItems = [...nextState.aggregatedItems, ...windowItems];
    nextState.auditWindows = [...nextState.auditWindows, {
      searchPath: result.execution.searchPath,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      kind: result.execution.effectiveKind,
      httpStatus: result.execution.exchange?.response?.httpStatus || 200,
      latencyMs: result.execution.exchange?.response?.latencyMs || null,
      resultCount: Array.isArray(windowItems) ? windowItems.length : 0
    }];
  }

  return collectManifestSearchResultsRecursive(gateway, context, options, nextState, windowIndex + 1);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function toPartnerPayload(partner = {}, { allowBlank = false } = {}) {
  if (!partner && allowBlank) {
    return createEmptyPartnerPayload();
  }
  if (!partner?.partnerCode && !allowBlank) {
    throw new AppError(400, 'Bad Request', 'partnerCode é obrigatório para envio do manifesto à CETESB.');
  }

  const address = partner?.address || {};
  return {
    parCodigo: partner?.partnerCode ? Number(partner.partnerCode) : null,
    parDescricao: partner?.description ?? '',
    parNomeFantasia: partner?.tradeName ?? '',
    parCadastroCetesb: partner?.registration ?? '',
    parComplemento: address.complement ?? '',
    parCnpj: partner?.document ?? '',
    parEndereco: address.street || buildPartnerAddressLine(address),  // ✅ Usar street diretamente se já veio de CETESB
    parNumeroEndereco: address.number ?? '',
    parBairro: address.district ?? '',
    parCep: address.postalCode ?? '',
    parUf: address.state ?? '',
    parCidade: address.city ?? '',
    parOrgaoEmissor: partner?.licenseIssuer || null,  // ✅ null ao invés de ""
    parLicenca: partner?.licenseNumber || null,       // ✅ null ao invés de ""
    spaCodigo: partner?.statusCode ?? 1,
    possuiPerfil: partner?.hasProfile ?? null
  };
}

function buildPartnerAddressLine(address = {}) {
  const parts = [address.street, address.postalCode, address.district].filter(Boolean);
  return parts.join(', ');
}

function createEmptyPartnerPayload() {
  return {
    parCodigo: null,
    parDescricao: '',
    parNomeFantasia: '',
    parCadastroCetesb: '',
    parComplemento: '',
    parCnpj: '',
    parEndereco: '',
    parNumeroEndereco: '',
    parBairro: '',
    parCep: '',
    parUf: '',
    parCidade: '',
    parOrgaoEmissor: '',
    parLicenca: '',
    spaCodigo: '',
    possuiPerfil: null
  };
}

function toResiduePayload(line = {}) {
  const marPesoTonelada = calculateResidueWeightTon(line);

  return {
    marCodigo: null,
    marQuantidade: line.quantity ?? null,
    marQuantidadeRecebida: line.receivedQuantity ?? null,
    marDensidade: line.density ?? null,
    marPesoTonelada: marPesoTonelada,
    marJustificativa: line.justification ?? null,
    marObservacao: line.notes ?? null,
    marCodigoInterno: line.internalCode ?? null,
    marNumeroONU: line.onuCode ?? null,
    marClasseRisco: line.riskClass ?? null,
    marNomeEmbarque: line.shipmentName ?? null,
    marCodigoInternoDestinador: line.receiverInternalCode ?? null,
    marCadriNumeroInformado: line.cadriNumber ?? null,
    marCadriColetivoNumeroInformado: line.collectiveCadriNumber ?? null,
    marParecerNumeroInformado: line.opinionNumber ?? null,
    marCadriItemInformado: line.cadriItemNumber ?? null,
    cadriID: line.cadriId ?? null,
    tipoCadriID: line.cadriTypeId ?? null,
    residuo: line.residue ? {
      ...buildResidueEntry(line)
    } : null,
    unidade: line.unit ? {
      uniCodigo: line.unit.code ?? null,
      uniDescricao: line.unit.description ?? null,
      uniSigla: line.unit.symbol ?? null
    } : null,
    tratamento: line.treatment ? {
      traCodigo: line.treatment.code ?? null,
      traDescricao: line.treatment.description ?? null
    } : null,
    classe: line.class ? {
      claCodigo: line.class.code ?? null,
      claDescricao: line.class.description ?? null
    } : null,
    abnt: line.abnt ? {
      abnCodigo: line.abnt.code ?? null,
      abnNumero: line.abnt.number ?? null,
      abnDescricao: line.abnt.description ?? null,
      abnDescricaoResumida: line.abnt.shortDescription ?? null,
      abnInteresse: line.abnt.interest ?? null
    } : { abnCodigo: null, abnNumero: null, abnDescricao: null, abnDescricaoResumida: null, abnInteresse: null },
    cadriItem: line.cadriItem ? {
      cdiCodigo: line.cadriItem.code ?? null,
      cadri: line.cadriItem.cadri ?? null,
      abnt: line.cadriItem.abnt ?? null,
      cdiNumero: line.cadriItem.number ?? null,
      cdiOrigem: line.cadriItem.origin ?? null,
      cdiQuantidade: line.cadriItem.quantity ?? null,
      cdiQuantidadeRestante: line.cadriItem.remainingQuantity ?? null,
      cdiDestino: line.cadriItem.destination ?? null,
      classe: line.cadriItem.class ?? null,
      tratamento: line.cadriItem.treatment ?? null
    } : { cdiCodigo: null, cadri: null, abnt: null, cdiNumero: null, cdiOrigem: null, cdiQuantidade: null, cdiQuantidadeRestante: null, cdiDestino: null, classe: null, tratamento: null },
    tipoEstado: line.stateType ? {
      tieCodigo: line.stateType.code ?? null,
      tieDescricao: line.stateType.description ?? null,
      tieCodigoReferencia: line.stateType.referenceCode ?? null
    } : null,
    tipoAcondicionamento: line.packagingType ? {
      tiaCodigo: line.packagingType.code ?? null,
      tiaDescricao: line.packagingType.description ?? null,
      tiaCodigoReferencia: line.packagingType.referenceCode ?? null
    } : null,
    grupoEmbalagem: line.packagingGroup ? {
      greCodigo: line.packagingGroup.code ?? null,
      greDescricao: line.packagingGroup.description ?? null
    } : { greCodigo: null, greDescricao: null }
  };
}

function mapManifestToCetesb(payload, sessionContext) {
  // Converter manifestType: I=1 (Interestadual), E=2 (Estadual), M=3 (Municipal)
  const manifestTypeMap = { I: 1, E: 2, M: 3 };
  const tipoManifesto = manifestTypeMap[payload.manifestType] || 1;
  
  return {
    manCodigo: payload.externalCode || null,
    manResponsavel: payload.responsibleName,
    manNumero: payload.manifestNumber || '',
    manDataExpedicao: normalizeExpeditionDate(payload.expeditionDate),
    manNomeMotorista: payload.driverName || '',
    manPlacaVeiculo: payload.vehiclePlate || '',
    manObservacao: payload.notes || '',
    manJustificativaCancelamento: '',
    manNomeMotoristaArmazenamentoTemporario: payload.temporaryStorageDriverName || '',
    manPlacaVeiculoArmazenamentoTemporario: payload.temporaryStorageVehiclePlate || '',
    manObservacaoArmazenadorTemporario: payload.temporaryStorageNotes || '',
    manDataRecebimentoArmazenamentoTemporario: payload.temporaryStorageReceivedAt || '',
    tipoManifesto: tipoManifesto,
    estado: {
      estCodigo: payload.state?.code,
      estAbreviacao: payload.state?.abbreviation
    },
    parceiroGerador: toPartnerPayload(payload.generator),
    parceiroTransportador: toPartnerPayload(payload.carrier),
    parceiroDestinador: toPartnerPayload(payload.receiver),
    possuiArmazenamentoTemporario: payload.hasTemporaryStorage === true,
    possuiCadriNaListaResiduo: payload.hasCadriInResidueList === true,
    parceiroArmazenadorTemporario: payload.hasTemporaryStorage ? toPartnerPayload(payload.temporaryStorage) : createEmptyPartnerPayload(),
    parceiroTransportadorArmazenadorTemporario: payload.hasTemporaryStorage ? toPartnerPayload(payload.temporaryStorageCarrier) : createEmptyPartnerPayload(),
    situacaoManifesto: { simCodigo: 1, simDescricao: 'SALVO', simOrdem: 1 },
    parceiroAcesso: {
      paaCodigo: sessionContext.userAccessCode ? Number(sessionContext.userAccessCode) : null,
      paaNome: sessionContext.userName || payload.responsibleName || null
    },
    listaManifestoResiduo: (payload.residues || []).map(toResiduePayload),
    // recaptchaToken é opcional - CETESB aceita string vazia via API backend
    recaptcha: payload.recaptchaToken || sessionContext.metadata?.recaptchaToken || ''
  };
}

function mapCadastroToCetesb(payload) {
  const enterprise = payload.enterprise || {};
  const address = payload.address || {};
  const primaryContact = payload.primaryContact || {};
  const responsibles = payload.responsibles || [];
  const first = responsibles[0] || {};
  const second = responsibles[1] || {};

  return {
    parCodigo: '',
    parDescricao: enterprise.legalName || '',
    parNomeFantasia: enterprise.tradeName || enterprise.legalName || '',
    parDataNascimento: '',
    parTipoPessoa: enterprise.personType || 'J',
    numeroPessoaJuridica: '',
    numVersaPessoJurdc: '',
    numUsuriCridr: '',
    origemCadastro: '',
    empreendimentoId: 0,
    numVersaEmprn: '',
    numSeqnc: '',
    numeroPessoaFisica: 0,
    numVersaPessoFisica: '',
    enderecoId: 0,
    nmuncp: '',
    nseqnc: '',
    nbacia: '',
    dbacia: '',
    nugrhi: '',
    dugrhi: '',
    nregnl: '',
    dregnl: '',
    benviacadunico: true,
    parceiroDocumento: { padCodigo: null, padArquivo: null },
    listaParceiroTipoParceiro: (enterprise.partnerTypes || []).map((type) => ({
      ptpCodigo: null,
      parCodigo: null,
      tpaCodigo: type.code ?? null,
      tpaDescricao: type.description ?? null
    })),
    spaCodigo: 1,
    spaDescricao: '',
    jurCodigo: '',
    jurCnpj: enterprise.personType === 'J' ? (enterprise.document || '') : '',
    fisCodigo: '',
    fisCpf: enterprise.personType === 'F' ? (enterprise.document || '') : '',
    paeCodigoEmail: '',
    paeDescricaoEmail: primaryContact.email || '',
    pafCodigo: '',
    pafNumero: primaryContact.phone || '',
    paeCodigoEndereco: '',
    paeCepNumero: address.postalCode || '',
    paeTipoLogradouro: address.streetType || '',
    paeLogradouro: address.street || '',
    paeNumero: address.number || '',
    paeBairro: address.district || '',
    paeLatitude: address.latitude == null ? '' : String(address.latitude),
    paeLongitude: address.longitude == null ? '' : String(address.longitude),
    paeComplemento: address.complement || '',
    estado: {
      estCodigo: address.stateCode || null,
      estAbreviacao: address.stateAbbreviation || null
    },
    cidade: {
      cidCodigo: address.cityCode || null,
      cidDescricao: address.cityName || null
    },
    paaCodigo: '',
    paaCpf: first.cpf || '',
    paaNome: first.name || '',
    paaEmail: first.email || '',
    paaCargo: first.role || '',
    paaCpf2: second.cpf || '',
    paaNome2: second.name || '',
    paaEmail2: second.email || '',
    paaCargo2: second.role || '',
    listaClasse: (payload.classes || []).map((item) => ({
      claCodigo: item.code ?? null,
      claDescricao: item.description ?? null
    })),
    possuiArmazenamentoTemporario: payload.hasTemporaryStorage === true,
    listaParceiroLicenca: payload.licenses || [],
    listaTransportadorClasse: [],
    listaPlacaTransportador: []
  };
}

function mapPartnerSearchItem(item, fallbackRole = null) {
  if (!item) return null;
  return {
    partnerCode: item.parCodigo ?? null,
    role: fallbackRole,
    description: item.parDescricao ?? '',
    tradeName: item.parNomeFantasia ?? null,
    document: item.parCnpj || item.fisCpf || null,
    registration: item.parCadastroCetesb ?? null,
    address: {
      street: item.parEndereco ?? null,
      number: item.parNumeroEndereco ?? null,
      complement: item.parComplemento ?? null,
      district: item.parBairro ?? null,
      postalCode: item.parCep ?? null,
      city: item.parCidade ?? null,
      state: item.parUf ?? null
    },
    licenseIssuer: item.parOrgaoEmissor ?? null,
    licenseNumber: item.parLicenca ?? null,
    statusCode: item.spaCodigo ?? null,
    hasProfile: item.possuiPerfil ?? null,
    raw: item
  };
}

function normalizeCatalogItems(items, mapper) {
  return (items || []).map(mapper).filter(Boolean);
}

function normalizeCatalogCode(value) {
  if (value == null || value === '') return null;
  return String(value);
}

function enrichResidueClassItems(items, residueSearchItems = [], classItems = []) {
  const residueByCode = new Map(
    (residueSearchItems || [])
      .filter((item) => normalizeCatalogCode(item?.code))
      .map((item) => [normalizeCatalogCode(item.code), item])
  );
  const classByCode = new Map(
    (classItems || [])
      .filter((item) => normalizeCatalogCode(item?.code))
      .map((item) => [normalizeCatalogCode(item.code), item])
  );

  return (items || []).map((item) => {
    const residueCode = normalizeCatalogCode(item?.resCodigo ?? item?.rclCodigo ?? item?.codigo);
    const classCode = normalizeCatalogCode(item?.claCodigo ?? item?.classCode);
    const residue = residueCode ? residueByCode.get(residueCode) : null;
    const residueClass = classCode ? classByCode.get(classCode) : null;
    const code = residueCode || classCode;

    if (!code) return null;

    const name =
      residue?.name ||
      item?.resDescricao ||
      item?.rclDescricao ||
      item?.claDescricao ||
      item?.descricao ||
      `Resíduo ${code}`;

    return {
      code,
      name,
      shortName: residue?.shortName || null,
      group: residueClass?.name || residue?.group || null,
      raw: {
        ...item,
        resCodigo: residueCode ? Number(residueCode) : item?.resCodigo ?? null,
        claCodigo: classCode ? Number(classCode) : item?.claCodigo ?? null,
        resDescricao: residue?.name || item?.resDescricao || null,
        claDescricao: residueClass?.name || item?.claDescricao || null,
        resCodigoIbama: residue?.shortName || item?.resCodigoIbama || null,
        grrDescricao: residue?.group || item?.grrDescricao || null
      }
    };
  }).filter(Boolean);
}

function buildResidueCatalogFromSearch(residueSearchItems = [], residueClassItems = []) {
  const relationByResidueCode = new Map(
    (residueClassItems || [])
      .map((item) => {
        const relationCode = normalizeCatalogCode(item?.raw?.resCodigo ?? item?.code);
        return relationCode ? [relationCode, item] : null;
      })
      .filter(Boolean)
  );

  return (residueSearchItems || []).map((item) => {
    const residueCode = normalizeCatalogCode(item?.code);
    if (!residueCode) return null;

    const relation = relationByResidueCode.get(residueCode);
    return {
      ...item,
      code: residueCode,
      group: relation?.group || item?.group || null,
      raw: {
        ...safeObjectSpread(item?.raw),
        resCodigo: item?.raw?.resCodigo ?? Number(residueCode),
        resDescricao: item?.name || item?.raw?.resDescricao || null,
        claCodigo: relation?.raw?.claCodigo ?? item?.raw?.claCodigo ?? null,
        claDescricao: relation?.raw?.claDescricao ?? null,
        resCodigoIbama: item?.shortName || item?.raw?.resCodigoIbama || null,
        grrDescricao: item?.group || item?.raw?.grrDescricao || null
      }
    };
  }).filter(Boolean);
}

function mapStates(item) { return { code: item.estCodigo, name: item.estDescricao || item.estNome || item.estAbreviacao, shortName: item.estAbreviacao, raw: item }; }
function mapCities(item) { return { code: item.cidCodigo, name: item.cidDescricao, shortName: item.cidDescricao, group: item.estCodigo ? String(item.estCodigo) : null, raw: item }; }
function mapPartnerTypes(item) { return { code: item.tpaCodigo, name: item.tpaDescricao, raw: item }; }
function mapClasses(item) { return { code: item.claCodigo, name: item.claDescricao, raw: item }; }
function mapIssuingAuthorities(item) { return { code: item.orgCodigo || item.oreCodigo || item.orgaoCodigo || item.estCodigo || item.codigo || item.descricao, name: item.orgDescricao || item.oreDescricao || item.descricao || item.nome, raw: item }; }
function mapUnits(item) { return { code: item.uniCodigo, name: item.uniDescricao, shortName: item.uniSigla, raw: item }; }
function mapResidueTreatments(item) { return { code: item.traCodigo, name: item.traDescricao, raw: item }; }
function mapResidueStates(item) { return { code: item.tieCodigo, name: item.tieDescricao, group: toOptionalGroup(item.tieCodigoReferencia), raw: item }; }
function mapPackagingGroups(item) { return { code: item.greCodigo, name: item.greDescricao, raw: item }; }
function mapResidueClasses(item) { return { code: item.rclCodigo || item.claCodigo || item.codigo, name: item.rclDescricao || item.claDescricao || item.descricao, raw: item }; }
function mapAbnt(item) { return { code: item.abnCodigo ?? item.codigo ?? item.abnNumero, name: item.abnDescricao || item.abnDescricaoResumida || item.descricao, shortName: item.abnNumero || item.abnDescricaoResumida || null, raw: item }; }
function mapResidueSearch(item) { return { code: item.resCodigo, name: item.resDescricao, shortName: item.resCodigoIbama || null, group: item.grrDescricao || null, raw: item }; }
function mapPackagingTypes(item) { return { code: item.tiaCodigo, name: item.tiaDescricao, group: toOptionalGroup(item.tiaCodigoReferencia), raw: item }; }

class RealCetesbGateway {
  resolveGatewayPartnerCode(options, sessionContext, integrationAccount, requiredField = 'partnerCode') {
    const resolved = firstDefined(
      options?.partnerCode,
      options?.parCodigo,
      sessionContext?.partnerCode,
      integrationAccount?.partner_code,
      null
    );

    if (resolved == null || resolved === '') {
      throw new AppError(400, 'Bad Request', `${requiredField} é obrigatório para esta operação CETESB.`);
    }

    return resolved;
  }

  resolveGatewayStateCode(options, sessionContext, integrationAccount) {
    return firstDefined(
      options?.stateCode,
      options?.estCodigo,
      sessionContext?.metadata?.stateCode,
      integrationAccount?.state_code,
      config.cetesbDefaultStateCode,
      26
    );
  }

  async resolveAuthenticatedOperationContext(options = {}, { requirePartnerCode = false, partnerFieldName = 'partnerCode' } = {}) {
    const { sessionContext, integrationAccount } = await this.resolveSession({
      sessionContextId: options.sessionContextId || null,
      integrationAccountId: options.integrationAccountId || null,
      requireAuth: true
    });

    if (!sessionContext?.jwtToken) {
      throw new AppError(400, 'Bad Request', 'Nenhum token válido disponível para a operação autenticada da CETESB.');
    }

    return {
      sessionContext,
      integrationAccount,
      partnerCode: requirePartnerCode
        ? this.resolveGatewayPartnerCode(options, sessionContext, integrationAccount, partnerFieldName)
        : firstDefined(options?.partnerCode, options?.parCodigo, sessionContext?.partnerCode, integrationAccount?.partner_code, null),
      stateCode: this.resolveGatewayStateCode(options, sessionContext, integrationAccount)
    };
  }

  async executeAuthenticatedJsonOperation({ options = {}, method, path, body = undefined, auditPath, dataBuilder }) {
    const { sessionContext, integrationAccount, partnerCode, stateCode } = await this.resolveAuthenticatedOperationContext(options);
    const { exchange, sessionContext: activeSessionContext } = await this.runWithSessionRefresh(
      sessionContext,
      (token) => this.requestJson({
        method,
        path,
        body,
        auth: true,
        token,
        correlationId: options.correlationId || null
      })
    );

    const envelope = unwrapApiBody(exchange.response.data);
    return {
      exchange: buildJsonOperationExchange({
        exchange,
        auditPath,
        requestBody: body,
        envelope,
        data: dataBuilder(envelope, {
          sessionContext: activeSessionContext,
          integrationAccount,
          partnerCode,
          stateCode
        })
      }),
      envelope,
      sessionContext: activeSessionContext,
      integrationAccount,
      partnerCode,
      stateCode
    };
  }

  async executeAuthenticatedBufferOperation({ options = {}, method, path, auditPath, requestBody = undefined }) {
    const { sessionContext } = await this.resolveAuthenticatedOperationContext(options);
    const { exchange } = await this.runWithSessionRefresh(
      sessionContext,
      (token) => this.requestBuffer({
        method,
        path,
        auth: true,
        token,
        correlationId: options.correlationId || null
      })
    );

    return buildBufferOperationExchange({
      exchange,
      auditPath,
      requestBody
    });
  }

  async executeManifestSearchWindow({
    effectivePartnerCode,
    stateCode,
    tipoManifesto,
    dateFrom,
    dateTo,
    statusFilter,
    kindCandidates,
    token,
    correlationId
  }) {
    let exchange = null;
    let searchPath = '';
    let effectiveKind = String(kindCandidates?.[0] || 'all');
    let lastError = null;

    for (let index = 0; index < kindCandidates.length; index += 1) {
      const candidateKind = kindCandidates[index];
      const candidatePath = `/api/mtr/pesquisaManifesto/${effectivePartnerCode}/${stateCode}/${tipoManifesto}/${dateFrom}/${dateTo}/${statusFilter}/${candidateKind}`;

      try {
        exchange = await this.requestJson({
          method: 'GET',
          path: candidatePath,
          auth: true,
          token,
          correlationId
        });

        searchPath = candidatePath;
        effectiveKind = candidateKind;
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const is500 = error instanceof AppError && error.code === 'CETESB_HTTP_ERROR' && Number(error.remoteStatus || 0) === 500;
        const hasNextCandidate = index < (kindCandidates.length - 1);
        if (is500 && hasNextCandidate) {
          continue;
        }

        break;
      }
    }

    return {
      exchange,
      searchPath,
      effectiveKind,
      lastError
    };
  }

  async bootstrapSession(input) {
    if (input?.jwtToken) {
      return { token: input.jwtToken, expiresAt: input.expiresAt || getJwtExpirationIso(input.jwtToken), authPayload: { token: input.jwtToken, partnerCode: input.partnerCode || null, userAccessCode: input.userAccessCode || null, userName: input.userName || null, email: input.email || null } };
    }
    const metadata = input?.metadata || {};
    const credentials = metadata.credentials || {};
    // recaptcha é opcional - CETESB aceita string vazia via API backend
    const recaptcha = String(metadata.recaptchaToken || input.recaptchaToken || '');
    const password = credentials.password || metadata.password || input.password || null;
    const login = credentials.login || metadata.login || input.partnerDocument || null;
    const email = credentials.email || metadata.email || input.email || null;
    const partnerCode = input.partnerCode || metadata.partnerCode || null;
    const system = Number(metadata.system ?? input.system ?? 0);
    if (!partnerCode || !login || !email || !password) {
      throw new AppError(400, 'Bad Request', 'Para bootstrap/refresh de sessão real é obrigatório informar partnerCode, login, email e senha no metadata.');
    }
    const exchange = await this.requestJson({ method: 'POST', path: '/api/mtr/carregaDadosLogin', body: { sistema: system, login, email, senha: password, parCodigo: partnerCode, recaptcha } });
    const auth = unwrapApiBody(exchange.response.data)?.objetoResposta;
    if (!auth?.token) {
      throw new AppError(502, 'CETESB Authentication Error', 'A CETESB não retornou token no login.', { code: 'CETESB_AUTH_NO_TOKEN' });
    }
    const setCookieHeader = exchange?.response?.sanitizedHeaders?.['set-cookie'] || exchange?.response?.sanitizedHeaders?.['Set-Cookie'] || null;
    const cookieHeader = buildCookieHeader(setCookieHeader);
    return {
      exchange,
      token: auth.token,
      expiresAt: getJwtExpirationIso(auth.token),
      authPayload: {
        ...auth,
        cookieHeader
      },
      metadata: {
        at: nowIso(),
        request: {
          attempt: exchange.response?.attempt || 1,
          maxAttempts: exchange.response?.maxAttempts || 1
        }
      }
    };
  }

  async enrichPartnerData(manifestPayload, sessionContext) {
    const enrichedPayload = { ...manifestPayload };
    
    // Buscar dados completos dos parceiros informados
    const partnerCodes = [
      manifestPayload.generator?.partnerCode,
      manifestPayload.carrier?.partnerCode,
      manifestPayload.receiver?.partnerCode,
      manifestPayload.temporaryStorage?.partnerCode,
      manifestPayload.temporaryStorageCarrier?.partnerCode
    ].filter(Boolean);
    
    // Deduplicate
    const uniqueCodes = [...new Set(partnerCodes)];
    
    // Buscar todos os parceiros em paralelo
    const partnerCache = {};
    await Promise.all(uniqueCodes.map(async (code) => {
      try {
        const exchange = await this.requestJson({ 
          method: 'GET', 
          path: `/api/mtr/pesquisaParceiroByCodigo/${code}`, 
          auth: true,  // ✅ CORREÇÃO: Endpoint exige autenticação
          token: sessionContext?.jwtToken 
        });
        const payload = unwrapApiBody(exchange.response.data);
        const items = payload?.objetoResposta || [];
        if (items.length > 0) {
          partnerCache[code] = mapPartnerSearchItem(items[0]);
        }
      } catch (error) {
        console.warn(`[enrichPartnerData] Não foi possível buscar dados do parceiro ${code}:`, error.message);
      }
    }));
    
    // Enriquecer cada parceiro no payload
    // IMPORTANTE: Usar dados brutos da CETESB (raw) para evitar duplicação de endereço
    if (enrichedPayload.generator?.partnerCode && partnerCache[enrichedPayload.generator.partnerCode]) {
      const rawData = partnerCache[enrichedPayload.generator.partnerCode].raw;
      enrichedPayload.generator = {
        partnerCode: rawData.parCodigo,
        description: rawData.parDescricao || '',
        tradeName: rawData.parNomeFantasia || '',
        document: rawData.parCnpj || rawData.fisCpf || '',
        registration: rawData.parCadastroCetesb || '',
        // Usar campos de endereço diretamente do raw (já em formato CETESB)
        address: {
          street: rawData.parEndereco,  // JÁ vem completo da CETESB
          number: rawData.parNumeroEndereco || '',
          complement: rawData.parComplemento || '',
          district: rawData.parBairro || '',
          postalCode: rawData.parCep || '',
          city: rawData.parCidade || '',
          state: rawData.parUf || ''
        },
        licenseIssuer: rawData.parOrgaoEmissor,
        licenseNumber: rawData.parLicenca,
        statusCode: rawData.spaCodigo,
        hasProfile: rawData.possuiPerfil
      };
    }
    if (enrichedPayload.carrier?.partnerCode && partnerCache[enrichedPayload.carrier.partnerCode]) {
      const rawData = partnerCache[enrichedPayload.carrier.partnerCode].raw;
      enrichedPayload.carrier = {
        partnerCode: rawData.parCodigo,
        description: rawData.parDescricao || '',
        tradeName: rawData.parNomeFantasia || '',
        document: rawData.parCnpj || rawData.fisCpf || '',
        registration: rawData.parCadastroCetesb || '',
        address: {
          street: rawData.parEndereco,
          number: rawData.parNumeroEndereco || '',
          complement: rawData.parComplemento || '',
          district: rawData.parBairro || '',
          postalCode: rawData.parCep || '',
          city: rawData.parCidade || '',
          state: rawData.parUf || ''
        },
        licenseIssuer: rawData.parOrgaoEmissor,
        licenseNumber: rawData.parLicenca,
        statusCode: rawData.spaCodigo,
        hasProfile: rawData.possuiPerfil
      };
    }
    if (enrichedPayload.receiver?.partnerCode && partnerCache[enrichedPayload.receiver.partnerCode]) {
      const rawData = partnerCache[enrichedPayload.receiver.partnerCode].raw;
      enrichedPayload.receiver = {
        partnerCode: rawData.parCodigo,
        description: rawData.parDescricao || '',
        tradeName: rawData.parNomeFantasia || '',
        document: rawData.parCnpj || rawData.fisCpf || '',
        registration: rawData.parCadastroCetesb || '',
        address: {
          street: rawData.parEndereco,
          number: rawData.parNumeroEndereco || '',
          complement: rawData.parComplemento || '',
          district: rawData.parBairro || '',
          postalCode: rawData.parCep || '',
          city: rawData.parCidade || '',
          state: rawData.parUf || ''
        },
        licenseIssuer: rawData.parOrgaoEmissor,
        licenseNumber: rawData.parLicenca,
        statusCode: rawData.spaCodigo,
        hasProfile: rawData.possuiPerfil
      };
    }
    if (enrichedPayload.temporaryStorage?.partnerCode && partnerCache[enrichedPayload.temporaryStorage.partnerCode]) {
      const rawData = partnerCache[enrichedPayload.temporaryStorage.partnerCode].raw;
      enrichedPayload.temporaryStorage = {
        partnerCode: rawData.parCodigo,
        description: rawData.parDescricao || '',
        tradeName: rawData.parNomeFantasia || '',
        document: rawData.parCnpj || rawData.fisCpf || '',
        registration: rawData.parCadastroCetesb || '',
        address: {
          street: rawData.parEndereco,
          number: rawData.parNumeroEndereco || '',
          complement: rawData.parComplemento || '',
          district: rawData.parBairro || '',
          postalCode: rawData.parCep || '',
          city: rawData.parCidade || '',
          state: rawData.parUf || ''
        },
        licenseIssuer: rawData.parOrgaoEmissor,
        licenseNumber: rawData.parLicenca,
        statusCode: rawData.spaCodigo,
        hasProfile: rawData.possuiPerfil
      };
    }
    if (enrichedPayload.temporaryStorageCarrier?.partnerCode && partnerCache[enrichedPayload.temporaryStorageCarrier.partnerCode]) {
      const rawData = partnerCache[enrichedPayload.temporaryStorageCarrier.partnerCode].raw;
      enrichedPayload.temporaryStorageCarrier = {
        partnerCode: rawData.parCodigo,
        description: rawData.parDescricao || '',
        tradeName: rawData.parNomeFantasia || '',
        document: rawData.parCnpj || rawData.fisCpf || '',
        registration: rawData.parCadastroCetesb || '',
        address: {
          street: rawData.parEndereco,
          number: rawData.parNumeroEndereco || '',
          complement: rawData.parComplemento || '',
          district: rawData.parBairro || '',
          postalCode: rawData.parCep || '',
          city: rawData.parCidade || '',
          state: rawData.parUf || ''
        },
        licenseIssuer: rawData.parOrgaoEmissor,
        licenseNumber: rawData.parLicenca,
        statusCode: rawData.spaCodigo,
        hasProfile: rawData.possuiPerfil
      };
    }
    
    return enrichedPayload;
  }

  async enrichResidueData(manifestPayload, sessionContext) {
    const enrichedPayload = { ...manifestPayload };
    const residues = Array.isArray(manifestPayload?.residues) ? manifestPayload.residues : [];
    if (!residues.length) {
      return enrichedPayload;
    }

    const catalogs = await this.fetchCatalogs(
      ['units', 'residueTreatments', 'residueClasses', 'residueStates', 'packagingTypes', 'residueSearch'],
      {
        sessionContextId: sessionContext?.id || null,
        integrationAccountId: sessionContext?.integrationAccountId || null,
        correlationId: sessionContext?.correlationId || null
      }
    );

    const byName = Object.fromEntries(catalogs.map((entry) => [entry.name, entry.items || []]));
    const catalogContext = buildCatalogContext(byName);
    const defaults = {
      defaultStateType: findCatalogItem(catalogContext.residueStates, '4', ['SOLIDO']),
      defaultPackagingType: findCatalogItem(catalogContext.packagingTypes, '4', ['CAÇAMBA ABERTA', 'CACAMBA ABERTA'])
    };

    enrichedPayload.residues = residues.map((line) => enrichResidueLine(line, catalogContext, defaults));

    return enrichedPayload;
  }

  async resolveManifestPartnerAccess(manifestPayload, sessionContext) {
    const fallback = {
      paaCodigo: sessionContext?.userAccessCode ? Number(sessionContext.userAccessCode) : null,
      paaNome: sessionContext?.userName || manifestPayload?.responsibleName || null
    };

    const generatorCode = Number(manifestPayload?.generator?.partnerCode || sessionContext?.partnerCode || 0);
    if (!Number.isFinite(generatorCode) || generatorCode <= 0) {
      return fallback;
    }

    try {
      const exchange = await this.requestJson({
        method: 'GET',
        path: `/api/mtr/manifesto/listaResponsavelRecebimento/${generatorCode}`,
        auth: true,
        token: sessionContext?.jwtToken
      });

      const payload = unwrapApiBody(exchange.response.data);
      const entries = extractApiItems(payload);

      if (!entries.length) {
        return fallback;
      }

      const normalizedFallbackCode = fallback.paaCodigo ? Number(fallback.paaCodigo) : null;
      const exact = normalizedFallbackCode
        ? entries.find((item) => Number(item?.paaCodigo) === normalizedFallbackCode)
        : null;
      const chosen = exact || entries[0] || null;

      return {
        paaCodigo: chosen?.paaCodigo ? Number(chosen.paaCodigo) : fallback.paaCodigo,
        paaNome: chosen?.paaNome || fallback.paaNome
      };
    } catch {
      return fallback;
    }
  }

  /**
   * Resolve a senha para renovar a sessao CETESB. Por seguranca a senha NAO e
   * persistida em texto plano no contexto de sessao; quando ausente, e re-derivada
   * da conta CETESB (fonte unica, cifrada em repouso) via metadata.accountId.
   */
  async resolveSessionRefreshPassword(sessionContext) {
    const metadata = sessionContext?.metadata || {};
    const credentials = metadata.credentials || {};
    const direct = credentials.password || metadata.password;
    if (direct) return String(direct);
    const accountId = typeof metadata.accountId === 'string' ? metadata.accountId.trim() : '';
    if (!accountId || !config.sicatCetesbPasswordSecret) return null;
    try {
      const account = await findSicatCetesbAccountById(accountId);
      if (!account?.cetesbPasswordCiphertext || !account.cetesbPasswordIv || !account.cetesbPasswordTag) {
        return null;
      }
      return decryptSecret(
        {
          ciphertext: account.cetesbPasswordCiphertext,
          iv: account.cetesbPasswordIv,
          tag: account.cetesbPasswordTag
        },
        { secret: config.sicatCetesbPasswordSecret }
      );
    } catch {
      return null;
    }
  }

  async ensureAuthForSession(sessionContextId, { forceRefresh = false } = {}) {
    if (!sessionContextId) throw new AppError(400, 'Bad Request', 'sessionContextId é obrigatório para operações autenticadas na CETESB.');
    const sessionContext = await findSessionContextById(sessionContextId);
    if (!sessionContext) throw new AppError(404, 'Not Found', `Session context ${sessionContextId} não encontrado.`);
    if (!forceRefresh && sessionContext.jwtToken && !isJwtExpiring(sessionContext.jwtToken, config.cetesbTokenRefreshSkewSeconds)) return sessionContext;

    const metadata = sessionContext.metadata || {};
    const credentials = metadata.credentials || {};
    const refreshPassword = await this.resolveSessionRefreshPassword(sessionContext);
    const hasBootstrapCredentials =
      Boolean(sessionContext.partnerCode || metadata.partnerCode)
      && Boolean(sessionContext.partnerDocument)
      && Boolean(sessionContext.email || metadata.email || credentials.email)
      && Boolean(refreshPassword);

    if (!hasBootstrapCredentials) {
      if (sessionContext.jwtToken && !isJwtExpiring(sessionContext.jwtToken, 0)) {
        return sessionContext;
      }

      throw new AppError(
        400,
        'Bad Request',
        'Session context sem credenciais suficientes para renovar token CETESB (partnerCode, login/documento, email e senha).',
        { code: 'SESSION_CONTEXT_REFRESH_CREDENTIALS_MISSING' }
      );
    }

    const boot = await this.bootstrapSession({
      ...sessionContext,
      password: refreshPassword,
      metadata: {
        ...metadata,
        credentials: { ...credentials, password: refreshPassword }
      },
      jwtToken: null,
      expiresAt: null
    });
    const refreshedAt = nowIso();
    return updateSessionContext(sessionContextId, {
      status: 'active',
      jwtToken: boot.token,
      expiresAt: boot.expiresAt,
      lastValidatedAt: refreshedAt,
      partnerCode: boot.authPayload?.parCodigo ?? sessionContext.partnerCode,
      userAccessCode: boot.authPayload?.paaCodigo ?? sessionContext.userAccessCode,
      userName: boot.authPayload?.paaNome ?? sessionContext.userName,
      email: boot.authPayload?.email ?? sessionContext.email,
      metadata: {
        ...safeObjectSpread(sessionContext.metadata),
        cookieHeader: boot.authPayload?.cookieHeader || sessionContext.metadata?.cookieHeader || null,
        lastBootstrapAt: refreshedAt,
        lastBootstrapTrace: {
          at: refreshedAt,
          forceRefresh,
          request: {
            attempt: boot.metadata?.request?.attempt || 1,
            maxAttempts: boot.metadata?.request?.maxAttempts || 1
          }
        }
      }
    });
  }

  async requestRaw({ method, path, body, token, responseType = 'json', headers = {}, auth = false, correlationId = null }) {
    const url = new URL(path, config.cetesbBaseUrl);
    const requestHeaders = { ...defaultHeaders(), ...headers };
    if (body != null && !requestHeaders['Content-Type'] && !requestHeaders['content-type']) requestHeaders['Content-Type'] = 'application/json';
    const hasCorrelationHeader = Object.keys(requestHeaders).some((name) => name.toLowerCase() === 'x-correlation-id');
    if (correlationId && !hasCorrelationHeader) requestHeaders['X-Correlation-Id'] = String(correlationId);
    if (auth && token) {
      if (config.cetesbTokenHeaderMode === 'x-access-token' || config.cetesbTokenHeaderMode === 'both') requestHeaders['x-access-token'] = token;
      if (config.cetesbTokenHeaderMode === 'authorization' || config.cetesbTokenHeaderMode === 'both') requestHeaders.Authorization = `Bearer ${token}`;
    }
    const maxAttempts = asPositiveInt(config.cetesbRetryAttempts, 1);
    const bodyStr = body == null ? null : JSON.stringify(body);
    if (bodyStr) requestHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    return executeRawRequestWithRetries({
      url,
      method,
      path,
      body,
      requestHeaders,
      bodyStr,
      responseType,
      maxAttempts
    });
  }
  async requestJson(args) { return this.requestRaw({ ...args, responseType: 'json' }); }
  async requestBuffer(args) { return this.requestRaw({ ...args, responseType: 'buffer' }); }

  async resolveSession({ sessionContextId, integrationAccountId, requireAuth = true }) {
    if (sessionContextId) {
      const scx = requireAuth ? await this.ensureAuthForSession(sessionContextId) : await findSessionContextById(sessionContextId);
      return { sessionContext: scx, integrationAccount: scx?.integrationAccountId ? await findIntegrationAccountById(scx.integrationAccountId) : null };
    }
    if (integrationAccountId) {
      const scx = await findLatestActiveSessionContextByIntegrationAccount(integrationAccountId);
      if (scx) {
        const ensured = requireAuth ? await this.ensureAuthForSession(scx.id) : scx;
        return { sessionContext: ensured, integrationAccount: await findIntegrationAccountById(integrationAccountId) };
      }
      return { sessionContext: null, integrationAccount: await findIntegrationAccountById(integrationAccountId) };
    }
    return { sessionContext: null, integrationAccount: null };
  }

  async lookupManifestByHash(manifest, sessionContext) {
    const payload = manifest.payload || {};
    const metadata = sessionContext?.metadata || {};
    const integrationAccount = manifest.integrationAccountId ? await findIntegrationAccountById(manifest.integrationAccountId) : null;
    const partnerCode = sessionContext?.partnerCode || integrationAccount?.partner_code || payload.generator?.partnerCode;
    const stateCode = metadata.stateCode || integrationAccount?.state_code || payload.state?.code || 26;
    const tipoManifesto = metadata.manifestSearch?.tipoManifesto ?? 8; // Tipo de manifesto (8 = todos?)
    const statusFilter = metadata.manifestSearch?.statusFilter ?? config.cetesbManifestSearchStatusFilter; // Status (0 = todos)
    const kind = metadata.manifestSearch?.kind ?? 'all';
    const normalizedKind = String(kind || 'all').trim() || 'all';
    const kindCandidates = normalizedKind.toLowerCase() === 'all'
      ? [normalizedKind, '0']
      : [normalizedKind];
    const expeditionDate = payload.expeditionDate ? new Date(`${payload.expeditionDate}T00:00:00Z`) : new Date();
    const daysBack = Number(metadata.manifestSearch?.daysBack ?? config.cetesbManifestSearchDaysBack);
    const dateFrom = formatDateBr(addDays(expeditionDate, -Math.abs(daysBack)));
    const dateTo = formatDateBr(expeditionDate); // Sem +1 dia - usar mesma data

    let exchange;
    for (let index = 0; index < kindCandidates.length; index += 1) {
      const candidateKind = kindCandidates[index];
      const candidatePath = `/api/mtr/pesquisaManifesto/${partnerCode}/${stateCode}/${tipoManifesto}/${dateFrom}/${dateTo}/${statusFilter}/${candidateKind}`;

      try {
        exchange = await this.requestJson({
          method: 'GET',
          path: candidatePath,
          auth: true,
          token: sessionContext?.jwtToken
        });
        break;
      } catch (error) {
        const is500 = error instanceof AppError && error.code === 'CETESB_HTTP_ERROR' && Number(error.remoteStatus || 0) === 500;
        const hasNextCandidate = index < (kindCandidates.length - 1);
        if (is500 && hasNextCandidate) {
          continue;
        }
        throw error;
      }
    }

    if (!exchange) {
      return { exchange: null, item: null };
    }

    const items = unwrapApiBody(exchange.response.data)?.objetoResposta || [];
    const match = items.find((item) => item.manHashCode === manifest.externalHashCode || item.manHashCode === exchange.response.data?.mensagem);
    return { exchange, item: match || null };
  }

  async executeAttemptSequence({ logPrefix, attempts, requestFactory }) {
    let lastError = null;

    for (const attempt of attempts) {
      try {
        const exchange = await requestFactory(attempt);
        if (logPrefix) {
          console.log(`[${logPrefix}] Sucesso com auth mode: ${attempt.mode}`);
        }
        return exchange;
      } catch (error) {
        lastError = error;
        if (logPrefix) {
          console.warn(`[${logPrefix}] Falha com auth mode ${attempt.mode}: status=${getRemoteStatus(error) || 'n/a'} code=${error?.code || 'n/a'}`);
        }
        if (!isRetryableAttemptError(error)) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  async runWithSessionRefresh(sessionContext, requestRunner) {
    try {
      return {
        exchange: await requestRunner(sessionContext?.jwtToken || null, sessionContext?.metadata?.cookieHeader || null),
        sessionContext
      };
    } catch (error) {
      const shouldRefreshSession = error instanceof AppError
        && (error.code === 'CETESB_AUTH_FAILED' || [401, 403].includes(getRemoteStatus(error)));
      if (!shouldRefreshSession || !sessionContext?.id) {
        throw error;
      }

      const refreshed = await this.ensureAuthForSession(sessionContext.id, { forceRefresh: true });
      return {
        exchange: await requestRunner(refreshed?.jwtToken || null, refreshed?.metadata?.cookieHeader || null),
        sessionContext: refreshed
      };
    }
  }

  async executeSubmitManifestRequest(cetesbPayload, token, cookieHeader = null) {
    return this.executeAttemptSequence({
      logPrefix: 'submitManifest',
      attempts: buildSubmitAttemptDefinitions(token, cookieHeader),
      requestFactory: (attempt) => this.requestJson({
        method: 'PUT',
        path: '/api/mtr/manifesto',
        body: cetesbPayload,
        ...attempt.args
      })
    });
  }

  buildSubmitManifestResponse(exchange, manifest, payload, manifestLookup, externalHashCode) {
    const resolved = manifestLookup?.item;
    return {
      ...exchange,
      response: {
        ...exchange.response,
        sanitizedBody: {
          ...exchange.response.sanitizedBody,
          resolvedManifest: resolved
            ? redactObject({
              manCodigo: resolved.manCodigo,
              manNumero: resolved.manNumero,
              manHashCode: resolved.manHashCode,
              situacaoManifesto: resolved.situacaoManifesto
            })
            : null
        },
        data: {
          manHashCode: externalHashCode,
          manCodigo: resolved?.manCodigo ?? manifest.externalReference?.manCodigo ?? null,
          manNumero: resolved?.manNumero ?? manifest.externalReference?.manNumero ?? null,
          simDescricao: resolved?.situacaoManifesto?.simDescricao || (payload?.validateOnly ? 'validado' : 'salvo')
        }
      },
      extraAudits: manifestLookup ? [manifestLookup.exchange] : []
    };
  }

  async submitManifest(manifest, payload) {
    const { sessionContext } = await this.resolveSession({
      sessionContextId: payload?.sessionContextId || manifest.sessionContextId,
      integrationAccountId: manifest.integrationAccountId,
      requireAuth: true
    });
    if (!sessionContext?.jwtToken) throw new AppError(400, 'Bad Request', 'Nenhum token válido disponível para o manifesto. Crie ou atualize o session context.');

    validateManifestPayload(manifest.payload, sessionContext);
    const enrichedPayload = await this.enrichPartnerData(manifest.payload, sessionContext);
    const enrichedResiduesPayload = await this.enrichResidueData(enrichedPayload, sessionContext);
    const partnerAccess = await this.resolveManifestPartnerAccess(enrichedResiduesPayload, sessionContext);
    const cetesbPayload = mapManifestToCetesb(enrichedResiduesPayload, {
      ...sessionContext,
      userAccessCode: partnerAccess.paaCodigo ?? sessionContext?.userAccessCode ?? null,
      userName: partnerAccess.paaNome || sessionContext?.userName || enrichedResiduesPayload?.responsibleName || null
    });

    // Hook controlado para o bloco MTR provisório (ver seção `submitMtrProvisorio`).
    // O override de `tipoManifesto` é lido de `manifest.tipoManifestoOverride` e nunca
    // de `manifest.payload`, para não vazar a sobrecarga ao validador de payload.
    // R3 (sobrecarga `tipoManifesto`) deve ser fechado pela fase 04 — ver
    // docs/handoffs/mtr-provisorio-fluxo-base/02-source-validation.md §2.5.
    const tipoManifestoOverride = manifest?.tipoManifestoOverride;
    if (tipoManifestoOverride !== undefined && tipoManifestoOverride !== null) {
      cetesbPayload.tipoManifesto = tipoManifestoOverride;
    }

    console.log('[DEBUG submitManifest] Payload CETESB:', JSON.stringify(cetesbPayload, null, 2));

    const { exchange } = await this.runWithSessionRefresh(
      sessionContext,
      (token, cookieHeader) => this.executeSubmitManifestRequest(cetesbPayload, token, cookieHeader)
    );

    const body = unwrapApiBody(exchange.response.data);
    const externalHashCode = body?.mensagem || null;
    let manifestLookup = null;
    if (externalHashCode) {
      manifest.externalHashCode = externalHashCode;
      try {
        manifestLookup = await this.lookupManifestByHash(manifest, sessionContext);
      } catch (error) {
        const isLookupNotFound = error instanceof AppError && error.code === 'CETESB_HTTP_ERROR' && error.remoteStatus === 404;
        if (!isLookupNotFound) throw error;
      }
    }

    return this.buildSubmitManifestResponse(exchange, manifest, payload, manifestLookup, externalHashCode);
  }

  async printManifest(manifest) {
    const { sessionContext } = await this.resolveSession({ sessionContextId: manifest.sessionContextId, integrationAccountId: manifest.integrationAccountId, requireAuth: true });
    if (!manifest.externalHashCode) throw new AppError(400, 'Bad Request', 'Manifesto sem hash externo para impressão.');
    const exchange = await this.requestBuffer({ method: 'GET', path: `/api/mtr/imprimir/imprimeManifesto/${manifest.externalHashCode}`, auth: true, token: sessionContext?.jwtToken });
    return { ...exchange, response: { ...exchange.response, data: { pdfBuffer: exchange.response.data } } };
  }

  async resolveCancelExternalReference(manifest, sessionContext) {
    return resolveCancelExternalReferenceRecursive(this, {
      manifest,
      sessionContext,
      externalReference: manifest.externalReference,
      extraAudits: [],
      delays: [2000, 5000, 10000, 15000, 20000]
    });
  }

  validateCancelReason(reason) {
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 500) {
      throw new AppError(400, 'Bad Request', `Campo reason obrigatório (entre 3 e 500 caracteres). Valor fornecido: "${reason || ''}"`);
    }
    return normalizedReason;
  }

  async executeCancelManifestRequest(cancelBody, token, cookieHeader = null) {
    return this.executeAttemptSequence({
      logPrefix: '',
      attempts: buildCancelAttemptDefinitions(token, cookieHeader),
      requestFactory: (attempt) => this.requestJson({
        method: 'POST',
        path: '/api/mtr/manifesto/cancelaManifesto',
        body: cancelBody,
        ...attempt.args
      })
    });
  }

  async verifyCancelledManifest(manifest, activeSessionContext, externalReference, exchange, extraAudits) {
    const responseBody = unwrapApiBody(exchange.response.data);
    const directResult = responseBody?.objetoResposta && typeof responseBody.objetoResposta === 'object'
      ? responseBody.objetoResposta
      : null;

    let lastKnownRemoteStatus = directResult?.situacaoManifesto?.simDescricao || null;

    if (isCancelledManifestState(directResult?.situacaoManifesto)) {
      return {
        verifiedManifest: {
          manCodigo: directResult?.manCodigo ?? externalReference.manCodigo,
          manNumero: directResult?.manNumero ?? externalReference.manNumero,
          situacaoManifesto: directResult?.situacaoManifesto || null
        },
        sessionContext: activeSessionContext
      };
    }

    if (!manifest.externalHashCode) {
      throw buildCancelNotConfirmedError(lastKnownRemoteStatus);
    }

    return verifyCancelledManifestByLookup(this, {
      manifest,
      sessionContext: activeSessionContext,
      externalReference,
      extraAudits,
      delays: [2000, 5000, 10000],
      lastKnownRemoteStatus
    });
  }

  async cancelManifest(manifest, payload) {
    const { sessionContext } = await this.resolveSession({ sessionContextId: manifest.sessionContextId, integrationAccountId: manifest.integrationAccountId, requireAuth: true });
    const cancelResolution = await this.resolveCancelExternalReference(manifest, sessionContext);
    let activeSessionContext = cancelResolution.activeSessionContext;
    const externalReference = cancelResolution.externalReference;
    const extraAudits = [...cancelResolution.extraAudits];

    if (!externalReference?.manCodigo || !externalReference?.manNumero) {
      throw new AppError(503, 'Manifest Not Ready', 'Não foi possível resolver manCodigo/manNumero para cancelar o manifesto. O MTR pode ainda não estar disponível na pesquisa CETESB - tente novamente em alguns segundos.', { code: 'MANIFEST_NOT_READY_FOR_CANCEL' });
    }

    const reason = this.validateCancelReason(payload?.reason);

    const cancelBody = {
      manCodigo: Number(externalReference.manCodigo),
      manNumero: String(externalReference.manNumero),
      manJustificativaCancelamento: reason
    };

    const cancelExecution = await this.runWithSessionRefresh(
      activeSessionContext,
      (token, cookieHeader) => this.executeCancelManifestRequest(cancelBody, token, cookieHeader)
    );
    const exchange = cancelExecution.exchange;
    activeSessionContext = cancelExecution.sessionContext;

    const verification = await this.verifyCancelledManifest(manifest, activeSessionContext, externalReference, exchange, extraAudits);
    const verifiedManifest = verification.verifiedManifest;
    activeSessionContext = verification.sessionContext;

    const auditEntry = {
      action: 'CANCEL',
      status: 'SUCCESS',
      details: {
        reason,
        cetesbResponse: {
          manCodigo: verifiedManifest.manCodigo ?? externalReference.manCodigo,
          manNumero: verifiedManifest.manNumero ?? externalReference.manNumero,
          mensagem: exchange.response.data?.mensagem || 'Manifesto cancelado com sucesso',
          situacaoManifesto: verifiedManifest.situacaoManifesto || null
        },
        requestedBy: activeSessionContext?.userId
      }
    };
    extraAudits.push(auditEntry);
    
    return {
      ...exchange,
      response: {
        ...exchange.response,
        data: {
          manCodigo: verifiedManifest.manCodigo ?? externalReference.manCodigo,
          manNumero: verifiedManifest.manNumero ?? externalReference.manNumero,
          mensagem: exchange.response.data?.mensagem || 'Manifesto cancelado com sucesso',
          simDescricao: verifiedManifest.situacaoManifesto?.simDescricao || 'cancelado'
        }
      },
      extraAudits
    };
  }

  async submitCadastro(cadastro) {
    const exchange = await this.requestJson({ method: 'POST', path: '/api/cadastro/salvarAcesso', body: mapCadastroToCetesb(cadastro.payload), auth: false });
    unwrapApiBody(exchange.response.data);
    return { ...exchange, response: { ...exchange.response, data: { mensagem: exchange.response.data?.mensagem || null, submittedAt: nowIso() } } };
  }

  async requestCatalogJson({ method, path, auth, token, options, allowRetryWithAuth = true }) {
    try {
      return await this.requestJson({ method, path, auth, token, correlationId: options.correlationId || null });
    } catch (error) {
      const isAuthError = error instanceof AppError && ['CETESB_AUTH_FAILED', 'CETESB_NON_JSON_RESPONSE'].includes(error.code);
      const canRetryWithAuth = allowRetryWithAuth && Boolean(options.sessionContextId || options.integrationAccountId);
      if (!isAuthError || !canRetryWithAuth) {
        throw error;
      }

      const ensured = await this.resolveSession({
        sessionContextId: options.sessionContextId || null,
        integrationAccountId: options.integrationAccountId || null,
        requireAuth: true
      });
      return this.requestJson({
        method,
        path,
        auth: true,
        token: ensured.sessionContext?.jwtToken,
        correlationId: options.correlationId || null
      });
    }
  }

  async fetchResidueSearchCatalog(descriptor, residueSeedTerms, options) {
    const allItems = [];
    for (const seedTerm of residueSeedTerms) {
      const exchange = await this.requestCatalogJson({
        method: descriptor.method,
        path: descriptor.path({ seedTerm }),
        auth: false,
        token: null,
        options
      });
      const payload = unwrapApiBody(exchange.response.data);
      allItems.push(...normalizeCatalogItems(payload?.objetoResposta || [], descriptor.mapper));
    }
    return uniqueBy(allItems, (item) => String(item.code));
  }

  async fetchResidueClassesCatalog(descriptor, residueSeedTerms, options) {
    const residueItems = await this.fetchResidueSearchCatalog(CATALOG_ENDPOINTS.residueSearch, residueSeedTerms, options);
    const classesExchange = await this.requestJson({
      method: CATALOG_ENDPOINTS.classes.method,
      path: CATALOG_ENDPOINTS.classes.path({}),
      auth: false,
      correlationId: options.correlationId || null
    });
    const classesPayload = unwrapApiBody(classesExchange.response.data);
    const classesItems = normalizeCatalogItems(classesPayload?.objetoResposta || [], CATALOG_ENDPOINTS.classes.mapper);

    let relationItems = [];
    try {
      const relationExchange = await this.requestCatalogJson({
        method: descriptor.method,
        path: descriptor.path({}),
        auth: false,
        token: null,
        options
      });
      const relationPayload = unwrapApiBody(relationExchange.response.data);
      relationItems = enrichResidueClassItems(relationPayload?.objetoResposta || [], residueItems, classesItems);
    } catch {
      relationItems = [];
    }

    return buildResidueCatalogFromSearch(residueItems, relationItems);
  }

  buildCatalogPath(name, descriptor, context) {
    const params = {};
    if (name === 'cities') params.stateCode = ensurePathValue('stateCode', context.stateCode);
    if (name === 'generatorAbnt') params.partnerCode = ensurePathValue('partnerCode', context.partnerCode);
    if (name === 'packagingTypes') params.tieCodigo = ensurePathValue('tieCodigo', context.tieCodigo);
    return descriptor.path(params);
  }

  async fetchStandardCatalog(name, descriptor, context) {
    const path = this.buildCatalogPath(name, descriptor, context);
    const exchange = await this.requestCatalogJson({
      method: descriptor.method,
      path,
      auth: descriptor.auth === true,
      token: context.sessionContext?.jwtToken,
      options: context,
      allowRetryWithAuth: descriptor.auth !== true
    });
    const payload = unwrapApiBody(exchange.response.data);
    return normalizeCatalogItems(payload?.objetoResposta || [], descriptor.mapper);
  }

  async fetchCatalogEntry(name, descriptor, context) {
    if (name === 'residueSearch') {
      return this.fetchResidueSearchCatalog(descriptor, context.residueSeedTerms, context);
    }
    if (name === 'residueClasses') {
      return this.fetchResidueClassesCatalog(descriptor, context.residueSeedTerms, context);
    }
    return this.fetchStandardCatalog(name, descriptor, context);
  }

  async fetchCatalogs(names, options = {}) {
    const needsAuth = names.some((name) => CATALOG_ENDPOINTS[name]?.auth === true);
    const { sessionContext, integrationAccount } = await this.resolveSession({
      sessionContextId: options.sessionContextId || null,
      integrationAccountId: options.integrationAccountId || null,
      requireAuth: needsAuth
    });
    const context = {
      ...options,
      sessionContext,
      integrationAccount,
      stateCode: options.stateCode || sessionContext?.metadata?.stateCode || integrationAccount?.state_code || config.cetesbDefaultStateCode || 26,
      partnerCode: options.partnerCode || sessionContext?.partnerCode || integrationAccount?.partner_code || null,
      tieCodigo: options.tieCodigo || sessionContext?.metadata?.packagingTypeTieCodigo || config.cetesbDefaultPackagingTieCodigo || 4,
      residueSeedTerms: options.residueSeedTerms || sessionContext?.metadata?.residueSearchTerms || config.cetesbResidueSearchSeedTerms
    };
    const out = [];

    for (const name of names) {
      const descriptor = CATALOG_ENDPOINTS[name];
      if (!descriptor) {
        out.push({ name, items: [], source: 'cetesb-real', skipped: true });
        continue;
      }

      try {
        const items = await this.fetchCatalogEntry(name, descriptor, context);
        out.push({ name, items, source: 'cetesb-real' });
      } catch (error) {
        out.push({ name, items: [], source: 'cetesb-real', error: sanitizeCatalogError(error) });
      }
      await sleep(config.cetesbCatalogThrottleMs);
    }
    return out;
  }

  buildManifestSearchRequestContext({ sessionContext, integrationAccount, jwtToken, partnerCode, dateFrom, dateTo, statusFilter, kind, accountType = null }) {
    const effectiveToken = jwtToken || sessionContext?.jwtToken || null;
    if (!effectiveToken) {
      throw new AppError(400, 'Bad Request', 'Nenhum token válido disponível para pesquisar manifestos na CETESB.');
    }

    const effectivePartnerCode = partnerCode || sessionContext?.partnerCode || integrationAccount?.partner_code || null;
    if (!effectivePartnerCode) {
      throw new AppError(400, 'Bad Request', 'Não foi possível resolver partnerCode para pesquisar manifestos na CETESB.');
    }

    const now = new Date();
    const daysBack = Math.abs(Number(config.cetesbManifestSearchDaysBack || 30));
    const effectiveDateFrom = normalizeDateForCetesb(dateFrom, addDays(now, -daysBack));
    const effectiveDateTo = normalizeDateForCetesb(dateTo, now);
    const parsedStatusFilter = Number(statusFilter);
    const effectiveStatusFilter = Number.isFinite(parsedStatusFilter)
      ? parsedStatusFilter
      : Number(config.cetesbManifestSearchStatusFilter || 0);
    const normalizedKind = String(kind || 'all').trim() || 'all';
    const kindCandidates = normalizedKind.toLowerCase() === 'all' ? [normalizedKind, '0'] : [normalizedKind];
    const rangeDays = enumerateDateRangeBr(effectiveDateFrom, effectiveDateTo);
    const shouldSplitByDay = rangeDays.length > 1;
    const metadataTipoManifesto = toParsedInteger(sessionContext?.metadata?.manifestSearch?.tipoManifesto);
    const tipoManifesto = resolveManifestSearchTipo(
      accountType,
      metadataTipoManifesto ?? 8
    );

    return {
      tokenForSearch: effectiveToken,
      effectivePartnerCode,
      stateCode: sessionContext?.metadata?.stateCode || integrationAccount?.state_code || config.cetesbDefaultStateCode || 26,
      tipoManifesto,
      effectiveDateFrom,
      effectiveDateTo,
      effectiveStatusFilter,
      normalizedKind,
      kindCandidates,
      shouldSplitByDay,
      dateWindows: shouldSplitByDay
        ? rangeDays.map((day) => ({ dateFrom: day, dateTo: day }))
        : [{ dateFrom: effectiveDateFrom, dateTo: effectiveDateTo }]
    };
  }

  async collectManifestSearchResults(context, { sessionContext, sessionContextId, jwtToken, correlationId }) {
    return collectManifestSearchResultsRecursive(this, context, {
      sessionContext,
      sessionContextId,
      jwtToken,
      correlationId
    }, {
      tokenForSearch: context.tokenForSearch,
      refreshedAfter500: false,
      aggregatedItems: [],
      auditWindows: [],
      skippedWindows: []
    });
  }

  buildManifestSearchAudit(context, items, auditWindows, skippedWindows) {
    const primaryAuditWindow = auditWindows[0] || null;
    return {
      httpMethod: 'GET',
      endpoint: primaryAuditWindow?.searchPath
        ? `${config.cetesbApiBaseUrl}${primaryAuditWindow.searchPath}`
        : `${config.cetesbApiBaseUrl}/api/mtr/pesquisaManifesto`,
      httpStatus: primaryAuditWindow?.httpStatus || (items.length ? 200 : 404),
      latencyMs: primaryAuditWindow?.latencyMs || null,
      sanitizedHeaders: {},
      sanitizedBody: {
        searchPath: primaryAuditWindow?.searchPath || null,
        partnerCode: context.effectivePartnerCode,
        stateCode: context.stateCode,
        tipoManifesto: context.tipoManifesto,
        dateFrom: context.effectiveDateFrom,
        dateTo: context.effectiveDateTo,
        statusFilter: context.effectiveStatusFilter,
        kind: primaryAuditWindow?.kind || context.normalizedKind,
        attemptedKinds: context.kindCandidates,
        resultCount: Array.isArray(items) ? items.length : 0,
        segmentedByDay: context.shouldSplitByDay,
        windowCount: context.dateWindows.length,
        successfulWindows: auditWindows.length,
        skippedWindows
      }
    };
  }

  async searchManifests({
    integrationAccountId = null,
    sessionContextId = null,
    jwtToken = null,
    partnerCode = null,
    correlationId = null,
    includeAudit = false,
    dateFrom = null,
    dateTo = null,
    statusFilter = null,
    page = 0,
    kind = 'all'
  } = {}) {
    const { sessionContext, integrationAccount } = await this.resolveSession({
      sessionContextId,
      integrationAccountId,
      requireAuth: !jwtToken
    });
    const rawSessionAccountId = sessionContext?.metadata?.accountId;
    const sessionAccountId = typeof rawSessionAccountId === 'string'
      ? rawSessionAccountId.trim()
      : '';
    const sicatAccount = sessionAccountId ? await findSicatCetesbAccountById(sessionAccountId) : null;
    const searchContext = this.buildManifestSearchRequestContext({
      sessionContext,
      integrationAccount,
      jwtToken,
      partnerCode,
      dateFrom,
      dateTo,
      statusFilter,
      kind,
      accountType: sicatAccount?.accountType || null
    });
    const collected = await this.collectManifestSearchResults(searchContext, {
      sessionContext,
      sessionContextId,
      jwtToken,
      correlationId
    });
    const items = uniqueBy(collected.aggregatedItems, buildManifestItemKey);

    if (includeAudit) {
      return {
        items,
        audit: this.buildManifestSearchAudit(searchContext, items, collected.auditWindows, collected.skippedWindows)
      };
    }

    return items;
  }

  async listReceiptResponsibles(options = {}) {
    const context = await this.resolveAuthenticatedOperationContext(options, {
      requirePartnerCode: true,
      partnerFieldName: 'parCodigo'
    });
    const result = await this.executeAuthenticatedJsonOperation({
      options,
      method: 'GET',
      path: `/api/mtr/manifesto/listaResponsavelRecebimento/${context.partnerCode}`,
      auditPath: '/api/mtr/manifesto/listaResponsavelRecebimento/{parCodigo}',
      dataBuilder: (envelope) => ({
        message: envelope?.mensagem || null,
        items: extractApiItems(envelope),
        envelope
      })
    });
    return result.exchange;
  }

  async searchReceivableManifests(options = {}) {
    const context = await this.resolveAuthenticatedOperationContext(options, {
      requirePartnerCode: true,
      partnerFieldName: 'partnerCode'
    });
    const now = new Date();
    const dateFrom = normalizeDateForCetesb(options.dateFrom, addDays(now, -Math.abs(Number(config.cetesbManifestSearchDaysBack || 30))));
    const dateTo = normalizeDateForCetesb(options.dateTo, now);
    // Variante observada na captura real do portal (cap_3012dde41ef83433f6):
    // com o número do manifesto APENSO ao path a CETESB filtra server-side —
    // .../0/all/{manNumero}. Sem número, busca o período inteiro (comportamento
    // anterior, preservado).
    const manifestNumber = options.manifestNumber == null ? '' : String(options.manifestNumber).trim();
    const numberSegment = manifestNumber ? `/${encodeURIComponent(manifestNumber)}` : '';
    const result = await this.executeAuthenticatedJsonOperation({
      options,
      method: 'GET',
      path: `/api/mtr/pesquisaManifesto/${context.partnerCode}/${context.stateCode}/${RECEIPT_MANIFEST_SEARCH_SEGMENTS.tipoManifesto}/${dateFrom}/${dateTo}/${RECEIPT_MANIFEST_SEARCH_SEGMENTS.statusFilter}/${RECEIPT_MANIFEST_SEARCH_SEGMENTS.kind}${numberSegment}`,
      auditPath: manifestNumber
        ? '/api/mtr/pesquisaManifesto/{partnerCode}/{stateCode}/9/{dataInicial_dd-MM-yyyy}/{dataFinal_dd-MM-yyyy}/0/all/{manNumero}'
        : '/api/mtr/pesquisaManifesto/{partnerCode}/{stateCode}/9/{dataInicial_dd-MM-yyyy}/{dataFinal_dd-MM-yyyy}/0/all',
      dataBuilder: (envelope) => ({
        message: envelope?.mensagem || null,
        items: extractApiItems(envelope),
        envelope,
        search: {
          partnerCode: context.partnerCode,
          stateCode: context.stateCode,
          dateFrom,
          dateTo,
          statusFilter: RECEIPT_MANIFEST_SEARCH_SEGMENTS.statusFilter,
          kind: RECEIPT_MANIFEST_SEARCH_SEGMENTS.kind,
          ...(manifestNumber ? { manifestNumber } : {})
        }
      })
    });
    return result.exchange;
  }

  async getRemoteManifest(manCodigo, options = {}) {
    if (manCodigo == null || manCodigo === '') {
      throw new AppError(400, 'Bad Request', 'manCodigo é obrigatório para consultar manifesto remoto na CETESB.');
    }

    const result = await this.executeAuthenticatedJsonOperation({
      options,
      method: 'GET',
      path: `/api/mtr/manifesto/${encodeURIComponent(String(manCodigo))}`,
      auditPath: '/api/mtr/manifesto/{manCodigo}',
      dataBuilder: (envelope) => ({
        message: envelope?.mensagem || null,
        item: envelope?.objetoResposta || null,
        envelope
      })
    });
    return result.exchange;
  }

  async receiveManifest(options = {}) {
    const body = firstDefined(options.payload, options.body, options.requestBody, null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new AppError(400, 'Bad Request', 'Payload JSON de recebimento é obrigatório para POST /api/mtr/manifesto/recebimento/.');
    }

    const result = await this.executeAuthenticatedJsonOperation({
      options,
      method: 'POST',
      path: '/api/mtr/manifesto/recebimento/',
      body,
      auditPath: '/api/mtr/manifesto/recebimento/',
      dataBuilder: (envelope) => ({
        message: envelope?.mensagem || null,
        result: envelope?.objetoResposta ?? null,
        envelope
      })
    });
    return result.exchange;
  }

  async printManifestReceipt(manHashCode, options = {}) {
    if (!manHashCode) {
      throw new AppError(400, 'Bad Request', 'manHashCode é obrigatório para imprimir comprovante de recebimento.');
    }

    return this.executeAuthenticatedBufferOperation({
      options,
      method: 'GET',
      path: `/api/mtr/imprimir/imprimeRecebimentoManifesto/${encodeURIComponent(String(manHashCode))}`,
      auditPath: '/api/mtr/imprimir/imprimeRecebimentoManifesto/{manHashCode}'
    });
  }

  async listCdfResponsibles(options = {}) {
    const context = await this.resolveAuthenticatedOperationContext(options, {
      requirePartnerCode: true,
      partnerFieldName: 'parCodigo'
    });
    const result = await this.executeAuthenticatedJsonOperation({
      options,
      method: 'GET',
      path: `/api/mtr/responsavel/${context.partnerCode}`,
      auditPath: '/api/mtr/responsavel/{parCodigo}',
      dataBuilder: (envelope) => ({
        message: envelope?.mensagem || null,
        items: extractApiItems(envelope),
        envelope
      })
    });
    return result.exchange;
  }

  async searchCdfGeneratorPartner(options = {}) {
    const rawDocument = firstDefined(options.document, options.partnerDocument, options.q, null);
    if (!rawDocument) {
      throw new AppError(400, 'Bad Request', 'document é obrigatório para pesquisar parceiro gerador de CDF.');
    }

    const normalizedDocument = isLikelyDocument(rawDocument)
      ? normalizeDocumentDigits(rawDocument)
      : String(rawDocument).trim();

    const result = await this.executeAuthenticatedJsonOperation({
      options,
      method: 'GET',
      path: `/api/mtr/pesquisaParceiro/8/${encodeURIComponent(normalizedDocument)}`,
      auditPath: '/api/mtr/pesquisaParceiro/8/{documento}',
      dataBuilder: (envelope) => ({
        message: envelope?.mensagem || null,
        items: extractApiItems(envelope),
        envelope
      })
    });
    return result.exchange;
  }

  async searchReceivedManifestsForCdf(options = {}) {
    const context = await this.resolveAuthenticatedOperationContext(options, {
      requirePartnerCode: true,
      partnerFieldName: 'partnerCode'
    });
    const body = firstDefined(options.generatorPartners, options.payload, options.body, options.requestBody, null);
    if (!Array.isArray(body)) {
      throw new AppError(400, 'Bad Request', 'Lista de parceiros geradores é obrigatória para pesquisar manifestos aptos a CDF.');
    }

    const now = new Date();
    const dateFrom = normalizeDateForCetesb(options.dateFrom, addDays(now, -Math.abs(Number(config.cetesbManifestSearchDaysBack || 30))));
    const dateTo = normalizeDateForCetesb(options.dateTo, now);
    const result = await this.executeAuthenticatedJsonOperation({
      options,
      method: 'POST',
      path: `/api/mtr/pesquisaManifestoRecebidoCertificado/${context.partnerCode}/${CDF_RECEIVED_MANIFEST_SEARCH_SEGMENTS.tipoManifesto}/${dateFrom}/${dateTo}/${CDF_RECEIVED_MANIFEST_SEARCH_SEGMENTS.statusFilter}`,
      body,
      auditPath: '/api/mtr/pesquisaManifestoRecebidoCertificado/{partnerCode}/9/{dataInicial_dd-MM-yyyy}/{dataFinal_dd-MM-yyyy}/0',
      dataBuilder: (envelope) => ({
        message: envelope?.mensagem || null,
        items: extractApiItems(envelope),
        envelope,
        search: {
          partnerCode: context.partnerCode,
          dateFrom,
          dateTo,
          tipoManifesto: CDF_RECEIVED_MANIFEST_SEARCH_SEGMENTS.tipoManifesto,
          statusFilter: CDF_RECEIVED_MANIFEST_SEARCH_SEGMENTS.statusFilter
        }
      })
    });
    return result.exchange;
  }

  async generateCdf(options = {}) {
    const body = firstDefined(options.payload, options.body, options.requestBody, null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new AppError(400, 'Bad Request', 'Payload JSON de geração de CDF é obrigatório para POST /api/mtr/certificadoDestinacao/.');
    }

    const result = await this.executeAuthenticatedJsonOperation({
      options,
      method: 'POST',
      path: '/api/mtr/certificadoDestinacao/',
      body,
      auditPath: '/api/mtr/certificadoDestinacao/',
      dataBuilder: (envelope) => ({
        message: envelope?.mensagem || null,
        result: envelope?.objetoResposta ?? null,
        envelope
      })
    });
    return result.exchange;
  }

  async searchCdfCertificates(options = {}) {
    const context = await this.resolveAuthenticatedOperationContext(options, {
      requirePartnerCode: true,
      partnerFieldName: 'partnerCode'
    });
    const now = new Date();
    const dateFrom = normalizeDateForCetesb(options.dateFrom, addDays(now, -Math.abs(Number(config.cetesbManifestSearchDaysBack || 30))));
    const dateTo = normalizeDateForCetesb(options.dateTo, now);
    const result = await this.executeAuthenticatedJsonOperation({
      options,
      method: 'GET',
      path: `/api/mtr/certificadoDestinacao/${CDF_CERTIFICATE_SEARCH_SEGMENTS.tipoCertificado}/${context.partnerCode}/${CDF_CERTIFICATE_SEARCH_SEGMENTS.statusFilter}/${CDF_CERTIFICATE_SEARCH_SEGMENTS.kind}/${dateFrom}/${dateTo}`,
      auditPath: '/api/mtr/certificadoDestinacao/9/{partnerCode}/0/all/{dataInicial_dd-MM-yyyy}/{dataFinal_dd-MM-yyyy}',
      dataBuilder: (envelope) => ({
        message: envelope?.mensagem || null,
        items: extractApiItems(envelope),
        envelope,
        search: {
          partnerCode: context.partnerCode,
          dateFrom,
          dateTo,
          tipoCertificado: CDF_CERTIFICATE_SEARCH_SEGMENTS.tipoCertificado,
          statusFilter: CDF_CERTIFICATE_SEARCH_SEGMENTS.statusFilter,
          kind: CDF_CERTIFICATE_SEARCH_SEGMENTS.kind
        }
      })
    });
    return result.exchange;
  }

  async printCdfCertificate(cerHashCode, options = {}) {
    if (!cerHashCode) {
      throw new AppError(400, 'Bad Request', 'cerHashCode é obrigatório para imprimir certificado de destinação.');
    }

    return this.executeAuthenticatedBufferOperation({
      options,
      method: 'GET',
      path: `/api/mtr/imprimir/imprimeCertificado/${encodeURIComponent(String(cerHashCode))}`,
      auditPath: '/api/mtr/imprimir/imprimeCertificado/{cerHashCode}'
    });
  }

  async searchPartners({ q = '', role = null, integrationAccountId = null, sessionContextId = null }) {
    const normalized = String(q || '').trim();
    if (!normalized) return [];
    const roleMap = { carrier: [5], transportador: [5], receiver: [9], destinador: [9] };
    const searches = [];
    if (isLikelyDocument(normalized)) {
      searches.push({ method: 'GET', path: `/api/mtr/consultaParceiro/J/${normalizeDocumentDigits(normalized)}`, role: role || null });
    }
    const mappedRoles = roleMap[String(role || '').toLowerCase()] || [];
    if (mappedRoles.length) mappedRoles.forEach((roleCode) => searches.push({ method: 'GET', path: `/api/mtr/pesquisaParceiro/${roleCode}/${encodeURIComponent(normalized)}`, role }));
    else if (/^\d+$/.test(normalized)) {
      searches.push(
        { method: 'GET', path: `/api/mtr/pesquisaParceiroByCodigo/${normalized}`, role },
        { method: 'GET', path: `/api/mtr/pesquisaParceiro/9/${encodeURIComponent(normalized)}`, role: 'receiver' }
      );
    } else {
      searches.push(
        { method: 'GET', path: `/api/mtr/pesquisaParceiro/5/${encodeURIComponent(normalized)}`, role: 'carrier' },
        { method: 'GET', path: `/api/mtr/pesquisaParceiro/9/${encodeURIComponent(normalized)}`, role: 'receiver' }
      );
    }
    const { sessionContext } = await this.resolveSession({ sessionContextId, integrationAccountId, requireAuth: false });
    const results = [];
    for (const search of searches) {
      let exchange;
      try {
        exchange = await this.requestJson({ method: search.method, path: search.path, auth: false, token: sessionContext?.jwtToken });
      } catch (error) {
        const isAuthError = error instanceof AppError && ['CETESB_AUTH_FAILED', 'CETESB_NON_JSON_RESPONSE'].includes(error.code);
        const canRetryWithAuth = Boolean(sessionContextId || integrationAccountId);
        if (!isAuthError || !canRetryWithAuth) throw error;

        const ensured = await this.resolveSession({ sessionContextId, integrationAccountId, requireAuth: true });
        exchange = await this.requestJson({
          method: search.method,
          path: search.path,
          auth: true,
          token: ensured.sessionContext?.jwtToken
        });
      }
      const payload = unwrapApiBody(exchange.response.data);
      results.push(...(payload?.objetoResposta || []).map((item) => mapPartnerSearchItem(item, search.role)));
    }
    return uniqueBy(results.filter(Boolean), (item) => String(item.partnerCode));
  }

  // ---------------------------------------------------------------------------
  // MTR provisório — bloco isolado (fase 03 / cadeia `mtr-provisorio-fluxo-base`).
  //
  // Evidência HAR (ver docs/handoffs/mtr-provisorio-fluxo-base/02-source-validation.md):
  // - listagem dedicada CONFIRMADA:
  //     GET /api/mtr/manifesto/provisorio/{parCodigo}/{flag}
  //     (docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har#L2554)
  // - submissão reaproveita PUT /api/mtr/manifesto (mesmo endpoint do MTR comum,
  //   discriminado por `tipoManifesto` no body — valor exato é SUPOSIÇÃO,
  //   parâmetro `tipoManifestoOverride` permanece externável pelo chamador).
  // - impressão reaproveita GET /api/mtr/imprimir/imprimeManifesto/{manHashCode}
  //   (mesmo caminho do MTR comum — chave é `manHashCode`, presente em ambos
  //   os tipos nas listagens; ver docs/cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har#L10705).
  //
  // Restrições preservadas:
  // - bootstrap de sessão via `resolveAuthenticatedOperationContext`
  //   (delegando a `session-context-service.ts`);
  // - audit-exchange-logging via `executeAuthenticatedJsonOperation` /
  //   `executeAuthenticatedBufferOperation` (auditPaths estabilizados, sem
  //   vazar parâmetros sensíveis);
  // - nenhum hardcode de JWT, headers ou recaptcha aqui;
  // - `submitMtrProvisorio` delega ao `submitManifest` existente apenas para
  //   sobrescrever `tipoManifesto` no payload mapeado — preserva enriquecimento
  //   de parceiros, residuos e partner access.
  //
  // R3 (sobrecarga `tipoManifesto`) — DECISÃO ADIADA para a fase 04. Por isso
  // o valor numérico do override não é fixado aqui; o caller (service/worker da
  // fase 04) decide. Se nenhum override for fornecido, este bloco se comporta
  // como o caminho comum (mantém compat com risco residual R1 documentado).
  // ---------------------------------------------------------------------------
  /**
   * Submete um MTR provisório.
   *
   * @param {{ manifest: object, payload?: object | null, tipoManifestoOverride?: number | string | null }} args
   * @returns {Promise<unknown>} mesmo formato de `submitManifest`.
   */
  async submitMtrProvisorio({ manifest, payload = null, tipoManifestoOverride = null } = {}) {
    if (!manifest || typeof manifest !== 'object') {
      throw new AppError(400, 'Bad Request', 'manifest é obrigatório para submitMtrProvisorio.');
    }
    // Usa um descriptor não-enumerável para não poluir serializações do manifest;
    // o hook em `submitManifest` lê via `manifest.tipoManifestoOverride`.
    if (tipoManifestoOverride !== null && tipoManifestoOverride !== undefined) {
      Object.defineProperty(manifest, 'tipoManifestoOverride', {
        value: tipoManifestoOverride,
        enumerable: false,
        writable: true,
        configurable: true
      });
    }
    return this.submitManifest(manifest, payload);
  }

  /**
   * Lista MTRs provisórios via endpoint dedicado.
   *
   * @param {{ parCodigo?: string | number, partnerCode?: string | number, flag?: boolean | string, sessionContextId?: string | null, integrationAccountId?: string | null, correlationId?: string | null }} [options]
   * @returns {Promise<unknown>} exchange auditado com `data.items`.
   */
  async listMtrProvisorio(options = {}) {
    const context = await this.resolveAuthenticatedOperationContext(options, {
      requirePartnerCode: true,
      partnerFieldName: 'parCodigo'
    });
    const rawFlag = firstDefined(options.flag, options.pendentes, true);
    const normalizedFlag = (rawFlag === true || String(rawFlag).toLowerCase() === 'true') ? 'true' : 'false';
    const parCodigo = ensurePathValue('parCodigo', context.partnerCode);
    const result = await this.executeAuthenticatedJsonOperation({
      options,
      method: 'GET',
      path: `/api/mtr/manifesto/provisorio/${encodeURIComponent(String(parCodigo))}/${normalizedFlag}`,
      auditPath: '/api/mtr/manifesto/provisorio/{parCodigo}/{flag}',
      dataBuilder: (envelope) => ({
        message: envelope?.mensagem || null,
        items: extractApiItems(envelope),
        envelope,
        search: {
          parCodigo,
          flag: normalizedFlag
        }
      })
    });
    return result.exchange;
  }

  /**
   * Imprime um MTR provisório. Reusa o endpoint comum por `manHashCode`
   * (suposição documentada em §2.4 do checkpoint 02 — risco residual baixo,
   * mitigável por captura HAR humana opcional).
   *
   * @param {string} manHashCode
   * @param {{ sessionContextId?: string | null, integrationAccountId?: string | null, correlationId?: string | null }} [options]
   */
  async printMtrProvisorio(manHashCode, options = {}) {
    if (!manHashCode) {
      throw new AppError(400, 'Bad Request', 'manHashCode é obrigatório para imprimir MTR provisório.');
    }
    return this.executeAuthenticatedBufferOperation({
      options,
      method: 'GET',
      path: `/api/mtr/imprimir/imprimeManifesto/${encodeURIComponent(String(manHashCode))}`,
      auditPath: '/api/mtr/imprimir/imprimeManifesto/{manHashCode}'
    });
  }

  // ---------------------------------------------------------------------------
  // DMR (Declaracao de Movimentacao de Residuos) — bloco STUB tipado.
  //
  // Estado atual (2026-04-25): a fase 03-external-integration permanece adiada
  // ate captura do HAR DMR (decisao Caminho B em
  // docs/handoffs/dmr-fluxo-base/02-source-validation.md §8). DL-093 proibe
  // hardcodar endpoints CETESB sem evidencia HAR — entao este stub somente
  // registra a tentativa em audit e devolve um problem+json 503 tipado.
  //
  // Restricoes:
  // - Nao chamar nenhum endpoint CETESB DMR aqui (sem HAR == sem rota).
  // - Nao tocar nas demais funcoes do gateway.
  // - Quando o HAR DMR chegar, este metodo passa a invocar `requestJson`/
  //   `executeAuthenticatedJsonOperation` mantendo a mesma assinatura
  //   `submitDmr({ dmrId, payload, sessionContextId, integrationAccountId,
  //   correlationId })` — assim o worker/handler `dmr.submit` (fase 05) nao
  //   muda quando o stub for substituido.
  // ---------------------------------------------------------------------------
  /**
   * @param {{ dmrId: string, payload?: unknown, sessionContextId?: string | null, integrationAccountId?: string | null, correlationId?: string | null }} [params]
   * @returns {Promise<unknown>}
   */
  async submitDmr({ dmrId, payload = null, sessionContextId = null, integrationAccountId = null, correlationId = null } = {}) {
    const auditPath = '/sicat/dmr/submit (stub-pending-har)';
    const requestSnapshot = sanitizeBusinessPayload({
      dmrId: ensurePathValue('dmrId', dmrId),
      sessionContextId,
      integrationAccountId,
      correlationId,
      payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : null
    });
    // Audit-friendly log (mesmo padrao usado nas demais operacoes do gateway)
    // — ajuda a fase 05 a validar o caminho do worker mesmo com stub.
    console.log(JSON.stringify({
      ts: nowIso(),
      level: 'warn',
      gateway: 'cetesb',
      operation: 'dmr.submit',
      mode: 'stub-pending-har',
      auditPath,
      correlationId: correlationId || null,
      request: requestSnapshot
    }));

    throw new AppError(
      503,
      'DMR gateway pending HAR capture',
      'O bloco DMR do gateway CETESB esta como stub. A captura do HAR DMR pela fase 02-source-validation ainda nao ocorreu, portanto a submissao real esta indisponivel. Ver docs/handoffs/dmr-fluxo-base/02-source-validation.md §8 (decisao Caminho B).',
      {
        type: 'https://sicat/problems/dmr-gateway-pending-har',
        code: 'DMR_GATEWAY_PENDING_HAR',
        correlationId,
        context: { dmrId, auditPath }
      }
    );
  }
}

export function createCetesbGateway() {
  if (config.cetesbGatewayMode === 'real') return new RealCetesbGateway();
  throw new AppError(500, 'Gateway Configuration Error', `CETESB_GATEWAY_MODE nao suportado: ${config.cetesbGatewayMode}. Utilize apenas real.`);
}
