/**
 * Service do domínio VPO — Vale-Pedágio Obrigatório (PR-D1, DL-103).
 *
 * Fronteira `route → service → repository → job → worker → gateway` (backend/AGENTS.md §2): a
 * metade HTTP-facing (`avaliarAplicabilidadeVpo`, `registrarAquisicaoVpoManual`, `solicitarAquisicaoVpo`,
 * `getVpoForOperationService`, `listVpoProvidersService`) é chamada pelas rotas; a metade
 * worker-facing (`runVpoAcquireJob`, `runVpoReconcileJob`) é chamada por
 * `workers/operation-handlers.ts` (handlers SEM parâmetro `gateway`, molde `runCiotRegisterJob` do
 * PR-C2) — mesmo arquivo, mesma fronteira de camadas.
 *
 * ── `vpo_allocations` é MUTÁVEL, uma linha por operação ────────────────────────────────────────
 * Ao contrário do CIOT (nova `ciot_operations` a cada `solicitar`), a especificação do PR-D1 pede
 * "cria/atualiza" — `avaliarAplicabilidade` faz upsert na ÚNICA linha da operação
 * (`vpo-repo.ts#upsertVpoApplicability`, `unique (operation_id)`). O histórico completo vive em
 * `vpo_events` (APPEND-ONLY).
 *
 * ── VPO NUNCA gatilha transição de `transport_operations.status` ───────────────────────────────
 * Diferente do CIOT (`ciot_pending`/`ciot_registered` no grafo de `transport-state-machine.ts`), o
 * VPO não tem estado próprio na máquina — é avaliado pelo motor de compliance (`GATE_PRE_BOARDING`,
 * `TR-VPO-001/002/003`) a partir do estado ATUAL da alocação. Os endpoints deste arquivo, portanto,
 * NUNCA chamam `transitionStatus`/`assertGatePassesForTransition`.
 *
 * ── Padrão DL-102 aplicado à aquisição via provedor (decisão do PR-D1) ───────────────────────────
 * O marcador de correlação (`lib/transport/vpo-correlation.ts`) é DETERMINÍSTICO a partir do
 * `vpoAllocationId` — não precisa de coluna própria (ao contrário de `ciot_operations.correlation_marker`,
 * necessária porque o CIOT tem MÚLTIPLAS tentativas por operação). Cada handler de worker grava um
 * evento `acquisition_requested` ANTES de chamar o gateway; uma resposta perdida (timeout DEPOIS do
 * dispatch) nunca vira falha definitiva — vira `acquisition_unconfirmed`, resolvido só pelo
 * reconciliador (`services/vpo-reconciler.ts`) perguntando ao provedor via `queryVpoByMarker`.
 *
 * ── VPO_amount SEMPRE separado do frete ──────────────────────────────────────────────────────────
 * Toda atualização de `transport_operations.vpo_amount` neste arquivo passa por
 * `updateOperationById` (locking otimista por `version`) — NUNCA por `freight_offered_amount`/
 * `freight_contracted_amount`. Não existe caminho neste arquivo que some o valor do VPO ao frete.
 */

import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { withTransaction } from '../db/pool.js';
import { buildCommandAccepted } from '../lib/command-response.js';
import { calculateJobPriority, extractJobTags, getRetryConfig } from '../lib/retry.js';
import { insertJobDeduplicated } from '../repositories/job-repo.js';
import { insertAuditEntry } from '../repositories/audit-repo.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';
import {
  getOperationAggregateById,
  getOperationHeaderById,
  updateOperationById
} from '../repositories/transport-operation-repo.js';
import { determineVpoApplicability } from '../lib/transport/vpo-applicability-engine.js';
import { buildVpoCorrelationMarker } from '../lib/transport/vpo-correlation.js';
import {
  completeVpoAcquisitionSucceeded,
  completeVpoReconcileFound,
  findVpoAllocationByIdInternal,
  findVpoAllocationByOperationId,
  findVpoProviderById,
  insertVpoEvent,
  listVpoEventsForAllocation,
  listVpoProviders,
  markVpoAllocationAcquiredManual,
  markVpoAllocationAcquisitionFailedRevertToApplicable,
  markVpoAllocationAcquisitionRequested,
  markVpoAllocationAcquisitionUnconfirmed,
  markVpoReconcileNotFoundRevertToApplicable,
  upsertVpoApplicability,
  type ListVpoEventsFilters
} from '../repositories/vpo-repo.js';
import {
  createVpoProviderGateway,
  type VpoAcquirePayload,
  type VpoProviderGateway,
  type VpoProviderResult
} from '../gateways/vpo-gateway.js';
import { reconcileVpoAllocation, type VpoReconcilerDeps } from './vpo-reconciler.js';
import type { VpoAllocation, VpoAllocationStatus, VpoEvidenceSource, VpoProvider } from '../lib/transport/vpo-types.js';

type LooseRecord = Record<string, unknown>;
type HeaderMap = Record<string, string | undefined>;

const ACQUIRE_OPERATION = 'transporte.vpo.acquire';

// =============================================================================
// Helpers locais — deliberadamente não compartilhados com transport-ciot-service.ts (mesmo molde:
// cada service da vertical duplica o mínimo de validação de entrada).
// =============================================================================

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requireNonEmptyString(value: unknown, detail: string, code: string): string {
  const normalized = toTrimmedString(value);
  if (!normalized) throw new AppError(400, 'Bad Request', detail, { code });
  return normalized;
}

function requireIntegrationAccountId(source: LooseRecord): string {
  return requireNonEmptyString(
    source.integrationAccountId,
    'integrationAccountId é obrigatório.',
    'TRANSPORT_OPERATION_FIELD_REQUIRED'
  );
}

function requirePositiveAmount(value: unknown, code: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, 'Bad Request', 'amount é obrigatório e deve ser > 0.', { code });
  }
  return amount;
}

function ensureCorrelationId(correlationId: string | null): string {
  return correlationId || createPrefixedId('corr');
}

function operationNotFound(operationId: string): AppError {
  return new AppError(404, 'Not Found', `Operação de transporte ${operationId} não encontrada.`, {
    code: 'TRANSPORT_OPERATION_NOT_FOUND'
  });
}

async function requireActiveVpoProvider(providerId: unknown): Promise<VpoProvider> {
  const normalized = requireNonEmptyString(providerId, 'providerId é obrigatório.', 'TRANSPORTE_VPO_FIELD_REQUIRED');
  const provider = await findVpoProviderById(normalized);
  if (!provider) {
    throw new AppError(404, 'Not Found', `Fornecedora de VPO ${normalized} não encontrada.`, {
      code: 'TRANSPORTE_VPO_PROVIDER_NOT_FOUND'
    });
  }
  if (!provider.isActive) {
    throw new AppError(
      400,
      'Bad Request',
      `Fornecedora de VPO "${provider.name}" está inativa — escolha uma fornecedora habilitada.`,
      { code: 'TRANSPORTE_VPO_PROVIDER_INACTIVE', context: { providerId: provider.id } }
    );
  }
  return provider;
}

/** `version` ATUAL de `transport_operations` — usado pelo WORKER (sem `body.version` do request) para o CAS de `vpo_amount`. Tolerante: se a operação sumiu, não lança (o allocation já foi persistido; o operador reconcilia o valor manualmente). */
async function applyVpoAmountToOperation(operationId: string, integrationAccountId: string, amount: number): Promise<void> {
  const current = await getOperationHeaderById(operationId, integrationAccountId);
  if (!current) return;
  try {
    await updateOperationById(operationId, integrationAccountId, current.version, { vpoAmount: amount });
  } catch (error: unknown) {
    // Corrida com outro PATCH concorrente — aceitável (mesmo racional de `calculateAndPersistFloorForOperation`):
    // o valor fica registrado em `vpo_allocations.amount`, e uma reavaliação futura reconcilia a operação.
    console.warn(`[transport-vpo-service] falha ao aplicar vpoAmount na operação ${operationId} (corrida de version): ${error instanceof Error ? error.message : String(error)}`);
  }
}

// =============================================================================
// DTOs (contrato)
// =============================================================================

export type VpoAllocationResource = {
  id: string;
  operationId: string;
  status: VpoAllocationStatus;
  applicable: boolean | null;
  applicabilityReasonCode: string | null;
  providerId: string | null;
  providerReference: string | null;
  amount: number | null;
  acquiredAt: string | null;
  evidenceSource: VpoEvidenceSource | null;
  mdfeReference: string | null;
  createdAt: string;
  updatedAt: string;
};

function toVpoAllocationResource(record: VpoAllocation): VpoAllocationResource {
  return {
    id: record.id,
    operationId: record.operationId,
    status: record.status,
    applicable: record.applicable,
    applicabilityReasonCode: record.applicabilityReasonCode,
    providerId: record.providerId,
    providerReference: record.providerReference,
    amount: record.amount,
    acquiredAt: record.acquiredAt,
    evidenceSource: record.evidenceSource,
    mdfeReference: record.mdfeReference,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export type VpoEventResource = {
  id: string;
  eventType: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type VpoProviderResource = {
  id: string;
  name: string;
  isActive: boolean;
  habilitationSource: string | null;
  habilitationCheckedAt: string | null;
  notes: string;
};

function toVpoProviderResource(record: VpoProvider): VpoProviderResource {
  return {
    id: record.id,
    name: record.name,
    isActive: record.isActive,
    habilitationSource: record.habilitationSource,
    habilitationCheckedAt: record.habilitationCheckedAt,
    notes: record.notes
  };
}

// =============================================================================
// POST /v1/transporte/operacoes/{operationId}/vpo/avaliar-aplicabilidade — SÍNCRONO, 200.
// =============================================================================

export type VpoCommandContext = { correlationId: string; evaluatedBy: string | null };

/** `applicable: boolean|null` (engine) → `status` de `vpo_allocations` (mesmo universo de `avaliarAplicabilidade`). */
function applicabilityToAllocationStatus(applicable: boolean | null): 'pending' | 'applicable' | 'not_applicable' {
  if (applicable === true) return 'applicable';
  if (applicable === false) return 'not_applicable';
  return 'pending';
}

export async function avaliarAplicabilidadeVpo(
  operationId: string,
  body: LooseRecord,
  ctx: VpoCommandContext
): Promise<VpoAllocationResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const aggregate = await getOperationAggregateById(operationId, integrationAccountId);
  if (!aggregate) throw operationNotFound(operationId);

  const result = determineVpoApplicability({ operation: aggregate });
  const status = applicabilityToAllocationStatus(result.applicable);
  const routeSnapshot = aggregate.route
    ? {
        originUf: aggregate.route.originUf,
        destinationUf: aggregate.route.destinationUf,
        distanceKm: aggregate.route.distanceKm,
        tollExpected: aggregate.route.tollExpected
      }
    : {};

  const existing = await findVpoAllocationByOperationId(operationId, integrationAccountId);
  const allocationId = existing?.id ?? createPrefixedId('vpoalloc');

  const { allocation, applied } = await upsertVpoApplicability({
    id: allocationId,
    integrationAccountId,
    operationId,
    status,
    applicable: result.applicable,
    applicabilityReasonCode: result.reasonCode,
    routeSnapshot,
    correlationId: ctx.correlationId
  });

  await insertVpoEvent({
    id: createPrefixedId('vpoev'),
    vpoAllocationId: allocation.id,
    eventType: 'applicability_evaluated',
    detail: {
      applicable: result.applicable,
      reasonCode: result.reasonCode,
      humanMessage: result.humanMessage,
      legalBasis: result.legalBasis,
      inputs: result.inputs,
      applied
    },
    correlationId: ctx.correlationId
  });

  return toVpoAllocationResource(allocation);
}

// =============================================================================
// POST /v1/transporte/operacoes/{operationId}/vpo/registrar-aquisicao — SÍNCRONO, 200 (MANUAL).
// =============================================================================

export async function registrarAquisicaoVpoManual(
  operationId: string,
  body: LooseRecord,
  ctx: VpoCommandContext
): Promise<VpoAllocationResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const expectedVersion = Number(body.version);
  if (!Number.isFinite(expectedVersion) || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new AppError(400, 'Bad Request', 'version é obrigatório e deve ser um inteiro >= 1.', {
      code: 'TRANSPORT_OPERATION_FIELD_REQUIRED'
    });
  }

  const transportOperation = await getOperationHeaderById(operationId, integrationAccountId);
  if (!transportOperation) throw operationNotFound(operationId);

  const allocation = await findVpoAllocationByOperationId(operationId, integrationAccountId);
  if (!allocation || allocation.status !== 'applicable') {
    throw new AppError(
      409,
      'Conflict',
      `VPO da operação ${operationId} não está em estado "applicable" para registrar aquisição `
        + `(atual: "${allocation?.status ?? 'nenhuma avaliação'}"). Rode avaliar-aplicabilidade primeiro.`,
      { code: 'TRANSPORTE_VPO_NOT_APPLICABLE', context: { status: allocation?.status ?? null } }
    );
  }

  const provider = await requireActiveVpoProvider(body.providerId);
  const amount = requirePositiveAmount(body.amount, 'TRANSPORTE_VPO_AMOUNT_INVALID');
  const providerReference = toTrimmedString(body.providerReference);
  const evidence = body.evidence && typeof body.evidence === 'object' && !Array.isArray(body.evidence)
    ? (body.evidence as Record<string, unknown>)
    : {};
  if (Object.keys(evidence).length === 0) {
    throw new AppError(400, 'Bad Request', 'evidence é obrigatória para registrar aquisição manual do VPO.', {
      code: 'TRANSPORTE_VPO_EVIDENCE_REQUIRED'
    });
  }

  // NUMA transação: a alocação vira `acquired` E `transport_operations.vpo_amount` é atualizado
  // (CAS por `version`) juntos — nunca um sem o outro (evita a alocação ficar `acquired` com a
  // operação ainda sem o valor refletido, ou o inverso, se o CAS falhar por corrida de version).
  const updated = await withTransaction(async (client) => {
    const allocationUpdate = await markVpoAllocationAcquiredManual(allocation.id, {
      providerId: provider.id,
      providerReference,
      amount,
      evidence
    }, client);
    if (!allocationUpdate) {
      throw new AppError(409, 'Conflict', `VPO da operação ${operationId} mudou de estado durante o registro — tente novamente.`, {
        code: 'TRANSPORTE_VPO_NOT_APPLICABLE'
      });
    }

    await insertVpoEvent({
      id: createPrefixedId('vpoev'),
      vpoAllocationId: allocationUpdate.id,
      eventType: 'acquired',
      detail: { providerId: provider.id, providerName: provider.name, providerReference, amount, evidenceSource: 'manual' },
      correlationId: ctx.correlationId
    }, client);

    // VALOR SEMPRE SEPARADO DO FRETE: só `vpo_amount`, nunca `freight_offered_amount`/`freight_contracted_amount`.
    await updateOperationById(operationId, integrationAccountId, expectedVersion, { vpoAmount: amount }, client);

    return allocationUpdate;
  });

  return toVpoAllocationResource(updated);
}

// =============================================================================
// POST /v1/transporte/operacoes/{operationId}/vpo/adquirir — 202, ciclo assíncrono (DL-102).
// =============================================================================

export async function solicitarAquisicaoVpo(
  operationId: string,
  body: LooseRecord,
  headers: HeaderMap,
  ctx: VpoCommandContext
): Promise<LooseRecord> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `${ACQUIRE_OPERATION}:${operationId}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused;

  const transportOperation = await getOperationHeaderById(operationId, integrationAccountId);
  if (!transportOperation) throw operationNotFound(operationId);

  const allocation = await findVpoAllocationByOperationId(operationId, integrationAccountId);
  if (!allocation || allocation.status !== 'applicable') {
    throw new AppError(
      409,
      'Conflict',
      `VPO da operação ${operationId} não está em estado "applicable" para adquirir `
        + `(atual: "${allocation?.status ?? 'nenhuma avaliação'}"). Rode avaliar-aplicabilidade primeiro.`,
      { code: 'TRANSPORTE_VPO_NOT_APPLICABLE', context: { status: allocation?.status ?? null } }
    );
  }

  const provider = await requireActiveVpoProvider(body.providerId);

  const retryConfig = getRetryConfig(ACQUIRE_OPERATION);
  const priority = calculateJobPriority(ACQUIRE_OPERATION);
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');

  const enqueued = await insertJobDeduplicated({
    jobId,
    commandId,
    entityType: 'vpo_allocation',
    entityId: operationId,
    operation: ACQUIRE_OPERATION,
    payload: {
      vpoAllocationId: allocation.id,
      operationId,
      integrationAccountId,
      providerId: provider.id
    },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: ctx.correlationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation: ACQUIRE_OPERATION, entityType: 'vpo_allocation', status: 'queued' })
  });

  if (!enqueued?.job) {
    throw new AppError(500, 'Internal Server Error', `Falha ao enfileirar aquisição de VPO da operação ${operationId}.`, {
      code: 'TRANSPORTE_VPO_ENQUEUE_FAILED'
    });
  }

  const response = buildCommandAccepted({
    commandId: enqueued.job.commandId || commandId,
    jobId: enqueued.job.jobId,
    correlationId: ctx.correlationId,
    entityType: 'vpo_allocation',
    entityId: operationId,
    operation: ACQUIRE_OPERATION,
    entityLink: `/v1/transporte/operacoes/${operationId}/vpo`
  });

  await rememberIdempotentResponse({
    operation: idempotencyScope,
    idempotencyKey,
    entityType: 'vpo_allocation',
    entityId: operationId,
    response: response as unknown as Record<string, unknown>
  });

  return response;
}

// =============================================================================
// GET /v1/transporte/operacoes/{operationId}/vpo — 200: allocation atual + eventos paginados.
// =============================================================================

export async function getVpoForOperationService(
  operationId: string,
  query: LooseRecord
): Promise<{ allocation: VpoAllocationResource | null; events: { items: VpoEventResource[]; total: number; page: number; pageSize: number } }> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const transportOperation = await getOperationHeaderById(operationId, integrationAccountId);
  if (!transportOperation) throw operationNotFound(operationId);

  const allocation = await findVpoAllocationByOperationId(operationId, integrationAccountId);
  if (!allocation) {
    return { allocation: null, events: { items: [], total: 0, page: 1, pageSize: 20 } };
  }

  const filters: ListVpoEventsFilters = {
    page: query.page !== undefined ? Number(query.page) : undefined,
    pageSize: query.pageSize !== undefined ? Number(query.pageSize) : undefined
  };
  const { items, total, page, pageSize } = await listVpoEventsForAllocation(allocation.id, filters);

  return {
    allocation: toVpoAllocationResource(allocation),
    events: {
      items: items.map((event) => ({ id: event.id, eventType: event.eventType, detail: event.detail, createdAt: event.createdAt })),
      total,
      page,
      pageSize
    }
  };
}

// =============================================================================
// GET /v1/transporte/vpo/fornecedoras — 200, read-only.
// =============================================================================

export async function listVpoProvidersService(): Promise<{ items: VpoProviderResource[] }> {
  const providers = await listVpoProviders();
  return { items: providers.map(toVpoProviderResource) };
}

// =============================================================================
// Worker — jobs `transporte.vpo.acquire|reconcile`. SEM parâmetro `gateway` (molde
// `runCiotRegisterJob`): dependências por import direto (`createVpoProviderGateway`).
// =============================================================================

export type VpoJobEntity = {
  jobId: string;
  entityId: string;
  correlationId: string | null;
  payload: LooseRecord;
};

export type VpoJobResult = { outcome: string; patch: LooseRecord };

function requireJobField(payload: LooseRecord, field: string): string {
  return requireNonEmptyString(payload[field], `Job sem ${field}.`, 'TRANSPORTE_VPO_JOB_FIELD_REQUIRED');
}

async function logVpoExchange(correlationId: string, operationId: string, action: string, request: LooseRecord, response: LooseRecord, httpStatus = 200): Promise<void> {
  await insertAuditEntry({
    correlationId,
    entityType: 'vpo_allocation',
    entityId: operationId,
    direction: 'outbound',
    component: 'vpo-gateway',
    httpMethod: 'POST',
    endpoint: `vpo-provider:${action}`,
    httpStatus: null,
    latencyMs: null,
    sanitizedBody: request
  });
  await insertAuditEntry({
    correlationId,
    entityType: 'vpo_allocation',
    entityId: operationId,
    direction: 'inbound',
    component: 'vpo-gateway',
    httpMethod: 'POST',
    endpoint: `vpo-provider:${action}`,
    httpStatus,
    latencyMs: null,
    sanitizedBody: response
  });
}

async function alreadyTerminalError(vpoAllocationId: string, action: string): Promise<never> {
  throw new AppError(
    409,
    'Conflict',
    `Alocação de VPO ${vpoAllocationId} já não está no estado esperado para "${action}" — resultado provavelmente já aplicado.`,
    { code: 'TRANSPORTE_VPO_ALREADY_TERMINAL' }
  );
}

function buildAcquirePayload(allocation: VpoAllocation, providerId: string, testFlags?: VpoAcquirePayload['testFlags']): VpoAcquirePayload {
  const snapshot = allocation.routeSnapshot;
  const route = snapshot && typeof snapshot.originUf === 'string'
    ? {
        originUf: String(snapshot.originUf),
        destinationUf: String(snapshot.destinationUf ?? ''),
        distanceKm: (snapshot.distanceKm as number | null | undefined) ?? null
      }
    : null;

  return {
    correlationMarker: buildVpoCorrelationMarker(allocation.id),
    operationId: allocation.operationId,
    providerId,
    route,
    ...(testFlags ? { testFlags } : {})
  };
}

/**
 * `transporte.vpo.acquire` — grava `acquisition_requested` ANTES da chamada (DL-102), chama o
 * provedor, e no sucesso completa a aquisição + atualiza `vpo_amount` na operação (CAS por version
 * ATUAL, não a do request — o worker não tem `body.version`). Rejeição/resposta perdida NÃO são
 * tratadas aqui: propagam como erro e são interpretadas pelo side-effect terminal
 * (`applyTransporteVpoTerminalFailureSideEffect`, chamado pelos DOIS pontos de `job-runner.ts`).
 */
export async function runVpoAcquireJob(job: VpoJobEntity, deps: { gateway?: VpoProviderGateway } = {}): Promise<VpoJobResult> {
  const vpoAllocationId = requireJobField(job.payload, 'vpoAllocationId');
  const operationId = requireJobField(job.payload, 'operationId');
  const integrationAccountId = requireJobField(job.payload, 'integrationAccountId');
  const providerId = requireJobField(job.payload, 'providerId');
  const correlationId = ensureCorrelationId(job.correlationId);

  const allocation = await findVpoAllocationByIdInternal(vpoAllocationId);
  if (!allocation) {
    throw new AppError(404, 'Not Found', `Alocação de VPO ${vpoAllocationId} não encontrada.`, { code: 'TRANSPORTE_VPO_NOT_FOUND' });
  }

  await markVpoAllocationAcquisitionRequested(vpoAllocationId, { jobId: job.jobId, providerId });
  const correlationMarker = buildVpoCorrelationMarker(vpoAllocationId);
  await insertVpoEvent({
    id: createPrefixedId('vpoev'),
    vpoAllocationId,
    eventType: 'acquisition_requested',
    detail: { providerId, correlationMarker },
    correlationId
  });

  const gateway = deps.gateway ?? createVpoProviderGateway();
  const requestPayload = buildAcquirePayload(allocation, providerId, job.payload.testFlags as VpoAcquirePayload['testFlags']);
  const result: VpoProviderResult = await gateway.acquireVpo(requestPayload);
  await logVpoExchange(correlationId, operationId, 'acquireVpo', requestPayload as unknown as LooseRecord, result as unknown as LooseRecord);

  const evidenceSource: VpoEvidenceSource = gateway.mode === 'real' ? 'provider' : 'mock';
  const completed = await completeVpoAcquisitionSucceeded(vpoAllocationId, {
    providerReference: result.providerReference,
    amount: result.amount,
    evidenceSource,
    raw: result.raw
  });
  if (!completed) return alreadyTerminalError(vpoAllocationId, 'acquire');

  await insertVpoEvent({
    id: createPrefixedId('vpoev'),
    vpoAllocationId,
    eventType: 'acquired',
    detail: { providerReference: result.providerReference, amount: result.amount, evidenceSource },
    correlationId
  });

  await applyVpoAmountToOperation(operationId, integrationAccountId, result.amount);

  return {
    outcome: 'transporte_vpo_acquire_succeeded',
    patch: { vpoAllocationId, providerReference: result.providerReference, amount: result.amount }
  };
}

/** Mapa "o provedor confirmou X" → nada além de `acquired` no VPO (sem retificar/cancelar nesta fase, ao contrário do CIOT). */
export async function runVpoReconcileJob(
  job: VpoJobEntity,
  deps: Partial<VpoReconcilerDeps> & { gateway?: VpoProviderGateway } = {}
): Promise<VpoJobResult> {
  const vpoAllocationId = requireJobField(job.payload, 'vpoAllocationId');
  const operationId = requireJobField(job.payload, 'operationId');
  const integrationAccountId = requireJobField(job.payload, 'integrationAccountId');
  const correlationId = ensureCorrelationId(job.correlationId);

  const allocation = await findVpoAllocationByIdInternal(vpoAllocationId);
  if (!allocation || allocation.status !== 'acquisition_unconfirmed') {
    // Já resolvido por um caminho concorrente (sweep + reconcile explícito) — NO-OP.
    return { outcome: 'transporte_vpo_reconcile_noop', patch: { vpoAllocationId } };
  }

  const gateway = deps.gateway ?? createVpoProviderGateway();
  const correlationMarker = buildVpoCorrelationMarker(vpoAllocationId);
  const result = await reconcileVpoAllocation(
    { queryVpoByMarker: deps.queryVpoByMarker ?? gateway.queryVpoByMarker, sleep: deps.sleep, delaysMs: deps.delaysMs },
    { vpoAllocationId, correlationMarker }
  );

  if (result.outcome === 'error') {
    // Propaga — INCONCLUSIVO nunca é "não aconteceu". A fila reencaminha (retry/backoff normais).
    throw result.error;
  }

  if (result.outcome === 'not-found-after-polling') {
    if (allocation.providerReference != null) {
      // Defensivo: já tínhamos uma referência local (aquisição conhecida) — não há como "não
      // encontrar" algo que já foi confirmado antes. Mantém unconfirmed para a próxima varredura em
      // vez de destruir um registro que sabemos que existiu.
      throw new AppError(502, 'Bad Gateway', `Reconciliação inconsistente do VPO ${vpoAllocationId}: marcador não encontrado apesar de providerReference local já confirmado.`, {
        code: 'TRANSPORTE_VPO_RECONCILE_INCONSISTENT'
      });
    }

    const reverted = await markVpoReconcileNotFoundRevertToApplicable(vpoAllocationId);
    if (!reverted) return { outcome: 'transporte_vpo_reconcile_noop', patch: { vpoAllocationId } };

    await insertVpoEvent({
      id: createPrefixedId('vpoev'),
      vpoAllocationId,
      eventType: 'reconciled',
      detail: { result: 'not_found', attempts: result.attempts },
      correlationId
    });

    return { outcome: 'transporte_vpo_reconcile_not_found', patch: { vpoAllocationId, status: 'applicable' } };
  }

  const evidenceSource: VpoEvidenceSource = gateway.mode === 'real' ? 'provider' : 'mock';
  const completed = await completeVpoReconcileFound(vpoAllocationId, {
    providerReference: result.match.providerReference,
    amount: result.match.amount,
    evidenceSource,
    raw: result.match.raw
  });
  if (!completed) return { outcome: 'transporte_vpo_reconcile_noop', patch: { vpoAllocationId } };

  await insertVpoEvent({
    id: createPrefixedId('vpoev'),
    vpoAllocationId,
    eventType: 'reconciled',
    detail: { result: 'found', providerReference: result.match.providerReference, amount: result.match.amount, attempts: result.attempts },
    correlationId
  });

  await applyVpoAmountToOperation(operationId, integrationAccountId, result.match.amount);

  return { outcome: 'transporte_vpo_reconcile_found', patch: { vpoAllocationId, providerReference: result.match.providerReference } };
}

// =============================================================================
// Terminal failure — DL-102: resposta perdida DEPOIS do dispatch NUNCA vira falha definitiva.
// Chamado pelos DOIS pontos de `job-runner.ts` (`handleDlqTransition`/`handleFailedTransition`),
// molde `applyTransporteCiotTerminalFailureSideEffect`.
// =============================================================================

/** Código de erro que só o provedor mock pode produzir de propósito — decisão DEFINITIVA, nunca "não sei". */
const VPO_PROVIDER_DEFINITIVE_REJECTION_CODE = 'VPO_PROVIDER_REJECTED_TEST';

export type VpoTerminalFailureJob = {
  jobId: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload: LooseRecord;
  correlationId?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
};

export type VpoTerminalFailure = {
  action?: string;
  dlqReason?: string;
  patch?: { lastErrorCode?: string | null; lastErrorMessage?: string | null };
};

export async function applyTransporteVpoTerminalFailureSideEffect(
  job: VpoTerminalFailureJob,
  terminalFailure: VpoTerminalFailure = {},
  error: unknown = null
): Promise<unknown> {
  if (job.operation !== ACQUIRE_OPERATION) return null;

  const terminalAction = String(terminalFailure.action || '').toLowerCase();
  if (!['failed', 'dlq', 'cancelled'].includes(terminalAction)) return null;

  const vpoAllocationId = toTrimmedString(job.payload?.vpoAllocationId);
  const operationId = toTrimmedString(job.payload?.operationId);
  const integrationAccountId = toTrimmedString(job.payload?.integrationAccountId);
  if (!vpoAllocationId) return null; // falhou antes de o payload carregar o id — nada a reconciliar

  const lastErrorCode = terminalFailure.patch?.lastErrorCode || job.lastErrorCode || null;
  const errorCode = (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string')
    ? (error as { code: string }).code
    : lastErrorCode;

  // Rejeição DEFINITIVA do provedor — decisão conhecida, não "resposta perdida".
  if (errorCode === VPO_PROVIDER_DEFINITIVE_REJECTION_CODE) {
    const reverted = await markVpoAllocationAcquisitionFailedRevertToApplicable(vpoAllocationId, {
      lastErrorCode: VPO_PROVIDER_DEFINITIVE_REJECTION_CODE,
      lastErrorDetail: { message: terminalFailure.patch?.lastErrorMessage || job.lastErrorMessage || null }
    });
    if (!reverted) return null;

    return insertVpoEvent({
      id: createPrefixedId('vpoev'),
      vpoAllocationId,
      eventType: 'acquisition_failed',
      detail: { reasonCode: VPO_PROVIDER_DEFINITIVE_REJECTION_CODE },
      correlationId: job.correlationId || createPrefixedId('corr')
    });
  }

  // Qualquer outro terminal (timeout/rede/DLQ por tentativas esgotadas) DEPOIS do dispatch — DL-102:
  // "não perguntei" nunca é "falhou". Marca unconfirmed e tenta enfileirar o reconciliador — se isso
  // falhar, a varredura periódica (`enqueueTransporteVpoReconcileSweepIfNeeded`) pega na próxima janela.
  const unconfirmed = await markVpoAllocationAcquisitionUnconfirmed(vpoAllocationId, {
    lastErrorCode: errorCode,
    lastErrorDetail: { message: terminalFailure.patch?.lastErrorMessage || job.lastErrorMessage || null }
  });
  if (!unconfirmed) return null; // já não estava em trânsito — nada a fazer

  await insertVpoEvent({
    id: createPrefixedId('vpoev'),
    vpoAllocationId,
    eventType: 'acquisition_unconfirmed',
    detail: { lastErrorCode: errorCode, operation: job.operation },
    correlationId: job.correlationId || createPrefixedId('corr')
  });

  if (operationId && integrationAccountId) {
    try {
      const retryConfig = getRetryConfig('transporte.vpo.reconcile');
      await insertJobDeduplicated({
        jobId: createPrefixedId('job'),
        commandId: createPrefixedId('cmd'),
        entityType: 'vpo_allocation',
        entityId: operationId,
        operation: 'transporte.vpo.reconcile',
        payload: { vpoAllocationId, operationId, integrationAccountId },
        status: 'queued',
        maxAttempts: retryConfig.maxAttempts,
        correlationId: job.correlationId || createPrefixedId('corr'),
        priority: calculateJobPriority('transporte.vpo.reconcile'),
        retryStrategy: retryConfig.strategy,
        baseDelayMs: retryConfig.baseDelayMs,
        maxDelayMs: retryConfig.maxDelayMs,
        tags: extractJobTags({ operation: 'transporte.vpo.reconcile', entityType: 'vpo_allocation', status: 'queued' })
      });
    } catch (enqueueError: unknown) {
      // Best-effort — a varredura periódica é a rede de segurança para este enfileiramento.
      console.warn(`[transport-vpo-service] falha ao enfileirar reconciliação do VPO ${vpoAllocationId}: ${enqueueError instanceof Error ? enqueueError.message : String(enqueueError)}`);
    }
  }

  return unconfirmed;
}
