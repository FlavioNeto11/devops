import { AppError } from '../../lib/problem.js';
import { runOperationalDiagnosis } from './conversation-diagnostic-agent.js';
import {
  listManifests,
  getManifest,
  listCdfCertificates,
  enqueueCdfGenerate,
  enqueueCdfDownload,
  createManifest,
  enqueueManifestSubmit,
  enqueueManifestBatchSubmit,
  enqueueManifestPrint,
  enqueueManifestCancel,
  enqueueManifestBatchCancel,
  enqueueManifestReceive,
  replicateManifest
} from '../manifest-service.js';
import { getJob } from '../job-service.js';
import { getAuditTrail } from '../audit-service.js';
import { queryCatalog } from '../catalog-service.js';
import { searchPartners } from '../partner-service.js';
import { getOperationsOverview, jobsSearch } from '../operations-service.js';
import { listDmrService } from '../dmr-service.js';
import { listMtrProvisorioService } from '../mtr-provisorio-service.js';
import { listManifestDocuments } from '../../repositories/manifest-repo.js';
import {
  getSystemHealth,
  getWorkerStatistics,
  listActiveJobs,
  calculateJobPerformanceMetrics
} from '../../repositories/health-repo.js';
import {
  MANIFEST_GROUP_DIMENSIONS,
  validateConversationToolInput,
  type ManifestGroupOrder
} from './tools/tool-schemas.js';
import { resolveManifestReference } from './tools/tool-entity-resolver.js';
import {
  normalizeManifestActionResult,
  normalizeManifestDetailResult,
  normalizeManifestListResult
} from './tools/tool-normalizer.js';

export type ConversationDispatchInput = {
  toolName: string;
  toolArgs: Record<string, unknown>;
  context: {
    correlationId: string;
    integrationAccountId: string | null;
    sessionContextId: string | null;
    requestedBy: string | null;
    manifestId: string | null;
    idempotencyKey: string | null;
    lastManifestSelectionIds?: string[];
  };
  headers: Record<string, string | undefined>;
};

type ManifestListItem = {
  id: string;
  manifestNumber: string | number | null;
  expeditionDate: string | null;
  lastSyncAt: string | null;
  status: string | null;
  externalStatus: string | null;
  externalHashCode: string | null;
  generatorDescription: string | null;
  carrierDescription: string | null;
  receiverDescription: string | null;
  driverName: string | null;
  vehiclePlate: string | null;
};

type ManifestConsolidatedDetail = {
  manifestId: string;
  manifestNumber: string | number | null;
  expeditionDate: string | null;
  status: string | null;
  externalStatus: string | null;
  externalHashCode: string | null;
  generator: string | null;
  carrier: string | null;
  receiver: string | null;
  driverName: string | null;
  vehiclePlate: string | null;
  lastSyncAt: string | null;
};

type BatchOperation = 'submit' | 'print' | 'cancel';

const SAFE_BATCH_MAX_ITEMS = 10;
// Impressão/2ª via apenas GERA documentos (PDF) para download — risco baixo frente a
// submeter/cancelar — então admite um lote maior (ex.: baixar os comprovantes de um período).
const SAFE_PRINT_MAX_ITEMS = 50;
// Teto de ids guardados no snapshot determinístico (cobre o maior lote suportado).
const SAFE_SNAPSHOT_MAX_ITEMS = 50;

function maxBatchItemsForOperation(operation?: BatchOperation): number {
  return operation === 'print' ? SAFE_PRINT_MAX_ITEMS : SAFE_BATCH_MAX_ITEMS;
}
const MAX_SEGMENTED_REPLICATION_BATCH = 20;
const SNAPSHOT_VERSION = 'conversation-selection.v1';

type ManifestRecencyOrder = 'recency_desc' | 'recency_asc';
type ManifestDateRange = {
  dateFrom: string | null;
  dateTo: string | null;
};

function toTrimmedString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).trim();
  }
  return '';
}

function toNullableString(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  return normalized || null;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toStringOrNumberOrNull(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of value) {
    const normalized = toNullableString(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function toIntArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const output: number[] = [];
  const seen = new Set<number>();

  for (const item of value) {
    const parsed = toOptionalNumber(item);
    if (parsed === undefined) continue;
    const normalized = Math.trunc(parsed);
    if (normalized < 1 || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

type DeterministicSelectionSnapshot = {
  snapshotVersion: string;
  intent: string;
  integrationAccountId: string | null;
  sessionContextId: string | null;
  selectedManifestIds: string[];
  selectedDocumentIds: string[];
  generatedAt: string;
  criteria: Record<string, unknown>;
};

function createDeterministicSelectionSnapshot(input: {
  intent: string;
  integrationAccountId: string | null;
  sessionContextId: string | null;
  selectedManifestIds?: string[];
  selectedDocumentIds?: string[];
  criteria?: Record<string, unknown>;
}) {
  const payload: DeterministicSelectionSnapshot = {
    snapshotVersion: SNAPSHOT_VERSION,
    intent: input.intent,
    integrationAccountId: input.integrationAccountId,
    sessionContextId: input.sessionContextId,
    selectedManifestIds: toStringArray(input.selectedManifestIds || []).slice(0, SAFE_SNAPSHOT_MAX_ITEMS),
    selectedDocumentIds: toStringArray(input.selectedDocumentIds || []).slice(0, SAFE_SNAPSHOT_MAX_ITEMS),
    generatedAt: new Date().toISOString(),
    criteria: input.criteria || {}
  };

  return toBase64Url(JSON.stringify(payload));
}

function parseDeterministicSelectionSnapshot(value: unknown): DeterministicSelectionSnapshot | null {
  const encoded = toNullableString(value);
  if (!encoded) return null;

  try {
    const raw = JSON.parse(fromBase64Url(encoded)) as Record<string, unknown>;
    if (toNullableString(raw.snapshotVersion) !== SNAPSHOT_VERSION) return null;

    return {
      snapshotVersion: SNAPSHOT_VERSION,
      intent: toNullableString(raw.intent) || '',
      integrationAccountId: toNullableString(raw.integrationAccountId),
      sessionContextId: toNullableString(raw.sessionContextId),
      selectedManifestIds: toStringArray(raw.selectedManifestIds),
      selectedDocumentIds: toStringArray(raw.selectedDocumentIds),
      generatedAt: toNullableString(raw.generatedAt) || new Date(0).toISOString(),
      criteria: toRecord(raw.criteria)
    };
  } catch {
    return null;
  }
}

function ensureDeterministicSelectionSnapshot(input: {
  value: unknown;
  expectedIntent: string;
  integrationAccountId: string | null;
}): DeterministicSelectionSnapshot {
  const snapshot = parseDeterministicSelectionSnapshot(input.value);
  if (!snapshot) {
    throw new AppError(
      409,
      'Conflict',
      'Confirmacao sensivel sem snapshot valido. Execute preview primeiro para congelar o conjunto selecionado.',
      { code: 'CONVERSATION_SELECTION_SNAPSHOT_REQUIRED' }
    );
  }

  if (snapshot.intent !== input.expectedIntent) {
    throw new AppError(
      409,
      'Conflict',
      `Snapshot invalido para intent ${input.expectedIntent}. Gere preview novamente antes de confirmar.`,
      { code: 'CONVERSATION_SELECTION_SNAPSHOT_MISMATCH' }
    );
  }

  if (snapshot.integrationAccountId && input.integrationAccountId && snapshot.integrationAccountId !== input.integrationAccountId) {
    throw new AppError(
      409,
      'Conflict',
      'Snapshot pertence a outra conta operacional. Gere preview no contexto atual antes de confirmar.',
      { code: 'CONVERSATION_SELECTION_SCOPE_MISMATCH' }
    );
  }

  return snapshot;
}

type ReplicationSegmentInput = {
  sourceManifestId: string;
  count: number;
  overrides: Record<string, unknown>;
};

function normalizeReplicationSegments(args: Record<string, unknown>, contextManifestId: string | null): ReplicationSegmentInput[] {
  const provided = Array.isArray(args.segments) ? args.segments : [];
  if (provided.length > 0) {
    return provided
      .slice(0, MAX_SEGMENTED_REPLICATION_BATCH)
      .map((item) => toRecord(item))
      .map((item) => {
        const sourceManifestId = requireString(
          item.sourceManifestId || item.manifestId,
          'Cada segmento de replicacao deve informar sourceManifestId.'
        );
        const count = clampPositiveInt(item.count, 1);
        const overrides = toRecord(item.overrides);
        const driverName = toNullableString(overrides.driverName || item.driverName);
        const vehiclePlate = toUpperPlate(overrides.vehiclePlate || item.vehiclePlate);

        return {
          sourceManifestId,
          count,
          overrides: {
            ...overrides,
            ...(driverName ? { driverName } : {}),
            ...(vehiclePlate ? { vehiclePlate } : {})
          }
        };
      });
  }

  const sourceManifestId = requireString(
    args.sourceManifestId || args.manifestId || contextManifestId,
    'sourceManifestId is required to replicate with patch.'
  );
  const rawOverrides = toRecord(args.overrides);
  const driverName = toNullableString(rawOverrides.driverName || args.driverName);
  const vehiclePlate = toUpperPlate(rawOverrides.vehiclePlate || args.vehiclePlate);

  return [
    {
      sourceManifestId,
      count: clampPositiveInt(args.count, 1),
      overrides: {
        ...rawOverrides,
        ...(driverName ? { driverName } : {}),
        ...(vehiclePlate ? { vehiclePlate } : {})
      }
    }
  ];
}

function buildOperatorActionHint() {
  return 'Use preview para congelar o conjunto, depois confirme com snapshot, ou informe manifestId/numero explicitamente.';
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function clampPositiveInt(value: unknown, fallback: number): number {
  const parsed = toOptionalNumber(value);
  if (!parsed) return fallback;
  const intValue = Math.trunc(parsed);
  return intValue > 0 ? intValue : fallback;
}

function clampNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = toOptionalNumber(value);
  if (parsed === undefined) return fallback;
  const intValue = Math.trunc(parsed);
  return intValue >= 0 ? intValue : fallback;
}

function resolveManifestRecencyOrder(value: unknown): ManifestRecencyOrder {
  const normalized = toNullableString(value)?.toLowerCase();
  if (normalized === 'recency_asc') return 'recency_asc';
  return 'recency_desc';
}

function toIsoDateOnly(value: unknown): string | null {
  const normalized = toNullableString(value);
  if (!normalized) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function resolveManifestDateRange(selection: Record<string, unknown>, args: Record<string, unknown>): ManifestDateRange {
  const from =
    toIsoDateOnly(selection.dateFrom)
    || toIsoDateOnly(selection.from)
    || toIsoDateOnly(selection.startDate)
    || toIsoDateOnly(args.dateFrom)
    || toIsoDateOnly(args.from)
    || toIsoDateOnly(args.startDate)
    || null;

  const to =
    toIsoDateOnly(selection.dateTo)
    || toIsoDateOnly(selection.to)
    || toIsoDateOnly(selection.endDate)
    || toIsoDateOnly(args.dateTo)
    || toIsoDateOnly(args.to)
    || toIsoDateOnly(args.endDate)
    || null;

  if (from && to && from > to) {
    throw new AppError(
      400,
      'Bad Request',
      `Periodo invalido: dateFrom (${from}) deve ser menor ou igual a dateTo (${to}).`,
      {
        code: 'CONVERSATION_INVALID_DATE_RANGE',
        context: {
          dateFrom: from,
          dateTo: to
        }
      }
    );
  }

  return { dateFrom: from, dateTo: to };
}

function assertOrderedDateRange(input: {
  dateFrom: string | null;
  dateTo: string | null;
  source: 'list_manifests' | 'list_cdf_certificates';
}) {
  if (!input.dateFrom || !input.dateTo) {
    return;
  }

  if (input.dateFrom <= input.dateTo) {
    return;
  }

  throw new AppError(
    400,
    'Bad Request',
    `Periodo invalido para ${input.source}: dateFrom (${input.dateFrom}) deve ser menor ou igual a dateTo (${input.dateTo}).`,
    {
      code: 'CONVERSATION_INVALID_DATE_RANGE',
      context: {
        source: input.source,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo
      }
    }
  );
}

function toManifestDateKey(item: ManifestListItem): string | null {
  return toIsoDateOnly(item.expeditionDate || item.lastSyncAt);
}

export function filterManifestsByDateRange(
  items: ManifestListItem[],
  dateFrom: string | null,
  dateTo: string | null
) {
  if (!dateFrom && !dateTo) return items;

  return items.filter((item) => {
    const dateKey = toManifestDateKey(item);
    if (!dateKey) return false;
    if (dateFrom && dateKey < dateFrom) return false;
    if (dateTo && dateKey > dateTo) return false;
    return true;
  });
}

function toUpperPlate(value: unknown): string | null {
  const normalized = toNullableString(value);
  return normalized ? normalized.toUpperCase() : null;
}

function enforceOperationalContext(input: {
  integrationAccountId: string | null;
  sessionContextId?: string | null;
  requireSession?: boolean;
}) {
  if (!input.integrationAccountId) {
    throw new AppError(
      400,
      'Bad Request',
      'Conta CETESB ativa nao informada para esta operacao. Selecione a conta e tente novamente.',
      { code: 'CONVERSATION_INTEGRATION_ACCOUNT_REQUIRED' }
    );
  }

  if (input.requireSession && !input.sessionContextId) {
    throw new AppError(
      400,
      'Bad Request',
      'Sessao CETESB ativa nao informada. Reautentique a conta antes de continuar.',
      { code: 'CONVERSATION_SESSION_CONTEXT_REQUIRED' }
    );
  }
}

function resolveScopeFromArgs(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const integrationAccountId = toNullableString(args.integrationAccountId) || input.context.integrationAccountId;
  const sessionContextId = toNullableString(args.sessionContextId) || input.context.sessionContextId;

  return {
    integrationAccountId,
    sessionContextId
  };
}

function requireString(value: unknown, detail: string): string {
  const normalized = toNullableString(value);
  if (!normalized) {
    throw new AppError(400, 'Bad Request', detail, { code: 'CONVERSATION_CONTEXT_MISSING' });
  }
  return normalized;
}

async function getDashboardOverview() {
  const [system, workers, activeJobs, performance] = await Promise.all([
    getSystemHealth(),
    getWorkerStatistics(),
    listActiveJobs(20),
    calculateJobPerformanceMetrics(24)
  ]);

  return {
    health: system,
    workers,
    activeJobs: {
      total: activeJobs.length,
      items: activeJobs.slice(0, 10)
    },
    performance
  };
}

function asListResponseItems(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  return Array.isArray(record.items) ? record.items : [];
}

function toManifestListItem(value: unknown): ManifestListItem | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = toNullableString(record.id);
  if (!id) return null;

  const generator = toRecord(record.generator);
  const carrier = toRecord(record.carrier);
  const receiver = toRecord(record.receiver);

  return {
    id,
    manifestNumber:
      typeof record.manifestNumber === 'string' || typeof record.manifestNumber === 'number'
        ? record.manifestNumber
        : null,
    expeditionDate: toNullableString(record.expeditionDate),
    lastSyncAt: toNullableString(record.lastSyncAt),
    status: toNullableString(record.status),
    externalStatus: toNullableString(record.externalStatus),
    externalHashCode: toNullableString(record.externalHashCode),
    generatorDescription: toNullableString(generator.description),
    carrierDescription: toNullableString(carrier.description),
    receiverDescription: toNullableString(receiver.description),
    driverName: toNullableString(record.driverName),
    vehiclePlate: toNullableString(record.vehiclePlate)
  };
}

function toRecencyTimestamp(item: ManifestListItem): number {
  const candidates = [item.expeditionDate, item.lastSyncAt];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const millis = Date.parse(candidate);
    if (Number.isFinite(millis)) return millis;
  }
  return 0;
}

export function selectRecentManifests(
  items: ManifestListItem[],
  top: number,
  skipMostRecent: number,
  orderBy: ManifestRecencyOrder
) {
  const sorted = [...items].sort((a, b) => {
    const delta = toRecencyTimestamp(b) - toRecencyTimestamp(a);
    return orderBy === 'recency_asc' ? -delta : delta;
  });

  return sorted.slice(skipMostRecent, skipMostRecent + top);
}

function summarizeManifestReference(item: ManifestListItem) {
  return {
    manifestId: item.id,
    manifestNumber: item.manifestNumber,
    expeditionDate: item.expeditionDate,
    status: item.status,
    externalStatus: item.externalStatus,
    externalHashCode: item.externalHashCode,
    generator: item.generatorDescription,
    carrier: item.carrierDescription,
    receiver: item.receiverDescription,
    driverName: item.driverName,
    vehiclePlate: item.vehiclePlate
  };
}

function positionLabel(n: number): string {
  const labels = ['1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º'];
  return labels[n - 1] ?? `${n}º`;
}

function buildPeriodText(dateRange: ManifestDateRange): string | null {
  const operationalTodayIso = getOperationalTodayIso();
  const timezone = getOperationalTimezone();

  if (dateRange.dateFrom && dateRange.dateTo) {
    if (dateRange.dateFrom === operationalTodayIso && dateRange.dateTo === operationalTodayIso) {
      return `no periodo de hoje (timezone ${timezone})`;
    }

    const fromTs = Date.parse(`${dateRange.dateFrom}T00:00:00.000Z`);
    const toTs = Date.parse(`${dateRange.dateTo}T00:00:00.000Z`);
    if (Number.isFinite(fromTs) && Number.isFinite(toTs) && dateRange.dateTo === operationalTodayIso) {
      const diffDays = Math.round((toTs - fromTs) / 86400000);
      if (diffDays >= 27 && diffDays <= 31) {
        return 'no periodo dos ultimos 30 dias';
      }
    }

    return `no periodo de ${dateRange.dateFrom} ate ${dateRange.dateTo}`;
  }

  if (dateRange.dateFrom) {
    return `a partir de ${dateRange.dateFrom}`;
  }

  if (dateRange.dateTo) {
    return `ate ${dateRange.dateTo}`;
  }

  return null;
}

function getOperationalTimezone(): string {
  const raw = process.env.SICAT_OPERATIONAL_TIMEZONE || 'America/Sao_Paulo';
  const trimmed = raw.trim();
  return trimmed || 'America/Sao_Paulo';
}

function getOperationalTodayIso(): string {
  const timezone = getOperationalTimezone();

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function buildQueryNoDataSummary(input: {
  domainLabel: 'manifestos' | 'cdfs';
  periodText: string | null;
  statusSummary: string;
  justification: string;
}): string {
  const periodSummary = input.periodText || 'no periodo solicitado';
  return `Consulta de ${input.domainLabel}: ${periodSummary}. Resumo: total encontrado=0, status relevantes=${input.statusSummary}, ausencia de dados=sim. Justificativa: ${input.justification}.`;
}

function toCdfStatusLabel(item: Record<string, unknown>): string {
  const directStatus = toNullableString(item.status || item.externalStatus);
  if (directStatus) return directStatus;

  const type = toRecord(item.type);
  const typeDescription = toNullableString(type.description);
  if (typeDescription) {
    return `emitido (${typeDescription})`;
  }

  return 'emitido';
}

function summarizeRelevantStatuses(items: Record<string, unknown>[], fallback = 'nenhum'): string {
  const statuses = Array.from(new Set(items
    .map((item) => toNullableString(item.status || item.externalStatus))
    .filter((value): value is string => Boolean(value))))
    .slice(0, 5);

  if (statuses.length === 0) return fallback;
  return statuses.join(', ');
}

function buildCdfListSummary(input: {
  items: Record<string, unknown>[];
  dateFrom: string | null;
  dateTo: string | null;
  message: string | null;
}): string {
  const periodText = buildPeriodText({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo
  });

  if (input.items.length === 0) {
    return buildQueryNoDataSummary({
      domainLabel: 'cdfs',
      periodText,
      statusSummary: 'emitido',
      justification: input.message || 'nenhum certificado foi retornado para os filtros aplicados'
    });
  }

  const topStatuses = Array.from(new Set(input.items.map(toCdfStatusLabel))).slice(0, 5).join(', ');
  const periodSummary = periodText || 'no periodo solicitado';

  return `Consulta de cdfs: ${periodSummary}. Resumo: total encontrado=${input.items.length}, status relevantes=${topStatuses}, ausencia de dados=nao.`;
}

function buildDmrHelpSummary(input: {
  total: number;
  periodStart: string | null;
  periodEnd: string | null;
  items: Record<string, unknown>[];
}): string {
  const periodText = buildPeriodText({
    dateFrom: input.periodStart,
    dateTo: input.periodEnd
  });

  const statuses = summarizeRelevantStatuses(input.items);
  const totalSummary = `total encontrado=${input.total}`;
  const periodSummary = periodText || 'no periodo solicitado';

  if (input.total === 0) {
    return `DMR no SICAT e a Declaracao de Movimentacao de Residuos para consolidacao declaratoria e acompanhamento regulatorio junto ao fluxo CETESB. Quando usar: fechamento e revisao do periodo declaratorio antes de submit. Resumo da consulta: ${periodSummary}, ${totalSummary}, status relevantes=${statuses}, ausencia de dados=sim. Justificativa: nao ha declaracoes DMR registradas nos filtros atuais.`;
  }

  return `DMR no SICAT e a Declaracao de Movimentacao de Residuos para consolidacao declaratoria no fluxo CETESB. Quando usar: revisar pendencias, consolidar periodo e enviar declaracao. Resumo da consulta: ${periodSummary}, ${totalSummary}, status relevantes=${statuses}, ausencia de dados=nao.`;
}

function normalizePartnerRoleLabel(role: string | null): string {
  const normalized = (role || '').toLowerCase();
  if (normalized === 'generator') return 'gerador';
  if (normalized === 'carrier') return 'transportador';
  if (normalized === 'receiver') return 'destinador';
  return role || 'gerador';
}

function extractFirstDefinedField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = toNullableString(record[key]);
    if (value) return value;
  }

  return null;
}

function buildCatalogListSummary(input: {
  catalogName: string;
  search: string | null;
  totalItems: number;
  items: Record<string, unknown>[];
}): string {
  const filterSummary = input.search ? `filtro search=${input.search}` : 'sem filtro search';
  const isWasteTypes = input.catalogName.toLowerCase() === 'wastetypes';
  const catalogLabel = isWasteTypes ? 'tipos de residuos' : input.catalogName;

  if (input.totalItems === 0) {
    const noDataHint = isWasteTypes
      ? 'nenhum tipo de residuo foi retornado para a conta/filtro atual'
      : `o catalogo nao retornou itens para ${filterSummary}`;
    return `Consulta de catalogos (${catalogLabel}): no periodo solicitado. Resumo: total encontrado=0, status relevantes=sincronizado, ausencia de dados=sim. Justificativa: ${noDataHint}. Proximo passo operacional: ajuste o filtro (codigo/descricao) ou valide sincronizacao da conta CETESB antes de reexecutar.`;
  }

  const sample = input.items
    .slice(0, 5)
    .map((item) => extractFirstDefinedField(item, ['description', 'descricao', 'name', 'nome', 'code', 'codigo']))
    .filter((value): value is string => Boolean(value));

  const sampleSummary = sample.length > 0
    ? ` Primeiros itens: ${sample.join(', ')}.`
    : '';

  return `Consulta de catalogos (${catalogLabel}): no periodo solicitado. Resumo: total encontrado=${input.totalItems}, status relevantes=sincronizado, ausencia de dados=nao. Filtro aplicado: ${filterSummary}.${sampleSummary}`;
}

function buildJobsListSummary(input: {
  items: Record<string, unknown>[];
  totalItems: number;
  statusFilter: string | null;
  mode?: string | null;
}): string {
  const statuses = summarizeRelevantStatuses(input.items, 'nenhum');
  const period = 'no periodo solicitado';
  const statusFilter = input.statusFilter || 'ativos';
  const navigationMode = toNullableString(input.mode)?.toLowerCase();
  const normalizedStatusFilter = statusFilter.trim().toLowerCase();
  const isErrorNavigation = navigationMode === 'jobs_error_navigation'
    || normalizedStatusFilter === 'error'
    || normalizedStatusFilter === 'failed'
    || normalizedStatusFilter === 'dlq';

  if (isErrorNavigation) {
    if (input.totalItems === 0) {
      return 'Para consultar jobs com erro no SICAT, use o modulo Jobs e, para diagnostico detalhado, o Centro Operacional > Console de jobs. No fluxo SICAT/CETESB, esses jobs representam etapas assicronas como submit, print, generate ou download que falharam, entraram em retry ou foram para DLQ. Acao recomendada: revisar o filtro, abrir o job ou correlationId correspondente e cruzar com Auditoria antes de reenfileirar. Causa: a origem costuma aparecer no motivo do job/DLQ, por exemplo sessao CETESB invalida, payload inconsistente ou erro retornado pela integracao. Limitacao: esta orientacao explica onde consultar e como ler a falha, sem afirmar que existe um job especifico com erro neste momento.';
    }

    const topOperations = Array.from(new Set(input.items
      .map((item) => toNullableString(item.operation || item.entityType))
      .filter((value): value is string => Boolean(value))))
      .slice(0, 5)
      .join(', ');
    const operationsSummary = topOperations ? ` Operacoes mais afetadas: ${topOperations}.` : '';

    return `Para consultar jobs com erro no SICAT, use o modulo Jobs e, para diagnostico detalhado, o Centro Operacional > Console de jobs. No fluxo SICAT/CETESB, esses jobs mostram onde uma etapa assincrona parou e se houve retry ou envio para DLQ.${operationsSummary} Acao recomendada: abrir o job afetado, conferir tentativas, correlationId e motivo do erro, e depois validar Auditoria antes de reprocessar. Causa: a trilha do job normalmente explicita se a falha veio de sessao CETESB, validacao de dados ou retorno do gateway.`;
  }

  if (input.totalItems === 0) {
    return `Consulta de jobs/fila/DLQ: ${period}. Resumo: total encontrado=0, status relevantes=jobs ativos (${statusFilter}) e DLQ, ausencia de dados=sim. Lista de jobs ativos: nenhum registro. Justificativa: nenhum job foi encontrado para o filtro aplicado.`;
  }

  const topOperations = Array.from(new Set(input.items
    .map((item) => toNullableString(item.operation || item.entityType))
    .filter((value): value is string => Boolean(value))))
    .slice(0, 5)
    .join(', ');

  const extra = topOperations ? ` Operacoes relevantes: ${topOperations}.` : '';
  return `Consulta de jobs/fila/DLQ: ${period}. Resumo: total encontrado=${input.totalItems}, status relevantes=${statuses}, ausencia de dados=nao.${extra}`;
}

function buildPartnerSearchSummary(input: {
  role: string;
  q: string | null;
  totalItems: number;
  items: Record<string, unknown>[];
}): string {
  const roleLabel = normalizePartnerRoleLabel(input.role);

  const documentFilter = input.q || 'nao informado';

  if (!input.q) {
    return `Limitacao operacional: CNPJ nao informado para a busca por documento. Consulta de parceiros (${roleLabel}): periodo aplicado=no periodo solicitado. Resumo operacional: total encontrado=0, status relevantes=cadastro de parceiros, ausencia de dados=sim. Impacto: sem CNPJ nao e possivel confirmar um parceiro especifico por documento. Proximo passo operacional: informe o CNPJ (com ou sem pontuacao) para executar a pesquisa precisa.`;
  }

  if (input.totalItems === 0) {
    const guidance = 'Revise o CNPJ informado (pontuacao/zeros) e tente novamente.';
    return `Consulta de parceiros (${roleLabel}): no periodo solicitado. Resumo: total encontrado=0, status relevantes=cadastro de parceiros, ausencia de dados=sim. Justificativa: nenhum parceiro foi encontrado para o filtro documento=${documentFilter}. Proximo passo operacional: ${guidance}`;
  }

  const sample = input.items
    .slice(0, 3)
    .map((item) => {
      const description = extractFirstDefinedField(item, ['description', 'tradeName', 'nome']);
      const document = extractFirstDefinedField(item, ['document', 'cnpj', 'cpf']);
      if (description && document) return `${description} (${document})`;
      return description || document;
    })
    .filter((value): value is string => Boolean(value));

  const sampleSummary = sample.length > 0
    ? ` Primeiros parceiros: ${sample.join(', ')}.`
    : '';

  return `Consulta de parceiros (${roleLabel}): no periodo solicitado. Resumo: total encontrado=${input.totalItems}, status relevantes=cadastro de parceiros, ausencia de dados=nao. Filtro aplicado: documento=${documentFilter}.${sampleSummary}`;
}

function buildMtrProvisorioSummary(input: {
  totalItems: number;
  items: Record<string, unknown>[];
  explanationOnly?: boolean;
}): string {
  const statuses = summarizeRelevantStatuses(input.items);

  if (input.explanationOnly) {
    return 'MTR provisorio no SICAT e um manifesto temporario usado para registrar a operacao enquanto os dados finais ainda estao em ajuste no fluxo CETESB. Quando usar: continuidade operacional, validacao progressiva de dados e rastreabilidade antes da consolidacao definitiva. Telas relacionadas: lista de MTR provisiorio, criacao de MTR provisiorio e detalhe do manifesto.';
  }

  if (input.totalItems === 0) {
    return 'MTR provisório no SICAT é um manifesto temporário para registrar movimentações em andamento antes da consolidação definitiva no fluxo CETESB. Quando usar: continuidade operacional com dados ainda em ajuste, mantendo rastreabilidade até confirmação final. Telas relacionadas: lista e detalhe de MTR provisório. Resumo da consulta: no periodo solicitado, total encontrado=0, status relevantes=nenhum, ausencia de dados=sim. Justificativa: nao ha registros provisórios para os filtros atuais.';
  }

  return `MTR provisório no SICAT é um manifesto temporário no fluxo CETESB, usado para registrar a operação enquanto os dados finais são validados. Resumo da consulta: no periodo solicitado, total encontrado=${input.totalItems}, status relevantes=${statuses}, ausencia de dados=nao.`;
}

function buildAuditTrailSummary(input: {
  correlationId: string;
  entryCount: number;
  entityType: string | null;
  entityId: string | null;
  found: boolean;
}): string {
  const filterSummary = `filtro correlationId=${input.correlationId}`;
  let entitySummary = 'nao identificado';
  if (input.entityType) {
    entitySummary = input.entityType;
    if (input.entityId) {
      entitySummary = `${entitySummary} (${input.entityId})`;
    }
  }

  if (!input.found || input.entryCount === 0) {
    return `Consulta de auditoria: no periodo solicitado. Resumo: ${filterSummary}, total encontrado=0, status relevantes=auditoria/correlationId, ausencia de dados=sim. Justificativa: nenhum registro foi encontrado para o correlationId informado. Proximo passo operacional: valide o correlationId completo ou refine com periodo/operacao para nova busca.`;
  }

  return `Consulta de auditoria: no periodo solicitado. Resumo: ${filterSummary}, total encontrado=${input.entryCount}, status relevantes=auditoria/correlationId, ausencia de dados=nao. Entidade principal: ${entitySummary}.`;
}

function buildOperationsOverviewSummary(input: {
  overview: Record<string, unknown>;
  integrationAccountId: string | null;
  sessionContextId: string | null;
  mode?: string | null;
  manifestNumber?: string | null;
}): string {
  const mode = toNullableString(input.mode)?.toLowerCase();
  const manifestNumber = toNullableString(input.manifestNumber);
  const accountContext = input.integrationAccountId || 'nao informado';
  const sessionContext = input.sessionContextId || 'nao informado';
  const hasContext = Boolean(input.integrationAccountId || input.sessionContextId);
  const overview = toRecord(input.overview);

  if (mode === 'cdf_navigation') {
    return 'Para ver CDFs emitidos no SICAT, abra o modulo Certificados (CDF) e use a tela Certificados emitidos. Ali voce consulta a lista, aplica filtros e baixa o documento quando ele ja foi emitido. No fluxo SICAT/CETESB, o CDF/CDR fica vinculado ao manifesto elegivel e ao contexto da conta CETESB ativa. Telas relacionadas: Certificados emitidos, Gerar CDF, Manifestos e Sessao/Conta CETESB. Acao recomendada: se a lista vier vazia, revise a conta CETESB ativa e os filtros aplicados antes de tentar nova consulta.';
  }

  if (mode === 'manifest_create_navigation') {
    return 'Para gerar um novo manifesto no SICAT, abra o modulo Manifestos e siga para a tela de criacao de manifesto. No fluxo SICAT/CETESB, essa e a etapa inicial para registrar a movimentacao do residuo antes de submit, acompanhamento de status, impressao ou preparacao de CDF. Quando usar: sempre que for iniciar um novo MTR para a conta CETESB ativa. Telas relacionadas: Manifestos, criacao de manifesto, detalhe do manifesto, Jobs e Sessao/Conta CETESB.';
  }

  if (mode === 'switch_active_account') {
    return 'Para trocar a conta CETESB ativa, use a tela Sessao e conta CETESB. Passos: 1) abra Sessao > Conta CETESB; 2) confira qual conta esta no contexto atual; 3) selecione a conta CETESB que deve assumir a sessao operacional; 4) atualize ou reautentique a sessao se o contexto pedir renovacao; 5) volte para Manifestos, Certificados (CDF) ou Console de jobs para continuar com a nova conta. No fluxo SICAT/CETESB, essa troca deve ser feita antes de consultar ou executar operacoes vinculadas a outro parceiro ou outra conta. Telas relacionadas: Sessao e conta CETESB, Manifestos, Certificados (CDF) e Console de jobs.';
  }

  if (mode === 'active_account_status') {
    if (!hasContext) {
      return 'Consulta da conta/sessao CETESB: no periodo solicitado. Resumo: total encontrado=0, status relevantes=conta/sessao CETESB, ausencia de dados=sim. Justificativa: nao ha conta CETESB vinculada ao contexto atual da conversa. Proximo passo operacional: abra Sessao e conta CETESB para selecionar a conta antes de operar.';
    }

    return 'Consulta da conta/sessao CETESB: no periodo solicitado. Resumo: total encontrado=1, status relevantes=conta CETESB ativa no contexto atual da conversa, ausencia de dados=nao. Justificativa: existe um integrationAccountId/sessionContextId associado a esta conversa. Limitacao: esta resposta confirma o contexto ativo no SICAT, mas nao expoe identificadores sensiveis nem substitui a verificacao visual na tela Sessao e conta CETESB.';
  }

  if (mode === 'admin_access_guidance') {
    return 'No SICAT, o acesso a area administrativa depende de permissoes de RBAC associadas ao seu perfil. Esse controle e interno ao SICAT e define se voce pode abrir o modulo Administracao > Perfis e acessos para gerenciar usuarios, perfis, permissoes e sessoes. Quando usar: sempre que precisar confirmar governanca de acesso, e nao para operar manifestos/CDF diretamente na CETESB. Telas relacionadas: Administracao, Perfis e acessos e Sessao do usuario. Como verificar: tente abrir a area administrativa; se o perfil tiver permissao, o modulo fica disponivel, e se nao tiver, o acesso e bloqueado.';
  }

  if (mode === 'module_access_status') {
    if (!hasContext) {
      return 'Disponibilidade de modulos para o perfil atual: periodo aplicado=contexto atual da conversa. Resumo: total modulos confirmados por dados operacionais=0, status relevantes=perfis/permissoes/modulos, ausencia de dados=sim. Nenhum registro foi encontrado nesta consulta para confirmar quais menus do SICAT estao habilitados para voce. Isso significa que o backend nao recebeu dados de perfil ou RBAC suficientes para responder por modulo. Lista clara no contexto atual: nenhum modulo confirmado para este perfil nesta consulta. Proximo passo: abra a interface do SICAT e valide os menus visiveis ou confira o perfil em Administracao > Perfis e acessos.';
    }

    return 'Disponibilidade de modulos para o perfil atual: interpretacao do pedido=quais menus e modulos o seu perfil pode abrir agora no SICAT. Periodo aplicado=contexto atual da conversa. Resumo: total modulos confirmados para o perfil=0, status relevantes=nenhum modulo confirmado por permissao nesta consulta, ausencia de dados=sim. Nenhum registro de permissao por modulo ou de menu foi encontrado nesta consulta. Isso significa que, para a pergunta sobre modulos disponiveis para voce, o resultado atual e: nenhum modulo pode ser confirmado pelo backend para o seu perfil. Lista clara no contexto atual: nenhum modulo confirmado para este perfil nesta consulta. Orientacao complementar: areas como Manifestos, Certificados (CDF), Jobs, Auditoria, Dashboard e Sessao/Conta CETESB fazem parte do fluxo SICAT/CETESB, mas a disponibilidade delas para o seu usuario deve ser validada na interface ou em Administracao > Perfis e acessos.';
  }

  if (mode === 'cdf_generation_guidance') {
    return 'Voce deve gerar CDF quando o manifesto ja estiver na etapa operacional correta e houver necessidade de emitir o certificado no fluxo SICAT/CETESB. Em pratica, primeiro valide o manifesto no modulo Manifestos, depois use Certificados (CDF) > Gerar CDF para preparar a emissao e acompanhe o resultado em Certificados emitidos. Quando usar: apos confirmar manifesto elegivel, conta CETESB ativa e dados obrigatorios do certificado. Telas relacionadas: Manifestos, Gerar CDF, Certificados emitidos e Sessao/Conta CETESB.';
  }

  if (mode === 'pending_har_explanation') {
    return 'Pendente de HAR significa que ainda falta a evidencia de trafego real da CETESB para fechar a validacao tecnica de um fluxo no SICAT. HAR e o arquivo capturado do navegador com request/response usados como fonte de verdade para integrar ou validar comportamento do portal CETESB. Quando isso aparece: normalmente em fases de integracao, validacao de gateway ou investigacao de divergencia entre SICAT e CETESB. Dados e referencias relacionadas: documentacao de integracao, evidencia em docs/cetesb, Saude CETESB e Auditoria quando a pendencia impacta a operacao.';
  }

  if (mode === 'cdf_already_issued_explanation') {
    return 'CDF ja emitido significa que o certificado daquele manifesto ja foi gerado no fluxo SICAT/CETESB e deve ser consultado como documento existente, e nao tratado como uma nova emissao. Em pratica, voce passa a acompanhar esse estado em Certificados emitidos e pode cruzar o certificado com o manifesto de origem. Quando usar essa leitura: ao revisar o status do certificado, evitar geracao duplicada e confirmar se o documento ja esta disponivel para consulta ou download. Telas relacionadas: Certificados emitidos, Gerar CDF, Manifestos e detalhe do manifesto.';
  }

  if (mode === 'manifest_received_explanation') {
    return 'Manifesto recebido significa que o MTR ja foi reconhecido no fluxo operacional e entrou em um estado apto para acompanhamento posterior no SICAT/CETESB. Em geral, isso indica que a etapa principal de envio/recebimento foi concluida e que o manifesto pode seguir para consulta, impressao ou preparacao de CDF conforme a elegibilidade. Quando usar essa leitura: ao acompanhar o status no modulo Manifestos e ao cruzar com Jobs/Auditoria se surgir alguma pendencia. Telas relacionadas: lista de Manifestos, detalhe do manifesto, Certificados (CDF) e Jobs/Auditoria.';
  }

  if (mode === 'admin_access_users') {
    return 'No SICAT, usuarios e permissoes sao controlados por RBAC no modulo Administracao. Essa consulta serve para orientacao de acesso e nao para listar dados operacionais da CETESB. Quando usar: conferir quem pode acessar a area administrativa, perfis e acoes de governanca. Telas relacionadas: Administracao > Perfis e acessos, usuarios, perfis e sessoes.';
  }

  if (mode === 'safe_error_triage') {
    const recentErrors = Array.isArray(overview.recentErrors) ? overview.recentErrors : [];
    const recentDlq = Array.isArray(overview.recentDlq) ? overview.recentDlq : [];
    const jobs = toRecord(overview.jobs);
    const failed24h = clampNonNegativeInt(jobs.failed_24h, recentErrors.length);
    const dlqTotal = clampNonNegativeInt(jobs.dlq_total, recentDlq.length);
    const manifestScope = manifestNumber
      ? `manifesto ${manifestNumber}`
      : 'manifesto informado';
    const missingDataHint = manifestNumber
      ? `Dados faltantes para fechar causa raiz do ${manifestScope}: correlationId, jobId e retorno CETESB desse manifesto.`
      : 'Dados faltantes para fechar causa raiz: informe manifesto (numero/ID), correlationId e jobId.';

    if (failed24h === 0 && dlqTotal === 0) {
      return `Diagnostico SICAT/CETESB para ${manifestScope}: nao encontrei falha ativa diretamente vinculada no recorte atual. Acao segura recomendada: validar status do manifesto, trilha de jobs/fila/DLQ e auditoria por correlationId antes de qualquer mutacao. ${missingDataHint} Confirmacao explicita: reprocessamentos/cancelamentos/submissoes so podem ocorrer apos sua confirmacao em modo simulacao/smoke.`;
    }

    return `Diagnostico SICAT/CETESB para ${manifestScope}: ha pendencias em etapas assicronas (jobs/fila/DLQ) e isso pode bloquear a geracao de CDF. Acao segura recomendada: conferir status do manifesto, consultar auditoria por correlationId e revisar job/fila associado antes de qualquer mutacao. ${missingDataHint} Confirmacao explicita: reprocessamentos/cancelamentos/submissoes so podem ocorrer apos sua confirmacao em modo simulacao/smoke.`;
  }

  if (mode === 'non_technical_error_explanation') {
    const jobs = toRecord(overview.jobs);
    const failed24h = clampNonNegativeInt(jobs.failed_24h, 0);
    const dlqTotal = clampNonNegativeInt(jobs.dlq_total, 0);
    const causeText = failed24h > 0 || dlqTotal > 0
      ? 'a etapa automatica encontrou bloqueio operacional e parou para evitar erro maior'
      : 'a etapa automatica nao concluiu como esperado e o sistema acionou protecao operacional';

    return `Explicacao simples (fluxo SICAT/CETESB): a causa provavel do erro e que ${causeText}. Acao recomendada: revisar o item afetado, checar jobs/fila/DLQ e repetir apenas o reprocessamento seguro em modo simulacao antes de qualquer acao irreversivel.`;
  }

  if (!hasContext) {
    return `Saude CETESB (conta/sessao): no periodo solicitado. Resumo: filtro aplicado=integrationAccountId=${accountContext}; sessionContextId=${sessionContext}, total encontrado=0, status relevantes=conta/sessao CETESB, ausencia de dados=sim. Justificativa: nao existe conta/sessao CETESB ativa no contexto atual da conversa. Proximo passo operacional: selecione a conta CETESB e reautentique a sessao para identificar a conta ativa.`;
  }

  const accounts = toRecord(overview.accounts);
  const hasAnyAccount = clampNonNegativeInt(accounts.active, 0) > 0 || clampNonNegativeInt(accounts.total, 0) > 0;
  if (!hasAnyAccount) {
    return 'Saude CETESB (conta/sessao): no periodo solicitado. Resumo: total encontrado=0, status relevantes=conta/sessao CETESB, ausencia de dados=sim. Justificativa: nao ha conta CETESB ativa para esta conversa no recorte consultado. Proximo passo operacional: vincule ou selecione uma conta CETESB e reautentique a sessao.';
  }

  return 'Consulta de conta/sessao CETESB: no periodo solicitado. Resumo: total encontrado=1, status relevantes=conta/sessao CETESB ativa no contexto da conversa, ausencia de dados=nao. Justificativa: existe vinculo de conta/sessao no contexto atual da conversa. Limitacao: este resumo e consultivo, nao exibe identificadores sensiveis e nao confirma autenticacao CETESB em tempo real.';
}

function buildDashboardOverviewSummary(input: { dashboard: Record<string, unknown>; mode?: string | null }): string {
  const mode = toNullableString(input.mode)?.toLowerCase();
  const workers = toRecord(input.dashboard.workers);
  const activeJobs = toRecord(input.dashboard.activeJobs);
  const items = Array.isArray(activeJobs.items) ? activeJobs.items : [];
  const performance = toRecord(input.dashboard.performance);
  const metrics = toRecord(performance.metrics);

  const activeWorkers = clampNonNegativeInt(workers.activeWorkers, 0);
  const unhealthyWorkers = clampNonNegativeInt(workers.unhealthyWorkers, 0);
  const activeJobsTotal = clampNonNegativeInt(activeJobs.total, items.length);
  const successRate = clampNonNegativeInt(metrics.job_success_rate, 0);
  const dlqItems = items.filter((item) => toNullableString(toRecord(item).status) === 'dlq').length;
  const hasOperationalData = activeWorkers > 0 || activeJobsTotal > 0 || successRate > 0;

  if (mode === 'document_flow_overview') {
    return 'No fluxo SICAT/CETESB, MTR e o manifesto operacional que registra a movimentacao do residuo; CDF/CDR e o certificado vinculado ao manifesto elegivel para emissao, consulta e download; DMR e a declaracao usada para consolidacao declaratoria do periodo. Quando usar: MTR no modulo Manifestos para criar, consultar e acompanhar a operacao; CDF no modulo Certificados (CDF), em Certificados emitidos ou Gerar CDF, para consultar certificados emitidos e preparar emissao/download; DMR no modulo DMR, em Declaracoes e Pendentes, para revisar, consolidar e submeter a declaracao. Telas relacionadas: Manifestos, Certificados (CDF) e DMR.';
  }

  if (mode === 'mtr_to_cdf_flow') {
    return 'Fluxo correto do MTR ate o CDF no SICAT/CETESB: periodo aplicado=orientacao geral, sem recorte temporal obrigatorio. Resumo: total etapas principais=4, total documentos centrais=2 (MTR e CDF), status relevantes=MTR criado, MTR submetido, MTR recebido/elegivel e CDF emitido, ausencia de dados=nao se aplica ao fluxo conceitual. Passo 1: criar o registro especifico do MTR no modulo Manifestos. Passo 2: consultar esse MTR e acompanhar o status ate ele ficar recebido ou elegivel. Passo 3: gerar o CDF a partir desse MTR elegivel em Certificados (CDF) > Gerar CDF. Passo 4: consultar o registro especifico do CDF em Certificados emitidos e baixar o documento quando estiver disponivel. Quando houver consulta operacional por conta ou periodo e nenhum MTR/CDF for encontrado, o resumo deve informar total encontrado=0 e ausencia de dados=sim, sem alterar o fluxo correto. Telas relacionadas: Manifestos, Gerar CDF, Certificados emitidos e Jobs/Auditoria quando houver falha assincrona.';
  }

  if (mode === 'sicat_overview') {
    return 'O SICAT e o sistema usado para organizar o trabalho com a CETESB em um so lugar. Em termos simples, ele ajuda voce a registrar e acompanhar MTR, consultar ou emitir CDF, verificar erros da operacao e confirmar qual conta CETESB esta ativa antes de continuar. Quando usar: Manifestos para criar e acompanhar MTR; Certificados (CDF) para consultar, gerar e baixar certificados; Jobs e Auditoria para investigar falhas; Sessao/Conta CETESB para validar o contexto ativo. Relacao com o fluxo SICAT/CETESB: primeiro voce opera o manifesto, depois acompanha status e, quando o caso permitir, segue para o certificado. Telas relacionadas: Manifestos, Certificados (CDF), Jobs, Auditoria, Dashboard e Sessao/Conta CETESB.';
  }

  if (mode === 'capabilities_overview') {
    return 'No SICAT voce consegue conduzir o fluxo operacional SICAT/CETESB com orientacao assistida para manifestos, certificados, auditoria, jobs e contexto de conta/sessao. Quando usar: Manifestos para criar e acompanhar MTR; Certificados (CDF) para emitir ou consultar CDF; Jobs e Auditoria para diagnosticar falhas; Dashboard para resumo operacional; Sessao/Conta CETESB para validar o contexto ativo. Telas relacionadas: Manifestos, Certificados (CDF), Jobs, Auditoria, Dashboard e Sessao/Conta CETESB.';
  }

  if (!hasOperationalData) {
    return 'Resumo do dia (dashboard): hoje (timezone America/Sao_Paulo). Resumo: total encontrado=0, status relevantes=jobs/workers/performance, ausencia de dados=sim. Justificativa: nao houve indicadores operacionais consolidados para o dia ate o momento. Proximo passo operacional: valide ingestao de metricas e reexecute a consulta em alguns minutos.';
  }

  return `Resumo do dia (dashboard): hoje (timezone America/Sao_Paulo). Resumo: total encontrado=${activeJobsTotal}, status relevantes=jobs/workers/performance, ausencia de dados=nao. Indicadores: workers ativos=${activeWorkers}, workers nao saudaveis=${unhealthyWorkers}, jobs ativos=${activeJobsTotal}, itens dlq entre jobs ativos=${dlqItems}, job_success_rate_24h=${successRate}%.`;
}

function buildSelectionLead(args: {
  top: number;
  skipMostRecent: number;
  orderBy: ManifestRecencyOrder;
  periodText: string | null;
  totalConsidered: number;
}): string {
  const preface = args.periodText
    ? `Considerei ${args.totalConsidered} manifesto(s) ${args.periodText}. `
    : '';

  if (args.skipMostRecent === 0) {
    if (args.orderBy === 'recency_asc') {
      return `${preface}Os ${args.top} manifestos mais antigos sao:`;
    }

    return `${preface}Os ${args.top} manifestos mais recentes sao:`;
  }

  if (args.orderBy === 'recency_asc') {
    return `${preface}Os manifestos selecionados (a partir do ${positionLabel(args.skipMostRecent + 1)} mais antigo) sao:`;
  }

  return `${preface}Os manifestos selecionados (a partir do ${positionLabel(args.skipMostRecent + 1)}) sao:`;
}

function buildSelectionSummary(args: {
  intent: string;
  top: number;
  skipMostRecent: number;
  orderBy: ManifestRecencyOrder;
  dateRange: ManifestDateRange;
  totalConsidered: number;
  selected: ManifestListItem[];
}): string {
  const periodText = buildPeriodText(args.dateRange);

  if (args.selected.length === 0) {
    const todayIso = getOperationalTodayIso();
    const from = args.dateRange.dateFrom;
    const to = args.dateRange.dateTo;
    const isFutureRange = Boolean(
      (from && from > todayIso)
      || (to && to > todayIso)
    );
    const periodSuffix = periodText ? ` ${periodText}` : ' no periodo solicitado';

    if (isFutureRange) {
      return `Consulta de manifestos:${periodSuffix}. Resumo: total encontrado=0, status relevantes=nenhum, ausencia de dados=sim. Justificativa: o periodo consultado esta no futuro em relacao a data operacional atual (${todayIso}).`;
    }

    return `Consulta de manifestos:${periodSuffix}. Resumo: total encontrado=0, status relevantes=nenhum, ausencia de dados=sim. Justificativa: nenhum manifesto elegivel foi retornado para os filtros aplicados.`;
  }

  const itemLabels = args.selected.map((item, index) => {
    const position = args.skipMostRecent + index + 1;
    const number = item.manifestNumber ? String(item.manifestNumber) : item.id;
    const dateLabel = item.expeditionDate || item.lastSyncAt || 'sem data';
    // Status user-facing (padrao do portal: salvo/recebido/...) tem prioridade sobre
    // o status interno do SICAT, alinhando o chat com o que aparece na grid.
    const statusLabel = item.externalStatus || item.status || 'sem status';
    return `${number} (${positionLabel(position)}; data: ${dateLabel}; status: ${statusLabel})`;
  });

  const listText =
    itemLabels.length === 1
      ? itemLabels[0]
      : `${itemLabels.slice(0, -1).join(', ')} e ${itemLabels.at(-1)}`;

  if (args.skipMostRecent === 0 && args.top === 1) {
    if (args.orderBy === 'recency_asc') {
      const detail = periodText ? ` ${periodText}` : '';
      return `O manifesto mais antigo${detail} e o ${itemLabels[0]}.`;
    }

    const detail = periodText ? ` ${periodText}` : '';
    return `O manifesto mais recente${detail} e o ${itemLabels[0]}.`;
  }

  const lead = buildSelectionLead({
    top: args.top,
    skipMostRecent: args.skipMostRecent,
    orderBy: args.orderBy,
    periodText,
    totalConsidered: args.totalConsidered
  });
  return `${lead} ${listText}.`;
}

function applyManifestSelectionExclusions(input: {
  selected: ManifestListItem[];
  excludedManifestIds: string[];
  excludedIndexes: number[];
}) {
  const excludedIds = new Set(input.excludedManifestIds);
  const excludedIndexSet = new Set(input.excludedIndexes);

  return input.selected.filter((item, index) => {
    const rankingPosition = index + 1;
    if (excludedIds.has(item.id)) return false;
    if (excludedIndexSet.has(rankingPosition)) return false;
    return true;
  });
}

// Computa o valor do bucket para uma DIMENSÃO CANÔNICA (contrato declarado ao
// LLM no schema da tool + validação Zod em tools/tool-schemas.ts). month/year
// derivam da data de expedição (chaves YYYY-MM / YYYY). Dimensão fora do
// contrato NÃO cai em fallback: vira erro estruturado que o planner lê e
// re-planeja — decisão é do LLM, o código só executa o que foi declarado.
function resolveGroupValue(item: ManifestListItem, groupBy: string): string {
  const key = groupBy.toLowerCase();
  if (key === 'status') return item.status || item.externalStatus || 'sem_status';
  if (key === 'externalstatus') return item.externalStatus || item.status || 'sem_status_externo';
  if (key === 'generator') return item.generatorDescription || 'gerador_nao_informado';
  if (key === 'carrier') return item.carrierDescription || 'transportador_nao_informado';
  if (key === 'receiver') return item.receiverDescription || 'destinador_nao_informado';
  if (key === 'drivername') return item.driverName || 'motorista_nao_informado';
  if (key === 'vehicleplate') return item.vehiclePlate || 'placa_nao_informada';
  if (key === 'date') return toManifestDateKey(item) || 'data_nao_informada';
  if (key === 'month') return toManifestDateKey(item)?.slice(0, 7) || 'data_nao_informada';
  if (key === 'year') return toManifestDateKey(item)?.slice(0, 4) || 'data_nao_informada';
  throw new AppError(
    400,
    'Bad Request',
    `Dimensao de agrupamento nao suportada: "${groupBy}". Dimensoes validas: ${MANIFEST_GROUP_DIMENSIONS.join(', ')}.`,
    { code: 'CONVERSATION_INVALID_GROUP_DIMENSION' }
  );
}

// A ORDENAÇÃO dos grupos é decisão do planner LLM (selection.groupOrder no
// schema da tool): count_desc = ranking por volume; key_asc = ordem natural da
// chave (cronológica para month/date/year). Nenhuma inferência interna.
export function buildGroupedManifestStats(
  items: ManifestListItem[],
  groupBy: string,
  groupOrder: ManifestGroupOrder = 'count_desc'
) {
  const grouped = new Map<string, { key: string; count: number; manifests: ManifestListItem[] }>();

  for (const item of items) {
    const key = resolveGroupValue(item, groupBy);
    const current = grouped.get(key) || { key, count: 0, manifests: [] };
    current.count += 1;
    current.manifests.push(item);
    grouped.set(key, current);
  }

  const entries = Array.from(grouped.values());
  const sorted = groupOrder === 'key_asc'
    ? entries.sort((a, b) => a.key.localeCompare(b.key))
    : entries.sort((a, b) => b.count - a.count);

  return sorted.map((entry, index) => ({
    rank: index + 1,
    group: entry.key,
    total: entry.count,
    manifestIds: entry.manifests.map((item) => item.id)
  }));
}

function summarizeConsolidatedManifestDetails(items: ManifestConsolidatedDetail[]): string {
  if (items.length === 0) {
    return 'Nao encontrei manifestos para detalhar neste momento.';
  }

  const lines = items.map((item, index) => {
    const ref = item.manifestNumber ? String(item.manifestNumber) : item.manifestId;
    const dateLabel = item.expeditionDate || 'sem data';
    const statusLabel = item.status || item.externalStatus || 'sem status';
    const generator = item.generator || '-';
    const carrier = item.carrier || '-';
    const receiver = item.receiver || '-';
    const plate = item.vehiclePlate || '-';
    const driver = item.driverName || '-';
    const cdf = item.externalHashCode || '-';

    return `${index + 1}) Manifesto ${ref}: data ${dateLabel}, status ${statusLabel}, CDF ${cdf}, gerador ${generator}, transportador ${carrier}, destinador ${receiver}, placa ${plate}, motorista ${driver}.`;
  });

  return `Consolidei mais dados do conjunto anterior:\n${lines.join('\n')}`;
}

function summarizeAskedManifestIds(manifestIds: string[]): string {
  if (manifestIds.length === 0) {
    return 'Ainda nao identifiquei manifestos consultados nesta sessao.';
  }

  if (manifestIds.length === 1) {
    return `Voce consultou este manifesto nesta sessao: ${manifestIds[0]}.`;
  }

  return `Voce consultou estes manifestos nesta sessao: ${manifestIds.join(', ')}.`;
}

function toManifestConsolidatedDetail(value: unknown): ManifestConsolidatedDetail | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const manifestId = toNullableString(record.id);
  if (!manifestId) return null;

  const generator = toRecord(record.generator);
  const carrier = toRecord(record.carrier);
  const receiver = toRecord(record.receiver);

  return {
    manifestId,
    manifestNumber: toStringOrNumberOrNull(record.manifestNumber),
    expeditionDate: toNullableString(record.expeditionDate),
    status: toNullableString(record.status),
    externalStatus: toNullableString(record.externalStatus),
    externalHashCode: toNullableString(record.externalHashCode),
    generator: toNullableString(generator.description),
    carrier: toNullableString(carrier.description),
    receiver: toNullableString(receiver.description),
    driverName: toNullableString(record.driverName),
    vehiclePlate: toNullableString(record.vehiclePlate),
    lastSyncAt: toNullableString(record.lastSyncAt)
  };
}

function resolveManifestListScope(input: ConversationDispatchInput, args: Record<string, unknown>) {
  return {
    integrationAccountId: toNullableString(args.integrationAccountId) || input.context.integrationAccountId || undefined,
    sessionContextId: toNullableString(args.sessionContextId) || input.context.sessionContextId || undefined
  };
}

function toPayloadRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function resolveBatchManifestIdsForPreview(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const fromArgs = toStringArray(args.manifestIds);
  if (fromArgs.length > 0) return fromArgs;

  const fromSelection = toStringArray(input.context.lastManifestSelectionIds || []);
  if (fromSelection.length > 0) return fromSelection;

  return [];
}

async function resolveManifestIdsForCancelPreviewBySelection(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const selection = toRecord(args.selection);
  const dateRange = resolveManifestDateRange(selection, args);
  const top = clampPositiveInt(selection.top || args.top, SAFE_BATCH_MAX_ITEMS);
  const skipMostRecent = clampNonNegativeInt(selection.skipMostRecent || args.skipMostRecent, 0);
  const orderBy = resolveManifestRecencyOrder(selection.orderBy || args.orderBy);
  const status = toNullableString(selection.status || args.status) || 'pending';
  const scope = resolveManifestListScope(input, args);

  const response = await listManifests(
    {
      ...scope,
      localOnly: true,
      status,
      orderBy,
      page: 1,
      pageSize: Math.max(top + skipMostRecent + 25, 50)
    },
    input.context.correlationId,
    input.headers
  );

  const manifestItems = asListResponseItems(response).map(toManifestListItem).filter(Boolean) as ManifestListItem[];
  const dateFiltered = filterManifestsByDateRange(manifestItems, dateRange.dateFrom, dateRange.dateTo);
  const selected = selectRecentManifests(dateFiltered, top, skipMostRecent, orderBy);

  return selected.map((item) => item.id);
}

/**
 * Fallback de seleção para preview de impressão/envio em lote.
 *
 * Quando não há manifestIds explícitos nem conjunto em foco (última seleção), mas o usuário
 * citou uma JANELA DE DATAS explícita (ex.: "imprima/gere os comprovantes dos últimos 4 dias"),
 * resolve o conjunto por essa janela — em vez de devolver o falso "nenhum item pendente" para
 * um pedido legítimo. Espelha o resolver do cancelamento, porém SEM forçar status 'pending'
 * (impressão/2ª via valem para os manifestos do período mostrado, qualquer que seja o status).
 * Sem janela explícita, retorna vazio (não inventa um conjunto "recente" arbitrário).
 */
async function resolveManifestIdsForBatchPreviewByWindow(input: ConversationDispatchInput, args: Record<string, unknown>, operation?: BatchOperation) {
  const selection = toRecord(args.selection);
  const dateRange = resolveManifestDateRange(selection, args);
  if (!dateRange.dateFrom && !dateRange.dateTo) return [];

  const top = clampPositiveInt(selection.top || args.top, maxBatchItemsForOperation(operation));
  const skipMostRecent = clampNonNegativeInt(selection.skipMostRecent || args.skipMostRecent, 0);
  const orderBy = resolveManifestRecencyOrder(selection.orderBy || args.orderBy);
  const status = toNullableString(selection.status || args.status);
  const scope = resolveManifestListScope(input, args);

  const response = await listManifests(
    {
      ...scope,
      localOnly: true,
      ...(status ? { status } : {}),
      orderBy,
      dateFrom: dateRange.dateFrom ?? undefined,
      dateTo: dateRange.dateTo ?? undefined,
      page: 1,
      pageSize: Math.max(top + skipMostRecent + 25, 50)
    },
    input.context.correlationId,
    input.headers
  );

  const manifestItems = asListResponseItems(response).map(toManifestListItem).filter(Boolean) as ManifestListItem[];
  const dateFiltered = filterManifestsByDateRange(manifestItems, dateRange.dateFrom, dateRange.dateTo);
  const selected = selectRecentManifests(dateFiltered, top, skipMostRecent, orderBy);

  return selected.map((item) => item.id);
}

function ensureBatchPreviewSelectionOrThrow(manifestIds: string[]) {
  return manifestIds.length > 0;
}

function resolveBatchManifestIdsForExecution(input: ConversationDispatchInput, args: Record<string, unknown>, operationIntent: string) {
  const fromArgs = toStringArray(args.manifestIds);
  if (fromArgs.length > 0) return fromArgs;

  const snapshot = ensureDeterministicSelectionSnapshot({
    value: args.selectionSnapshot,
    expectedIntent: operationIntent,
    integrationAccountId: input.context.integrationAccountId
  });

  if (snapshot.selectedManifestIds.length === 0) {
    throw new AppError(
      409,
      'Conflict',
      'Snapshot confirmado sem manifestos selecionados. Gere preview novamente antes de confirmar.',
      { code: 'CONVERSATION_SELECTION_SNAPSHOT_EMPTY' }
    );
  }

  return snapshot.selectedManifestIds;
}

function enforceSafeBatchLimit(manifestIds: string[], operation?: BatchOperation) {
  const maxItems = maxBatchItemsForOperation(operation);
  if (manifestIds.length > maxItems) {
    throw new AppError(
      409,
      'Conflict',
      `Operacao em lote bloqueada por seguranca: limite de ${maxItems} manifestos por comando. Selecione um subconjunto e confirme novamente.`,
      {
        code: 'CONVERSATION_BATCH_LIMIT_EXCEEDED',
        context: {
          maxItems,
          requestedItems: manifestIds.length
        }
      }
    );
  }
}

function collectManifestRequiredFieldsForCreation(payload: Record<string, unknown>) {
  const missing: string[] = [];
  const generator = toRecord(payload.generator);
  const carrier = toRecord(payload.carrier);
  const receiver = toRecord(payload.receiver);

  if (!toNullableString(payload.integrationAccountId)) missing.push('integrationAccountId');
  if (!toNullableString(payload.sessionContextId)) missing.push('sessionContextId');
  if (!toIsoDateOnly(payload.expeditionDate)) missing.push('expeditionDate');
  if (!toNullableString(generator.partnerCode)) missing.push('generator.partnerCode');
  if (!toNullableString(carrier.partnerCode)) missing.push('carrier.partnerCode');
  if (!toNullableString(receiver.partnerCode)) missing.push('receiver.partnerCode');

  return missing;
}

function buildMissingFieldsSummary(missingFields: string[]) {
  if (missingFields.length === 0) return 'Nao identifiquei campos faltantes.';
  return `Faltam os seguintes campos obrigatorios: ${missingFields.join(', ')}.`;
}

async function handleManifestCreateDraft(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const scope = resolveScopeFromArgs(input, args);
  enforceOperationalContext({
    integrationAccountId: scope.integrationAccountId
  });

  const payload = toPayloadRecord(args.payload || args.draftPayload);
  const created = await createManifest(
    {
      ...payload,
      integrationAccountId: scope.integrationAccountId,
      sessionContextId: scope.sessionContextId,
      requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy
    },
    input.context.correlationId
  );

  const createdManifestId = toNullableString((created as Record<string, unknown>).id);
  const createdManifestSuffix = createdManifestId ? ` (manifestId: ${createdManifestId})` : '';

  return {
    kind: 'action',
    data: {
      intent: 'manifest.create_draft',
      manifest: created,
      affectedItems: createdManifestId ? [{ manifestId: createdManifestId }] : []
    },
    assistantSummary: `Rascunho criado com sucesso${createdManifestSuffix}. Se quiser, eu te ajudo a preencher os faltantes antes do envio.`,
    jobId: null
  };
}

async function handleManifestCreateFromPayload(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const scope = resolveScopeFromArgs(input, args);
  enforceOperationalContext({
    integrationAccountId: scope.integrationAccountId,
    sessionContextId: scope.sessionContextId,
    requireSession: true
  });

  const payload = toPayloadRecord(args.payload);
  const snapshot = parseDeterministicSelectionSnapshot(args.creationSnapshot || args.selectionSnapshot);
  const snapshotPayload = snapshot
    ? toPayloadRecord(toRecord(snapshot.criteria).payload)
    : {};

  const completePayload: Record<string, unknown> = {
    ...snapshotPayload,
    ...payload,
    integrationAccountId: scope.integrationAccountId,
    sessionContextId: scope.sessionContextId,
    requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy
  };

  const missingFields = collectManifestRequiredFieldsForCreation(completePayload);
  if (missingFields.length > 0) {
    throw new AppError(
      400,
      'Bad Request',
      `${buildMissingFieldsSummary(missingFields)} Envie os campos faltantes ou use create_draft para continuar com seguranca.`,
      {
        code: 'CONVERSATION_MANIFEST_REQUIRED_FIELDS',
        context: {
          missingFields
        }
      }
    );
  }

  const created = await createManifest(completePayload, input.context.correlationId);
  const createdManifestId = toNullableString((created as Record<string, unknown>).id);
  const createdManifestSuffix = createdManifestId ? ` (manifestId: ${createdManifestId})` : '';

  return {
    kind: 'action',
    data: {
      intent: 'manifest.create_from_payload',
      manifest: created,
      affectedItems: createdManifestId ? [{ manifestId: createdManifestId }] : []
    },
    assistantSummary: `Manifesto criado com payload completo${createdManifestSuffix}. Posso seguir com submit quando voce confirmar.`,
    jobId: null
  };
}

async function handleManifestCreatePreviewFromPayload(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const scope = resolveScopeFromArgs(input, args);
  enforceOperationalContext({
    integrationAccountId: scope.integrationAccountId
  });

  const payload = toPayloadRecord(args.payload);
  const completePayload: Record<string, unknown> = {
    ...payload,
    integrationAccountId: scope.integrationAccountId,
    sessionContextId: scope.sessionContextId,
    requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy
  };

  const missingFields = collectManifestRequiredFieldsForCreation(completePayload);
  if (missingFields.length > 0) {
    const missingSummary = buildMissingFieldsSummary(missingFields);
    return {
      kind: 'query',
      type: 'manifest_missing_fields',
      data: {
        intent: 'manifest.create_missing_fields',
        missingFields,
        payloadPreview: completePayload
      },
      artifacts: [],
      actions: [
        {
          type: 'follow_up',
          label: 'Informar campos faltantes',
          payload: {
            intent: 'manifest.preview_create_from_payload',
            missingFields
          }
        }
      ],
      assistantSummary:
        `${missingSummary} `
        + 'Previa/simulacao (modo smoke sem mutacao): ainda nao executei criacao real de manifesto. '
        + 'Impacto e risco: criar manifesto sem payload completo pode gerar rejeicao operacional e inconsistencias. '
        + 'Pre-requisitos: enviar os campos faltantes e validar dados de gerador, transportador, destinador e residuos. '
        + 'Confirmacao explicita obrigatoria: somente apos revisar a previa final, responda "confirmo manifest.create_from_payload" para autorizar a acao. '
        + 'Acao ainda nao executada: estou apenas em modo simulacao/smoke. Voce confirma esse fluxo de criacao somente apos a previa final?',
      jobId: null
    };
  }

  const creationSnapshot = createDeterministicSelectionSnapshot({
    intent: 'manifest.create_from_payload',
    integrationAccountId: scope.integrationAccountId || null,
    sessionContextId: scope.sessionContextId || null,
    criteria: {
      payload: completePayload
    }
  });

  return {
    kind: 'query',
    type: 'manifest_creation_draft',
    data: {
      intent: 'manifest.preview_create_from_payload',
      actionIntent: 'manifest.create_from_payload',
      payloadPreview: completePayload,
      creationSnapshot,
      requiresConfirmation: true
    },
    artifacts: [],
    actions: [
      {
        type: 'confirm_tool_execution',
        label: 'Confirmar criacao do manifesto',
        payload: {
          intent: 'manifest.create_from_payload',
          creationSnapshot,
          confirmed: true
        }
      }
    ],
    assistantSummary: 'Preview de criacao pronto em modo simulacao/smoke; nenhuma criacao real foi executada. Pre-requisitos validados com payload congelado. Impacto e risco: criacao real altera trilha operacional. Confirmacao explicita obrigatoria: responda "confirmo manifest.create_from_payload" para prosseguir. Voce confirma?',
    jobId: null
  };
}

async function handleManifestReceiveWithReceipt(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const scope = resolveScopeFromArgs(input, args);
  enforceOperationalContext({
    integrationAccountId: scope.integrationAccountId,
    sessionContextId: scope.sessionContextId,
    requireSession: true
  });

  const receiptPayload = toPayloadRecord(args.receiptPayload || args.payload);
  if (Object.keys(receiptPayload).length === 0) {
    throw new AppError(
      400,
      'Bad Request',
      'Para confirmar o recebimento, envie os dados em receiptPayload (ex.: hash do manifesto, quantidade recebida, observacao).',
      {
        code: 'CONVERSATION_RECEIPT_PAYLOAD_REQUIRED'
      }
    );
  }

  const response = await enqueueManifestReceive(
    {
      integrationAccountId: scope.integrationAccountId,
      sessionContextId: scope.sessionContextId,
      requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy,
      printReceiptAfterReceive: Boolean(args.printReceiptAfterReceive),
      receiptPayload
    },
    {
      ...input.headers,
      'idempotency-key': input.context.idempotencyKey || undefined
    },
    input.context.correlationId
  );

  const responseJobId = toNullableString((response as Record<string, unknown>).jobId);

  return {
    kind: 'action',
    data: {
      intent: 'manifest.receive_with_receipt',
      receiptPayload,
      command: response
    },
    assistantSummary: 'Recebimento enfileirado com sucesso. Acompanhe o job para validar o processamento no CETESB.',
    jobId: responseJobId
  };
}

async function executeSafeBatchOperation(input: {
  operation: BatchOperation;
  operationIntent: string;
  dispatchInput: ConversationDispatchInput;
  args: Record<string, unknown>;
}) {
  const scope = resolveScopeFromArgs(input.dispatchInput, input.args);
  enforceOperationalContext({
    integrationAccountId: scope.integrationAccountId,
    sessionContextId: scope.sessionContextId,
    requireSession: input.operation === 'submit'
  });

  const manifestIds = resolveBatchManifestIdsForExecution(input.dispatchInput, input.args, input.operationIntent);
  enforceSafeBatchLimit(manifestIds, input.operation);
  const deterministicSelectionSnapshot = toNullableString(input.args.selectionSnapshot);
  const deterministicExecution = {
    intent: input.operationIntent,
    confirmed: true,
    selectionSnapshot: deterministicSelectionSnapshot,
    selectedManifestIds: manifestIds,
    selectionSource: deterministicSelectionSnapshot ? 'snapshot' : 'explicit_manifest_ids'
  };

  if (input.operation === 'submit') {
    const response = await enqueueManifestBatchSubmit(
      {
        manifestIds,
        sessionContextId: scope.sessionContextId,
        requestedBy: toNullableString(input.args.requestedBy) || input.dispatchInput.context.requestedBy,
        validateOnly: Boolean(input.args.validateOnly),
        printAfterSubmit: Boolean(input.args.printAfterSubmit),
        conversationDeterministic: deterministicExecution
      },
      {
        ...input.dispatchInput.headers,
        'idempotency-key': input.dispatchInput.context.idempotencyKey || undefined
      },
      input.dispatchInput.context.correlationId
    );

    return {
      intent: 'manifest.batch_submit_selected',
      operation: 'manifest.batch_submit',
      response,
      jobId: null,
      summary: `${manifestIds.length} manifesto(s) enviados para fila de submit em lote com seguranca.`
    };
  }

  if (input.operation === 'cancel') {
    const reason = toNullableString(input.args.reason);
    if (!reason || reason.length < 3) {
      throw new AppError(
        400,
        'Bad Request',
        'Informe reason com pelo menos 3 caracteres para cancelar manifestos em lote.',
        { code: 'CONVERSATION_CANCEL_REASON_REQUIRED' }
      );
    }

    const response = await enqueueManifestBatchCancel(
      {
        manifestIds,
        reason,
        requestedBy: toNullableString(input.args.requestedBy) || input.dispatchInput.context.requestedBy,
        conversationDeterministic: deterministicExecution
      },
      {
        ...input.dispatchInput.headers,
        'idempotency-key': input.dispatchInput.context.idempotencyKey || undefined
      },
      input.dispatchInput.context.correlationId
    );

    return {
      intent: 'manifest.batch_cancel_selected',
      operation: 'manifest.batch_cancel',
      response,
      jobId: null,
      summary: `${manifestIds.length} manifesto(s) enviados para cancelamento em lote com seguranca.`
    };
  }

  const execution: Array<{ manifestId: string; jobId: string | null }> = [];
  for (const manifestId of manifestIds) {
    const itemResponse = await enqueueManifestPrint(
      manifestId,
      {
        requestedBy: toNullableString(input.args.requestedBy) || input.dispatchInput.context.requestedBy,
        conversationDeterministic: {
          ...deterministicExecution,
          selectedManifestIds: [manifestId]
        }
      },
      {
        ...input.dispatchInput.headers,
        'idempotency-key': input.dispatchInput.context.idempotencyKey
          ? `${input.dispatchInput.context.idempotencyKey}:${manifestId}`
          : undefined
      },
      input.dispatchInput.context.correlationId
    );

    execution.push({
      manifestId,
      jobId: toNullableString((itemResponse as Record<string, unknown>).jobId)
    });
  }

  return {
    intent: 'manifest.batch_print_selected',
    operation: 'manifest.batch_print',
    response: {
      items: execution,
      total: execution.length
    },
    jobId: execution[0]?.jobId || null,
    summary: `Enfileirei a geração dos comprovantes (PDF) de ${manifestIds.length} manifesto(s). Assim que os documentos ficarem prontos, o download em lote (arquivo ZIP) ficará disponível nesta conversa.`
  };
}

function resolveBatchOperationIntent(operation: BatchOperation): string {
  if (operation === 'submit') return 'manifest.batch_submit_selected';
  if (operation === 'cancel') return 'manifest.batch_cancel_selected';
  return 'manifest.batch_print_selected';
}

function resolveBatchOperationName(operation: BatchOperation): string {
  if (operation === 'submit') return 'manifest.batch_submit';
  if (operation === 'cancel') return 'manifest.batch_cancel';
  return 'manifest.batch_print';
}

function resolveBatchOperationLabel(operation: BatchOperation): string {
  if (operation === 'submit') return 'envio (submit)';
  if (operation === 'cancel') return 'cancelamento';
  return 'impressao';
}

async function handleBatchOperationPreview(input: ConversationDispatchInput, args: Record<string, unknown>, operation: BatchOperation) {
  const scope = resolveScopeFromArgs(input, args);
  enforceOperationalContext({
    integrationAccountId: scope.integrationAccountId,
    sessionContextId: scope.sessionContextId,
    requireSession: false
  });

  let manifestIds = resolveBatchManifestIdsForPreview(input, args);

  if (manifestIds.length === 0 && operation === 'cancel') {
    manifestIds = await resolveManifestIdsForCancelPreviewBySelection(input, args);
  }

  // Impressão/envio em lote: se não há seleção explícita nem conjunto em foco, mas o usuário
  // citou uma janela de datas explícita ("os comprovantes dos últimos 4 dias"), resolve por janela
  // — evita o falso "nenhum manifesto pendente" para um pedido legítimo de documentos do período.
  if (manifestIds.length === 0 && operation !== 'cancel') {
    manifestIds = await resolveManifestIdsForBatchPreviewByWindow(input, args, operation);
  }

  const hasSelection = ensureBatchPreviewSelectionOrThrow(manifestIds);
  if (!hasSelection) {
    const operationLabel = resolveBatchOperationLabel(operation);
    return {
      kind: 'query',
      type: 'manifest_batch_preview',
      data: {
        intent: `manifest.preview_${resolveBatchOperationName(operation)}_selected`,
        actionIntent: resolveBatchOperationIntent(operation),
        operation: resolveBatchOperationName(operation),
        affectedItems: [],
        requiresConfirmation: true,
        selectionSnapshot: null
      },
      actions: [],
      artifacts: [],
      assistantSummary: `Previa da acao: ${operationLabel} em lote para manifestos pendentes no contexto/filtro informado. Pre-requisitos: conta e sessao CETESB ativas, alem de conjunto elegivel apos filtros. Impacto e risco: sem itens elegiveis, nenhuma alteracao foi preparada. Itens afetados: nenhum manifesto pendente encontrado para os filtros atuais. Confirmacao explicita: nao executei nenhuma mutacao; se desejar, ajuste filtros (data/status) para gerar uma nova previa confirmavel.`,
      jobId: null
    };
  }

  enforceSafeBatchLimit(manifestIds, operation);
  const operationIntent = resolveBatchOperationIntent(operation);
  const snapshot = createDeterministicSelectionSnapshot({
    intent: operationIntent,
    integrationAccountId: scope.integrationAccountId,
    sessionContextId: scope.sessionContextId,
    selectedManifestIds: manifestIds,
    criteria: {
      operation,
      source: toStringArray(args.manifestIds).length > 0 ? 'explicit_manifest_ids' : 'last_manifest_selection',
      reason: toNullableString(args.reason) || null
    }
  });

  return {
    kind: 'query',
    type: 'manifest_batch_preview',
    data: {
      intent: `manifest.preview_${resolveBatchOperationName(operation)}_selected`,
      actionIntent: operationIntent,
      operation: resolveBatchOperationName(operation),
      affectedItems: manifestIds.map((manifestId) => ({ manifestId })),
      requiresConfirmation: true,
      selectionSnapshot: snapshot
    },
    actions: [
      {
        type: 'confirm_tool_execution',
        label: `Confirmar ${resolveBatchOperationLabel(operation)} em lote`,
        payload: {
          intent: operationIntent,
          selectionSnapshot: snapshot,
          confirmed: true,
          ...(operation === 'cancel' ? { reason: toNullableString(args.reason) || null } : {})
        }
      }
    ],
    artifacts: [],
    assistantSummary: operation === 'print'
      ? `Vou gerar os comprovantes (PDF) de ${manifestIds.length} manifesto(s) e disponibilizar um download em lote (ZIP). Revise os itens e confirme para gerar.`
      : `Preview pronto para ${resolveBatchOperationLabel(operation)} de ${manifestIds.length} manifesto(s). Confirme com o snapshot para executar sem recalcular o conjunto.`,
    jobId: null
  };
}

async function handleBatchOperationIntent(input: ConversationDispatchInput, args: Record<string, unknown>, operation: BatchOperation) {
  if (args.previewOnly === true || toNullableString(args.mode)?.toLowerCase() === 'preview') {
    return handleBatchOperationPreview(input, args, operation);
  }

  const operationIntent = resolveBatchOperationIntent(operation);
  const result = await executeSafeBatchOperation({
    operation,
    operationIntent,
    dispatchInput: input,
    args
  });

  const affectedItems = resolveBatchManifestIdsForExecution(input, args, operationIntent).map((manifestId) => ({ manifestId }));

  return {
    kind: 'action',
    data: {
      intent: result.intent,
      operation: result.operation,
      affectedItems,
      execution: result.response
    },
    assistantSummary: result.summary,
    jobId: result.jobId
  };
}

async function handleCdfResolveByManifestReference(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const resolvedReference = await resolveManifestReference({
    args,
    context: {
      ...input.context,
      lastManifestSelectionIds: input.context.lastManifestSelectionIds || []
    },
    headers: input.headers
  });

  const manifestId = requireString(
    resolvedReference.manifestId,
    'manifestId is required to resolve CDF criteria by manifesto.'
  );
  const manifestDetail = toRecord(await getManifest(manifestId));

  const suggestedCertificateCriteria = {
    manifestId,
    manifestNumber: toStringOrNumberOrNull(manifestDetail.manifestNumber),
    certificateHashCode: toNullableString(manifestDetail.externalHashCode),
    dateFrom: toIsoDateOnly(manifestDetail.expeditionDate),
    dateTo: toIsoDateOnly(manifestDetail.expeditionDate),
    integrationAccountId: toNullableString(args.integrationAccountId) || input.context.integrationAccountId,
    sessionContextId: toNullableString(args.sessionContextId) || input.context.sessionContextId
  };

  return {
    kind: 'query',
    data: {
      intent: 'cdf.resolve_by_manifest_reference',
      sourceManifest: {
        manifestId,
        manifestNumber: toStringOrNumberOrNull(manifestDetail.manifestNumber),
        externalHashCode: toNullableString(manifestDetail.externalHashCode),
        status: toNullableString(manifestDetail.status),
        externalStatus: toNullableString(manifestDetail.externalStatus)
      },
      suggestedCertificateCriteria,
      affectedItems: [{ manifestId }]
    },
    assistantSummary: 'Preparei os criterios de CDF a partir do manifesto selecionado. Confirme os dados para gerar ou baixar o certificado.',
    jobId: null
  };
}

async function handleCdfListByManifestSelection(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const scope = resolveScopeFromArgs(input, args);
  enforceOperationalContext({
    integrationAccountId: scope.integrationAccountId
  });

  const manifestIds = toStringArray(args.manifestIds).length > 0
    ? toStringArray(args.manifestIds)
    : toStringArray(input.context.lastManifestSelectionIds || []);

  if (manifestIds.length === 0) {
    throw new AppError(400, 'Bad Request', `Nenhum manifesto selecionado para vincular CDF/CDR. ${buildOperatorActionHint()}`, {
      code: 'CONVERSATION_MANIFEST_SET_REQUIRED'
    });
  }

  const manifestDetails = await Promise.all(manifestIds.slice(0, SAFE_BATCH_MAX_ITEMS).map((manifestId) => getManifest(manifestId)));
  const hashCodes = Array.from(new Set(manifestDetails
    .map((detail) => toNullableString(toRecord(detail).externalHashCode))
    .filter((value): value is string => Boolean(value))));

  const dateCandidates = manifestDetails
    .map((detail) => toIsoDateOnly(toRecord(detail).expeditionDate))
    .filter((value): value is string => Boolean(value));
  const sortedDates = dateCandidates.length > 0
    ? [...dateCandidates].sort((a, b) => a.localeCompare(b))
    : [];
  const dateFrom = sortedDates.length > 0 ? sortedDates[0] : null;
  const dateTo = sortedDates.length > 0 ? sortedDates.at(-1) || null : null;

  const certificates = await listCdfCertificates(
    {
      integrationAccountId: scope.integrationAccountId || undefined,
      sessionContextId: scope.sessionContextId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined
    },
    input.context.correlationId,
    input.headers
  );

  const certificateItems = asListResponseItems(certificates).map((item) => toRecord(item));
  const filtered = hashCodes.length > 0
    ? certificateItems.filter((item) => {
      const documentId = toNullableString(item.id || item.documentId || item.cerHashCode);
      return documentId ? hashCodes.includes(documentId) : false;
    })
    : certificateItems;

  return {
    kind: 'query',
    data: {
      intent: 'cdf.list_by_manifest_selection',
      manifestIds,
      linkedHashCodes: hashCodes,
      certificates: filtered
    },
    assistantSummary: `Encontrei ${filtered.length} certificado(s) CDF/CDR vinculados ao conjunto de ${manifestIds.length} manifesto(s).`,
    jobId: null
  };
}

async function handleCdfGenerateFromManifestSelection(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const scope = resolveScopeFromArgs(input, args);
  enforceOperationalContext({
    integrationAccountId: scope.integrationAccountId,
    sessionContextId: scope.sessionContextId,
    requireSession: true
  });

  const cdfPayload = toPayloadRecord(args.cdfPayload || args.payload);
  if (Object.keys(cdfPayload).length === 0) {
    throw new AppError(400, 'Bad Request', 'Para gerar CDF/CDR informe cdfPayload com os dados obrigatorios.', {
      code: 'CONVERSATION_CDF_PAYLOAD_REQUIRED'
    });
  }

  const response = await enqueueCdfGenerate(
    {
      integrationAccountId: scope.integrationAccountId,
      sessionContextId: scope.sessionContextId,
      requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy,
      cdfPayload
    },
    {
      ...input.headers,
      'idempotency-key': input.context.idempotencyKey || undefined
    },
    input.context.correlationId
  );

  return {
    kind: 'action',
    type: 'cdf_action',
    data: {
      intent: 'cdf.generate_from_manifest_selection',
      command: response
    },
    artifacts: [],
    actions: [],
    assistantSummary: 'Geracao de CDF/CDR enfileirada com sucesso. Acompanhe o job para confirmar a emissao.',
    jobId: toNullableString((response as Record<string, unknown>).jobId)
  };
}

async function handleCdfDownloadBatch(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const scope = resolveScopeFromArgs(input, args);
  enforceOperationalContext({
    integrationAccountId: scope.integrationAccountId,
    sessionContextId: scope.sessionContextId,
    requireSession: true
  });

  const previewOnly = args.previewOnly === true || toNullableString(args.mode)?.toLowerCase() === 'preview';
  const explicitDocumentIds = toStringArray(args.documentIds || args.manifestDocumentIds || args.certificateHashCodes);

  if (previewOnly) {
    const documentIds = explicitDocumentIds.slice(0, SAFE_BATCH_MAX_ITEMS);
    if (documentIds.length === 0) {
      throw new AppError(400, 'Bad Request', 'Informe documentIds para preview de download em lote de CDF/CDR.', {
        code: 'CONVERSATION_CDF_DOCUMENT_SET_REQUIRED'
      });
    }

    const selectionSnapshot = createDeterministicSelectionSnapshot({
      intent: 'cdf.download_batch_selected',
      integrationAccountId: scope.integrationAccountId,
      sessionContextId: scope.sessionContextId,
      selectedDocumentIds: documentIds,
      criteria: {
        source: 'explicit_document_ids'
      }
    });

    return {
      kind: 'query',
      type: 'cdf_detail',
      data: {
        intent: 'cdf.preview_download_batch_selected',
        actionIntent: 'cdf.download_batch_selected',
        documentIds,
        selectionSnapshot,
        requiresConfirmation: true
      },
      artifacts: [],
      actions: [
        {
          type: 'confirm_tool_execution',
          label: 'Confirmar download em lote de CDF/CDR',
          payload: {
            intent: 'cdf.download_batch_selected',
            selectionSnapshot,
            confirmed: true
          }
        }
      ],
      assistantSummary: `Preview pronto para download de ${documentIds.length} documento(s) CDF/CDR. Confirme com snapshot para executar sem recalcular.`,
      jobId: null
    };
  }

  const documentIds = explicitDocumentIds.length > 0
    ? explicitDocumentIds
    : ensureDeterministicSelectionSnapshot({
      value: args.selectionSnapshot,
      expectedIntent: 'cdf.download_batch_selected',
      integrationAccountId: scope.integrationAccountId
    }).selectedDocumentIds;

  if (documentIds.length === 0) {
    throw new AppError(409, 'Conflict', 'Snapshot de CDF/CDR sem documentos selecionados. Gere preview novamente.', {
      code: 'CONVERSATION_SELECTION_SNAPSHOT_EMPTY'
    });
  }

  const execution: Array<{ documentId: string; jobId: string | null }> = [];
  for (const documentId of documentIds.slice(0, SAFE_BATCH_MAX_ITEMS)) {
    const response = await enqueueCdfDownload(
      {
        integrationAccountId: scope.integrationAccountId,
        sessionContextId: scope.sessionContextId,
        requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy,
        documentId,
        conversationDeterministic: {
          intent: 'cdf.download_batch_selected',
          confirmed: true,
          selectionSnapshot: toNullableString(args.selectionSnapshot),
          selectedDocumentIds: documentIds,
          selectedDocumentId: documentId,
          selectionSource: explicitDocumentIds.length > 0 ? 'explicit_document_ids' : 'snapshot'
        }
      },
      {
        ...input.headers,
        'idempotency-key': input.context.idempotencyKey ? `${input.context.idempotencyKey}:${documentId}` : undefined
      },
      input.context.correlationId
    );

    execution.push({
      documentId,
      jobId: toNullableString((response as Record<string, unknown>).jobId)
    });
  }

  return {
    kind: 'action',
    type: 'cdf_action',
    data: {
      intent: 'cdf.download_batch_selected',
      execution,
      total: execution.length
    },
    artifacts: [],
    actions: [],
    assistantSummary: `${execution.length} download(s) CDF/CDR foram enfileirados com o conjunto confirmado.`,
    jobId: execution[0]?.jobId || null
  };
}

async function handleManifestListRecentTop(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const selection = (args.selection as Record<string, unknown>) || {};
  const skipMostRecent = clampNonNegativeInt(selection.skipMostRecent, 0);
  const orderBy = resolveManifestRecencyOrder(selection.orderBy);
  const groupBy = toNullableString(selection.groupBy || args.groupBy);
  // Ordenação dos grupos decidida pelo planner (validada no Zod da tool);
  // default declarado no schema: count_desc.
  const groupOrder: ManifestGroupOrder =
    toNullableString(selection.groupOrder || args.groupOrder) === 'key_asc' ? 'key_asc' : 'count_desc';
  const withoutCdf = toBoolean(selection.withoutCdf ?? args.withoutCdf, false);
  const excludedManifestIds = toStringArray(selection.excludeManifestIds || args.excludeManifestIds);
  const excludedIndexes = toIntArray(selection.excludeIndexes || args.excludeIndexes);
  const dateRange = resolveManifestDateRange(selection, args);
  // Listar um PERÍODO informado (com data) e sem N explícito deve ser ABRANGENTE — mostrar
  // todos do período (cap de segurança), não um recorte de 3 (que falsamente sugere período vazio).
  // Sem período (apenas "os recentes"), mantém-se um recorte enxuto.
  const hasExplicitDateRange = Boolean(dateRange.dateFrom || dateRange.dateTo);
  const top = clampPositiveInt(selection.top, hasExplicitDateRange ? 25 : 3);
  const scope = resolveManifestListScope(input, args);

  // Recencia governada pela DATA DE NEGOCIO (data de expedicao), nao pelo tempo de
  // insercao no espelho (created_at). Ordenamos no banco por orderBy (recency_desc/asc)
  // e buscamos uma janela ampla o suficiente para conter os realmente mais recentes,
  // mesmo apos os filtros em memoria (intervalo de datas / sem CDF).
  const consultedAt = new Date().toISOString();
  const response = await listManifests(
    {
      ...scope,
      localOnly: true,
      orderBy,
      dateFrom: dateRange.dateFrom ?? undefined,
      dateTo: dateRange.dateTo ?? undefined,
      page: 1,
      pageSize: Math.max(top + skipMostRecent + 25, 50)
    },
    input.context.correlationId,
    input.headers
  );

  const manifestItems = asListResponseItems(response).map(toManifestListItem).filter(Boolean) as ManifestListItem[];
  const dateFiltered = filterManifestsByDateRange(manifestItems, dateRange.dateFrom, dateRange.dateTo);
  const operationallyFiltered = withoutCdf
    ? dateFiltered.filter((item) => !toNullableString(item.externalHashCode))
    : dateFiltered;
  const ranked = selectRecentManifests(
    operationallyFiltered,
    top + excludedIndexes.length + excludedManifestIds.length,
    skipMostRecent,
    orderBy
  );
  const selected = applyManifestSelectionExclusions({
    selected: ranked,
    excludedManifestIds,
    excludedIndexes
  }).slice(0, top);
  const grouped = groupBy ? buildGroupedManifestStats(selected, groupBy, groupOrder) : [];
  const groupedRankingSummary = grouped.length > 0
    ? grouped
      .map((item) => `${item.rank}o ${item.group} (${item.total})`)
      .join(', ')
    : 'sem grupos';

  const baseIntent = groupBy ? 'manifest.group_recent_top' : 'manifest.list_recent_top';

  // Ambiguidade explicita: quando varios manifestos compartilham a mesma data de
  // expedicao do topo do ranking, a "recencia" por data nao é suficiente para eleger
  // um unico "mais recente". Expomos isso como evidencia para o LLM raciocinar
  // (ele deve explicar o empate em vez de forçar uma escolha arbitraria).
  const topExpeditionDate = toNullableString(selected[0]?.expeditionDate);
  const sameTopDateItems = topExpeditionDate
    ? operationallyFiltered.filter((item) => toNullableString(item.expeditionDate) === topExpeditionDate)
    : [];

  return {
    kind: 'query',
    data: {
      intent: baseIntent,
      criteria: {
        orderBy,
        top,
        skipMostRecent,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        totalInRange: operationallyFiltered.length,
        withoutCdf,
        groupBy,
        groupOrder: groupBy ? groupOrder : null,
        // Rastreabilidade/evidência: de onde veio, quando, e por qual campo a recência foi medida.
        source: 'local_mirror',
        consultedAt,
        recencyField: 'expeditionDate',
        ambiguousTopExpeditionDate:
          sameTopDateItems.length > 1
            ? {
                expeditionDate: topExpeditionDate,
                count: sameTopDateItems.length,
                manifests: sameTopDateItems.slice(0, 10).map(summarizeManifestReference)
              }
            : null,
        exclusions: {
          manifestIds: excludedManifestIds,
          indexes: excludedIndexes
        }
      },
      affectedItems: selected.map(summarizeManifestReference),
      grouped
    },
    assistantSummary: (() => {
      if (groupBy && selected.length === 0) {
        const periodText = buildPeriodText(dateRange);
        const cdfSuffix = withoutCdf ? ' sem CDF' : '';
        const periodLabel = periodText || 'no periodo solicitado';
        const groupLabel = groupBy.toLowerCase() === 'generator' ? 'gerador' : groupBy;
        if (withoutCdf && groupBy.toLowerCase() === 'status') {
          return `Diagnostico inicial (manifestos/MTR sem CDF): ${periodLabel}. Resumo: total encontrado=0, totais por status=nenhum, ausencia de dados=sim. Acoes seguras executaveis agora: revisar filtros e listar novamente manifestos elegiveis sem CDF. Acao sensivel bloqueada: geracao de CDF/certificado nao foi executada neste modo. Confirmacao explicita: apos obter itens elegiveis na previa, responda "confirmo cdf.generate_from_manifest_selection" para autorizar a acao sensivel.`;
        }
        return `Consulta de manifestos${cdfSuffix}: ${periodLabel}. Resumo: total encontrado=0, totais por ${groupLabel}=nenhum, status relevantes=manifesto recebido sem CDF, ausencia de dados=sim. Justificativa: nenhum manifesto sem CDF foi retornado para os filtros aplicados neste recorte por ${groupLabel}.`;
      }

      if (groupBy) {
        return `Agrupei ${selected.length} manifesto(s) por ${groupBy} (ordenacao ${groupOrder}). Grupos: ${groupedRankingSummary}.`;
      }

      return buildSelectionSummary({
        intent: 'manifest.list_recent_top',
        top,
        skipMostRecent,
        orderBy,
        dateRange,
        totalConsidered: operationallyFiltered.length,
        selected
      });
    })()
  };
}

async function handleManifestDetailSelectedSet(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const manifestIds = toStringArray(args.manifestIds).length > 0
    ? toStringArray(args.manifestIds)
    : toStringArray(input.context.lastManifestSelectionIds || []);
  if (manifestIds.length === 0) {
    // Sem seleção explícita: se há uma JANELA ATIVA (memória de contexto), resolve "esses"
    // para os manifestos desse período e os lista com seus campos — em vez de erro técnico.
    const selection = (args.selection as Record<string, unknown>) || {};
    const dateRange = resolveManifestDateRange(selection, args);
    if (dateRange.dateFrom || dateRange.dateTo) {
      const scope = resolveManifestListScope(input, args);
      const response = await listManifests(
        {
          ...scope,
          localOnly: true,
          orderBy: 'recency_desc',
          dateFrom: dateRange.dateFrom ?? undefined,
          dateTo: dateRange.dateTo ?? undefined,
          page: 1,
          pageSize: 80
        },
        input.context.correlationId,
        input.headers
      );
      const items = asListResponseItems(response).map(toManifestListItem).filter(Boolean) as ManifestListItem[];
      const windowItems = filterManifestsByDateRange(items, dateRange.dateFrom, dateRange.dateTo).slice(0, 25);
      return {
        kind: 'query',
        data: {
          intent: 'manifest.list_recent_top',
          criteria: {
            source: 'active_window',
            consultedAt: new Date().toISOString(),
            recencyField: 'expeditionDate',
            orderBy: 'recency_desc',
            dateFrom: dateRange.dateFrom,
            dateTo: dateRange.dateTo,
            totalInRange: windowItems.length
          },
          affectedItems: windowItems
        },
        assistantSummary: `Manifestos do periodo de ${dateRange.dateFrom ?? '...'} a ${dateRange.dateTo ?? '...'}: ${windowItems.length}.`
      };
    }
    throw new AppError(400, 'Bad Request', `Nenhum manifesto selecionado para detalhar. ${buildOperatorActionHint()}`, {
      code: 'CONVERSATION_MANIFEST_SET_REQUIRED'
    });
  }

  const details = await Promise.all(manifestIds.slice(0, 10).map((manifestId) => getManifest(manifestId)));
  const manifests = details.map(toManifestConsolidatedDetail).filter(Boolean) as ManifestConsolidatedDetail[];

  return {
    kind: 'query',
    data: {
      intent: 'manifest.detail_selected_set',
      source: 'session_last_selection',
      manifests
    },
    assistantSummary: summarizeConsolidatedManifestDetails(manifests)
  };
}

function handleMemoryListAskedManifests(args: Record<string, unknown>) {
  const manifestIds = toStringArray(args.manifestIds).slice(0, 20);

  return {
    kind: 'query',
    data: {
      intent: 'memory.list_asked_manifests',
      source: 'conversation_memory',
      manifestIds,
      affectedItems: manifestIds.map((manifestId) => ({ manifestId }))
    },
    assistantSummary: summarizeAskedManifestIds(manifestIds)
  };
}

async function handleLookupGeneratorByManifestNumber(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const manifestNumber = requireString(args.manifestNumber, 'manifestNumber is required for manifest.lookup_generator_by_number.');
  const scope = resolveManifestListScope(input, args);

  const response = await listManifests(
    {
      ...scope,
      localOnly: true,
      manifestNumber,
      page: 1,
      pageSize: 5
    },
    input.context.correlationId,
    input.headers
  );

  const manifestItems = asListResponseItems(response).map(toManifestListItem).filter(Boolean) as ManifestListItem[];
  const selected = manifestItems[0] || null;

  if (!selected) {
    return {
      kind: 'query',
      data: {
        intent: 'manifest.lookup_generator_by_number',
        manifestNumber,
        found: false,
        affectedItems: []
      },
      assistantSummary: `Nao encontrei manifesto com numero ${manifestNumber} para o contexto operacional atual.`
    };
  }

  const manifestRef = selected.manifestNumber ? String(selected.manifestNumber) : selected.id;
  const generator = selected.generatorDescription || '-';
  const carrier = selected.carrierDescription || '-';
  const receiver = selected.receiverDescription || '-';

  return {
    kind: 'query',
    data: {
      intent: 'manifest.lookup_generator_by_number',
      manifestNumber,
      found: true,
      affectedItems: [summarizeManifestReference(selected)]
    },
    assistantSummary: `O gerador do manifesto ${manifestRef} e ${generator}. Origem operacional: gerador ${generator}, transportador ${carrier}, destinador ${receiver}.`
  };
}

async function handleCancelRecentExcludingFirst(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const selection = (args.selection as Record<string, unknown>) || {};
  const top = clampPositiveInt(selection.top, 3);
  const skipMostRecent = clampPositiveInt(selection.skipMostRecent, 1);
  const previewOnly = args.previewOnly === true || toNullableString(args.mode)?.toLowerCase() === 'preview';
  const scope = resolveManifestListScope(input, args);

  const criteria = {
    orderBy: 'recency_desc',
    top,
    skipMostRecent
  };

  if (previewOnly) {
    const listedPreview = await listManifests(
      {
        ...scope,
        page: 1,
        pageSize: Math.max(top + skipMostRecent + 3, 10)
      },
      input.context.correlationId,
      input.headers
    );

    const previewItems = asListResponseItems(listedPreview).map(toManifestListItem).filter(Boolean) as ManifestListItem[];
    const previewSelected = selectRecentManifests(previewItems, top, skipMostRecent, 'recency_desc');
    const previewManifestIds = previewSelected.map((manifest) => manifest.id);
    const selectionSnapshot = createDeterministicSelectionSnapshot({
      intent: 'manifest.cancel_recent_excluding_first',
      integrationAccountId: scope.integrationAccountId || null,
      sessionContextId: scope.sessionContextId || null,
      selectedManifestIds: previewManifestIds,
      criteria
    });

    return {
      kind: 'query',
      type: 'manifest_batch_preview',
      data: {
        intent: 'manifest.preview_cancel_recent_excluding_first',
        actionIntent: 'manifest.cancel_recent_excluding_first',
        criteria,
        affectedItems: previewSelected.map(summarizeManifestReference),
        requiresConfirmation: true,
        selectionSnapshot
      },
      actions: [
        {
          type: 'confirm_tool_execution',
          label: 'Confirmar cancelamento do conjunto selecionado',
          payload: {
            intent: 'manifest.cancel_recent_excluding_first',
            selectionSnapshot,
            confirmed: true,
            reason: toNullableString(args.reason) || 'Cancelled by conversation orchestration.'
          }
        }
      ],
      artifacts: [],
      assistantSummary: `${buildSelectionSummary({
        intent: 'manifest.cancel_recent_excluding_first',
        top,
        skipMostRecent,
        orderBy: 'recency_desc',
        dateRange: { dateFrom: null, dateTo: null },
        totalConsidered: previewItems.length,
        selected: previewSelected
      })} Preview congelado. Confirme com o snapshot para executar sem recalcular.`,
      jobId: null
    };
  }

  const selectedManifestIds = resolveBatchManifestIdsForExecution(
    input,
    {
      manifestIds: args.manifestIds,
      selectionSnapshot: args.selectionSnapshot
    },
    'manifest.cancel_recent_excluding_first'
  );

  enforceSafeBatchLimit(selectedManifestIds);

  const selectedDetails = await Promise.all(selectedManifestIds.map(async (manifestId) => {
    const detail = toRecord(await getManifest(manifestId));
    return {
      id: manifestId,
      manifestNumber: toStringOrNumberOrNull(detail.manifestNumber),
      expeditionDate: toNullableString(detail.expeditionDate),
      lastSyncAt: toNullableString(detail.lastSyncAt),
      status: toNullableString(detail.status),
      externalStatus: toNullableString(detail.externalStatus),
      externalHashCode: toNullableString(detail.externalHashCode),
      generatorDescription: toNullableString(toRecord(detail.generator).description),
      carrierDescription: toNullableString(toRecord(detail.carrier).description),
      receiverDescription: toNullableString(toRecord(detail.receiver).description),
      driverName: toNullableString(detail.driverName),
      vehiclePlate: toNullableString(detail.vehiclePlate)
    } as ManifestListItem;
  }));

  const executionResults: Array<{ manifestId: string; jobId: string | null }> = [];
  for (const manifest of selectedDetails) {
    const itemHeaders = {
      ...input.headers,
      'idempotency-key': input.context.idempotencyKey
        ? `${input.context.idempotencyKey}:${manifest.id}`
        : undefined
    };
    const cancelled = await enqueueManifestCancel(
      manifest.id,
      {
        requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy,
        reason: toNullableString(args.reason) || 'Cancelled by conversation orchestration.',
        conversationDeterministic: {
          intent: 'manifest.cancel_recent_excluding_first',
          confirmed: true,
          selectionSnapshot: toNullableString(args.selectionSnapshot),
          selectedManifestIds,
          selectedManifestId: manifest.id,
          selectionSource: args.selectionSnapshot ? 'snapshot' : 'explicit_manifest_ids',
          criteria
        }
      },
      itemHeaders,
      input.context.correlationId
    );

    executionResults.push({
      manifestId: manifest.id,
      jobId: toNullableString(cancelled.jobId)
    });
  }

  const summary = buildSelectionSummary({
    intent: 'manifest.cancel_recent_excluding_first',
    top: selectedDetails.length,
    skipMostRecent: 0,
    orderBy: 'recency_desc',
    dateRange: { dateFrom: null, dateTo: null },
    totalConsidered: selectedDetails.length,
    selected: selectedDetails
  });
  return {
    kind: 'action',
    data: {
      intent: 'manifest.cancel_recent_excluding_first',
      criteria: {
        ...criteria,
        selectionSource: args.selectionSnapshot ? 'snapshot' : 'explicit_manifest_ids'
      },
      affectedItems: selectedDetails.map(summarizeManifestReference),
      execution: executionResults
    },
    assistantSummary: `${summary} Cancelamentos enfileirados: ${executionResults.length}.`,
    jobId: executionResults[0]?.jobId || null
  };
}

async function handleReplicateWithPatch(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const previewOnly = args.previewOnly === true || toNullableString(args.mode)?.toLowerCase() === 'preview';
  const intent = toNullableString(args.intent) || 'manifest.replicate_with_patch';
  const segments = normalizeReplicationSegments(args, input.context.manifestId);
  const replicationIntent = intent === 'manifest.replicate_segmented'
    ? 'manifest.replicate_segmented'
    : 'manifest.replicate_with_patch';

  if (previewOnly) {
    const selectionSnapshot = createDeterministicSelectionSnapshot({
      intent: replicationIntent,
      integrationAccountId: input.context.integrationAccountId,
      sessionContextId: toNullableString(args.sessionContextId) || input.context.sessionContextId,
      selectedManifestIds: segments.map((segment) => segment.sourceManifestId),
      criteria: {
        segments
      }
    });

    const totalReplicas = segments.reduce((acc, segment) => acc + segment.count, 0);

    return {
      kind: 'query',
      type: 'manifest_replication_preview',
      data: {
        intent: `manifest.preview_${replicationIntent.replace('manifest.', '')}`,
        actionIntent: replicationIntent,
        segments,
        totalReplicas,
        requiresConfirmation: true,
        selectionSnapshot
      },
      actions: [
        {
          type: 'confirm_tool_execution',
          label: 'Confirmar replicacao segmentada',
          payload: {
            intent: replicationIntent,
            selectionSnapshot,
            confirmed: true
          }
        }
      ],
      artifacts: [],
      assistantSummary: `Preview pronto para replicar ${totalReplicas} manifesto(s) em ${segments.length} segmento(s). Confirme com snapshot para executar sem recalcular.`,
      jobId: null
    };
  }

  const snapshot = parseDeterministicSelectionSnapshot(args.selectionSnapshot);
  const resolvedSegments = snapshot?.intent === replicationIntent
    ? normalizeReplicationSegments({ segments: toRecord(snapshot.criteria).segments }, input.context.manifestId)
    : segments;

  const execution = [] as Array<{ sourceManifestId: string; count: number; response: unknown }>;

  for (const segment of resolvedSegments) {
    const replicated = await replicateManifest(
      segment.sourceManifestId,
      {
        count: segment.count,
        overrides: segment.overrides,
        sessionContextId: toNullableString(args.sessionContextId) || input.context.sessionContextId,
        requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy
      },
      input.context.correlationId
    );

    execution.push({
      sourceManifestId: segment.sourceManifestId,
      count: segment.count,
      response: replicated
    });
  }

  const totalReplicas = resolvedSegments.reduce((acc, segment) => acc + segment.count, 0);

  return {
    kind: 'action',
    data: {
      intent: replicationIntent,
      mode: resolvedSegments.length > 1 ? 'segmented' : 'single',
      segments: resolvedSegments,
      totalReplicas,
      execution
    },
    assistantSummary: `Replicacao executada para ${resolvedSegments.length} segmento(s), total planejado de ${totalReplicas} replica(s).`,
    jobId: null
  };
}

async function executeOrchestratedManifestOperation(input: ConversationDispatchInput) {
  const args = input.toolArgs || {};
  const intent = toNullableString(args.intent);

  if (!intent) {
    throw new AppError(400, 'Bad Request', 'intent is required for orchestrated manifest operation.');
  }

  switch (intent) {
    case 'manifest.list_recent_top':
      return handleManifestListRecentTop(input, args);
    case 'manifest.group_recent_top':
      return handleManifestListRecentTop(input, {
        ...args,
        selection: {
          ...toRecord(args.selection),
          groupBy: toNullableString(toRecord(args.selection).groupBy || args.groupBy) || 'status'
        }
      });
    case 'manifest.preview_cancel_recent_excluding_first':
      return handleCancelRecentExcludingFirst(input, {
        ...args,
        previewOnly: true
      });
    case 'manifest.detail_selected_set':
      return handleManifestDetailSelectedSet(input, args);
    case 'memory.list_asked_manifests':
      return handleMemoryListAskedManifests(args);
    case 'manifest.lookup_generator_by_number':
      return handleLookupGeneratorByManifestNumber(input, args);
    case 'manifest.cancel_recent_excluding_first':
      return handleCancelRecentExcludingFirst(input, args);
    case 'manifest.replicate_with_patch':
      return handleReplicateWithPatch(input, args);
    case 'manifest.replicate_segmented':
      return handleReplicateWithPatch(input, {
        ...args,
        intent
      });
    case 'manifest.create_draft':
      return handleManifestCreateDraft(input, args);
    case 'manifest.preview_create_from_payload':
      return handleManifestCreatePreviewFromPayload(input, args);
    case 'manifest.create_from_payload':
      return handleManifestCreateFromPayload(input, args);
    case 'manifest.receive_with_receipt':
      return handleManifestReceiveWithReceipt(input, args);
    case 'manifest.batch_submit_selected':
      return handleBatchOperationIntent(input, args, 'submit');
    case 'manifest.preview_batch_submit_selected':
      return handleBatchOperationIntent(input, {
        ...args,
        previewOnly: true
      }, 'submit');
    case 'manifest.batch_print_selected':
      return handleBatchOperationIntent(input, args, 'print');
    case 'manifest.preview_batch_print_selected':
      return handleBatchOperationIntent(input, {
        ...args,
        previewOnly: true
      }, 'print');
    case 'manifest.batch_cancel_selected':
      return handleBatchOperationIntent(input, args, 'cancel');
    case 'manifest.preview_batch_cancel_selected':
      return handleBatchOperationIntent(input, {
        ...args,
        previewOnly: true
      }, 'cancel');
    case 'cdf.resolve_by_manifest_reference':
      return handleCdfResolveByManifestReference(input, args);
    case 'cdf.list_by_manifest_selection':
      return handleCdfListByManifestSelection(input, args);
    case 'cdf.generate_from_manifest_selection':
      return handleCdfGenerateFromManifestSelection(input, args);
    case 'cdf.preview_download_batch_selected':
      return handleCdfDownloadBatch(input, {
        ...args,
        previewOnly: true
      });
    case 'cdf.download_batch_selected':
      return handleCdfDownloadBatch(input, args);
    default:
      throw new AppError(400, 'Bad Request', `intent ${intent} is not supported by orchestrate_manifest_operation.`, {
        code: 'CONVERSATION_INTENT_UNSUPPORTED',
        context: {
          intent,
          toolName: 'orchestrate_manifest_operation'
        }
      });
  }
}

function withNormalizedShape(input: {
  legacyKind: 'query' | 'action';
  data: unknown;
  jobId?: string | null;
  normalized: {
    type: 'list' | 'detail' | 'action' | 'status';
    artifacts: unknown[];
    actions: unknown[];
  };
  assistantSummary?: string;
}) {
  return {
    kind: input.legacyKind,
    type: input.normalized.type,
    data: input.data,
    artifacts: input.normalized.artifacts,
    actions: input.normalized.actions,
    assistantSummary: input.assistantSummary,
    jobId: input.jobId || null
  };
}

// Skill de diagnóstico operacional (loop agêntico read-only). Encadeia tools de leitura
// via o próprio dispatcher (mesma plumbing/contexto) e devolve o diagnóstico + evidências.
async function handleOperationDiagnose(input: ConversationDispatchInput, args: Record<string, unknown>) {
  const question = toNullableString(args.question)
    || toNullableString((args as Record<string, unknown>).messageText)
    || 'Faca um diagnostico operacional do estado atual (manifestos, CDF, jobs/erros) e indique os proximos passos seguros.';

  const diagnosis = await runOperationalDiagnosis({
    question,
    dispatch: (toolName, toolArgs) => dispatchConversationTool({
      ...input,
      toolName,
      toolArgs: toolArgs || {}
    })
  });

  return {
    kind: 'query',
    data: {
      intent: 'operation.diagnose',
      stepsUsed: diagnosis.steps,
      evidence: diagnosis.evidence.map((entry) => ({ tool: entry.tool, result: entry.result }))
    },
    assistantSummary: diagnosis.answer
  };
}

export async function dispatchConversationTool(input: ConversationDispatchInput) {
  const toolName = input.toolName;
  if (
    toolName !== 'orchestrate_manifest_operation'
    && toolName !== 'list_manifests'
    && toolName !== 'get_manifest_details'
    && toolName !== 'list_manifest_documents'
    && toolName !== 'list_cdf_certificates'
    && toolName !== 'enqueue_cdf_download'
    && toolName !== 'get_job_status'
    && toolName !== 'list_jobs'
    && toolName !== 'get_audit_trail'
    && toolName !== 'query_catalog'
    && toolName !== 'search_partners'
    && toolName !== 'get_operations_overview'
    && toolName !== 'list_dmr'
    && toolName !== 'list_mtr_provisorio'
    && toolName !== 'get_dashboard_overview'
    && toolName !== 'diagnose_operation'
    && toolName !== 'replicate_manifest'
    && toolName !== 'submit_manifest'
    && toolName !== 'print_manifest'
    && toolName !== 'cancel_manifest'
  ) {
    throw new AppError(
      400,
      'Bad Request',
      `Tool ${toolName} is not supported by conversation dispatcher.`,
      {
        code: 'CONVERSATION_TOOL_UNSUPPORTED',
        context: {
          toolName
        }
      }
    );
  }

  const args = validateConversationToolInput(toolName, input.toolArgs || {});

  switch (toolName) {
    case 'orchestrate_manifest_operation':
      return executeOrchestratedManifestOperation({
        ...input,
        toolArgs: args
      });

    case 'diagnose_operation':
      return handleOperationDiagnose(input, args);

    case 'list_manifests': {
      const dateFrom = toNullableString(args.dateFrom);
      const dateTo = toNullableString(args.dateTo);
      assertOrderedDateRange({ dateFrom, dateTo, source: 'list_manifests' });

      const response = await listManifests(
        {
          integrationAccountId: toNullableString(args.integrationAccountId) || input.context.integrationAccountId || undefined,
          sessionContextId: toNullableString(args.sessionContextId) || input.context.sessionContextId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          status: toNullableString(args.status) || undefined,
          page: toOptionalNumber(args.page),
          pageSize: toOptionalNumber(args.pageSize)
        },
        input.context.correlationId,
        input.headers
      );

      const normalized = normalizeManifestListResult(response);

      return withNormalizedShape({
        legacyKind: 'query',
        data: response,
        normalized
      });
    }

    case 'get_manifest_details': {
      const resolvedReference = await resolveManifestReference({
        args,
        context: {
          ...input.context,
          lastManifestSelectionIds: input.context.lastManifestSelectionIds || []
        },
        headers: input.headers
      });
      const manifestId = requireString(
        resolvedReference.manifestId,
        'manifestId is required to get manifest details.'
      );
      const response = await getManifest(manifestId);
      const normalized = normalizeManifestDetailResult(response);

      return withNormalizedShape({
        legacyKind: 'query',
        data: response,
        normalized
      });
    }

    case 'list_manifest_documents': {
      const manifestId = requireString(args.manifestId, 'manifestId is required to list manifest documents.');
      const response = await listManifestDocuments(manifestId);

      return {
        kind: 'query',
        type: 'artifact_list',
        data: {
          manifestId,
          items: response
        },
        artifacts: [],
        actions: []
      };
    }

    case 'list_cdf_certificates': {
      const integrationAccountId = toNullableString(args.integrationAccountId) || input.context.integrationAccountId;
      const dateFrom = toNullableString(args.dateFrom);
      const dateTo = toNullableString(args.dateTo);
      assertOrderedDateRange({ dateFrom, dateTo, source: 'list_cdf_certificates' });

      enforceOperationalContext({
        integrationAccountId,
        sessionContextId: toNullableString(args.sessionContextId) || input.context.sessionContextId,
        requireSession: false
      });

      const response = await listCdfCertificates(
        {
          integrationAccountId: integrationAccountId || undefined,
          sessionContextId: toNullableString(args.sessionContextId) || input.context.sessionContextId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined
        },
        input.context.correlationId,
        input.headers
      );

      return {
        kind: 'query',
        type: 'cdf_list',
        data: response,
        artifacts: [],
        actions: [],
        assistantSummary: buildCdfListSummary({
          items: asListResponseItems(response).map((item) => toRecord(item)),
          dateFrom: toNullableString((response as Record<string, unknown>).dateFrom),
          dateTo: toNullableString((response as Record<string, unknown>).dateTo),
          message: toNullableString((response as Record<string, unknown>).message)
        })
      };
    }

    case 'enqueue_cdf_download': {
      const integrationAccountId = toNullableString(args.integrationAccountId) || input.context.integrationAccountId;
      const sessionContextId = toNullableString(args.sessionContextId) || input.context.sessionContextId;
      enforceOperationalContext({ integrationAccountId, sessionContextId, requireSession: true });

      const response = await enqueueCdfDownload(
        {
          integrationAccountId,
          sessionContextId,
          requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy,
          documentId: requireString(args.documentId, 'documentId is required to download CDF.')
        },
        {
          ...input.headers,
          'idempotency-key': input.context.idempotencyKey || undefined
        },
        input.context.correlationId
      );

      return {
        kind: 'action',
        type: 'cdf_action',
        data: response,
        artifacts: [],
        actions: [],
        jobId: toNullableString((response as Record<string, unknown>).jobId)
      };
    }

    case 'get_job_status': {
      const jobId = requireString(args.jobId, 'jobId is required to get job status.');
      const response = await getJob(jobId);
      const responseJobId = toNullableString((response as Record<string, unknown>).jobId);

      return {
        kind: 'query',
        type: 'job_card',
        data: response,
        artifacts: [],
        actions: [],
        jobId: responseJobId
      };
    }

    case 'list_jobs': {
      const response = await jobsSearch(args);
      const responseRecord = toRecord(response);
      const items = asListResponseItems(responseRecord).map((item) => toRecord(item));
      const totalItems = clampNonNegativeInt(responseRecord.totalItems, items.length);
      const statusFilter = toNullableString(args.status);
      return {
        kind: 'query',
        type: 'job_list',
        data: response,
        artifacts: [],
        actions: [],
        assistantSummary: buildJobsListSummary({
          items,
          totalItems,
          statusFilter,
          mode: toNullableString(args.mode)
        })
      };
    }

    case 'get_audit_trail': {
      const correlationId = requireString(
        args.correlationId || input.context.correlationId,
        'correlationId is required to get audit trail.'
      );
      try {
        const response = await getAuditTrail(correlationId);
        const responseRecord = toRecord(response);
        const entries = Array.isArray(responseRecord.entries) ? responseRecord.entries : [];
        const entityType = toNullableString(responseRecord.entityType);
        const entityId = toNullableString(responseRecord.entityId);

        return {
          kind: 'query',
          type: 'audit_timeline',
          data: response,
          artifacts: [],
          actions: [],
          assistantSummary: buildAuditTrailSummary({
            correlationId,
            entryCount: entries.length,
            entityType,
            entityId,
            found: true
          })
        };
      } catch (error: unknown) {
        if (error instanceof AppError && error.statusCode === 404) {
          return {
            kind: 'query',
            type: 'audit_timeline',
            data: {
              correlationId,
              entityType: null,
              entityId: null,
              entries: []
            },
            artifacts: [],
            actions: [],
            assistantSummary: buildAuditTrailSummary({
              correlationId,
              entryCount: 0,
              entityType: null,
              entityId: null,
              found: false
            })
          };
        }

        throw error;
      }
    }

    case 'query_catalog': {
      const catalogName = requireString(args.catalogName, 'catalogName is required.');
      const search = toNullableString(args.search);
      const response = await queryCatalog(catalogName, {
        page: args.page,
        pageSize: args.pageSize,
        search: search || undefined,
        integrationAccountId: toNullableString(args.integrationAccountId) || input.context.integrationAccountId || undefined,
        sessionContextId: toNullableString(args.sessionContextId) || input.context.sessionContextId || undefined
      });

      const responseRecord = toRecord(response);
      const items = asListResponseItems(responseRecord).map((item) => toRecord(item));
      const totalItems = clampNonNegativeInt(responseRecord.totalItems, items.length);

      return {
        kind: 'query',
        type: 'manifest_detail',
        data: response,
        artifacts: [],
        actions: [],
        assistantSummary: buildCatalogListSummary({
          catalogName,
          search,
          totalItems,
          items
        })
      };
    }

    case 'search_partners': {
      const role = toNullableString(args.role) || 'generator';
      const q = toNullableString(args.q);
      const page = Math.max(1, Math.trunc(toOptionalNumber(args.page) || 1));
      const pageSize = Math.max(1, Math.min(200, Math.trunc(toOptionalNumber(args.pageSize) || 20)));

      const response = await searchPartners({
        role,
        q: q || '',
        integrationAccountId: toNullableString(args.integrationAccountId) || input.context.integrationAccountId || undefined,
        sessionContextId: toNullableString(args.sessionContextId) || input.context.sessionContextId || undefined,
        page,
        pageSize
      });

      const responseRecord = toRecord(response);
      const items = asListResponseItems(responseRecord).map((item) => toRecord(item));
      const totalItems = clampNonNegativeInt(responseRecord.totalItems, items.length);

      return {
        kind: 'query',
        type: 'manifest_list',
        data: response,
        artifacts: [],
        actions: [],
        assistantSummary: buildPartnerSearchSummary({
          role,
          q,
          totalItems,
          items
        })
      };
    }

    case 'get_operations_overview': {
      const response = await getOperationsOverview();
      const integrationAccountId = toNullableString(args.integrationAccountId) || input.context.integrationAccountId;
      const sessionContextId = toNullableString(args.sessionContextId) || input.context.sessionContextId;
      const mode = toNullableString(args.mode);
      const manifestNumber = toNullableString(args.manifestNumber);

      return {
        kind: 'query',
        type: 'operation_progress',
        data: response,
        artifacts: [],
        actions: [],
        assistantSummary: buildOperationsOverviewSummary({
          overview: toRecord(response),
          integrationAccountId,
          sessionContextId,
          mode,
          manifestNumber
        })
      };
    }

    case 'list_dmr': {
      const explanationOnly = toBoolean(args.explanationOnly, false);

      if (explanationOnly) {
        return {
          kind: 'query',
          type: 'manifest_list',
          data: {
            items: [],
            page: 1,
            pageSize: 50,
            total: 0,
            totalPages: 1,
            explanationOnly: true
          },
          artifacts: [],
          actions: [],
          assistantSummary: 'DMR no SICAT e a Declaracao de Movimentacao de Residuos usada para consolidar e reportar a movimentacao no fluxo CETESB. Quando usar: fechamento e revisao do periodo declaratorio, antes do envio oficial. Telas relacionadas: lista de DMR, detalhe da declaracao e acompanhamento de pendencias de validacao.'
        };
      }

      const response = await listDmrService(args);
      const responseRecord = toRecord(response);
      const items = asListResponseItems(responseRecord).map((item) => toRecord(item));
      return {
        kind: 'query',
        type: 'manifest_list',
        data: response,
        artifacts: [],
        actions: [],
        assistantSummary: buildDmrHelpSummary({
          total: clampNonNegativeInt(responseRecord.total, items.length),
          periodStart: toNullableString(args.periodStart),
          periodEnd: toNullableString(args.periodEnd),
          items
        })
      };
    }

    case 'list_mtr_provisorio': {
      const explanationOnly = toBoolean(args.explanationOnly, false);

      if (explanationOnly) {
        return {
          kind: 'query',
          type: 'manifest_list',
          data: {
            items: [],
            page: 1,
            pageSize: 50,
            totalItems: 0,
            totalPages: 1,
            explanationOnly: true
          },
          artifacts: [],
          actions: [],
          assistantSummary: buildMtrProvisorioSummary({
            totalItems: 0,
            items: [],
            explanationOnly: true
          })
        };
      }

      const response = await listMtrProvisorioService(args);
      const responseRecord = toRecord(response);
      const items = asListResponseItems(responseRecord).map((item) => toRecord(item));
      const totalItems = clampNonNegativeInt(responseRecord.totalItems, items.length);
      return {
        kind: 'query',
        type: 'manifest_list',
        data: response,
        artifacts: [],
        actions: [],
        assistantSummary: buildMtrProvisorioSummary({
          totalItems,
          items,
          explanationOnly: false
        })
      };
    }

    case 'get_dashboard_overview': {
      const response = await getDashboardOverview();
      const mode = toNullableString(args.mode);

      return {
        kind: 'query',
        type: 'operation_progress',
        data: response,
        artifacts: [],
        actions: [],
        assistantSummary: buildDashboardOverviewSummary({
          dashboard: toRecord(response),
          mode
        })
      };
    }

    case 'submit_manifest': {
      const resolvedReference = await resolveManifestReference({
        args,
        context: {
          ...input.context,
          lastManifestSelectionIds: input.context.lastManifestSelectionIds || []
        },
        headers: input.headers
      });
      const manifestId = requireString(resolvedReference.manifestId, 'manifestId is required to submit a manifest.');
      const response = await enqueueManifestSubmit(
        manifestId,
        {
          sessionContextId: toNullableString(args.sessionContextId) || input.context.sessionContextId,
          requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy,
          validateOnly: Boolean(args.validateOnly),
          printAfterSubmit: Boolean(args.printAfterSubmit)
        },
        {
          ...input.headers,
          'idempotency-key': input.context.idempotencyKey || undefined
        },
        input.context.correlationId
      );
      const responseJobId = toNullableString((response as Record<string, unknown>).jobId);

      const normalized = normalizeManifestActionResult({
        operation: 'manifest.submit',
        manifestId,
        jobId: responseJobId,
        data: response
      });

      return withNormalizedShape({
        legacyKind: 'action',
        data: response,
        jobId: responseJobId,
        normalized
      });
    }

    case 'replicate_manifest': {
      const manifestId = requireString(args.manifestId || input.context.manifestId, 'manifestId is required to replicate a manifest.');
      const overrides = typeof args.overrides === 'object' && args.overrides && !Array.isArray(args.overrides)
        ? (args.overrides as Record<string, unknown>)
        : {};
      const count = toOptionalNumber(args.count) || 1;
      const response = await replicateManifest(
        manifestId,
        {
          count,
          overrides,
          sessionContextId: toNullableString(args.sessionContextId) || input.context.sessionContextId,
          requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy
        },
        input.context.correlationId
      );

      return {
        kind: 'action',
        data: response,
        jobId: null
      };
    }

    case 'print_manifest': {
      const resolvedReference = await resolveManifestReference({
        args,
        context: {
          ...input.context,
          lastManifestSelectionIds: input.context.lastManifestSelectionIds || []
        },
        headers: input.headers
      });
      const manifestId = requireString(resolvedReference.manifestId, 'manifestId is required to print a manifest.');
      const response = await enqueueManifestPrint(
        manifestId,
        {
          requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy
        },
        {
          ...input.headers,
          'idempotency-key': input.context.idempotencyKey || undefined
        },
        input.context.correlationId
      );
      const responseJobId = toNullableString((response as Record<string, unknown>).jobId);

      const normalized = normalizeManifestActionResult({
        operation: 'manifest.print',
        manifestId,
        jobId: responseJobId,
        data: response
      });

      return withNormalizedShape({
        legacyKind: 'action',
        data: response,
        jobId: responseJobId,
        normalized
      });
    }

    case 'cancel_manifest': {
      const resolvedReference = await resolveManifestReference({
        args,
        context: {
          ...input.context,
          lastManifestSelectionIds: input.context.lastManifestSelectionIds || []
        },
        headers: input.headers
      });
      const manifestId = requireString(resolvedReference.manifestId, 'manifestId is required to cancel a manifest.');
      const response = await enqueueManifestCancel(
        manifestId,
        {
          requestedBy: toNullableString(args.requestedBy) || input.context.requestedBy,
          reason: toNullableString(args.reason) || 'Cancelled by conversation flow.'
        },
        {
          ...input.headers,
          'idempotency-key': input.context.idempotencyKey || undefined
        },
        input.context.correlationId
      );
      const responseJobId = toNullableString((response as Record<string, unknown>).jobId);

      const normalized = normalizeManifestActionResult({
        operation: 'manifest.cancel',
        manifestId,
        jobId: responseJobId,
        data: response
      });

      return withNormalizedShape({
        legacyKind: 'action',
        data: response,
        jobId: responseJobId,
        normalized
      });
    }

    default:
      throw new AppError(400, 'Bad Request', `Tool ${toolName} is not supported by conversation dispatcher.`, {
        code: 'CONVERSATION_TOOL_UNSUPPORTED',
        context: {
          toolName
        }
      });
  }
}
