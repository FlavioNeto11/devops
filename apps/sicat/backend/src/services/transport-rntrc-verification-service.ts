/**
 * Verificação de regularidade RNTRC — PR-C1, DL-103.
 *
 * Primeiro gateway externo REAL e primeiro job type assíncrono (202) da vertical Transporte.
 * Estratégias:
 *   - `manual` — evidência DECLARADA por um usuário; SÍNCRONA (200), grava direto, sem fila.
 *   - `open_data` — integração real com o Portal de Dados Abertos da ANTT
 *     (`gateways/antt-rntrc-gateway.ts`); ASSÍNCRONA (202), no molde `dmr-service.enqueueDmrSubmit`.
 *   - `antt` — consulta credenciada; interface reservada, recusada com 400 nesta fase.
 *
 * Distinção de relatório (guia do programa, pendência P4): dado aberto é CACHE INFORMATIVO, nunca
 * prova de regularidade — `rule-evaluators.ts` (TR-RNTRC-001) é quem compõe a frase "active
 * (open_data, dataDate=...)" a partir de `resultStatus`/`dataReferenceDate`; este service só
 * persiste os fatos brutos.
 *
 * Fronteira `route → service → repository → job → worker → gateway` (backend/AGENTS.md §2):
 * `requestRntrcVerificationService` é chamado pela rota; `runRntrcVerificationJob` é chamado pelo
 * worker (`workers/operation-handlers.ts`, handler SEM parâmetro `gateway` — dependências por
 * import direto, molde `handleWhatsAppInboundMessage`). `patchJobPayload` entra por INJEÇÃO (não
 * import direto de `workers/job-payload-patch.ts`), mesmo molde de `whatsapp-turn-service.ts` —
 * mantém `services/` sem depender de `workers/`.
 */

import { withTransaction } from '../db/pool.js';
import { AppError } from '../lib/problem.js';
import { createPrefixedId } from '../lib/ids.js';
import { buildCommandAccepted } from '../lib/command-response.js';
import { calculateJobPriority, extractJobTags, getRetryConfig } from '../lib/retry.js';
import { config } from '../lib/config.js';
import { insertJobDeduplicated } from '../repositories/job-repo.js';
import { insertAuditEntry } from '../repositories/audit-repo.js';
import { getIdempotentResponse, rememberIdempotentResponse } from './idempotency-service.js';
import {
  getPartyById,
  updatePartyById,
  type PartyUpdatePatch
} from '../repositories/transport-party-repo.js';
import {
  completeVerificationSucceeded,
  insertPendingRntrcVerification,
  insertSucceededRntrcVerification,
  listRntrcVerificationsForParty,
  type ListRntrcVerificationsFilters
} from '../repositories/rntrc-verification-repo.js';
import { validateRntrcCategory } from '../lib/validators/transport-party-validator.js';
import type { RntrcStatus } from '../lib/transport/transport-party-types.js';
import {
  RNTRC_VERIFICATION_RESULT_STATUSES,
  type RntrcVerification,
  type RntrcVerificationResultCategory,
  type RntrcVerificationResultStatus
} from '../lib/transport/rntrc-verification-types.js';
import {
  createAnttRntrcGateway,
  type RntrcGatewayExchange,
  type RntrcLookupResult
} from '../gateways/antt-rntrc-gateway.js';

type LooseRecord = Record<string, unknown>;
type HeaderMap = Record<string, string | undefined>;

const OPERATION = 'transporte.rntrc.verify';

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
    'RNTRC_VERIFICATION_FIELD_REQUIRED'
  );
}

function ensureCorrelationId(correlationId: string | null): string {
  return correlationId || createPrefixedId('corr');
}

function partyNotFound(partyId: string): AppError {
  return new AppError(404, 'Not Found', `Transportador ${partyId} não encontrado.`, {
    code: 'TRANSPORT_PARTY_NOT_FOUND'
  });
}

/** `not_found`/`unknown` (dado aberto sem confirmação clara) mapeiam para `unknown` no cadastro — nunca inventa um dos quatro status "provados". */
function mapResultStatusToPartyStatus(status: RntrcVerificationResultStatus): RntrcStatus {
  if (status === 'not_found' || status === 'unknown') return 'unknown';
  return status;
}

function requireResultStatus(value: unknown): RntrcVerificationResultStatus {
  if (typeof value === 'string' && (RNTRC_VERIFICATION_RESULT_STATUSES as readonly string[]).includes(value)) {
    return value as RntrcVerificationResultStatus;
  }
  throw new AppError(
    400,
    'Bad Request',
    `manualEvidence.resultStatus inválido: esperado um de ${RNTRC_VERIFICATION_RESULT_STATUSES.join(', ')} (recebido "${String(value)}").`,
    { code: 'RNTRC_VERIFICATION_RESULT_STATUS_INVALID' }
  );
}

// =============================================================================
// Auditoria — CADA troca externa com a ANTT vira 2 linhas (outbound + inbound), no molde de
// `logExchange` (workers/operation-handlers.ts), com component próprio.
// =============================================================================

async function logRntrcExchange(correlationId: string, partyId: string, exchange: RntrcGatewayExchange): Promise<void> {
  await insertAuditEntry({
    correlationId,
    entityType: 'transport_party',
    entityId: partyId,
    direction: 'outbound',
    component: 'antt-rntrc-gateway',
    httpMethod: exchange.request.httpMethod,
    endpoint: exchange.request.endpoint,
    httpStatus: null,
    latencyMs: null,
    sanitizedHeaders: exchange.request.sanitizedHeaders,
    sanitizedBody: exchange.request.sanitizedBody
  });

  await insertAuditEntry({
    correlationId,
    entityType: 'transport_party',
    entityId: partyId,
    direction: 'inbound',
    component: 'antt-rntrc-gateway',
    httpMethod: exchange.response.httpMethod,
    endpoint: exchange.response.endpoint,
    httpStatus: exchange.response.httpStatus,
    latencyMs: exchange.response.latencyMs,
    sanitizedHeaders: exchange.response.sanitizedHeaders,
    sanitizedBody: exchange.response.sanitizedBody
  });
}

// =============================================================================
// DTO
// =============================================================================

type VerificationResource = {
  id: string;
  partyId: string;
  rntrcNumber: string | null;
  strategy: string;
  requestedStatus: string;
  resultStatus: string | null;
  resultCategory: string | null;
  dataReferenceDate: string | null;
  evidenceSource: string | null;
  verifiedBy: string | null;
  createdAt: string;
  completedAt: string | null;
};

function toVerificationResource(record: RntrcVerification): VerificationResource {
  return {
    id: record.id,
    partyId: record.partyId,
    rntrcNumber: record.rntrcNumber,
    strategy: record.strategy,
    requestedStatus: record.requestedStatus,
    resultStatus: record.resultStatus,
    resultCategory: record.resultCategory,
    dataReferenceDate: record.dataReferenceDate,
    evidenceSource: record.evidenceSource,
    verifiedBy: record.verifiedBy,
    createdAt: record.createdAt,
    completedAt: record.completedAt
  };
}

// =============================================================================
// POST /v1/transporte/transportadores/{partyId}/verificar-rntrc
// =============================================================================

type RequestVerificationContext = { correlationId: string | null; evaluatedBy: string | null };

export async function requestRntrcVerificationService(
  partyId: string,
  body: LooseRecord,
  headers: HeaderMap,
  ctx: RequestVerificationContext
): Promise<LooseRecord> {
  const integrationAccountId = requireIntegrationAccountId(body);
  const party = await getPartyById(partyId, integrationAccountId);
  if (!party) throw partyNotFound(partyId);

  const strategy = body.strategy;
  const correlationId = ensureCorrelationId(ctx.correlationId);

  if (strategy === 'manual') {
    return runManualVerification(party, body, ctx.evaluatedBy, correlationId);
  }

  if (strategy === 'open_data') {
    return enqueueOpenDataVerification(party, headers, correlationId);
  }

  if (strategy === 'antt') {
    throw new AppError(
      400,
      'Bad Request',
      'strategy "antt" (consulta credenciada) ainda não está implementada nesta fase — interface reservada para o futuro.',
      { code: 'RNTRC_VERIFICATION_STRATEGY_NOT_IMPLEMENTED' }
    );
  }

  throw new AppError(
    400,
    'Bad Request',
    `strategy inválida: esperado "open_data" ou "manual" (recebido "${String(strategy)}").`,
    { code: 'RNTRC_VERIFICATION_STRATEGY_INVALID' }
  );
}

async function runManualVerification(
  party: { id: string; integrationAccountId: string; version: number; rntrcNumber: string | null },
  body: LooseRecord,
  evaluatedBy: string | null,
  correlationId: string
): Promise<VerificationResource> {
  const rawEvidence = body.manualEvidence;
  if (!rawEvidence || typeof rawEvidence !== 'object' || Array.isArray(rawEvidence)) {
    throw new AppError(400, 'Bad Request', 'manualEvidence é obrigatório para strategy "manual".', {
      code: 'RNTRC_VERIFICATION_MANUAL_EVIDENCE_REQUIRED'
    });
  }

  const evidenceInput = rawEvidence as LooseRecord;
  const resultStatus = requireResultStatus(evidenceInput.resultStatus);
  const resultCategory = validateRntrcCategory(evidenceInput.resultCategory) as RntrcVerificationResultCategory | null;
  const rntrcNumberOverride = toTrimmedString(evidenceInput.rntrcNumber);
  const notes = toTrimmedString(evidenceInput.notes);

  // LGPD: evidência mínima — status/categoria/número declarados + nota curta (cap defensivo), nunca
  // um blob livre do body inteiro.
  const evidence: LooseRecord = {
    resultStatus,
    resultCategory,
    rntrcNumber: rntrcNumberOverride ?? party.rntrcNumber ?? null
  };
  if (notes) evidence.notes = notes.slice(0, 500);

  const id = createPrefixedId('rntrcver');

  const verification = await withTransaction(async (client) => {
    const inserted = await insertSucceededRntrcVerification(
      {
        id,
        integrationAccountId: party.integrationAccountId,
        partyId: party.id,
        rntrcNumber: rntrcNumberOverride ?? party.rntrcNumber,
        strategy: 'manual',
        resultStatus,
        resultCategory,
        dataReferenceDate: null,
        evidence,
        evidenceSource: 'manual_declaration',
        verifiedBy: evaluatedBy,
        correlationId
      },
      client
    );

    const patch: PartyUpdatePatch = {
      rntrcStatus: mapResultStatusToPartyStatus(resultStatus),
      rntrcVerifiedAt: inserted.completedAt ?? new Date().toISOString(),
      rntrcVerificationSource: 'manual'
    };
    if (resultCategory) patch.rntrcCategory = resultCategory;

    await updatePartyById(party.id, party.integrationAccountId, party.version, patch, client);
    return inserted;
  });

  return toVerificationResource(verification);
}

async function enqueueOpenDataVerification(
  party: { id: string; integrationAccountId: string },
  headers: HeaderMap,
  correlationId: string
): Promise<LooseRecord> {
  const idempotencyKey = headers['idempotency-key'];
  const reused = await getIdempotentResponse(`${OPERATION}:${party.id}`, idempotencyKey);
  if (reused) return reused;

  const retryConfig = getRetryConfig(OPERATION);
  const priority = calculateJobPriority(OPERATION);
  const jobId = createPrefixedId('job');
  const commandId = createPrefixedId('cmd');

  const enqueued = await insertJobDeduplicated({
    jobId,
    commandId,
    entityType: 'transport_party',
    entityId: party.id,
    operation: OPERATION,
    payload: {
      partyId: party.id,
      integrationAccountId: party.integrationAccountId,
      strategy: 'open_data'
    },
    status: 'queued',
    maxAttempts: retryConfig.maxAttempts,
    correlationId,
    idempotencyKey,
    priority,
    retryStrategy: retryConfig.strategy,
    baseDelayMs: retryConfig.baseDelayMs,
    maxDelayMs: retryConfig.maxDelayMs,
    tags: extractJobTags({ operation: OPERATION, entityType: 'transport_party', status: 'queued' })
  });

  if (!enqueued?.job) {
    throw new AppError(500, 'Internal Server Error', `Falha ao enfileirar verificação RNTRC do transportador ${party.id}.`, {
      code: 'RNTRC_VERIFICATION_ENQUEUE_FAILED'
    });
  }

  const response = buildCommandAccepted({
    commandId: enqueued.job.commandId || commandId,
    jobId: enqueued.job.jobId,
    correlationId,
    entityType: 'transport_party',
    entityId: party.id,
    operation: OPERATION
  });

  await rememberIdempotentResponse({
    operation: `${OPERATION}:${party.id}`,
    idempotencyKey,
    entityType: 'transport_party',
    entityId: party.id,
    response: response as unknown as Record<string, unknown>
  });

  return response;
}

// =============================================================================
// GET /v1/transporte/transportadores/{partyId}/verificacoes-rntrc
// =============================================================================

export async function listRntrcVerificationsService(
  partyId: string,
  query: LooseRecord
): Promise<{ items: VerificationResource[]; total: number; page: number; pageSize: number }> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const party = await getPartyById(partyId, integrationAccountId);
  if (!party) throw partyNotFound(partyId);

  const filters: ListRntrcVerificationsFilters = {
    page: query.page !== undefined ? Number(query.page) : undefined,
    pageSize: query.pageSize !== undefined ? Number(query.pageSize) : undefined
  };

  const { items, total, page, pageSize } = await listRntrcVerificationsForParty(partyId, integrationAccountId, filters);
  return { items: items.map(toVerificationResource), total, page, pageSize };
}

// =============================================================================
// Worker — job `transporte.rntrc.verify` (open_data). SEM parâmetro `gateway`: dependências por
// import direto (`createAnttRntrcGateway`), molde `handleWhatsAppInboundMessage`.
// =============================================================================

export type RntrcVerifyJobEntity = {
  jobId: string;
  entityId: string;
  correlationId: string | null;
  claimedBy?: string | null;
  payload: LooseRecord;
};

export type RntrcVerifyJobDependencies = {
  patchJobPayload: (job: { jobId: string; claimedBy?: string | null; payload: LooseRecord }, patch: LooseRecord) => Promise<void>;
};

export type RntrcVerifyJobResult = {
  outcome: string;
  patch: LooseRecord;
};

function buildJobEvidence(lookup: RntrcLookupResult): LooseRecord {
  return {
    found: lookup.found,
    source: lookup.source,
    ...lookup.raw
  };
}

/**
 * Corpo do job `transporte.rntrc.verify` — chamado por `handleTransporteRntrcVerify`
 * (`workers/operation-handlers.ts`). Fluxo: cria (ou reaproveita, em retry) a linha `pending` →
 * chama o gateway → audita CADA troca externa → grava resultado + atualiza `transport_parties`
 * NUMA transação → devolve `{ outcome, patch }` para `finishJob`.
 *
 * Falha (rede/timeout/erro do gateway) PROPAGA — não é capturada aqui. O terminal (DLQ/failed)
 * é tratado por `applyTransporteRntrcVerifyTerminalFailureSideEffect`
 * (`workers/operation-handlers.ts`, chamado por `workers/job-runner.ts`), que marca a linha
 * `pending` como `failed` SEM tocar o party — exatamente o par simétrico deste handler.
 */
export async function runRntrcVerificationJob(
  job: RntrcVerifyJobEntity,
  deps: RntrcVerifyJobDependencies
): Promise<RntrcVerifyJobResult> {
  const partyId = requireNonEmptyString(job.payload.partyId, `Job ${job.jobId} sem partyId.`, 'RNTRC_VERIFICATION_FIELD_REQUIRED');
  const integrationAccountId = requireNonEmptyString(
    job.payload.integrationAccountId,
    `Job ${job.jobId} sem integrationAccountId.`,
    'RNTRC_VERIFICATION_FIELD_REQUIRED'
  );
  const correlationId = ensureCorrelationId(job.correlationId);

  let verificationId = toTrimmedString(job.payload.verificationId);
  if (!verificationId) {
    const pending = await insertPendingRntrcVerification({
      id: createPrefixedId('rntrcver'),
      integrationAccountId,
      partyId,
      strategy: 'open_data',
      jobId: job.jobId,
      correlationId
    });
    verificationId = pending.id;
    await deps.patchJobPayload({ jobId: job.jobId, claimedBy: job.claimedBy ?? null, payload: job.payload }, { verificationId });
  }

  const party = await getPartyById(partyId, integrationAccountId);
  if (!party) {
    // Party sumiu entre o enqueue e a execução — não é transitório, novas tentativas não ajudam.
    throw new AppError(404, 'Not Found', `Transportador ${partyId} não encontrado para concluir a verificação RNTRC.`, {
      code: 'TRANSPORT_PARTY_NOT_FOUND'
    });
  }

  const gateway = createAnttRntrcGateway({ mode: config.rntrcGatewayMode });
  const lookup = await gateway.lookupCarrier({ document: party.documentNumber, rntrcNumber: party.rntrcNumber });

  for (const exchange of lookup.exchanges) {
    await logRntrcExchange(correlationId, partyId, exchange);
  }

  const evidence = buildJobEvidence(lookup);

  const completedVerificationId = verificationId;
  const updatedParty = await withTransaction(async (client) => {
    const completed = await completeVerificationSucceeded(
      completedVerificationId,
      {
        rntrcNumber: lookup.rntrcNumber,
        resultStatus: lookup.status,
        resultCategory: lookup.category,
        dataReferenceDate: lookup.dataReferenceDate,
        evidence,
        evidenceSource: 'open_data'
      },
      client
    );

    if (!completed) {
      // Linha já não está `pending` — retry tardio após um commit anterior bem-sucedido (job não
      // chegou a `finishJob` por queda do processo). Não repete a atualização do party.
      throw new AppError(
        409,
        'Conflict',
        `Verificação RNTRC ${completedVerificationId} já não está pendente — resultado provavelmente já aplicado.`,
        { code: 'RNTRC_VERIFICATION_ALREADY_TERMINAL' }
      );
    }

    const currentParty = await getPartyById(partyId, integrationAccountId, client);
    if (!currentParty) {
      throw new AppError(404, 'Not Found', `Transportador ${partyId} não encontrado para concluir a verificação RNTRC.`, {
        code: 'TRANSPORT_PARTY_NOT_FOUND'
      });
    }

    const patch: PartyUpdatePatch = {
      rntrcStatus: mapResultStatusToPartyStatus(lookup.status),
      rntrcVerifiedAt: completed.completedAt ?? new Date().toISOString(),
      rntrcVerificationSource: 'open_data'
    };
    if (lookup.category) patch.rntrcCategory = lookup.category;

    return updatePartyById(partyId, integrationAccountId, currentParty.version, patch, client);
  });

  return {
    outcome: lookup.found ? 'rntrc_verification_succeeded' : 'rntrc_verification_not_found',
    patch: {
      verificationId: completedVerificationId,
      resultStatus: lookup.status,
      resultCategory: lookup.category,
      dataReferenceDate: lookup.dataReferenceDate,
      partyRntrcStatus: updatedParty.rntrcStatus
    }
  };
}
