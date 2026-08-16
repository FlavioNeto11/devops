/**
 * Service do ciclo de averbação eletrônica (PR-I3, REQ-SICAT-0034) — averbar cada operação de
 * transporte nas apólices VIGENTES aplicáveis do transportador, com prêmio calculado NO ATO
 * (`insurance-premium-engine.ts`, centavos half-up) e gateway ABSTRAÍDO
 * (`gateways/averbacao-gateway.ts`, modos off|sandbox).
 *
 * Fronteira `route → service → repository → job → worker → gateway` (backend/AGENTS.md §2): a
 * metade HTTP-facing (`averbarOperacaoService`, `retificarAverbacaoService`,
 * `cancelarAverbacaoService`, `listAverbacoesForOperationService`, `listSegurosAverbacoesService`)
 * é chamada pelas rotas; a metade worker-facing (`runAverbacao*Job`) é chamada por
 * `workers/operation-handlers.ts` (handlers SEM parâmetro `gateway`, molde `runCiot*Job`).
 *
 * ── DL-102 aplicado à averbação (replicado do CIOT, NÃO reaproveitado — bounded context próprio) ──
 * O `provider_declaration_ref` nasce na RESPOSTA da seguradora. Por isso: (1) o marcador de
 * correlação (`lib/transport/averbacao-correlation.ts`) é gravado na CRIAÇÃO da linha
 * `insurance_shipment_declarations`, ANTES de qualquer chamada; (2) cada transição grava um evento
 * append-only; (3) uma resposta perdida (timeout DEPOIS do dispatch) nunca vira `rejected` — vira
 * `*_unconfirmed`, resolvido só pelo reconciliador (`services/averbacao-reconciler.ts`) perguntando
 * à seguradora via `queryByMarker`.
 *
 * ── Rejeição da seguradora NÃO é falha nossa ────────────────────────────────────────────────────
 * `declareShipment` devolve a recusa como OUTCOME (`rejected`), nunca como exceção: o job marca a
 * declaração `rejected` diretamente (decisão de negócio conhecida) — o índice parcial
 * `uq_insdecl_operation_policy_live` libera a chave para um novo `averbar` criar uma declaração
 * NOVA (histórico preservado, nunca reescrito).
 *
 * ── Diferença deliberada do CIOT: averbação NÃO tem side-effect de manifest/transição ───────────
 * Averbar não move a máquina de estados da operação — quem cobra averbação antes do trânsito é a
 * regra TR-SEG-005 no GATE_PRE_BOARDING (advisory), nunca uma transição automática daqui.
 */

import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { buildCommandAccepted } from '../lib/command-response.js';
import { calculateJobPriority, extractJobTags, getRetryConfig } from '../lib/retry.js';
import { insertJobDeduplicated } from '../repositories/job-repo.js';
import { insertAuditEntry } from '../repositories/audit-repo.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';
import { getOperationAggregateById, getOperationHeaderById } from '../repositories/transport-operation-repo.js';
import type { TransportOperationAggregate } from '../lib/transport/transport-operation-types.js';
import {
  findApplicablePolicyForPartyAndType,
  getPolicyById,
  listRateSchedulesForPolicy
} from '../repositories/transport-insurance-repo.js';
import { INSURANCE_POLICY_TYPES, type InsurancePolicy, type InsurancePolicyType } from '../lib/transport/transport-insurance-types.js';
import {
  computeDeclarationPremiumCents,
  selectApplicableRate,
  type RateScheduleForSelection
} from '../lib/transport/insurance-premium-engine.js';
import {
  completeDeclarationCancelled,
  completeDeclarationDeclared,
  completeDeclarationReconcileFound,
  completeDeclarationRectified,
  findDeclarationById,
  findDeclarationByIdInternal,
  insertDeclaration,
  insertDeclarationEvent,
  listDeclarationEvents,
  listDeclarationsForAccount,
  listDeclarationsForOperation,
  markDeclarationCancelling,
  markDeclarationReconcileNotFoundRejected,
  markDeclarationRejected,
  markDeclarationRectifying,
  markDeclarationUnconfirmed,
  type ListDeclarationsForAccountFilters
} from '../repositories/insurance-declaration-repo.js';
import { buildAverbacaoCorrelationMarker } from '../lib/transport/averbacao-correlation.js';
import { createAverbacaoGateway, type AverbacaoGateway } from '../gateways/averbacao-gateway.js';
import { reconcileAverbacaoDeclaration, type AverbacaoReconcilerDeps } from './averbacao-reconciler.js';
import {
  INSURANCE_DECLARATION_STATUSES,
  INSURANCE_DECLARATION_TERMINAL_STATUSES,
  type InsuranceDeclarationStatus,
  type InsuranceShipmentDeclaration
} from '../lib/transport/averbacao-types.js';
import { config } from '../lib/config.js';

type LooseRecord = Record<string, unknown>;
type HeaderMap = Record<string, string | undefined>;

const DECLARE_OPERATION = 'transporte.averbacao.declare';
const RECTIFY_OPERATION = 'transporte.averbacao.rectify';
const CANCEL_OPERATION = 'transporte.averbacao.cancel';
const RECONCILE_OPERATION = 'transporte.averbacao.reconcile';

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

function ensureCorrelationId(correlationId: string | null): string {
  return correlationId || createPrefixedId('corr');
}

function operationNotFound(operationId: string): AppError {
  return new AppError(404, 'Not Found', `Operação de transporte ${operationId} não encontrada.`, {
    code: 'TRANSPORT_OPERATION_NOT_FOUND'
  });
}

function declarationNotFound(declarationId: string): AppError {
  return new AppError(404, 'Not Found', `Averbação ${declarationId} não encontrada.`, {
    code: 'TRANSPORTE_AVERBACAO_NOT_FOUND'
  });
}

/** Recusa explícita quando a feature está desligada — mesmo racional do 501 do gateway (`off` nunca cria linha nenhuma). */
function assertAverbacaoEnabled(): void {
  if (config.averbacaoGatewayMode === 'off') {
    throw new AppError(
      501,
      'Not Implemented',
      'Averbação eletrônica desligada (AVERBACAO_GATEWAY_MODE=off) — nenhuma seguradora/averbadora integrada. '
        + 'Ligue AVERBACAO_GATEWAY_MODE=sandbox para o ciclo determinístico local.',
      { code: 'AVERBACAO_GATEWAY_DISABLED' }
    );
  }
}

/** Reais → centavos inteiros (half-up) — a aritmética do prêmio roda SEMPRE em centavos (mesmo helper de `rule-evaluators.ts#toCentsHalfUp`). */
function toCentsHalfUp(amount: number): number {
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(amount) * 100 + 1e-9);
}

/** Hoje em 'YYYY-MM-DD' no fuso LOCAL do processo — mesmo padrão de `transport-compliance-service.ts`. */
function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Estados a partir dos quais `averbar` é aceito: qualquer um DEPOIS de `contract` no ciclo de vida
 * (a averbação declara um embarque de um frete JÁ contratado), exceto `cancelled` — averbar uma
 * operação cancelada seria pagar prêmio por carga que não viaja.
 */
const AVERBAR_ALLOWED_OPERATION_STATUSES = new Set([
  'contracted',
  'ciot_pending',
  'ciot_registered',
  'fiscal_pending',
  'ready_for_release',
  'in_transit',
  'completion_pending',
  'completed'
]);

/**
 * Soma dos `declaredValue` da carga em CENTAVOS — o valor que a averbação CONGELA. Lança quando a
 * soma seria mentirosa (sem carga, ou item sem valor declarado): declarar um valor subestimado à
 * seguradora é exatamente o erro que deixa carga descoberta (mesmo racional de TR-SEG-004).
 */
function requireCargoDeclaredValueCents(aggregate: TransportOperationAggregate): number {
  const cargoItems = aggregate.cargo ?? [];
  const missing = cargoItems.filter((item) => item.declaredValue == null).length;
  if (cargoItems.length === 0 || missing > 0) {
    throw new AppError(
      409,
      'Conflict',
      cargoItems.length === 0
        ? 'Operação sem carga registrada — não há valor declarado para averbar.'
        : `${missing} item(ns) de carga sem valor declarado — declare o valor de cada item antes de averbar.`,
      { code: 'TRANSPORTE_AVERBACAO_CARGO_VALUE_MISSING', context: { cargoItemsCount: cargoItems.length, missing } }
    );
  }
  return cargoItems.reduce((total, item) => total + toCentsHalfUp(item.declaredValue as number), 0);
}

/** Percurso da operação no formato das taxas por escopo ('SP-PR') — `null` quando a operação não tem rota. */
function resolveOperationRouteScope(aggregate: TransportOperationAggregate): string | null {
  const route = aggregate.route;
  if (!route) return null;
  return `${route.originUf}-${route.destinationUf}`;
}

// =============================================================================
// DTOs (contrato)
// =============================================================================

export type AverbacaoDeclarationResource = {
  id: string;
  version: number;
  operationId: string;
  policyId: string;
  rateScheduleId: string;
  declaredCargoAmount: number;
  appliedRatePercent: number;
  premiumAmount: number;
  routeScope: string | null;
  providerDeclarationRef: string | null;
  status: InsuranceDeclarationStatus;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

function toDeclarationResource(record: InsuranceShipmentDeclaration): AverbacaoDeclarationResource {
  return {
    id: record.id,
    version: record.version,
    operationId: record.operationId,
    policyId: record.policyId,
    rateScheduleId: record.rateScheduleId,
    declaredCargoAmount: record.declaredCargoAmount,
    appliedRatePercent: record.appliedRatePercent,
    premiumAmount: record.premiumAmount,
    routeScope: record.routeScope,
    providerDeclarationRef: record.providerDeclarationRef,
    status: record.status,
    lastErrorCode: record.lastErrorCode,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export type AverbacaoEventResource = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type AverbacaoCommandContext = { correlationId: string; evaluatedBy: string | null };

// =============================================================================
// POST /v1/transporte/operacoes/{operationId}/averbacoes — 202, cria N declarações + N jobs.
// =============================================================================

export async function averbarOperacaoService(
  operationId: string,
  body: LooseRecord,
  headers: HeaderMap,
  ctx: AverbacaoCommandContext
): Promise<LooseRecord> {
  assertAverbacaoEnabled();

  const integrationAccountId = requireIntegrationAccountId(body);
  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `${DECLARE_OPERATION}:${operationId}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused;

  const aggregate = await getOperationAggregateById(operationId, integrationAccountId);
  if (!aggregate) throw operationNotFound(operationId);

  if (!AVERBAR_ALLOWED_OPERATION_STATUSES.has(aggregate.operation.status)) {
    throw new AppError(
      409,
      'Conflict',
      `Operação ${operationId} não está pronta para averbar (status atual: "${aggregate.operation.status}"; `
        + 'a averbação exige um frete já contratado — status "contracted" em diante).',
      { code: 'TRANSPORTE_AVERBACAO_OPERATION_NOT_READY', context: { status: aggregate.operation.status } }
    );
  }

  const carrierParty = aggregate.parties.find((party) => party.role === 'carrier') ?? null;
  if (!carrierParty) {
    throw new AppError(409, 'Conflict', `Operação ${operationId} não tem transportador (carrier) vinculado — não há apólice a averbar.`, {
      code: 'TRANSPORTE_AVERBACAO_CARRIER_MISSING'
    });
  }

  const cargoAmountCents = requireCargoDeclaredValueCents(aggregate);
  const declaredCargoAmount = cargoAmountCents / 100;
  const routeScope = resolveOperationRouteScope(aggregate);
  const referenceDate = todayIsoDate();

  // Apólices VIGENTES aplicáveis do carrier: RCTR-C e RC-DC sempre; RC-V só com veículo vinculado
  // (sem veículo não há o que o RC-V segurar — mesmo recorte de TR-SEG-003/TR-SEG-005).
  const applicableTypes: InsurancePolicyType[] = INSURANCE_POLICY_TYPES.filter(
    (type) => type !== 'RC_V' || aggregate.vehicles.length > 0
  );

  const applicablePolicies: InsurancePolicy[] = [];
  for (const policyType of applicableTypes) {
    const policy = await findApplicablePolicyForPartyAndType(carrierParty.partyId, integrationAccountId, policyType, referenceDate);
    // Só apólice cuja janela COBRE a data de hoje é averbável — o repo devolve "a melhor", que pode
    // estar vencida; averbar numa apólice vencida declararia cobertura que não existe.
    if (policy && policy.validFrom <= referenceDate && policy.validUntil >= referenceDate) {
      applicablePolicies.push(policy);
    }
  }

  if (applicablePolicies.length === 0) {
    throw new AppError(
      409,
      'Conflict',
      'Nenhuma apólice vigente aplicável ao transportador desta operação — registre/renove as apólices antes de averbar.',
      { code: 'TRANSPORTE_AVERBACAO_NO_APPLICABLE_POLICY', context: { referenceDate } }
    );
  }

  // No máximo UMA averbação viva por operação×apólice (índice parcial da migration 036) — o
  // pré-check devolve um 409 legível; a corrida residual cai no 23505 tratado abaixo.
  const existing = await listDeclarationsForOperation(operationId, integrationAccountId);
  const liveByPolicy = new Set(
    existing
      .filter((declaration) => !(INSURANCE_DECLARATION_TERMINAL_STATUSES as readonly string[]).includes(declaration.status))
      .map((declaration) => declaration.policyId)
  );
  const alreadyLive = applicablePolicies.filter((policy) => liveByPolicy.has(policy.id));
  if (alreadyLive.length > 0) {
    throw new AppError(
      409,
      'Conflict',
      `Operação ${operationId} já tem averbação viva para apólice(s) ${alreadyLive.map((policy) => policy.policyType).join('/')}`
        + ' — retifique ou cancele a averbação existente em vez de criar outra.',
      { code: 'TRANSPORTE_AVERBACAO_ALREADY_LIVE', context: { policyIds: alreadyLive.map((policy) => policy.id) } }
    );
  }

  // Resolve a TAXA aplicável de cada apólice ANTES de criar qualquer linha: falta de taxa recusa a
  // averbação inteira com erro explícito (`selectApplicableRate` devolvendo null NUNCA vira default
  // silencioso — diretriz do motor, REQ-SICAT-0034).
  type PlannedDeclaration = { policy: InsurancePolicy; rateScheduleId: string; ratePercent: number; premiumAmount: number };
  const planned: PlannedDeclaration[] = [];
  for (const policy of applicablePolicies) {
    const schedules = await listRateSchedulesForPolicy(policy.id, integrationAccountId);
    const selectable = schedules.map((schedule) => ({
      id: schedule.id,
      ratePercent: schedule.ratePercent,
      routeScope: schedule.routeScope,
      monthlyMinimumAmount: schedule.monthlyMinimumAmount,
      validFrom: schedule.validFrom,
      validUntil: schedule.validUntil,
      status: schedule.status
    }));
    const selected = selectApplicableRate(selectable as readonly RateScheduleForSelection[], { referenceDate, routeScope });
    const selectedWithId = selectable.find((candidate) => candidate === selected) ?? null;
    if (!selectedWithId) {
      throw new AppError(
        409,
        'Conflict',
        `Apólice ${policy.policyType} (${policy.policyNumber}) não tem taxa de averbação aplicável em ${referenceDate}`
          + `${routeScope ? ` para o percurso ${routeScope} nem default` : ''} — cadastre a taxa (POST .../apolices/{policyId}/taxas) antes de averbar.`,
        { code: 'TRANSPORTE_AVERBACAO_RATE_NOT_FOUND', context: { policyId: policy.id, policyType: policy.policyType, referenceDate, routeScope } }
      );
    }
    const premiumCents = computeDeclarationPremiumCents({ cargoAmountCents, ratePercent: selectedWithId.ratePercent });
    planned.push({
      policy,
      rateScheduleId: selectedWithId.id,
      ratePercent: selectedWithId.ratePercent,
      premiumAmount: premiumCents / 100
    });
  }

  const correlationId = ensureCorrelationId(ctx.correlationId);
  const retryConfig = getRetryConfig(DECLARE_OPERATION);
  const priority = calculateJobPriority(DECLARE_OPERATION);

  const declarations: LooseRecord[] = [];
  for (const plan of planned) {
    const declarationId = createPrefixedId('insdecl');
    const correlationMarker = buildAverbacaoCorrelationMarker(declarationId);

    let declaration: InsuranceShipmentDeclaration;
    try {
      declaration = await insertDeclaration({
        id: declarationId,
        integrationAccountId,
        operationId,
        policyId: plan.policy.id,
        rateScheduleId: plan.rateScheduleId,
        declaredCargoAmount,
        appliedRatePercent: plan.ratePercent,
        premiumAmount: plan.premiumAmount,
        routeScope,
        correlationMarker,
        correlationId
      });
    } catch (error: unknown) {
      const pgCode = (error as { code?: string } | null)?.code;
      if (pgCode === '23505') {
        throw new AppError(409, 'Conflict', `Operação ${operationId} já tem averbação viva para a apólice ${plan.policy.policyType}.`, {
          code: 'TRANSPORTE_AVERBACAO_ALREADY_LIVE',
          context: { policyId: plan.policy.id }
        });
      }
      throw error;
    }

    await insertDeclarationEvent({
      id: createPrefixedId('insdev'),
      declarationId: declaration.id,
      eventType: 'declare_requested',
      payload: {
        correlationMarker,
        policyType: plan.policy.policyType,
        declaredCargoAmount,
        appliedRatePercent: plan.ratePercent,
        premiumAmount: plan.premiumAmount
      },
      correlationId
    });

    // Dedup por DECLARAÇÃO (não por operação, como no CIOT): uma operação enfileira N declares —
    // um por apólice — e o alvo de conflito do `insertJobDeduplicated` é (entityType, entityId,
    // operation); entityId = declarationId mantém os N jobs independentes.
    const enqueued = await insertJobDeduplicated({
      jobId: createPrefixedId('job'),
      commandId: createPrefixedId('cmd'),
      entityType: 'insurance_declaration',
      entityId: declaration.id,
      operation: DECLARE_OPERATION,
      payload: {
        declarationId: declaration.id,
        operationId,
        integrationAccountId,
        correlationMarker
      },
      status: 'queued',
      maxAttempts: retryConfig.maxAttempts,
      correlationId,
      idempotencyKey,
      priority,
      retryStrategy: retryConfig.strategy,
      baseDelayMs: retryConfig.baseDelayMs,
      maxDelayMs: retryConfig.maxDelayMs,
      tags: extractJobTags({ operation: DECLARE_OPERATION, entityType: 'insurance_declaration', status: 'queued' })
    });

    if (!enqueued?.job) {
      throw new AppError(500, 'Internal Server Error', `Falha ao enfileirar a averbação ${declaration.id} da operação ${operationId}.`, {
        code: 'TRANSPORTE_AVERBACAO_ENQUEUE_FAILED'
      });
    }

    declarations.push({
      ...toDeclarationResource(declaration),
      policyType: plan.policy.policyType,
      policyNumber: plan.policy.policyNumber,
      jobId: enqueued.job.jobId
    });
  }

  const response: LooseRecord = {
    operationId,
    correlationId,
    referenceDate,
    declaredCargoAmount,
    declarations,
    links: { entity: `/v1/transporte/operacoes/${operationId}/averbacoes` }
  };

  await rememberIdempotentResponse({
    operation: idempotencyScope,
    idempotencyKey,
    entityType: 'insurance_declaration',
    entityId: operationId,
    response
  });

  return response;
}

// =============================================================================
// POST /v1/transporte/averbacoes/{declarationId}/retificar | /cancelar — 202, ciclo assíncrono.
// =============================================================================

export async function retificarAverbacaoService(
  declarationId: string,
  body: LooseRecord,
  headers: HeaderMap,
  ctx: AverbacaoCommandContext
): Promise<LooseRecord> {
  assertAverbacaoEnabled();

  const integrationAccountId = requireIntegrationAccountId(body);
  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `${RECTIFY_OPERATION}:${declarationId}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused;

  const declaration = await findDeclarationById(declarationId, integrationAccountId);
  if (!declaration) throw declarationNotFound(declarationId);

  if (declaration.status !== 'declared') {
    throw new AppError(
      409,
      'Conflict',
      `Averbação ${declarationId} não está em estado válido para retificar (esperado "declared"; atual: "${declaration.status}").`,
      { code: 'TRANSPORTE_AVERBACAO_MUTATION_NOT_ALLOWED', context: { command: 'rectify', status: declaration.status } }
    );
  }

  const aggregate = await getOperationAggregateById(declaration.operationId, integrationAccountId);
  if (!aggregate) throw operationNotFound(declaration.operationId);

  // A retificação re-congela o valor da CARGA ATUAL da operação com a MESMA taxa aplicada na
  // averbação original — retificar corrige o VALOR declarado, nunca renegocia a taxa (trocar de
  // taxa é cancelar e averbar de novo, com trilha própria).
  const cargoAmountCents = requireCargoDeclaredValueCents(aggregate);
  const newDeclaredCargoAmount = cargoAmountCents / 100;
  const premiumCents = computeDeclarationPremiumCents({ cargoAmountCents, ratePercent: declaration.appliedRatePercent });

  const marked = await markDeclarationRectifying(declarationId, declaration.version, {
    declaredCargoAmount: newDeclaredCargoAmount,
    premiumAmount: premiumCents / 100
  });
  if (!marked) {
    throw new AppError(409, 'Conflict', `Averbação ${declarationId} foi modificada por outro processo — recarregue e tente de novo.`, {
      code: 'TRANSPORTE_AVERBACAO_VERSION_CONFLICT'
    });
  }

  const correlationId = ensureCorrelationId(ctx.correlationId);
  await insertDeclarationEvent({
    id: createPrefixedId('insdev'),
    declarationId,
    eventType: 'rectify_requested',
    payload: {
      previousDeclaredCargoAmount: declaration.declaredCargoAmount,
      declaredCargoAmount: newDeclaredCargoAmount,
      premiumAmount: premiumCents / 100
    },
    correlationId
  });

  return enqueueMutationJob(RECTIFY_OPERATION, marked, idempotencyScope, idempotencyKey, correlationId, {
    reason: toTrimmedString(body.reason)
  });
}

export async function cancelarAverbacaoService(
  declarationId: string,
  body: LooseRecord,
  headers: HeaderMap,
  ctx: AverbacaoCommandContext
): Promise<LooseRecord> {
  assertAverbacaoEnabled();

  const integrationAccountId = requireIntegrationAccountId(body);
  const idempotencyKey = headers['idempotency-key'];
  const idempotencyScope = `${CANCEL_OPERATION}:${declarationId}`;
  const reused = await getIdempotentResponse(idempotencyScope, idempotencyKey);
  if (reused) return reused;

  const declaration = await findDeclarationById(declarationId, integrationAccountId);
  if (!declaration) throw declarationNotFound(declarationId);

  if (declaration.status !== 'declared') {
    throw new AppError(
      409,
      'Conflict',
      `Averbação ${declarationId} não está em estado válido para cancelar (esperado "declared"; atual: "${declaration.status}").`,
      { code: 'TRANSPORTE_AVERBACAO_MUTATION_NOT_ALLOWED', context: { command: 'cancel', status: declaration.status } }
    );
  }

  const marked = await markDeclarationCancelling(declarationId, declaration.version);
  if (!marked) {
    throw new AppError(409, 'Conflict', `Averbação ${declarationId} foi modificada por outro processo — recarregue e tente de novo.`, {
      code: 'TRANSPORTE_AVERBACAO_VERSION_CONFLICT'
    });
  }

  const correlationId = ensureCorrelationId(ctx.correlationId);
  await insertDeclarationEvent({
    id: createPrefixedId('insdev'),
    declarationId,
    eventType: 'cancel_requested',
    payload: { reason: toTrimmedString(body.reason) },
    correlationId
  });

  return enqueueMutationJob(CANCEL_OPERATION, marked, idempotencyScope, idempotencyKey, correlationId, {
    reason: toTrimmedString(body.reason)
  });
}

async function enqueueMutationJob(
  operation: string,
  declaration: InsuranceShipmentDeclaration,
  idempotencyScope: string,
  idempotencyKey: string | undefined,
  correlationId: string,
  extraPayload: LooseRecord
): Promise<LooseRecord> {
  const retryConfig = getRetryConfig(operation);
  const priority = calculateJobPriority(operation);
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');

  const enqueued = await insertJobDeduplicated({
    jobId,
    commandId,
    entityType: 'insurance_declaration',
    entityId: declaration.id,
    operation,
    payload: {
      declarationId: declaration.id,
      operationId: declaration.operationId,
      integrationAccountId: declaration.integrationAccountId,
      correlationMarker: declaration.correlationMarker,
      ...extraPayload
    },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation, entityType: 'insurance_declaration', status: 'queued' })
  });

  if (!enqueued?.job) {
    throw new AppError(500, 'Internal Server Error', `Falha ao enfileirar "${operation}" da averbação ${declaration.id}.`, {
      code: 'TRANSPORTE_AVERBACAO_ENQUEUE_FAILED'
    });
  }

  const response = buildCommandAccepted({
    commandId: enqueued.job.commandId || commandId,
    jobId: enqueued.job.jobId,
    correlationId,
    entityType: 'insurance_declaration',
    entityId: declaration.id,
    operation,
    entityLink: `/v1/transporte/operacoes/${declaration.operationId}/averbacoes`
  });

  await rememberIdempotentResponse({
    operation: idempotencyScope,
    idempotencyKey,
    entityType: 'insurance_declaration',
    entityId: declaration.id,
    response: response as unknown as Record<string, unknown>
  });

  return response;
}

// =============================================================================
// GET /v1/transporte/operacoes/{operationId}/averbacoes — 200: declarações + eventos.
// =============================================================================

export async function listAverbacoesForOperationService(
  operationId: string,
  query: LooseRecord
): Promise<{ items: Array<AverbacaoDeclarationResource & { events: AverbacaoEventResource[] }>; totalItems: number }> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const operation = await getOperationHeaderById(operationId, integrationAccountId);
  if (!operation) throw operationNotFound(operationId);

  const declarations = await listDeclarationsForOperation(operationId, integrationAccountId);
  const items: Array<AverbacaoDeclarationResource & { events: AverbacaoEventResource[] }> = [];
  for (const declaration of declarations) {
    const events = await listDeclarationEvents(declaration.id);
    items.push({
      ...toDeclarationResource(declaration),
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        payload: event.payload,
        createdAt: event.createdAt
      }))
    });
  }

  return { items, totalItems: items.length };
}

// =============================================================================
// GET /v1/transporte/seguros/averbacoes — 200: extrato por conta/período.
// =============================================================================

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toOptionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim();
  if (!DATE_REGEX.test(normalized)) {
    throw new AppError(400, 'Bad Request', `${field} inválido: esperado 'YYYY-MM-DD' (recebido "${String(value)}").`, {
      code: 'TRANSPORTE_AVERBACAO_DATE_INVALID',
      context: { field }
    });
  }
  return normalized;
}

function toOptionalStatus(value: unknown): InsuranceDeclarationStatus | null {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim();
  if (!(INSURANCE_DECLARATION_STATUSES as readonly string[]).includes(normalized)) {
    throw new AppError(
      400,
      'Bad Request',
      `status inválido: esperado um de ${INSURANCE_DECLARATION_STATUSES.join(', ')} (recebido "${normalized}").`,
      { code: 'TRANSPORTE_AVERBACAO_STATUS_INVALID' }
    );
  }
  return normalized as InsuranceDeclarationStatus;
}

export async function listSegurosAverbacoesService(query: LooseRecord): Promise<{
  items: AverbacaoDeclarationResource[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const integrationAccountId = requireIntegrationAccountId(query);

  const filters: ListDeclarationsForAccountFilters = {
    from: toOptionalDate(query.from, 'from'),
    to: toOptionalDate(query.to, 'to'),
    policyId: toTrimmedString(query.policyId),
    status: toOptionalStatus(query.status),
    page: query.page !== undefined ? Number(query.page) : undefined,
    pageSize: query.pageSize !== undefined ? Number(query.pageSize) : undefined
  };
  if (filters.from && filters.to && filters.to < filters.from) {
    throw new AppError(400, 'Bad Request', `Período inválido: to (${filters.to}) anterior a from (${filters.from}).`, {
      code: 'TRANSPORTE_AVERBACAO_PERIOD_INVALID'
    });
  }

  const { items, total, page, pageSize } = await listDeclarationsForAccount(integrationAccountId, filters);
  return { items: items.map(toDeclarationResource), total, page, pageSize };
}

// =============================================================================
// Worker — jobs `transporte.averbacao.declare|rectify|cancel|reconcile`. SEM parâmetro `gateway`
// (molde `runCiot*Job`): dependências por import direto (`createAverbacaoGateway`).
// =============================================================================

export type AverbacaoJobEntity = {
  jobId: string;
  entityId: string;
  correlationId: string | null;
  payload: LooseRecord;
};

export type AverbacaoJobResult = { outcome: string; patch: LooseRecord };

function requireJobField(payload: LooseRecord, field: string): string {
  return requireNonEmptyString(payload[field], `Job sem ${field}.`, 'TRANSPORTE_AVERBACAO_JOB_FIELD_REQUIRED');
}

async function logAverbacaoExchange(
  correlationId: string,
  declarationId: string,
  action: string,
  request: LooseRecord,
  response: LooseRecord
): Promise<void> {
  await insertAuditEntry({
    correlationId,
    entityType: 'insurance_declaration',
    entityId: declarationId,
    direction: 'outbound',
    component: 'averbacao-gateway',
    httpMethod: 'POST',
    endpoint: `averbacao:${action}`,
    httpStatus: null,
    latencyMs: null,
    sanitizedBody: request
  });
  await insertAuditEntry({
    correlationId,
    entityType: 'insurance_declaration',
    entityId: declarationId,
    direction: 'inbound',
    component: 'averbacao-gateway',
    httpMethod: 'POST',
    endpoint: `averbacao:${action}`,
    httpStatus: 200,
    latencyMs: null,
    sanitizedBody: response
  });
}

function alreadyTerminalError(declarationId: string, action: string): never {
  throw new AppError(
    409,
    'Conflict',
    `Averbação ${declarationId} já não está no estado esperado para "${action}" — resultado provavelmente já aplicado.`,
    { code: 'TRANSPORTE_AVERBACAO_ALREADY_TERMINAL' }
  );
}

async function requireDeclarationForJob(declarationId: string): Promise<InsuranceShipmentDeclaration> {
  const declaration = await findDeclarationByIdInternal(declarationId);
  if (!declaration) {
    throw new AppError(404, 'Not Found', `Averbação ${declarationId} não encontrada.`, { code: 'TRANSPORTE_AVERBACAO_NOT_FOUND' });
  }
  return declaration;
}

/**
 * `transporte.averbacao.declare` — chama a seguradora e aplica o desfecho. Rejeição é OUTCOME
 * (nunca exceção): marca `rejected` aqui mesmo. Resposta perdida propaga como erro e é interpretada
 * pelo side-effect terminal (`applyTransporteAverbacaoTerminalFailureSideEffect`).
 */
export async function runAverbacaoDeclareJob(job: AverbacaoJobEntity, deps: { gateway?: AverbacaoGateway } = {}): Promise<AverbacaoJobResult> {
  const declarationId = requireJobField(job.payload, 'declarationId');
  const correlationId = ensureCorrelationId(job.correlationId);

  const declaration = await requireDeclarationForJob(declarationId);
  const policy = await getPolicyById(declaration.policyId, declaration.integrationAccountId);
  if (!policy) {
    throw new AppError(404, 'Not Found', `Apólice ${declaration.policyId} da averbação ${declarationId} não encontrada.`, {
      code: 'TRANSPORT_INSURANCE_POLICY_NOT_FOUND'
    });
  }

  const gateway = deps.gateway ?? createAverbacaoGateway();
  const requestPayload = {
    correlationMarker: declaration.correlationMarker,
    policyType: policy.policyType,
    policyNumber: policy.policyNumber,
    cargoAmount: declaration.declaredCargoAmount,
    routeScope: declaration.routeScope,
    operationRef: declaration.operationId
  };
  const result = await gateway.declareShipment(requestPayload);
  await logAverbacaoExchange(correlationId, declarationId, 'declareShipment', requestPayload as unknown as LooseRecord, result as unknown as LooseRecord);

  if (result.outcome === 'rejected') {
    const reasonCode = String(result.raw.reasonCode ?? 'AVERBACAO_REJECTED');
    const rejected = await markDeclarationRejected(declarationId, { reasonCode });
    if (!rejected) return alreadyTerminalError(declarationId, 'declare');

    await insertDeclarationEvent({
      id: createPrefixedId('insdev'),
      declarationId,
      eventType: 'rejected',
      payload: { reasonCode, raw: result.raw },
      correlationId
    });

    return { outcome: 'transporte_averbacao_declare_rejected', patch: { declarationId, status: 'rejected', reasonCode } };
  }

  const completed = await completeDeclarationDeclared(declarationId, { providerDeclarationRef: result.declarationRef as string });
  if (!completed) return alreadyTerminalError(declarationId, 'declare');

  await insertDeclarationEvent({
    id: createPrefixedId('insdev'),
    declarationId,
    eventType: 'declared',
    payload: { providerDeclarationRef: result.declarationRef, premiumAmount: declaration.premiumAmount },
    correlationId
  });

  return { outcome: 'transporte_averbacao_declare_succeeded', patch: { declarationId, providerDeclarationRef: result.declarationRef } };
}

/** `transporte.averbacao.rectify` — o novo valor já está CONGELADO na linha (service); aqui só o dispatch + confirmação. */
export async function runAverbacaoRectifyJob(job: AverbacaoJobEntity, deps: { gateway?: AverbacaoGateway } = {}): Promise<AverbacaoJobResult> {
  const declarationId = requireJobField(job.payload, 'declarationId');
  const correlationId = ensureCorrelationId(job.correlationId);

  const declaration = await requireDeclarationForJob(declarationId);
  const gateway = deps.gateway ?? createAverbacaoGateway();
  const requestPayload = {
    correlationMarker: declaration.correlationMarker,
    cargoAmount: declaration.declaredCargoAmount,
    reason: (job.payload.reason as string | undefined) ?? null
  };
  const result = await gateway.rectifyShipment(requestPayload);
  await logAverbacaoExchange(correlationId, declarationId, 'rectifyShipment', requestPayload as unknown as LooseRecord, result as unknown as LooseRecord);

  const completed = await completeDeclarationRectified(declarationId);
  if (!completed) return alreadyTerminalError(declarationId, 'rectify');

  await insertDeclarationEvent({
    id: createPrefixedId('insdev'),
    declarationId,
    eventType: 'rectified',
    payload: { declaredCargoAmount: declaration.declaredCargoAmount, premiumAmount: declaration.premiumAmount },
    correlationId
  });

  return { outcome: 'transporte_averbacao_rectify_succeeded', patch: { declarationId, status: 'declared' } };
}

export async function runAverbacaoCancelJob(job: AverbacaoJobEntity, deps: { gateway?: AverbacaoGateway } = {}): Promise<AverbacaoJobResult> {
  const declarationId = requireJobField(job.payload, 'declarationId');
  const correlationId = ensureCorrelationId(job.correlationId);

  const declaration = await requireDeclarationForJob(declarationId);
  const gateway = deps.gateway ?? createAverbacaoGateway();
  const requestPayload = {
    correlationMarker: declaration.correlationMarker,
    reason: (job.payload.reason as string | undefined) ?? null
  };
  const result = await gateway.cancelShipment(requestPayload);
  await logAverbacaoExchange(correlationId, declarationId, 'cancelShipment', requestPayload as unknown as LooseRecord, result as unknown as LooseRecord);

  const completed = await completeDeclarationCancelled(declarationId);
  if (!completed) return alreadyTerminalError(declarationId, 'cancel');

  await insertDeclarationEvent({
    id: createPrefixedId('insdev'),
    declarationId,
    eventType: 'cancelled',
    payload: { reason: requestPayload.reason },
    correlationId
  });

  return { outcome: 'transporte_averbacao_cancel_succeeded', patch: { declarationId, status: 'cancelled' } };
}

/**
 * `transporte.averbacao.reconcile` — pergunta à seguradora pelo marcador de uma linha
 * `*_unconfirmed` (DL-102). `found`: sincroniza o status local com o do provedor.
 * `not-found-after-polling` com `providerDeclarationRef` nulo: rejeita com
 * `AVERBACAO_DECLARATION_NOT_FOUND_REMOTE` — a chave viva é liberada para um novo `averbar`.
 * `error`: propaga (retry da fila) mantendo `*_unconfirmed`.
 */
export async function runAverbacaoReconcileJob(
  job: AverbacaoJobEntity,
  deps: Partial<AverbacaoReconcilerDeps> & { gateway?: AverbacaoGateway } = {}
): Promise<AverbacaoJobResult> {
  const declarationId = requireJobField(job.payload, 'declarationId');
  const correlationMarker = requireJobField(job.payload, 'correlationMarker');
  const correlationId = ensureCorrelationId(job.correlationId);

  const declaration = await findDeclarationByIdInternal(declarationId);
  if (!declaration || !declaration.status.endsWith('_unconfirmed')) {
    // Já resolvido por um caminho concorrente (sweep + reconcile explícito, por exemplo) — NO-OP.
    return { outcome: 'transporte_averbacao_reconcile_noop', patch: { declarationId } };
  }

  const gateway = deps.gateway ?? createAverbacaoGateway();
  const result = await reconcileAverbacaoDeclaration(
    { queryByMarker: deps.queryByMarker ?? gateway.queryByMarker, sleep: deps.sleep, delaysMs: deps.delaysMs },
    { declarationId, correlationMarker }
  );

  if (result.outcome === 'error') {
    // Propaga — INCONCLUSIVO nunca é "não existe". A fila reencaminha (retry/backoff normais).
    throw result.error;
  }

  if (result.outcome === 'not-found-after-polling') {
    if (declaration.providerDeclarationRef != null) {
      // Defensivo: já tínhamos um ref local (declaração confirmada antes) — não há como "não
      // encontrar" algo já confirmado. Mantém unconfirmed para a próxima varredura em vez de
      // destruir um registro que sabemos que existiu.
      throw new AppError(502, 'Bad Gateway', `Reconciliação inconsistente da averbação ${declarationId}: marcador não encontrado apesar de providerDeclarationRef local já confirmado.`, {
        code: 'TRANSPORTE_AVERBACAO_RECONCILE_INCONSISTENT'
      });
    }

    const rejected = await markDeclarationReconcileNotFoundRejected(declarationId, { reasonCode: 'AVERBACAO_DECLARATION_NOT_FOUND_REMOTE' });
    if (!rejected) return { outcome: 'transporte_averbacao_reconcile_noop', patch: { declarationId } };

    await insertDeclarationEvent({
      id: createPrefixedId('insdev'),
      declarationId,
      eventType: 'reconciled',
      payload: { result: 'not_found', reasonCode: 'AVERBACAO_DECLARATION_NOT_FOUND_REMOTE', attempts: result.attempts },
      correlationId
    });

    return { outcome: 'transporte_averbacao_reconcile_not_found', patch: { declarationId, status: 'rejected' } };
  }

  const toStatus = result.match.externalStatus === 'CANCELLED' ? 'cancelled' : 'declared';
  const completed = await completeDeclarationReconcileFound(declarationId, {
    toStatus,
    providerDeclarationRef: result.match.declarationRef
  });
  if (!completed) return { outcome: 'transporte_averbacao_reconcile_noop', patch: { declarationId } };

  await insertDeclarationEvent({
    id: createPrefixedId('insdev'),
    declarationId,
    eventType: 'reconciled',
    payload: { result: 'found', toStatus, providerDeclarationRef: result.match.declarationRef, attempts: result.attempts },
    correlationId
  });

  return { outcome: 'transporte_averbacao_reconcile_found', patch: { declarationId, status: toStatus, providerDeclarationRef: result.match.declarationRef } };
}

// =============================================================================
// Terminal failure — DL-102: resposta perdida DEPOIS do dispatch NUNCA vira `rejected`.
// Chamado pelos DOIS pontos de `job-runner.ts` (`handleDlqTransition`/`handleFailedTransition`),
// molde `applyTransporteCiotTerminalFailureSideEffect`. Diferença deliberada do CIOT: aqui NÃO
// existe rejeição-por-exceção (a recusa da seguradora é OUTCOME do gateway, aplicada no próprio
// job) — todo terminal que chega aqui é indeterminação, exceto a flag desligada (nunca dispatchou).
// =============================================================================

const AVERBACAO_MUTATING_OPERATIONS = new Set([DECLARE_OPERATION, RECTIFY_OPERATION, CANCEL_OPERATION]);

export type AverbacaoTerminalFailureJob = {
  jobId: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload: LooseRecord;
  correlationId?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
};

export type AverbacaoTerminalFailure = {
  action?: string;
  dlqReason?: string;
  patch?: { lastErrorCode?: string | null; lastErrorMessage?: string | null };
};

export async function applyTransporteAverbacaoTerminalFailureSideEffect(
  job: AverbacaoTerminalFailureJob,
  terminalFailure: AverbacaoTerminalFailure = {},
  error: unknown = null
): Promise<unknown> {
  if (!AVERBACAO_MUTATING_OPERATIONS.has(job.operation)) return null;

  const terminalAction = String(terminalFailure.action || '').toLowerCase();
  if (!['failed', 'dlq', 'cancelled'].includes(terminalAction)) return null;

  const declarationId = toTrimmedString(job.payload?.declarationId);
  const operationId = toTrimmedString(job.payload?.operationId);
  const integrationAccountId = toTrimmedString(job.payload?.integrationAccountId);
  const correlationMarker = toTrimmedString(job.payload?.correlationMarker);
  if (!declarationId) return null; // falhou antes de o payload carregar o id — nada a reconciliar

  const lastErrorCode = terminalFailure.patch?.lastErrorCode || job.lastErrorCode || null;
  const errorCode = (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string')
    ? (error as { code: string }).code
    : lastErrorCode;

  // Flag desligada = o gateway RECUSOU CRIAR a instância — nada foi dispatchado, não há o que
  // reconciliar. Uma declaração `declaring` vira `rejected` (terminal honesto, libera a chave
  // viva); rectify/cancel em trânsito ficam para a reconciliação quando o modo religar.
  if (errorCode === 'AVERBACAO_GATEWAY_DISABLED' && job.operation === DECLARE_OPERATION) {
    const rejected = await markDeclarationRejected(declarationId, { reasonCode: 'AVERBACAO_GATEWAY_DISABLED' });
    if (!rejected) return null;

    return insertDeclarationEvent({
      id: createPrefixedId('insdev'),
      declarationId,
      eventType: 'rejected',
      payload: { reasonCode: 'AVERBACAO_GATEWAY_DISABLED' },
      correlationId: job.correlationId || createPrefixedId('corr')
    });
  }

  // Qualquer outro terminal (timeout/rede/DLQ por tentativas esgotadas) DEPOIS do dispatch — DL-102:
  // "não perguntei" nunca é "falhou". Marca `*_unconfirmed` e tenta enfileirar o reconciliador — se
  // isso falhar, a varredura periódica (`enqueueTransporteAverbacaoReconcileSweepIfNeeded`) pega na
  // próxima janela.
  const unconfirmed = await markDeclarationUnconfirmed(declarationId, { lastErrorCode: errorCode });
  if (!unconfirmed) return null; // já não estava em trânsito — nada a fazer

  await insertDeclarationEvent({
    id: createPrefixedId('insdev'),
    declarationId,
    eventType: 'declare_unconfirmed',
    payload: { lastErrorCode: errorCode, operation: job.operation, status: unconfirmed.status },
    correlationId: job.correlationId || createPrefixedId('corr')
  });

  if (operationId && integrationAccountId && correlationMarker) {
    try {
      const retryConfig = getRetryConfig(RECONCILE_OPERATION);
      await insertJobDeduplicated({
        jobId: createPrefixedId('job'),
        commandId: createPrefixedId('cmd'),
        entityType: 'insurance_declaration',
        entityId: declarationId,
        operation: RECONCILE_OPERATION,
        payload: { declarationId, operationId, integrationAccountId, correlationMarker },
        status: 'queued',
        maxAttempts: retryConfig.maxAttempts,
        correlationId: job.correlationId || createPrefixedId('corr'),
        priority: calculateJobPriority(RECONCILE_OPERATION),
        retryStrategy: retryConfig.strategy,
        baseDelayMs: retryConfig.baseDelayMs,
        maxDelayMs: retryConfig.maxDelayMs,
        tags: extractJobTags({ operation: RECONCILE_OPERATION, entityType: 'insurance_declaration', status: 'queued' })
      });
    } catch (enqueueError: unknown) {
      // Best-effort — a varredura periódica é a rede de segurança para este enfileiramento.
      console.warn(`[transport-averbacao-service] falha ao enfileirar reconciliação da averbação ${declarationId}: ${enqueueError instanceof Error ? enqueueError.message : String(enqueueError)}`);
    }
  }

  return unconfirmed;
}
