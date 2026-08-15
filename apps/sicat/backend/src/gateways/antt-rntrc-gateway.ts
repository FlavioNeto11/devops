/**
 * Gateway RNTRC/ANTT — primeiro gateway externo REAL da vertical Transporte (PR-C1, DL-103).
 *
 * TypeScript por padrão (`cetesb-gateway.js` é a ÚNICA exceção JS do diretório, DL-093). Única
 * camada autorizada a falar com o Portal de Dados Abertos da ANTT — rotas/serviços/worker nunca
 * chamam `fetch` diretamente para dados.antt.gov.br.
 *
 * ── SONDAGEM REAL (2026-08-14, evidência colada no relatório do PR) ──────────────────────────────
 * O portal é um CKAN público (`dados.antt.gov.br/api/3/action/*`), dataset id `"rntrc"`:
 *
 *   1. `package_show?id=rntrc` → 200, lista ~70 resources (um CSV por mês desde ago/2020 + 1 PDF
 *      dicionário de dados + 1 dashboard). Cada resource carrega `datastore_active` (bool).
 *   2. Amostrado em 2026-08-14: os 3 meses MAIS RECENTES (mai/jun/jul-26) tinham
 *      `datastore_active=false` — só CSV para download. Um bloco de 4 meses no meio do histórico
 *      (jan-abr/26) tinha `datastore_active=true`. Isso confirma que o CKAN da ANTT ativa o
 *      datastore do mês corrente com atraso (às vezes nunca, antes de ser substituído pelo mês
 *      seguinte) — então o gateway NÃO pode assumir datastore ativo no resource mais recente; tem
 *      de checar e cair para CSV quando não estiver.
 *   3. `datastore_search?resource_id=<id>&filters={"cpfcnpjtransportador":"11.193.322/0001-10"}`
 *      → 200, `total: 1`, registro exato. Testado TAMBÉM com o CNPJ sem máscara (só dígitos) →
 *      `total: 0` — o filtro do CKAN é EXATO contra o valor armazenado, que inclui a máscara
 *      (`XX.XXX.XXX/XXXX-XX`). Testado com `filters={"numero_rntrc":"50085788"}` (sem zeros à
 *      esquerda) → `total: 1`, mesmo registro.
 *   4. Campos confirmados (iguais no datastore e no CSV): `nome_transportador`, `numero_rntrc`,
 *      `data_primeiro_cadastro`, `situacao_rntrc`, `cpfcnpjtransportador`, `categoria_transportador`,
 *      `cep`, `municipio`, `uf`, `equiparado`, `data_situacao_rntrc`.
 *   5. `situacao_rntrc` só assume DOIS valores no dado publicado: `ATIVO` e `PENDENTE` (confirmado
 *      via `datastore_search_sql`, `SELECT DISTINCT situacao_rntrc, categoria_transportador`).
 *      `categoria_transportador` assume `TAC`/`ETC`/`CTC` — mesmo universo já cadastrado em
 *      `transport-party-types.ts`. NÃO existe `SUSPENSO`/`CANCELADO`/`VENCIDO` no dado aberto: o
 *      export público da ANTT é um retrato do registro CORRENTE, não um histórico de situações. Por
 *      isso `not_found` aqui NUNCA prova irregularidade — só prova ausência DESTE dado (documento
 *      pode estar suspenso/cancelado e simplesmente não aparecer no retrato atual). Este é o
 *      racional central da distinção "cache informativo" do guia do programa (pendência P4):
 *      `open_data` mapeia `ATIVO → active`, `PENDENTE → unknown` (nem regular nem irregular) e
 *      ausência → `not_found`; NUNCA `suspended`/`cancelled`/`expired` (o dado aberto não tem como
 *      provar nenhum dos três).
 *   6. CSV do mês mais recente (jul/26, `datastore_active=false`): `text/csv`, separador `;`,
 *      campos entre aspas, mesmas colunas do datastore (header confirmado por leitura direta,
 *      byte-range), datas `DD/MM/AAAA`, ~150 MB. Charset não-UTF-8 (acentos vieram corrompidos em
 *      terminal UTF-8) — decodificado aqui como `latin1`; irrelevante para o MATCH (documento/RNTRC
 *      são ASCII em ambos os encodings).
 *
 * ── Estratégia `open_data` ────────────────────────────────────────────────────────────────────
 * `package_show` → resource mais recente (por `last_modified`/`created`) → se `datastore_active`,
 * `datastore_search` com filtro exato (documento mascarado, ou `numero_rntrc` sem zeros à
 * esquerda); senão, download STREAMING do CSV (cache local em `STORAGE_DIR/rntrc-open-data/`,
 * chaveado pelo id do resource do CKAN — muda todo mês, então o cache nunca serve dado velho) e
 * busca linha a linha (sem carregar o arquivo inteiro em memória).
 *
 * ── Estratégia `mock` ─────────────────────────────────────────────────────────────────────────
 * Determinística para testes: documento terminado em dígito PAR → `active`/`ETC`; ÍMPAR →
 * `not_found`. `mockOverrides` (por documento OU rntrcNumber, dígitos) sobrepõe o resultado
 * default — é como os testes exercitam `suspended`/`cancelled`/`unknown`/erros.
 */

import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import readline from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { AppError } from '../lib/problem.js';
import { ensureDir, resolveStoragePath } from '../lib/files.js';
import { config, type RntrcGatewayMode } from '../lib/config.js';

// =================================================================================================
// Tipos públicos
// =================================================================================================

export type { RntrcGatewayMode };

export type RntrcLookupQuery = {
  /** CPF/CNPJ — dígitos ou já mascarado, tanto faz (normalizado aqui). */
  document?: string | null;
  rntrcNumber?: string | null;
};

export type RntrcLookupResultStatus = 'active' | 'suspended' | 'cancelled' | 'expired' | 'not_found' | 'unknown';

/** Payload MÍNIMO da linha encontrada — LGPD: nunca inclui nome/endereço do transportador. */
export type RntrcLookupRaw = {
  rntrcNumber?: string | null;
  category?: 'TAC' | 'ETC' | 'CTC' | null;
  status?: string;
  statusDate?: string | null;
  uf?: string | null;
};

export type RntrcGatewayExchange = {
  request: {
    httpMethod: string;
    endpoint: string;
    sanitizedHeaders?: Record<string, unknown>;
    sanitizedBody?: Record<string, unknown>;
  };
  response: {
    httpMethod: string;
    endpoint: string;
    httpStatus: number | null;
    latencyMs: number | null;
    sanitizedHeaders?: Record<string, unknown>;
    sanitizedBody?: Record<string, unknown>;
  };
};

export type RntrcLookupResult = {
  found: boolean;
  rntrcNumber: string | null;
  category: 'TAC' | 'ETC' | 'CTC' | null;
  status: RntrcLookupResultStatus;
  /** Data-base do dado consultado (mês de publicação do resource CKAN), 'YYYY-MM-DD'. `null` só em `mock`. */
  dataReferenceDate: string | null;
  raw: RntrcLookupRaw;
  source: 'datastore' | 'csv_cache' | 'mock';
  exchanges: RntrcGatewayExchange[];
};

export type AnttRntrcGateway = {
  mode: RntrcGatewayMode;
  lookupCarrier(query: RntrcLookupQuery): Promise<RntrcLookupResult>;
};

export type RntrcMockOverride = Partial<Pick<RntrcLookupResult, 'found' | 'rntrcNumber' | 'category' | 'status' | 'dataReferenceDate'>>;

export type CreateAnttRntrcGatewayOptions = {
  mode?: RntrcGatewayMode;
  baseUrl?: string;
  timeoutMs?: number;
  csvDownloadTimeoutMs?: number;
  csvMaxBytes?: number;
  /** Só usado em `mode: 'mock'` — chave por documento OU rntrcNumber (dígitos, sem máscara). */
  mockOverrides?: Record<string, RntrcMockOverride>;
};

// =================================================================================================
// Erros tipados — RNTRC_GATEWAY_* (status HTTP real na instância, para `lib/retry.ts` classificar
// pela regra genérica de status: 4xx definitivo NÃO retenta, 5xx/408/429 retenta).
// =================================================================================================

function gatewayError(status: number, code: string, detail: string, context?: Record<string, unknown>): AppError {
  return new AppError(status, 'RNTRC Gateway Error', detail, { code, ...(context ? { context } : {}) });
}

// =================================================================================================
// Helpers de documento
// =================================================================================================

function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '');
}

function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, '');
  return stripped || '0';
}

/** Máscara oficial CNPJ/CPF — é o formato EXATO armazenado por `cpfcnpjtransportador` no dado ANTT. */
function formatDocumentMask(digits: string): string | null {
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }
  return null;
}

// =================================================================================================
// Normalização de campos do dado ANTT (compartilhada entre datastore e CSV)
// =================================================================================================

const VALID_CATEGORIES = new Set(['TAC', 'ETC', 'CTC']);

function normalizeCategory(value: unknown): 'TAC' | 'ETC' | 'CTC' | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  return VALID_CATEGORIES.has(normalized) ? (normalized as 'TAC' | 'ETC' | 'CTC') : null;
}

/**
 * `situacao_rntrc` → `RntrcLookupResultStatus`. Só `ATIVO`/`PENDENTE` existem no dado publicado
 * (sondagem real, ver header do arquivo) — qualquer outro texto (mudança futura do dicionário de
 * dados da ANTT) cai em `unknown` em vez de quebrar o gateway.
 */
function normalizeSituacao(value: unknown): RntrcLookupResultStatus {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'ATIVO') return 'active';
  if (normalized === 'PENDENTE') return 'unknown';
  return 'unknown';
}

/** `DD/MM/AAAA` (CSV) ou `AAAA-MM-DDTHH:MM:SS...` (datastore/ISO) → `AAAA-MM-DD`. `null` se não reconhecido. */
function normalizeStatusDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  return null;
}

type NormalizedRow = {
  rntrcNumber: string;
  category: 'TAC' | 'ETC' | 'CTC' | null;
  status: RntrcLookupResultStatus;
  statusDate: string | null;
  uf: string | null;
};

function normalizeRow(fields: {
  numero_rntrc?: unknown;
  categoria_transportador?: unknown;
  situacao_rntrc?: unknown;
  data_situacao_rntrc?: unknown;
  uf?: unknown;
}): NormalizedRow {
  return {
    rntrcNumber: stripLeadingZeros(onlyDigits(fields.numero_rntrc)),
    category: normalizeCategory(fields.categoria_transportador),
    status: normalizeSituacao(fields.situacao_rntrc),
    statusDate: normalizeStatusDate(fields.data_situacao_rntrc),
    uf: fields.uf ? String(fields.uf).trim().toUpperCase() || null : null
  };
}

function toResultFromRow(row: NormalizedRow, dataReferenceDate: string | null, source: RntrcLookupResult['source'], exchanges: RntrcGatewayExchange[]): RntrcLookupResult {
  return {
    found: true,
    rntrcNumber: row.rntrcNumber,
    category: row.category,
    status: row.status,
    dataReferenceDate,
    raw: {
      rntrcNumber: row.rntrcNumber,
      category: row.category,
      status: row.status,
      statusDate: row.statusDate,
      uf: row.uf
    },
    source,
    exchanges
  };
}

function notFoundResult(dataReferenceDate: string | null, source: RntrcLookupResult['source'], exchanges: RntrcGatewayExchange[]): RntrcLookupResult {
  return {
    found: false,
    rntrcNumber: null,
    category: null,
    status: 'not_found',
    dataReferenceDate,
    raw: {},
    source,
    exchanges
  };
}

// =================================================================================================
// HTTP — package_show / datastore_search (JSON pequeno)
// =================================================================================================

type CkanResource = {
  id: string;
  format: string;
  url: string;
  datastore_active?: boolean;
  last_modified?: string | null;
  created?: string | null;
};

async function fetchJson(url: string, timeoutMs: number): Promise<{ status: number; json: unknown; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    const latencyMs = Date.now() - startedAt;
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (!response.ok) {
      throw gatewayError(
        response.status,
        'RNTRC_GATEWAY_HTTP_ERROR',
        `Portal de Dados Abertos da ANTT respondeu ${response.status} para ${url}.`,
        { remoteStatus: response.status, url }
      );
    }
    return { status: response.status, json, latencyMs };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const isAbort = error instanceof Error && error.name === 'AbortError';
    if (isAbort) {
      throw gatewayError(504, 'RNTRC_GATEWAY_TIMEOUT', `Timeout (${timeoutMs}ms) consultando o Portal de Dados Abertos da ANTT (${url}).`, { url });
    }
    throw gatewayError(502, 'RNTRC_GATEWAY_NETWORK_ERROR', `Falha de rede consultando o Portal de Dados Abertos da ANTT (${url}): ${error instanceof Error ? error.message : String(error)}.`, { url });
  } finally {
    clearTimeout(timer);
  }
}

const RNTRC_DATASET_ID = 'rntrc';

async function packageShow(baseUrl: string, timeoutMs: number): Promise<{ resources: CkanResource[]; exchange: RntrcGatewayExchange }> {
  const endpoint = `${baseUrl}/api/3/action/package_show?id=${RNTRC_DATASET_ID}`;
  const { status, json, latencyMs } = await fetchJson(endpoint, timeoutMs);
  const resources = Array.isArray((json as { result?: { resources?: unknown } })?.result?.resources)
    ? ((json as { result: { resources: CkanResource[] } }).result.resources)
    : [];

  if (resources.length === 0) {
    throw gatewayError(502, 'RNTRC_GATEWAY_DATASET_UNAVAILABLE', `package_show do dataset "${RNTRC_DATASET_ID}" não devolveu nenhum resource.`, { endpoint });
  }

  return {
    resources,
    exchange: {
      request: { httpMethod: 'GET', endpoint },
      response: { httpMethod: 'GET', endpoint, httpStatus: status, latencyMs }
    }
  };
}

function resolveLatestCsvResource(resources: CkanResource[]): CkanResource {
  const csvResources = resources.filter((resource) => String(resource.format || '').toUpperCase() === 'CSV');
  if (csvResources.length === 0) {
    throw gatewayError(502, 'RNTRC_GATEWAY_DATASET_UNAVAILABLE', `Nenhum resource CSV encontrado no dataset "${RNTRC_DATASET_ID}".`);
  }
  return csvResources
    .slice()
    .sort((a, b) => {
      const dateA = a.last_modified || a.created || '';
      const dateB = b.last_modified || b.created || '';
      return dateB.localeCompare(dateA);
    })[0] as CkanResource;
}

function resolveDataReferenceDate(resource: CkanResource): string | null {
  const raw = resource.last_modified || resource.created || null;
  return raw ? raw.slice(0, 10) : null;
}

async function datastoreSearch(
  baseUrl: string,
  timeoutMs: number,
  resourceId: string,
  filters: Record<string, string>
): Promise<{ records: Record<string, unknown>[]; exchange: RntrcGatewayExchange }> {
  const params = new URLSearchParams({ resource_id: resourceId, filters: JSON.stringify(filters) });
  const endpoint = `${baseUrl}/api/3/action/datastore_search?${params.toString()}`;
  const { status, json, latencyMs } = await fetchJson(endpoint, timeoutMs);
  const records = Array.isArray((json as { result?: { records?: unknown } })?.result?.records)
    ? ((json as { result: { records: Record<string, unknown>[] } }).result.records)
    : [];

  return {
    records,
    exchange: {
      request: { httpMethod: 'GET', endpoint: `${baseUrl}/api/3/action/datastore_search`, sanitizedBody: { resource_id: resourceId, filters } },
      response: { httpMethod: 'GET', endpoint, httpStatus: status, latencyMs }
    }
  };
}

// =================================================================================================
// Fallback CSV — download streaming + cache local + busca linha a linha
// =================================================================================================

const RNTRC_CACHE_DIRNAME = 'rntrc-open-data';

/** Splitter respeitando aspas — o export ANTT usa `;` como delimitador e aspas em todo campo. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ';' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function ensureCsvCached(baseUrl: string, resource: CkanResource, downloadTimeoutMs: number, maxBytes: number): Promise<{ path: string; exchange: RntrcGatewayExchange }> {
  await ensureDir(resolveStoragePath(RNTRC_CACHE_DIRNAME));
  const cachePath = resolveStoragePath(RNTRC_CACHE_DIRNAME, `rntrc-${resource.id}.csv`);

  try {
    await fs.access(cachePath);
    // Já em cache — o id do resource muda a cada mês publicado pela ANTT, então um hit aqui é
    // sempre o dado do MESMO mês (nunca rebaixa um cache novo para um antigo).
    return {
      path: cachePath,
      exchange: {
        request: { httpMethod: 'GET', endpoint: resource.url, sanitizedBody: { cached: true } },
        response: { httpMethod: 'GET', endpoint: resource.url, httpStatus: 304, latencyMs: 0, sanitizedBody: { cached: true } }
      }
    };
  } catch {
    // sem cache — segue para download
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), downloadTimeoutMs);
  const startedAt = Date.now();
  const tmpPath = `${cachePath}.part-${process.pid}-${Date.now()}`;

  try {
    const response = await fetch(resource.url, { signal: controller.signal });
    if (!response.ok || !response.body) {
      throw gatewayError(502, 'RNTRC_GATEWAY_CSV_DOWNLOAD_FAILED', `Download do CSV RNTRC (${resource.url}) respondeu ${response.status}.`, { url: resource.url, remoteStatus: response.status });
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw gatewayError(
        502,
        'RNTRC_GATEWAY_CSV_TOO_LARGE',
        `CSV RNTRC (${resource.url}) tem ${contentLength} bytes — acima do teto configurado (${maxBytes}).`,
        { url: resource.url, contentLength, maxBytes }
      );
    }

    let totalBytes = 0;
    const nodeSource = Readable.fromWeb(response.body);
    const guard = new Transform({
      transform(chunk: Buffer, _enc, callback) {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          callback(gatewayError(502, 'RNTRC_GATEWAY_CSV_TOO_LARGE', `CSV RNTRC (${resource.url}) excedeu ${maxBytes} bytes durante o download.`, { url: resource.url, maxBytes }));
          return;
        }
        callback(null, chunk);
      }
    });

    const writeStream = createWriteStream(tmpPath);
    await pipeline(nodeSource, guard, writeStream);
    await fs.rename(tmpPath, cachePath);

    const latencyMs = Date.now() - startedAt;
    return {
      path: cachePath,
      exchange: {
        request: { httpMethod: 'GET', endpoint: resource.url },
        response: { httpMethod: 'GET', endpoint: resource.url, httpStatus: response.status, latencyMs, sanitizedBody: { bytesDownloaded: totalBytes } }
      }
    };
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    if (error instanceof AppError) throw error;
    const isAbort = error instanceof Error && error.name === 'AbortError';
    if (isAbort) {
      throw gatewayError(504, 'RNTRC_GATEWAY_TIMEOUT', `Timeout (${downloadTimeoutMs}ms) baixando o CSV RNTRC (${resource.url}).`, { url: resource.url });
    }
    throw gatewayError(502, 'RNTRC_GATEWAY_NETWORK_ERROR', `Falha de rede baixando o CSV RNTRC (${resource.url}): ${error instanceof Error ? error.message : String(error)}.`, { url: resource.url });
  } finally {
    clearTimeout(timer);
  }
}

async function searchCsvForDocument(
  csvPath: string,
  normalizedDocument: string | null,
  normalizedRntrcNumber: string | null
): Promise<NormalizedRow | null> {
  const input = createReadStream(csvPath, { encoding: 'latin1' });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let columnIndex: Record<string, number> | null = null;
  try {
    for await (const line of rl) {
      if (!line) continue;
      const fields = splitCsvLine(line);

      if (!columnIndex) {
        columnIndex = {};
        fields.forEach((name, index) => {
          if (columnIndex) columnIndex[name.trim()] = index;
        });
        continue;
      }

      const activeColumnIndex = columnIndex;
      const get = (name: string): string | undefined => {
        const index = activeColumnIndex[name];
        return index === undefined ? undefined : fields[index];
      };

      const rowDocument = onlyDigits(get('cpfcnpjtransportador'));
      const rowRntrc = stripLeadingZeros(onlyDigits(get('numero_rntrc')));

      const documentMatches = normalizedDocument != null && rowDocument === normalizedDocument;
      const rntrcMatches = normalizedRntrcNumber != null && rowRntrc === normalizedRntrcNumber;
      if (!documentMatches && !rntrcMatches) continue;

      rl.close();
      input.destroy();
      return normalizeRow({
        numero_rntrc: get('numero_rntrc'),
        categoria_transportador: get('categoria_transportador'),
        situacao_rntrc: get('situacao_rntrc'),
        data_situacao_rntrc: get('data_situacao_rntrc'),
        uf: get('uf')
      });
    }
  } finally {
    rl.close();
    input.destroy();
  }
  return null;
}

// =================================================================================================
// Estratégia mock — determinística, sem rede
// =================================================================================================

function lookupMock(query: RntrcLookupQuery, overrides: Record<string, RntrcMockOverride> = {}): RntrcLookupResult {
  const documentDigits = onlyDigits(query.document);
  const rntrcDigits = query.rntrcNumber ? stripLeadingZeros(onlyDigits(query.rntrcNumber)) : '';
  const override = (documentDigits && overrides[documentDigits]) || (rntrcDigits && overrides[rntrcDigits]) || null;

  const lastDigit = documentDigits ? Number(documentDigits[documentDigits.length - 1]) : 0;
  const isEven = Number.isFinite(lastDigit) && lastDigit % 2 === 0;

  const base: RntrcLookupResult = isEven
    ? {
        found: true,
        rntrcNumber: rntrcDigits || '50085788',
        category: 'ETC',
        status: 'active',
        dataReferenceDate: null,
        raw: { rntrcNumber: rntrcDigits || '50085788', category: 'ETC', status: 'active', statusDate: null, uf: null },
        source: 'mock',
        exchanges: []
      }
    : {
        found: false,
        rntrcNumber: null,
        category: null,
        status: 'not_found',
        dataReferenceDate: null,
        raw: {},
        source: 'mock',
        exchanges: []
      };

  const result: RntrcLookupResult = override ? { ...base, ...override, source: 'mock', exchanges: [] } : base;
  // `raw` é sempre reconstruído a partir do resultado FINAL (pós-override) — nunca um spread cru
  // do override, que tem um shape diferente (`found`/`dataReferenceDate` não pertencem a `raw`).
  result.raw = result.found
    ? { rntrcNumber: result.rntrcNumber, category: result.category, status: result.status, statusDate: null, uf: null }
    : {};
  return result;
}

// =================================================================================================
// Fábrica
// =================================================================================================

export function createAnttRntrcGateway(options: CreateAnttRntrcGatewayOptions = {}): AnttRntrcGateway {
  const mode = options.mode ?? config.rntrcGatewayMode;
  const baseUrl = options.baseUrl ?? config.rntrcGatewayBaseUrl;
  const timeoutMs = options.timeoutMs ?? config.rntrcGatewayTimeoutMs;
  const csvDownloadTimeoutMs = options.csvDownloadTimeoutMs ?? config.rntrcGatewayCsvDownloadTimeoutMs;
  const csvMaxBytes = options.csvMaxBytes ?? config.rntrcGatewayCsvMaxBytes;
  const mockOverrides = options.mockOverrides ?? {};

  async function lookupCarrier(query: RntrcLookupQuery): Promise<RntrcLookupResult> {
    const documentDigits = query.document ? onlyDigits(query.document) : '';
    const rntrcDigits = query.rntrcNumber ? stripLeadingZeros(onlyDigits(query.rntrcNumber)) : '';

    if (!documentDigits && !rntrcDigits) {
      throw gatewayError(400, 'RNTRC_GATEWAY_INVALID_QUERY', 'lookupCarrier exige document ou rntrcNumber.');
    }

    if (mode === 'mock') {
      // Jitter mínimo — mantém o shape "assíncrono" sem serializar testes uns atrás dos outros.
      await delay(0);
      return lookupMock({ document: documentDigits || null, rntrcNumber: rntrcDigits || null }, mockOverrides);
    }

    const { resources, exchange: packageExchange } = await packageShow(baseUrl, timeoutMs);
    const resource = resolveLatestCsvResource(resources);
    const dataReferenceDate = resolveDataReferenceDate(resource);
    const exchanges: RntrcGatewayExchange[] = [packageExchange];

    if (resource.datastore_active) {
      const documentMask = documentDigits ? formatDocumentMask(documentDigits) : null;
      const filters: Record<string, string> = documentMask
        ? { cpfcnpjtransportador: documentMask }
        : { numero_rntrc: rntrcDigits };
      const { records, exchange } = await datastoreSearch(baseUrl, timeoutMs, resource.id, filters);
      exchanges.push(exchange);

      const record = records[0];
      if (!record) return notFoundResult(dataReferenceDate, 'datastore', exchanges);

      const row = normalizeRow({
        numero_rntrc: record.numero_rntrc,
        categoria_transportador: record.categoria_transportador,
        situacao_rntrc: record.situacao_rntrc,
        data_situacao_rntrc: record.data_situacao_rntrc,
        uf: record.uf
      });
      return toResultFromRow(row, dataReferenceDate, 'datastore', exchanges);
    }

    const { path: csvPath, exchange: downloadExchange } = await ensureCsvCached(baseUrl, resource, csvDownloadTimeoutMs, csvMaxBytes);
    exchanges.push(downloadExchange);

    const row = await searchCsvForDocument(csvPath, documentDigits || null, rntrcDigits || null);
    if (!row) return notFoundResult(dataReferenceDate, 'csv_cache', exchanges);
    return toResultFromRow(row, dataReferenceDate, 'csv_cache', exchanges);
  }

  return { mode, lookupCarrier };
}
