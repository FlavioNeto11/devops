/**
 * Service do ciclo do CIOT (PR-C2, DL-103) — pré-validação síncrona + ciclo assíncrono completo
 * (solicitar → registrar, retificar, cancelar, encerrar) com PROVEDOR ABSTRAÍDO
 * (`gateways/ciot-provider-gateway.ts`, hoje só `mode: 'mock'` — [EXTERNAL DEPENDENCY] P5).
 *
 * Fronteira `route → service → repository → job → worker → gateway` (backend/AGENTS.md §2): a
 * metade HTTP-facing (`preValidateCiot`, `requestCiot`, `rectifyCiot`, `cancelCiot`, `closeCiot`,
 * `getCiotForOperationService`) é chamada pelas rotas; a metade worker-facing (`runCiot*Job`) é
 * chamada por `workers/operation-handlers.ts` (handlers SEM parâmetro `gateway`, molde
 * `runRntrcVerificationJob` do PR-C1) — mesmo arquivo, mesma fronteira de camadas.
 *
 * ── Padrão DL-102 aplicado ao CIOT (replicado, NÃO reaproveitado do MTR — bounded context próprio) ──
 * O número do CIOT nasce na RESPOSTA do provedor. Por isso: (1) o marcador de correlação
 * (`lib/transport/ciot-correlation.ts`) é gravado na CRIAÇÃO da linha `ciot_operations`, ANTES de
 * qualquer chamada ao provedor; (2) cada handler de worker grava um evento `*_dispatched`/
 * `*_requested` ANTES de chamar o gateway; (3) uma resposta perdida (timeout DEPOIS do dispatch)
 * nunca vira `failed` — vira `request_unconfirmed`, resolvido só pelo reconciliador
 * (`services/ciot-reconciler.ts`) perguntando ao provedor via `queryCiotByMarker`.
 *
 * ── Rejeição do provedor NÃO é falha nossa ──────────────────────────────────────────────────────
 * Quando o provedor recusa a solicitação (ex.: frete abaixo do mínimo aceito), a `ciot_operations`
 * atual vira `rejected` — a `transport_operations` PERMANECE `ciot_pending` (rejeição de UMA
 * tentativa não é cancelamento da operação) e um novo `POST .../ciot/solicitar` cria uma
 * `ciot_operations` NOVA (histórico preservado, nunca reescrito).
 */

import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { buildCommandAccepted } from '../lib/command-response.js';
import { calculateJobPriority, extractJobTags, getRetryConfig } from '../lib/retry.js';
import { insertJobDeduplicated } from '../repositories/job-repo.js';
import { insertAuditEntry } from '../repositories/audit-repo.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';
import {
  getOperationAggregateById,
  getOperationHeaderById,
  transitionStatus
} from '../repositories/transport-operation-repo.js';
import { assertTransition } from '../lib/transport/transport-state-machine.js';
import type { TransportOperationAggregate, TransportOperationParty } from '../lib/transport/transport-operation-types.js';
import {
  assertGatePassesForTransition,
  evaluateGateService,
  toComplianceEvaluationResource,
  type ComplianceEvaluationResource
} from './transport-compliance-service.js';
import {
  completeCiotMutationSucceeded,
  completeCiotReconcileFound,
  completeCiotRegistrationSucceeded,
  findCiotOperationByIdInternal,
  findLatestCiotOperationForOperation,
  insertCiotEvent,
  insertCiotOperation,
  listCiotEventsForOperation,
  markCiotOperationRejected,
  markCiotOperationReconcileNotFoundRejected,
  markCiotOperationRequested,
  markCiotOperationRequestUnconfirmed,
  type CiotEventInsertInput,
  type ListCiotEventsFilters
} from '../repositories/ciot-repo.js';
import { buildCiotCorrelationMarker } from '../lib/transport/ciot-correlation.js';
import {
  createCiotProviderGateway,
  type CiotMutationPayload,
  type CiotProviderGateway,
  type CiotProviderResult,
  type CiotRegisterPayload
} from '../gateways/ciot-provider-gateway.js';
import { reconcileCiotOperation, type CiotReconcilerDeps } from './ciot-reconciler.js';
import type { CiotOperation, CiotOperationStatus } from '../lib/transport/ciot-types.js';

type LooseRecord = Record<string, unknown>;
type HeaderMap = Record<string, string | undefined>;

const REGISTER_OPERATION = 'transporte.ciot.register';
const RECTIFY_OPERATION = 'transporte.ciot.rectify';
const CANCEL_OPERATION = 'transporte.ciot.cancel';
const CLOSE_OPERATION = 'transporte.ciot.close';

// =============================================================================
// Helpers locais — deliberadamente não compartilhados com transport-operation-service.ts (mesmo
// molde de transport-compliance-service.ts: cada service duplica o mínimo de validação de entrada).
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

function ensureCorrelationId(correlationId: string | null): string {
  return correlationId || createPrefixedId('corr');
}

function operationNotFound(operationId: string): AppError {
  return new AppError(404, 'Not Found', `Operação de transporte ${operationId} não encontrada.`, {
    code: 'TRANSPORT_OPERATION_NOT_FOUND'
  });
}

function findPartyByRole(parties: TransportOperationParty[], role: string): TransportOperationParty | null {
  return parties.find((party) => party.role === role) ?? null;
}

// =============================================================================
// Snapshot minimizado do request (LGPD: só o que o provedor precisa — nunca o payload cru).
// =============================================================================

const DEFAULT_RESPONSIBLE_PARTY_ROLE = 'contractor';
/** Papéis que fazem sentido como responsável pela declaração do CIOT (enquadramento — TR-CIOT-003). */
const RESPONSIBLE_PARTY_CANDIDATE_ROLES = ['contractor', 'subcontractor'] as const;

function resolveResponsibleParty(aggregate: TransportOperationAggregate, requested: unknown): string {
  const normalized = toTrimmedString(requested) ?? DEFAULT_RESPONSIBLE_PARTY_ROLE;
  if (!(RESPONSIBLE_PARTY_CANDIDATE_ROLES as readonly string[]).includes(normalized)) {
    throw new AppError(
      400,
      'Bad Request',
      `responsibleParty inválido: esperado um de ${RESPONSIBLE_PARTY_CANDIDATE_ROLES.join(', ')} (recebido "${normalized}").`,
      { code: 'TRANSPORTE_CIOT_RESPONSIBLE_PARTY_INVALID' }
    );
  }
  if (!findPartyByRole(aggregate.parties, normalized)) {
    throw new AppError(
      400,
      'Bad Request',
      `responsibleParty "${normalized}" não corresponde a nenhuma parte vinculada à operação.`,
      { code: 'TRANSPORTE_CIOT_RESPONSIBLE_PARTY_NOT_LINKED', context: { responsibleParty: normalized } }
    );
  }
  return normalized;
}

function buildCiotRequestPayloadSnapshot(aggregate: TransportOperationAggregate, responsibleParty: string): LooseRecord {
  const { operation, parties, cargo, route } = aggregate;
  return {
    responsibleParty,
    parties: parties.map((party) => ({
      role: party.role,
      document: (party.partySnapshot.documentNumber as string | null | undefined) ?? null
    })),
    cargo: cargo.map((item) => ({ cargoType: item.cargoType, weightKg: item.weightKg })),
    route: route ? { originUf: route.originUf, destinationUf: route.destinationUf } : null,
    freight: {
      offeredAmount: operation.freightOfferedAmount,
      contractedAmount: operation.freightContractedAmount
    },
    payment: {
      method: operation.paymentMethod,
      termDays: operation.paymentTermDays
    }
  };
}

function toGatewayPartySnapshot(entry: LooseRecord): { role: string; document: string | null } {
  return {
    role: String(entry.role ?? ''),
    document: (entry.document as string | null | undefined) ?? null
  };
}

function buildRegisterPayload(ciotOperation: CiotOperation, testFlags?: CiotRegisterPayload['testFlags']): CiotRegisterPayload {
  const snapshot = ciotOperation.requestPayloadSnapshot;
  const parties = Array.isArray(snapshot.parties) ? (snapshot.parties as LooseRecord[]).map(toGatewayPartySnapshot) : [];
  const cargo = Array.isArray(snapshot.cargo)
    ? (snapshot.cargo as LooseRecord[]).map((item) => ({
        cargoType: String(item.cargoType ?? ''),
        weightKg: (item.weightKg as number | null | undefined) ?? null
      }))
    : [];
  const route = snapshot.route && typeof snapshot.route === 'object'
    ? {
        originUf: String((snapshot.route as LooseRecord).originUf ?? ''),
        destinationUf: String((snapshot.route as LooseRecord).destinationUf ?? '')
      }
    : null;
  const freight = (snapshot.freight as LooseRecord) ?? {};
  const payment = (snapshot.payment as LooseRecord) ?? {};

  return {
    correlationMarker: ciotOperation.correlationMarker,
    operationId: ciotOperation.operationId,
    parties,
    cargo,
    route,
    freight: {
      offeredAmount: (freight.offeredAmount as number | null | undefined) ?? null,
      contractedAmount: (freight.contractedAmount as number | null | undefined) ?? null
    },
    payment: {
      method: (payment.method as string | null | undefined) ?? null,
      termDays: (payment.termDays as number | null | undefined) ?? null
    },
    ...(testFlags ? { testFlags } : {})
  };
}

// =============================================================================
// DTOs (contrato)
// =============================================================================

export type CiotOperationResource = {
  id: string;
  operationId: string;
  provider: string;
  status: CiotOperationStatus;
  ciotNumber: string | null;
  externalStatus: string | null;
  rejectionReasonCode: string | null;
  requestedAt: string | null;
  registeredAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toCiotOperationResource(record: CiotOperation): CiotOperationResource {
  return {
    id: record.id,
    operationId: record.operationId,
    provider: record.provider,
    status: record.status,
    ciotNumber: record.ciotNumber,
    externalStatus: record.externalStatus,
    rejectionReasonCode: record.rejectionReasonCode,
    requestedAt: record.requestedAt,
    registeredAt: record.registeredAt,
    closedAt: record.closedAt,
    cancelledAt: record.cancelledAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export type CiotEventResource = {
  id: string;
  eventType: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

// =============================================================================
// POST /v1/transporte/operacoes/{operationId}/ciot/pre-validar — SÍNCRONO, 200, sem transição.
// =============================================================================

export type CiotCommandContext = { correlationId: string; evaluatedBy: string | null };

export async function preValidateCiot(
  operationId: string,
  body: LooseRecord,
  ctx: CiotCommandContext
): Promise<ComplianceEvaluationResource> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const aggregate = await getOperationAggregateById(operationId, integrationAccountId);
  if (!aggregate) throw operationNotFound(operationId);

  // Avalia GATE_CIOT (TR-CIOT-001/003/004 já cobrem "dados mínimos" + enquadramento declarado) —
  // nenhuma regra local ADICIONAL é necessária além do motor: o motor É a fonte de verdade sobre
  // completude de dados, e duplicar a checagem aqui divergiria da avaliação persistida.
  const evaluation = await evaluateGateService({
    operationId,
    integrationAccountId,
    gate: 'GATE_CIOT',
    triggeredBy: 'user',
    evaluatedBy: ctx.evaluatedBy,
    correlationId: ctx.correlationId
  });

  return toComplianceEvaluationResource(evaluation);
}

// =============================================================================
// POST /v1/transporte/operacoes/{operationId}/ciot/solicitar — 202, ciclo assíncrono.
// =============================================================================

/** Estados de `transport_operations` a partir dos quais `solicitar` é aceito. */
const REQUEST_CIOT_ALLOWED_OPERATION_STATUSES = new Set(['contracted', 'ciot_pending']);

export async function requestCiot(
  operationId: string,
  body: LooseRecord,
  headers: HeaderMap,
  ctx: CiotCommandContext
): Promise<LooseRecord> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `${REGISTER_OPERATION}:${operationId}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused;

  const current = await getOperationHeaderById(operationId, integrationAccountId);
  if (!current) throw operationNotFound(operationId);

  // `ciot_pending` é aceito ALÉM de `contracted`: uma tentativa REJEITADA pelo provedor deixa a
  // operação em `ciot_pending` (rejeição de UMA tentativa não cancela a operação) e um novo
  // `solicitar` precisa poder criar uma NOVA `ciot_operations` sem repetir a transição de estado
  // (que já aconteceu na primeira tentativa e não está declarada como idempotente no grafo).
  if (!REQUEST_CIOT_ALLOWED_OPERATION_STATUSES.has(current.status)) {
    throw new AppError(
      409,
      'Conflict',
      `Operação ${operationId} não está pronta para solicitar CIOT (status atual: "${current.status}"; `
        + 'esperado "contracted" ou "ciot_pending").',
      { code: 'TRANSPORTE_CIOT_OPERATION_NOT_READY', context: { status: current.status } }
    );
  }

  // GATE_CIOT com triggeredBy 'transition' — 409 TRANSPORT_GATE_BLOCKED se bloquear (mesmo caminho
  // de `contractTransportOperation`).
  const evaluation = await assertGatePassesForTransition(operationId, integrationAccountId, 'GATE_CIOT', {
    correlationId: ctx.correlationId,
    evaluatedBy: ctx.evaluatedBy
  });

  const aggregate = await getOperationAggregateById(operationId, integrationAccountId);
  if (!aggregate) throw operationNotFound(operationId);

  const responsibleParty = resolveResponsibleParty(aggregate, body.responsibleParty);
  const requestPayloadSnapshot = buildCiotRequestPayloadSnapshot(aggregate, responsibleParty);

  const ciotId = createPrefixedId('ciot');
  const correlationMarker = buildCiotCorrelationMarker(ciotId);

  const ciotOperation = await insertCiotOperation({
    id: ciotId,
    integrationAccountId,
    operationId,
    correlationMarker,
    requestPayloadSnapshot,
    correlationId: ctx.correlationId
  });

  await insertCiotEvent({
    id: createPrefixedId('ciotev'),
    ciotOperationId: ciotOperation.id,
    eventType: 'pre_validated',
    detail: { gate: 'GATE_CIOT', evaluationId: evaluation.evaluationId, overallStatus: evaluation.overallStatus },
    correlationId: ctx.correlationId
  });

  if (current.status === 'contracted') {
    const transition = assertTransition(current.status, 'request_ciot');
    await transitionStatus(operationId, integrationAccountId, transition.from, transition.to, current.version);
  }

  const retryConfig = getRetryConfig(REGISTER_OPERATION);
  const priority = calculateJobPriority(REGISTER_OPERATION);
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');

  const enqueued = await insertJobDeduplicated({
    jobId,
    commandId,
    entityType: 'ciot_operation',
    entityId: operationId,
    operation: REGISTER_OPERATION,
    payload: {
      ciotOperationId: ciotOperation.id,
      operationId,
      integrationAccountId,
      correlationMarker
    },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: ctx.correlationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation: REGISTER_OPERATION, entityType: 'ciot_operation', status: 'queued' })
  });

  if (!enqueued?.job) {
    throw new AppError(500, 'Internal Server Error', `Falha ao enfileirar solicitação de CIOT da operação ${operationId}.`, {
      code: 'TRANSPORTE_CIOT_ENQUEUE_FAILED'
    });
  }

  const response = buildCommandAccepted({
    commandId: enqueued.job.commandId || commandId,
    jobId: enqueued.job.jobId,
    correlationId: ctx.correlationId,
    entityType: 'ciot_operation',
    entityId: operationId,
    operation: REGISTER_OPERATION,
    entityLink: `/v1/transporte/operacoes/${operationId}/ciot`
  });

  await rememberIdempotentResponse({
    operation: idempotencyScope,
    idempotencyKey,
    entityType: 'ciot_operation',
    entityId: operationId,
    response: response as unknown as Record<string, unknown>
  });

  return response;
}

// =============================================================================
// POST .../ciot/retificar | .../cancelar | .../encerrar — 202, ciclo assíncrono.
// =============================================================================

type MutationCommand = 'rectify' | 'cancel' | 'close';

const MUTATION_OPERATION_BY_COMMAND: Record<MutationCommand, string> = {
  rectify: RECTIFY_OPERATION,
  cancel: CANCEL_OPERATION,
  close: CLOSE_OPERATION
};

/** Estados de `ciot_operations` a partir dos quais cada comando é aceito. */
const MUTATION_ALLOWED_STATUSES: Record<MutationCommand, readonly CiotOperationStatus[]> = {
  rectify: ['registered'],
  cancel: ['registered'],
  close: ['registered', 'rectified']
};

async function requestCiotMutation(
  command: MutationCommand,
  operationId: string,
  body: LooseRecord,
  headers: HeaderMap,
  ctx: CiotCommandContext
): Promise<LooseRecord> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const operation = MUTATION_OPERATION_BY_COMMAND[command];
  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `${operation}:${operationId}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused;

  const transportOperation = await getOperationHeaderById(operationId, integrationAccountId);
  if (!transportOperation) throw operationNotFound(operationId);

  const latest = await findLatestCiotOperationForOperation(operationId, integrationAccountId);
  const allowedStatuses = MUTATION_ALLOWED_STATUSES[command];
  if (!latest || !allowedStatuses.includes(latest.status)) {
    throw new AppError(
      409,
      'Conflict',
      `Operação ${operationId} não tem um CIOT em estado válido para "${command}" `
        + `(esperado ${allowedStatuses.join('/')}; atual: "${latest?.status ?? 'nenhum'}").`,
      { code: 'TRANSPORTE_CIOT_MUTATION_NOT_ALLOWED', context: { command, status: latest?.status ?? null } }
    );
  }

  const reason = command === 'cancel' ? toTrimmedString(body.reason) : null;

  const retryConfig = getRetryConfig(operation);
  const priority = calculateJobPriority(operation);
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');

  const enqueued = await insertJobDeduplicated({
    jobId,
    commandId,
    entityType: 'ciot_operation',
    entityId: operationId,
    operation,
    payload: {
      ciotOperationId: latest.id,
      operationId,
      integrationAccountId,
      correlationMarker: latest.correlationMarker,
      ...(reason ? { reason } : {})
    },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId: ctx.correlationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation, entityType: 'ciot_operation', status: 'queued' })
  });

  if (!enqueued?.job) {
    throw new AppError(500, 'Internal Server Error', `Falha ao enfileirar "${command}" do CIOT da operação ${operationId}.`, {
      code: 'TRANSPORTE_CIOT_ENQUEUE_FAILED'
    });
  }

  const response = buildCommandAccepted({
    commandId: enqueued.job.commandId || commandId,
    jobId: enqueued.job.jobId,
    correlationId: ctx.correlationId,
    entityType: 'ciot_operation',
    entityId: operationId,
    operation,
    entityLink: `/v1/transporte/operacoes/${operationId}/ciot`
  });

  await rememberIdempotentResponse({
    operation: idempotencyScope,
    idempotencyKey,
    entityType: 'ciot_operation',
    entityId: operationId,
    response: response as unknown as Record<string, unknown>
  });

  return response;
}

export const rectifyCiot = (operationId: string, body: LooseRecord, headers: HeaderMap, ctx: CiotCommandContext) =>
  requestCiotMutation('rectify', operationId, body, headers, ctx);

/**
 * Cancelamento do CIOT NÃO cancela a operação de transporte — são ciclos DISTINTOS. Cancelar o
 * CIOT é "esta identificação de operação de transporte perante a ANTT foi anulada"; cancelar a
 * `transport_operations` (`POST .../operacoes/{id}/cancelar`) é "esta operação de transporte não
 * vai mais acontecer". Os dois comandos não se chamam um ao outro.
 */
export const cancelCiot = (operationId: string, body: LooseRecord, headers: HeaderMap, ctx: CiotCommandContext) =>
  requestCiotMutation('cancel', operationId, body, headers, ctx);

export const closeCiot = (operationId: string, body: LooseRecord, headers: HeaderMap, ctx: CiotCommandContext) =>
  requestCiotMutation('close', operationId, body, headers, ctx);

// =============================================================================
// GET /v1/transporte/operacoes/{operationId}/ciot — 200: ciot atual + eventos paginados.
// =============================================================================

export async function getCiotForOperationService(
  operationId: string,
  query: LooseRecord
): Promise<{ ciot: CiotOperationResource | null; events: { items: CiotEventResource[]; total: number; page: number; pageSize: number } }> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const transportOperation = await getOperationHeaderById(operationId, integrationAccountId);
  if (!transportOperation) throw operationNotFound(operationId);

  const latest = await findLatestCiotOperationForOperation(operationId, integrationAccountId);
  if (!latest) {
    return { ciot: null, events: { items: [], total: 0, page: 1, pageSize: 20 } };
  }

  const filters: ListCiotEventsFilters = {
    page: query.page !== undefined ? Number(query.page) : undefined,
    pageSize: query.pageSize !== undefined ? Number(query.pageSize) : undefined
  };
  const { items, total, page, pageSize } = await listCiotEventsForOperation(latest.id, filters);

  return {
    ciot: toCiotOperationResource(latest),
    events: {
      items: items.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        detail: event.detail,
        createdAt: event.createdAt
      })),
      total,
      page,
      pageSize
    }
  };
}

// =============================================================================
// Worker — jobs `transporte.ciot.register|rectify|cancel|close|reconcile`. SEM parâmetro `gateway`
// (molde `runRntrcVerificationJob`): dependências por import direto (`createCiotProviderGateway`).
// =============================================================================

export type CiotJobEntity = {
  jobId: string;
  entityId: string;
  correlationId: string | null;
  payload: LooseRecord;
};

export type CiotJobResult = { outcome: string; patch: LooseRecord };

function requireJobField(payload: LooseRecord, field: string): string {
  return requireNonEmptyString(payload[field], `Job sem ${field}.`, 'TRANSPORTE_CIOT_JOB_FIELD_REQUIRED');
}

async function logCiotExchange(correlationId: string, operationId: string, action: string, request: LooseRecord, response: LooseRecord, httpStatus = 200): Promise<void> {
  await insertAuditEntry({
    correlationId,
    entityType: 'ciot_operation',
    entityId: operationId,
    direction: 'outbound',
    component: 'ciot-provider-gateway',
    httpMethod: 'POST',
    endpoint: `ciot-provider:${action}`,
    httpStatus: null,
    latencyMs: null,
    sanitizedBody: request
  });
  await insertAuditEntry({
    correlationId,
    entityType: 'ciot_operation',
    entityId: operationId,
    direction: 'inbound',
    component: 'ciot-provider-gateway',
    httpMethod: 'POST',
    endpoint: `ciot-provider:${action}`,
    httpStatus,
    latencyMs: null,
    sanitizedBody: response
  });
}

async function alreadyTerminalError(ciotOperationId: string, action: string): Promise<never> {
  throw new AppError(
    409,
    'Conflict',
    `Ciot ${ciotOperationId} já não está no estado esperado para "${action}" — resultado provavelmente já aplicado.`,
    { code: 'TRANSPORTE_CIOT_ALREADY_TERMINAL' }
  );
}

/**
 * Confirma `transport_operations` `ciot_pending → ciot_registered` (`confirm_ciot`, sem gate) —
 * usado tanto pelo caminho feliz do registro quanto pelo reconciliador quando ele encontra um
 * registro que havia se perdido. Tolerante: se a operação já saiu de `ciot_pending` (ex.: dois
 * caminhos concorrentes confirmando o mesmo registro), não repete a transição.
 */
async function confirmCiotRegisteredOnOperation(operationId: string, integrationAccountId: string): Promise<void> {
  const current = await getOperationHeaderById(operationId, integrationAccountId);
  if (!current || current.status !== 'ciot_pending') return;
  const transition = assertTransition(current.status, 'confirm_ciot');
  await transitionStatus(operationId, integrationAccountId, transition.from, transition.to, current.version);
}

/**
 * `transporte.ciot.register` — grava `request_dispatched` ANTES da chamada (DL-102), chama o
 * provedor, e no sucesso completa o registro + confirma a transição da operação. Rejeição/resposta
 * perdida NÃO são tratadas aqui: propagam como erro e são interpretadas pelo side-effect terminal
 * (`applyTransporteCiotTerminalFailureSideEffect`, chamado pelos DOIS pontos de `job-runner.ts`).
 */
export async function runCiotRegisterJob(job: CiotJobEntity, deps: { gateway?: CiotProviderGateway } = {}): Promise<CiotJobResult> {
  const ciotOperationId = requireJobField(job.payload, 'ciotOperationId');
  const operationId = requireJobField(job.payload, 'operationId');
  const integrationAccountId = requireJobField(job.payload, 'integrationAccountId');
  const correlationId = ensureCorrelationId(job.correlationId);

  const ciotOperation = await findCiotOperationByIdInternal(ciotOperationId);
  if (!ciotOperation) {
    throw new AppError(404, 'Not Found', `Ciot ${ciotOperationId} não encontrado.`, { code: 'TRANSPORTE_CIOT_NOT_FOUND' });
  }

  await markCiotOperationRequested(ciotOperationId, { jobId: job.jobId });
  await insertCiotEvent({
    id: createPrefixedId('ciotev'),
    ciotOperationId,
    eventType: 'request_dispatched',
    detail: { correlationMarker: ciotOperation.correlationMarker },
    correlationId
  });

  const gateway = deps.gateway ?? createCiotProviderGateway();
  const requestPayload = buildRegisterPayload(ciotOperation, job.payload.testFlags as CiotRegisterPayload['testFlags']);
  const result = await gateway.registerCiot(requestPayload);
  await logCiotExchange(correlationId, operationId, 'registerCiot', requestPayload as unknown as LooseRecord, result as unknown as LooseRecord);

  const completed = await completeCiotRegistrationSucceeded(ciotOperationId, result);
  if (!completed) return alreadyTerminalError(ciotOperationId, 'register');

  await insertCiotEvent({
    id: createPrefixedId('ciotev'),
    ciotOperationId,
    eventType: 'registered',
    detail: { ciotNumber: result.ciotNumber, externalStatus: result.externalStatus },
    correlationId
  });

  await confirmCiotRegisteredOnOperation(operationId, integrationAccountId);

  return {
    outcome: 'transporte_ciot_register_succeeded',
    patch: { ciotOperationId, ciotNumber: result.ciotNumber, externalStatus: result.externalStatus }
  };
}

async function runCiotMutationJob(
  command: MutationCommand,
  job: CiotJobEntity,
  deps: { gateway?: CiotProviderGateway } = {}
): Promise<CiotJobResult> {
  const ciotOperationId = requireJobField(job.payload, 'ciotOperationId');
  const operationId = requireJobField(job.payload, 'operationId');
  const correlationId = ensureCorrelationId(job.correlationId);

  const ciotOperation = await findCiotOperationByIdInternal(ciotOperationId);
  if (!ciotOperation) {
    throw new AppError(404, 'Not Found', `Ciot ${ciotOperationId} não encontrado.`, { code: 'TRANSPORTE_CIOT_NOT_FOUND' });
  }

  const requestedEventType = command === 'rectify' ? 'rectify_requested' : command === 'cancel' ? 'cancel_requested' : 'close_requested';
  await insertCiotEvent({
    id: createPrefixedId('ciotev'),
    ciotOperationId,
    eventType: requestedEventType,
    detail: { correlationMarker: ciotOperation.correlationMarker },
    correlationId
  });

  const gateway = deps.gateway ?? createCiotProviderGateway();
  const mutationPayload: CiotMutationPayload = {
    correlationMarker: ciotOperation.correlationMarker,
    ciotNumber: ciotOperation.ciotNumber,
    reason: (job.payload.reason as string | undefined) ?? null,
    testFlags: job.payload.testFlags as CiotMutationPayload['testFlags']
  };

  const action = command === 'rectify' ? 'rectifyCiot' : command === 'cancel' ? 'cancelCiot' : 'closeCiot';
  const result: CiotProviderResult = await gateway[action](mutationPayload);
  await logCiotExchange(correlationId, operationId, action, mutationPayload as unknown as LooseRecord, result as unknown as LooseRecord);

  const toStatus = command === 'rectify' ? 'rectified' : command === 'cancel' ? 'cancelled' : 'closed';
  const completed = await completeCiotMutationSucceeded(ciotOperationId, { ...result, toStatus });
  if (!completed) return alreadyTerminalError(ciotOperationId, command);

  await insertCiotEvent({
    id: createPrefixedId('ciotev'),
    ciotOperationId,
    eventType: toStatus as CiotEventInsertInput['eventType'],
    detail: { externalStatus: result.externalStatus },
    correlationId
  });

  return {
    outcome: `transporte_ciot_${command}_succeeded`,
    patch: { ciotOperationId, externalStatus: result.externalStatus, status: toStatus }
  };
}

export const runCiotRectifyJob = (job: CiotJobEntity, deps?: { gateway?: CiotProviderGateway }) => runCiotMutationJob('rectify', job, deps);
export const runCiotCancelJob = (job: CiotJobEntity, deps?: { gateway?: CiotProviderGateway }) => runCiotMutationJob('cancel', job, deps);
export const runCiotCloseJob = (job: CiotJobEntity, deps?: { gateway?: CiotProviderGateway }) => runCiotMutationJob('close', job, deps);

/** Mapa "o provedor confirmou X" → status local do agregado `ciot_operations`. */
const EXTERNAL_STATUS_TO_CIOT_STATUS: Record<string, 'registered' | 'rectified' | 'cancelled' | 'closed'> = {
  REGISTERED: 'registered',
  RECTIFIED: 'rectified',
  CANCELLED: 'cancelled',
  CLOSED: 'closed'
};

/**
 * `transporte.ciot.reconcile` — pergunta ao provedor pelo marcador de uma linha `request_unconfirmed`
 * (DL-102 aplicado ao CIOT). `found`: sincroniza o status local com o do provedor (e confirma a
 * transição da operação se o desfecho for `registered`, mesmo caminho do sucesso direto).
 * `not-found-after-polling` com `ciotNumber` local nulo: rejeita com `CIOT_REQUEST_NOT_FOUND_REMOTE`
 * — a operação PERMANECE `ciot_pending`, liberando um novo `solicitar`. `error`: propaga (retry da
 * fila) mantendo `request_unconfirmed`.
 */
export async function runCiotReconcileJob(
  job: CiotJobEntity,
  deps: Partial<CiotReconcilerDeps> & { gateway?: CiotProviderGateway } = {}
): Promise<CiotJobResult> {
  const ciotOperationId = requireJobField(job.payload, 'ciotOperationId');
  const operationId = requireJobField(job.payload, 'operationId');
  const integrationAccountId = requireJobField(job.payload, 'integrationAccountId');
  const correlationMarker = requireJobField(job.payload, 'correlationMarker');
  const correlationId = ensureCorrelationId(job.correlationId);

  const ciotOperation = await findCiotOperationByIdInternal(ciotOperationId);
  if (!ciotOperation || ciotOperation.status !== 'request_unconfirmed') {
    // Já resolvido por um caminho concorrente (sweep + reconcile explícito, por exemplo) — NO-OP.
    return { outcome: 'transporte_ciot_reconcile_noop', patch: { ciotOperationId } };
  }

  const gateway = deps.gateway ?? createCiotProviderGateway();
  const result = await reconcileCiotOperation(
    { queryCiotByMarker: deps.queryCiotByMarker ?? gateway.queryCiotByMarker, sleep: deps.sleep, delaysMs: deps.delaysMs },
    { ciotOperationId, correlationMarker }
  );

  if (result.outcome === 'error') {
    // Propaga — INCONCLUSIVO nunca é "não existe". A fila reencaminha (retry/backoff normais).
    throw result.error;
  }

  if (result.outcome === 'not-found-after-polling') {
    if (ciotOperation.ciotNumber != null) {
      // Defensivo: já tínhamos um número local (registro conhecido) — não há como "não encontrar"
      // algo que já foi confirmado antes. Mantém unconfirmed para a próxima varredura em vez de
      // destruir um registro que sabemos que existiu.
      throw new AppError(502, 'Bad Gateway', `Reconciliação inconsistente do CIOT ${ciotOperationId}: marcador não encontrado apesar de ciotNumber local já confirmado.`, {
        code: 'TRANSPORTE_CIOT_RECONCILE_INCONSISTENT'
      });
    }

    const rejected = await markCiotOperationReconcileNotFoundRejected(ciotOperationId, { reasonCode: 'CIOT_REQUEST_NOT_FOUND_REMOTE' });
    if (!rejected) return { outcome: 'transporte_ciot_reconcile_noop', patch: { ciotOperationId } };

    await insertCiotEvent({
      id: createPrefixedId('ciotev'),
      ciotOperationId,
      eventType: 'reconciled',
      detail: { result: 'not_found', reasonCode: 'CIOT_REQUEST_NOT_FOUND_REMOTE', attempts: result.attempts },
      correlationId
    });

    return { outcome: 'transporte_ciot_reconcile_not_found', patch: { ciotOperationId, status: 'rejected' } };
  }

  const toStatus = EXTERNAL_STATUS_TO_CIOT_STATUS[result.match.externalStatus] ?? 'registered';
  const completed = await completeCiotReconcileFound(ciotOperationId, {
    ciotNumber: result.match.ciotNumber,
    externalStatus: result.match.externalStatus,
    raw: result.match.raw,
    toStatus
  });
  if (!completed) return { outcome: 'transporte_ciot_reconcile_noop', patch: { ciotOperationId } };

  await insertCiotEvent({
    id: createPrefixedId('ciotev'),
    ciotOperationId,
    eventType: 'reconciled',
    detail: { result: 'found', toStatus, ciotNumber: result.match.ciotNumber, attempts: result.attempts },
    correlationId
  });

  if (toStatus === 'registered') {
    await confirmCiotRegisteredOnOperation(operationId, integrationAccountId);
  }

  return { outcome: 'transporte_ciot_reconcile_found', patch: { ciotOperationId, status: toStatus, ciotNumber: result.match.ciotNumber } };
}

// =============================================================================
// Terminal failure — DL-102: resposta perdida DEPOIS do dispatch NUNCA vira `failed`.
// Chamado pelos DOIS pontos de `job-runner.ts` (`handleDlqTransition`/`handleFailedTransition`),
// molde `applyManifestSubmitTerminalFailureSideEffect`.
// =============================================================================

const CIOT_MUTATING_OPERATIONS = new Set([REGISTER_OPERATION, RECTIFY_OPERATION, CANCEL_OPERATION, CLOSE_OPERATION]);

/** Código de erro que só o provedor pode produzir de propósito — decisão DEFINITIVA, nunca "não sei". */
const CIOT_PROVIDER_DEFINITIVE_REJECTION_CODE = 'CIOT_PROVIDER_REJECTED_TEST';

export type CiotTerminalFailureJob = {
  jobId: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload: LooseRecord;
  correlationId?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
};

export type CiotTerminalFailure = {
  action?: string;
  dlqReason?: string;
  patch?: { lastErrorCode?: string | null; lastErrorMessage?: string | null };
};

export async function applyTransporteCiotTerminalFailureSideEffect(
  job: CiotTerminalFailureJob,
  terminalFailure: CiotTerminalFailure = {},
  error: unknown = null
): Promise<unknown> {
  if (!CIOT_MUTATING_OPERATIONS.has(job.operation)) return null;

  const terminalAction = String(terminalFailure.action || '').toLowerCase();
  if (!['failed', 'dlq', 'cancelled'].includes(terminalAction)) return null;

  const ciotOperationId = toTrimmedString(job.payload?.ciotOperationId);
  const operationId = toTrimmedString(job.payload?.operationId);
  const integrationAccountId = toTrimmedString(job.payload?.integrationAccountId);
  const correlationMarker = toTrimmedString(job.payload?.correlationMarker);
  if (!ciotOperationId) return null; // falhou antes de o payload carregar o id — nada a reconciliar

  const lastErrorCode = terminalFailure.patch?.lastErrorCode || job.lastErrorCode || null;
  const errorCode = (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string')
    ? (error as { code: string }).code
    : lastErrorCode;

  // Rejeição DEFINITIVA do provedor — decisão conhecida, não "resposta perdida".
  if (errorCode === CIOT_PROVIDER_DEFINITIVE_REJECTION_CODE) {
    const rejected = await markCiotOperationRejected(ciotOperationId, {
      reasonCode: CIOT_PROVIDER_DEFINITIVE_REJECTION_CODE,
      raw: { message: terminalFailure.patch?.lastErrorMessage || job.lastErrorMessage || null }
    });
    if (!rejected) return null;

    return insertCiotEvent({
      id: createPrefixedId('ciotev'),
      ciotOperationId,
      eventType: 'rejected',
      detail: { reasonCode: CIOT_PROVIDER_DEFINITIVE_REJECTION_CODE },
      correlationId: job.correlationId || createPrefixedId('corr')
    });
  }

  // Qualquer outro terminal (timeout/rede/DLQ por tentativas esgotadas) DEPOIS do dispatch — DL-102:
  // "não perguntei" nunca é "falhou". Marca unconfirmed e tenta enfileirar o reconciliador — se isso
  // falhar, a varredura periódica (`enqueueTransporteCiotReconcileSweepIfNeeded`) pega na próxima janela.
  const unconfirmed = await markCiotOperationRequestUnconfirmed(ciotOperationId, {
    lastErrorCode: errorCode,
    lastErrorDetail: { message: terminalFailure.patch?.lastErrorMessage || job.lastErrorMessage || null }
  });
  if (!unconfirmed) return null; // já não estava em trânsito — nada a fazer

  await insertCiotEvent({
    id: createPrefixedId('ciotev'),
    ciotOperationId,
    eventType: 'request_unconfirmed',
    detail: { lastErrorCode: errorCode, operation: job.operation },
    correlationId: job.correlationId || createPrefixedId('corr')
  });

  if (operationId && integrationAccountId && correlationMarker) {
    try {
      const retryConfig = getRetryConfig('transporte.ciot.reconcile');
      await insertJobDeduplicated({
        jobId: createPrefixedId('job'),
        commandId: createPrefixedId('cmd'),
        entityType: 'ciot_operation',
        entityId: operationId,
        operation: 'transporte.ciot.reconcile',
        payload: { ciotOperationId, operationId, integrationAccountId, correlationMarker },
        status: 'queued',
        maxAttempts: retryConfig.maxAttempts,
        correlationId: job.correlationId || createPrefixedId('corr'),
        priority: calculateJobPriority('transporte.ciot.reconcile'),
        retryStrategy: retryConfig.strategy,
        baseDelayMs: retryConfig.baseDelayMs,
        maxDelayMs: retryConfig.maxDelayMs,
        tags: extractJobTags({ operation: 'transporte.ciot.reconcile', entityType: 'ciot_operation', status: 'queued' })
      });
    } catch (enqueueError: unknown) {
      // Best-effort — a varredura periódica é a rede de segurança para este enfileiramento.
      console.warn(`[transport-ciot-service] falha ao enfileirar reconciliação do CIOT ${ciotOperationId}: ${enqueueError instanceof Error ? enqueueError.message : String(enqueueError)}`);
    }
  }

  return unconfirmed;
}
