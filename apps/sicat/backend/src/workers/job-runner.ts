import { config } from '../lib/config.js';
import { sleep } from '../lib/time.js';
import { claimJobs, updateJobIfOwned, moveJobToDLQ, requeueStaleRunningJobs, heartbeatJobClaim, insertJobDeduplicated } from '../repositories/job-repo.js';
import { listIntegrationAccountIdsWithUnconfirmedSubmits } from '../repositories/manifest-repo.js';
import { createPrefixedId } from '../lib/ids.js';
import type { GatewaySearchManifestsArgs } from '../services/manifest-submit-reconciler.js';
import {
  registerWorker,
  sendWorkerHeartbeat,
  stopWorker,
  logSystemEvent
} from '../repositories/health-repo.js';
import { createCetesbGateway } from '../gateways/cetesb-gateway.js';
import {
  processJob,
  applyAsyncOperationTerminalFailureSideEffect,
  applyConversationArtifactTerminalFailureSideEffect,
  applyManifestCancelTerminalFailureSideEffect,
  applyManifestSubmitTerminalFailureSideEffect,
  applyTransporteRntrcVerifyTerminalFailureSideEffect,
  applyTransporteCiotTerminalFailureSideEffect,
  applyTransporteVpoTerminalFailureSideEffect,
  applyTransporteDfeIssuanceTerminalFailureSideEffect,
  applyTransporteAverbacaoTerminalFailureSideEffect,
  applyWhatsAppInboundTerminalFailureSideEffect
} from './operation-handlers.js';
import { listUnconfirmedCiotOperationsForReconciliation } from '../repositories/ciot-repo.js';
import { listUnconfirmedVpoAllocationsForReconciliation } from '../repositories/vpo-repo.js';
import { listUnconfirmedDfeIssuancesForReconciliation } from '../repositories/dfe-issuance-repo.js';
import { listUnconfirmedDeclarationsForReconciliation } from '../repositories/insurance-declaration-repo.js';
import { prepareBillingPeriodsForSweep } from '../services/transport-insurance-billing-service.js';
import { previousPeriodMonth } from '../lib/transport/insurance-billing-types.js';
import { enqueueRegulatoryWatchSweep } from '../services/transport-regulatory-watch-service.js';
import { calculateNextRetry, shouldMoveToDLQ, extractJobTags, isRetryableJobError, getJobErrorCode } from '../lib/retry.js';
import { resolveWorkerLane } from '../lib/job-lanes.js';

// O gateway vive em JS (DL-093) e o TS infere os parâmetros destructurados a
// partir dos DEFAULTS (`= null`), o que produz assinaturas como
// `integrationAccountId?: null`. `manifest-service.ts` resolve isso do mesmo
// jeito: declara o contrato esperado e converte UMA vez, na fronteira.
type WorkerCetesbGateway = Parameters<typeof processJob>[1] & {
  searchManifests: (options: GatewaySearchManifestsArgs) => Promise<unknown>;
};

const gateway = createCetesbGateway() as unknown as WorkerCetesbGateway;

// Único ponto do processo que dá ao reconciliador o meio de perguntar à CETESB.
// A dependência é INJETADA (e não importada dentro do handler) justamente para
// que nenhum teste consiga acionar a CETESB real sem passar por aqui.
const submitReconcileDeps = {
  searchManifests: (args: GatewaySearchManifestsArgs) => gateway.searchManifests(args)
};

/**
 * Superfície de E/S do laço do worker. Existe para que o teste possa dirigir uma fila em memória com
 * relógio virtual: o defeito que este seam cobre (lote reivindicado de uma vez × heartbeat por job)
 * só aparece na INTERAÇÃO entre claim, heartbeat e varredura de stale — nenhuma das três isolada.
 */
type JobRunnerDependencies = {
  claimJobs: typeof claimJobs;
  heartbeatJobClaim: typeof heartbeatJobClaim;
  requeueStaleRunningJobs: typeof requeueStaleRunningJobs;
  updateJobIfOwned: typeof updateJobIfOwned;
  moveJobToDLQ: typeof moveJobToDLQ;
  processJob: typeof processJob;
  logSystemEvent: typeof logSystemEvent;
};

const defaultDependencies: JobRunnerDependencies = {
  claimJobs,
  heartbeatJobClaim,
  requeueStaleRunningJobs,
  updateJobIfOwned,
  moveJobToDLQ,
  processJob,
  logSystemEvent
};

let dependencies: JobRunnerDependencies = defaultDependencies;

/** Seam de teste. Os doubles são fontes de dado e espiões de argumento — nunca lógica de decisão. */
export function setJobRunnerDependenciesForTests(overrides: Partial<JobRunnerDependencies> | null): void {
  dependencies = overrides ? { ...defaultDependencies, ...overrides } : defaultDependencies;
}

type JobEntity = {
  jobId: string;
  commandId: string | null;
  entityType: string;
  entityId: string;
  operation: string;
  status: 'queued' | 'running' | 'retry_wait' | 'failed' | 'succeeded' | 'dlq' | 'cancelled';
  attempts: number;
  maxAttempts: number;
  retryStrategy: string;
  baseDelayMs: number;
  maxDelayMs: number;
  payload: Record<string, unknown> | null;
  retryDelays: unknown[];
  correlationId: string | null;
  claimedBy: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  dlqReason: string | null;
};

type WorkerStats = {
  totalJobsClaimed: number;
  totalJobsSucceeded: number;
  totalJobsFailed: number;
  totalJobsDLQ: number;
  jobDurations: number[];
  lastJobClaimedAt: Date | null;
  lastJobCompletedAt: Date | null;
};

type FailureTransition =
  | { action: 'dlq'; dlqReason: string }
  | { action: 'failed' | 'retry_wait'; delayMs?: number; patch: Record<string, unknown> };

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  if (typeof error === 'string') return error;
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return String(error);
  }
  return '';
}

function isOwnershipError(error: unknown): error is { code: string; message: string } {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'JOB_OWNERSHIP_LOST');
}

function hasRemoteBody(error: unknown): error is { extras: { remoteBody: unknown } } {
  return Boolean(
    error
    && typeof error === 'object'
    && 'extras' in error
    && (error as { extras?: unknown }).extras
    && typeof (error as { extras?: unknown }).extras === 'object'
    && 'remoteBody' in ((error as { extras: { remoteBody?: unknown } }).extras)
  );
}

// Worker stats tracking
let workerStats: WorkerStats = {
  totalJobsClaimed: 0,
  totalJobsSucceeded: 0,
  totalJobsFailed: 0,
  totalJobsDLQ: 0,
  jobDurations: [],
  lastJobClaimedAt: null,
  lastJobCompletedAt: null
};

function updateWorkerStats(event: 'claimed' | 'succeeded' | 'failed' | 'dlq', duration: number | null = null) {
  switch (event) {
    case 'claimed':
      workerStats.totalJobsClaimed++;
      workerStats.lastJobClaimedAt = new Date();
      break;
    case 'succeeded':
      workerStats.totalJobsSucceeded++;
      workerStats.lastJobCompletedAt = new Date();
      if (duration) workerStats.jobDurations.push(duration);
      break;
    case 'failed':
      workerStats.totalJobsFailed++;
      workerStats.lastJobCompletedAt = new Date();
      if (duration) workerStats.jobDurations.push(duration);
      break;
    case 'dlq':
      workerStats.totalJobsDLQ++;
      workerStats.lastJobCompletedAt = new Date();
      break;
  }

  // Manter apenas últimas 100 durações para cálculo de média
  if (workerStats.jobDurations.length > 100) {
    workerStats.jobDurations = workerStats.jobDurations.slice(-100);
  }
}

function getWorkerStatsForHeartbeat() {
  const avgDuration = workerStats.jobDurations.length > 0
    ? Math.round(workerStats.jobDurations.reduce((a, b) => a + b, 0) / workerStats.jobDurations.length)
    : null;

  return {
    totalJobsClaimed: workerStats.totalJobsClaimed,
    totalJobsSucceeded: workerStats.totalJobsSucceeded,
    totalJobsFailed: workerStats.totalJobsFailed,
    totalJobsDLQ: workerStats.totalJobsDLQ,
    avgJobDurationMs: avgDuration,
    lastJobClaimedAt: workerStats.lastJobClaimedAt,
    lastJobCompletedAt: workerStats.lastJobCompletedAt
  };
}

export function resolveFailureTransition(job: JobEntity, error: unknown, executionTimeMs: number, now = new Date()): FailureTransition {
  const retryable = isRetryableJobError(error);
  const errorCode = getJobErrorCode(error);
  const errorMessage = getErrorMessage(error) || 'Unhandled worker error';

  if (!retryable) {
    return {
      action: 'failed',
      patch: {
        status: 'failed',
        attempts: job.attempts,
        finishedAt: now.toISOString(),
        lastErrorCode: errorCode,
        lastErrorMessage: errorMessage,
        executionTimeMs,
        tags: extractJobTags({ ...job, status: 'failed', lastErrorCode: errorCode })
      }
    };
  }

  if (shouldMoveToDLQ(job)) {
    return {
      action: 'dlq',
      dlqReason: `Max attempts (${job.maxAttempts}) exceeded for retryable error. Last error: ${errorMessage}`
    };
  }

  const nextRetryAt = calculateNextRetry(
    job.attempts,
    job.retryStrategy as 'exponential' | 'linear' | 'fixed',
    job.baseDelayMs,
    job.maxDelayMs
  );

  const currentDelay = nextRetryAt.getTime() - Date.now();
  const retryDelays = [...(job.retryDelays || []), {
    attempt: job.attempts,
    delayMs: currentDelay,
    scheduledFor: nextRetryAt.toISOString()
  }];

  return {
    action: 'retry_wait',
    delayMs: currentDelay,
    patch: {
      status: 'retry_wait',
      attempts: job.attempts,
      nextRetryAt: nextRetryAt.toISOString(),
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
      executionTimeMs,
      retryDelays,
      tags: extractJobTags({ ...job, status: 'retry_wait', lastErrorCode: errorCode })
    }
  };
}

async function registerWorkerLifecycle(workerId: string, workerName: string) {
  try {
    await registerWorker(workerId, workerName);
    await logSystemEvent({
      eventType: 'WORKER_STARTED',
      severity: 'info',
      component: 'job-runner',
      message: `Worker ${workerId} started`,
      details: { workerId, workerName, pid: process.pid }
    });
    console.log(`[worker] Registrado como ${workerId}`);
  } catch (error: unknown) {
    console.error('[worker] Erro ao registrar worker:', getErrorMessage(error));
  }
}

function startWorkerHeartbeat(workerId: string) {
  return setInterval(async () => {
    try {
      await sendWorkerHeartbeat(workerId, getWorkerStatsForHeartbeat());
    } catch (error: unknown) {
      console.error('[worker] Erro ao enviar heartbeat:', getErrorMessage(error));
    }
  }, 30000);
}

function createCleanupHandler(workerId: string, heartbeatInterval: NodeJS.Timeout, shutdownState: { requested: boolean }) {
  return async (signal: string) => {
    if (shutdownState.requested) {
      console.log('[worker] Shutdown já em progresso, forçando saída...');
      process.exit(1);
    }

    shutdownState.requested = true;
    console.log(`[worker] Recebido sinal ${signal}, encerrando gracefully...`);
    clearInterval(heartbeatInterval);

    const cleanupTimeout = setTimeout(() => {
      console.error('[worker] Cleanup timeout (5s), forçando saída');
      process.exit(1);
    }, 5000);

    try {
      await stopWorker(workerId, `Shutdown requested (${signal})`);
      console.log('[worker] Cleanup concluído com sucesso');
    } catch (error: unknown) {
      console.error('[worker] Erro ao parar worker:', getErrorMessage(error));
    } finally {
      clearTimeout(cleanupTimeout);
      process.exit(0);
    }
  };
}

function attachWorkerProcessHandlers(cleanup: (signal: string) => Promise<void>) {
  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));
  process.on('uncaughtException', (error) => {
    console.error('[worker] uncaughtException:', error);
    cleanup('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[worker] unhandledRejection:', reason);
    cleanup('unhandledRejection');
  });
}

async function requeueStaleJobsIfNeeded() {
  const staleJobs = await dependencies.requeueStaleRunningJobs(config.workerClaimStaleTimeoutMs, config.workerBatchSize);
  if (staleJobs.length === 0) {
    return;
  }

  console.warn(`[worker] ${staleJobs.length} job(s) running stale reencaminhados para retry_wait`);
  await dependencies.logSystemEvent({
    eventType: 'STALE_JOBS_REQUEUED',
    severity: 'warning',
    component: 'job-runner',
    message: `${staleJobs.length} stale jobs requeued`,
    details: { count: staleJobs.length, jobIds: staleJobs.map((job) => job.jobId) }
  });
}

// ---------------------------------------------------------------------------
// Varredura periódica de submits sem confirmação.
//
// NÃO existe cron neste app: nenhum CronJob em `k8s/` e nenhum `setInterval` de
// negócio. Criar um CronJob k8s mexeria em manifesto sob Argo (selfHeal) e é
// escopo maior; o gancho certo é este loop, ao lado de
// `requeueStaleJobsIfNeeded()` — que resolve um problema da mesma natureza
// (estado preso que ninguém mais vai destravar).
// ---------------------------------------------------------------------------

const MANIFEST_SUBMIT_RECONCILE_SWEEP_DEFAULT_MS = 5 * 60 * 1000;
// Janela de atividade das linhas candidatas. Sem recorte a varredura do
// repositório degenera em full scan (a própria função se recusa a rodar).
const MANIFEST_SUBMIT_RECONCILE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

// Lido do ambiente e não de `lib/config.ts` porque é knob de operação desta
// varredura. `0` (ou negativo) DESLIGA — a válvula de escape sem redeploy de código.
function resolveSubmitReconcileSweepIntervalMs(): number {
  const raw = Number(process.env.MANIFEST_SUBMIT_RECONCILE_SWEEP_MS);
  if (!Number.isFinite(raw)) {
    return MANIFEST_SUBMIT_RECONCILE_SWEEP_DEFAULT_MS;
  }
  return raw;
}

let lastSubmitReconcileSweepAt = 0;

export function resetSubmitReconcileSweepClockForTests() {
  lastSubmitReconcileSweepAt = 0;
}

async function enqueueManifestSubmitReconcileSweepIfNeeded() {
  const intervalMs = resolveSubmitReconcileSweepIntervalMs();
  if (intervalMs <= 0) {
    return;
  }

  const now = Date.now();
  if (lastSubmitReconcileSweepAt && (now - lastSubmitReconcileSweepAt) < intervalMs) {
    return;
  }
  lastSubmitReconcileSweepAt = now;

  const updatedSince = new Date(now - MANIFEST_SUBMIT_RECONCILE_LOOKBACK_MS).toISOString();

  try {
    const accountIds = await listIntegrationAccountIdsWithUnconfirmedSubmits({ updatedSince });
    for (const integrationAccountId of accountIds) {
      // `insertJobDeduplicated` tem alvo de conflito
      // `(entity_type, entity_id, operation) where status in ('queued','running','retry_wait')`:
      // no máximo UMA varredura ativa por conta, mesmo com o loop passando aqui
      // a cada iteração.
      await insertJobDeduplicated({
        jobId: createPrefixedId('job'),
        commandId: createPrefixedId('cmd'),
        entityType: 'integration_account',
        entityId: integrationAccountId,
        operation: 'manifest.reconcile_submit',
        payload: { integrationAccountId, updatedSince },
        status: 'queued',
        maxAttempts: 3,
        correlationId: createPrefixedId('corr'),
        priority: 2,
        retryStrategy: 'fixed',
        baseDelayMs: 30000,
        maxDelayMs: 120000,
        tags: extractJobTags({ operation: 'manifest.reconcile_submit', entityType: 'integration_account', status: 'queued' })
      });
    }
  } catch (error: unknown) {
    // Falha aqui NUNCA pode derrubar o loop do worker: a varredura é reparo de
    // fundo, não caminho crítico. Volta na próxima janela.
    console.warn(`[worker] varredura de reconciliação de submit não pôde ser enfileirada: ${getErrorMessage(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Varredura periódica do CIOT sem confirmação (PR-C2, DL-102 aplicado ao domínio CIOT) — molde
// EXATO de `enqueueManifestSubmitReconcileSweepIfNeeded` acima: mesmo racional (estado preso que
// ninguém mais vai destravar), mesmo desenho (relógio próprio, `0`/negativo desliga, falha nunca
// derruba o loop do worker).
// ---------------------------------------------------------------------------

const TRANSPORTE_CIOT_RECONCILE_SWEEP_DEFAULT_MS = 5 * 60 * 1000;
// Mesma janela de atividade de `MANIFEST_SUBMIT_RECONCILE_LOOKBACK_MS` — sem recorte a varredura
// do repositório degenera em full scan.
const TRANSPORTE_CIOT_RECONCILE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function resolveTransporteCiotReconcileSweepIntervalMs(): number {
  const raw = Number(process.env.TRANSPORTE_CIOT_RECONCILE_SWEEP_MS);
  if (!Number.isFinite(raw)) {
    return TRANSPORTE_CIOT_RECONCILE_SWEEP_DEFAULT_MS;
  }
  return raw;
}

let lastTransporteCiotReconcileSweepAt = 0;

export function resetTransporteCiotReconcileSweepClockForTests() {
  lastTransporteCiotReconcileSweepAt = 0;
}

async function enqueueTransporteCiotReconcileSweepIfNeeded() {
  const intervalMs = resolveTransporteCiotReconcileSweepIntervalMs();
  if (intervalMs <= 0) {
    return;
  }

  const now = Date.now();
  if (lastTransporteCiotReconcileSweepAt && (now - lastTransporteCiotReconcileSweepAt) < intervalMs) {
    return;
  }
  lastTransporteCiotReconcileSweepAt = now;

  const updatedSince = new Date(now - TRANSPORTE_CIOT_RECONCILE_LOOKBACK_MS).toISOString();

  try {
    const candidates = await listUnconfirmedCiotOperationsForReconciliation({ updatedSince });
    for (const candidate of candidates) {
      // `insertJobDeduplicated` tem alvo de conflito `(entity_type, entity_id, operation) where
      // status in ('queued','running','retry_wait')`: no máximo UMA reconciliação ativa por
      // operação — o `applyTransporteCiotTerminalFailureSideEffect` já tenta enfileirar no momento
      // do terminal; esta varredura é a rede de segurança para quando aquele enfileiramento falhou
      // (ou o processo caiu entre marcar `request_unconfirmed` e enfileirar).
      await insertJobDeduplicated({
        jobId: createPrefixedId('job'),
        commandId: createPrefixedId('cmd'),
        entityType: 'ciot_operation',
        entityId: candidate.operationId,
        operation: 'transporte.ciot.reconcile',
        payload: {
          ciotOperationId: candidate.id,
          operationId: candidate.operationId,
          integrationAccountId: candidate.integrationAccountId,
          correlationMarker: candidate.correlationMarker
        },
        status: 'queued',
        maxAttempts: 3,
        correlationId: candidate.correlationId,
        priority: 3,
        retryStrategy: 'exponential',
        baseDelayMs: 5000,
        maxDelayMs: 60000,
        tags: extractJobTags({ operation: 'transporte.ciot.reconcile', entityType: 'ciot_operation', status: 'queued' })
      });
    }
  } catch (error: unknown) {
    // Falha aqui NUNCA pode derrubar o loop do worker — mesma postura da varredura de manifesto.
    console.warn(`[worker] varredura de reconciliação de CIOT não pôde ser enfileirada: ${getErrorMessage(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Varredura periódica de reconciliação do VPO (PR-D1, DL-102) — molde EXATO de
// `enqueueTransporteCiotReconcileSweepIfNeeded` acima: rede de segurança para `vpo_allocations` em
// `acquisition_unconfirmed` cujo enfileiramento direto (`applyTransporteVpoTerminalFailureSideEffect`)
// falhou, ou cujo processo caiu entre marcar unconfirmed e enfileirar.
// ---------------------------------------------------------------------------

const TRANSPORTE_VPO_RECONCILE_SWEEP_DEFAULT_MS = 5 * 60 * 1000;
const TRANSPORTE_VPO_RECONCILE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function resolveTransporteVpoReconcileSweepIntervalMs(): number {
  const raw = Number(process.env.TRANSPORTE_VPO_RECONCILE_SWEEP_MS);
  if (!Number.isFinite(raw)) {
    return TRANSPORTE_VPO_RECONCILE_SWEEP_DEFAULT_MS;
  }
  return raw;
}

let lastTransporteVpoReconcileSweepAt = 0;

export function resetTransporteVpoReconcileSweepClockForTests() {
  lastTransporteVpoReconcileSweepAt = 0;
}

async function enqueueTransporteVpoReconcileSweepIfNeeded() {
  const intervalMs = resolveTransporteVpoReconcileSweepIntervalMs();
  if (intervalMs <= 0) {
    return;
  }

  const now = Date.now();
  if (lastTransporteVpoReconcileSweepAt && (now - lastTransporteVpoReconcileSweepAt) < intervalMs) {
    return;
  }
  lastTransporteVpoReconcileSweepAt = now;

  const updatedSince = new Date(now - TRANSPORTE_VPO_RECONCILE_LOOKBACK_MS).toISOString();

  try {
    const candidates = await listUnconfirmedVpoAllocationsForReconciliation({ updatedSince });
    for (const candidate of candidates) {
      // `insertJobDeduplicated` tem alvo de conflito `(entity_type, entity_id, operation) where
      // status in ('queued','running','retry_wait')`: no máximo UMA reconciliação ativa por
      // operação — mesmo racional de `enqueueTransporteCiotReconcileSweepIfNeeded`.
      await insertJobDeduplicated({
        jobId: createPrefixedId('job'),
        commandId: createPrefixedId('cmd'),
        entityType: 'vpo_allocation',
        entityId: candidate.operationId,
        operation: 'transporte.vpo.reconcile',
        payload: {
          vpoAllocationId: candidate.id,
          operationId: candidate.operationId,
          integrationAccountId: candidate.integrationAccountId
        },
        status: 'queued',
        maxAttempts: 3,
        correlationId: candidate.correlationId,
        priority: 3,
        retryStrategy: 'exponential',
        baseDelayMs: 5000,
        maxDelayMs: 60000,
        tags: extractJobTags({ operation: 'transporte.vpo.reconcile', entityType: 'vpo_allocation', status: 'queued' })
      });
    }
  } catch (error: unknown) {
    // Falha aqui NUNCA pode derrubar o loop do worker — mesma postura da varredura de manifesto/CIOT.
    console.warn(`[worker] varredura de reconciliação de VPO não pôde ser enfileirada: ${getErrorMessage(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Varredura periódica da emissão de DF-e sem confirmação (PR-G, DL-102 aplicado à emissão fiscal) —
// molde EXATO de `enqueueTransporteCiotReconcileSweepIfNeeded`/`enqueueTransporteVpoReconcileSweepIfNeeded`
// acima: rede de segurança para `dfe_issuances` em `submit_unconfirmed` cujo enfileiramento direto
// (`applyTransporteDfeIssuanceTerminalFailureSideEffect`) falhou, ou cujo processo caiu entre marcar
// unconfirmed e enfileirar.
// ---------------------------------------------------------------------------

const TRANSPORTE_DFE_ISSUANCE_RECONCILE_SWEEP_DEFAULT_MS = 5 * 60 * 1000;
const TRANSPORTE_DFE_ISSUANCE_RECONCILE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function resolveTransporteDfeIssuanceReconcileSweepIntervalMs(): number {
  const raw = Number(process.env.TRANSPORTE_DFE_ISSUANCE_RECONCILE_SWEEP_MS);
  if (!Number.isFinite(raw)) {
    return TRANSPORTE_DFE_ISSUANCE_RECONCILE_SWEEP_DEFAULT_MS;
  }
  return raw;
}

let lastTransporteDfeIssuanceReconcileSweepAt = 0;

export function resetTransporteDfeIssuanceReconcileSweepClockForTests() {
  lastTransporteDfeIssuanceReconcileSweepAt = 0;
}

async function enqueueTransporteDfeIssuanceReconcileSweepIfNeeded() {
  const intervalMs = resolveTransporteDfeIssuanceReconcileSweepIntervalMs();
  if (intervalMs <= 0) {
    return;
  }

  const now = Date.now();
  if (lastTransporteDfeIssuanceReconcileSweepAt && (now - lastTransporteDfeIssuanceReconcileSweepAt) < intervalMs) {
    return;
  }
  lastTransporteDfeIssuanceReconcileSweepAt = now;

  const updatedSince = new Date(now - TRANSPORTE_DFE_ISSUANCE_RECONCILE_LOOKBACK_MS).toISOString();

  try {
    const candidates = await listUnconfirmedDfeIssuancesForReconciliation({ updatedSince });
    for (const candidate of candidates) {
      // `insertJobDeduplicated` tem alvo de conflito `(entity_type, entity_id, operation) where
      // status in ('queued','running','retry_wait')`: no máximo UMA reconciliação ativa por
      // operação — mesmo racional de `enqueueTransporteCiotReconcileSweepIfNeeded`.
      await insertJobDeduplicated({
        jobId: createPrefixedId('job'),
        commandId: createPrefixedId('cmd'),
        entityType: 'dfe_issuance',
        entityId: candidate.operationId,
        operation: 'transporte.dfe.issue.reconcile',
        payload: {
          issuanceId: candidate.id,
          operationId: candidate.operationId,
          integrationAccountId: candidate.integrationAccountId,
          documentType: candidate.documentType,
          correlationMarker: candidate.correlationMarker
        },
        status: 'queued',
        maxAttempts: 3,
        correlationId: candidate.correlationId,
        priority: 3,
        retryStrategy: 'exponential',
        baseDelayMs: 5000,
        maxDelayMs: 60000,
        tags: extractJobTags({ operation: 'transporte.dfe.issue.reconcile', entityType: 'dfe_issuance', status: 'queued' })
      });
    }
  } catch (error: unknown) {
    // Falha aqui NUNCA pode derrubar o loop do worker — mesma postura da varredura de manifesto/CIOT/VPO.
    console.warn(`[worker] varredura de reconciliação de emissão de DF-e não pôde ser enfileirada: ${getErrorMessage(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Varredura periódica da averbação sem confirmação (PR-I3, DL-102 aplicado à averbação) — molde
// EXATO de `enqueueTransporteCiotReconcileSweepIfNeeded` acima: rede de segurança para
// `insurance_shipment_declarations` em `*_unconfirmed` cujo enfileiramento direto
// (`applyTransporteAverbacaoTerminalFailureSideEffect`) falhou, ou cujo processo caiu entre marcar
// unconfirmed e enfileirar.
// ---------------------------------------------------------------------------

const TRANSPORTE_AVERBACAO_RECONCILE_SWEEP_DEFAULT_MS = 5 * 60 * 1000;
const TRANSPORTE_AVERBACAO_RECONCILE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function resolveTransporteAverbacaoReconcileSweepIntervalMs(): number {
  const raw = Number(process.env.TRANSPORTE_AVERBACAO_RECONCILE_SWEEP_MS);
  if (!Number.isFinite(raw)) {
    return TRANSPORTE_AVERBACAO_RECONCILE_SWEEP_DEFAULT_MS;
  }
  return raw;
}

let lastTransporteAverbacaoReconcileSweepAt = 0;

export function resetTransporteAverbacaoReconcileSweepClockForTests() {
  lastTransporteAverbacaoReconcileSweepAt = 0;
}

async function enqueueTransporteAverbacaoReconcileSweepIfNeeded() {
  const intervalMs = resolveTransporteAverbacaoReconcileSweepIntervalMs();
  if (intervalMs <= 0) {
    return;
  }

  const now = Date.now();
  if (lastTransporteAverbacaoReconcileSweepAt && (now - lastTransporteAverbacaoReconcileSweepAt) < intervalMs) {
    return;
  }
  lastTransporteAverbacaoReconcileSweepAt = now;

  const updatedSince = new Date(now - TRANSPORTE_AVERBACAO_RECONCILE_LOOKBACK_MS).toISOString();

  try {
    const candidates = await listUnconfirmedDeclarationsForReconciliation({ updatedSince });
    for (const candidate of candidates) {
      // `insertJobDeduplicated` tem alvo de conflito `(entity_type, entity_id, operation) where
      // status in ('queued','running','retry_wait')`: no máximo UMA reconciliação ativa por
      // DECLARAÇÃO (entityId = declarationId — uma operação pode ter N declarações, uma por
      // apólice; dedupe por operação, como no CIOT, esmagaria N-1 delas).
      await insertJobDeduplicated({
        jobId: createPrefixedId('job'),
        commandId: createPrefixedId('cmd'),
        entityType: 'insurance_declaration',
        entityId: candidate.id,
        operation: 'transporte.averbacao.reconcile',
        payload: {
          declarationId: candidate.id,
          operationId: candidate.operationId,
          integrationAccountId: candidate.integrationAccountId,
          correlationMarker: candidate.correlationMarker
        },
        status: 'queued',
        maxAttempts: 3,
        correlationId: candidate.correlationId,
        priority: 3,
        retryStrategy: 'exponential',
        baseDelayMs: 5000,
        maxDelayMs: 60000,
        tags: extractJobTags({ operation: 'transporte.averbacao.reconcile', entityType: 'insurance_declaration', status: 'queued' })
      });
    }
  } catch (error: unknown) {
    // Falha aqui NUNCA pode derrubar o loop do worker — mesma postura das varreduras vizinhas.
    console.warn(`[worker] varredura de reconciliação de averbação não pôde ser enfileirada: ${getErrorMessage(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Fechamento mensal da apuração de prêmio (PR-I4, REQ-SICAT-0035) — mesmo molde estrutural das
// sweeps acima (relógio próprio, `0`/negativo desliga, falha nunca derruba o loop). Default DIÁRIO
// (24h): a conta a fechar é a do mês ANTERIOR, então basta uma passada por dia — quem entra no mês
// novo encontra o período anterior fechado no primeiro giro. `prepareBillingPeriodsForSweep` garante
// o período criado (apólice com movimento OU com mínimo devido) e a dedupe do job é por PERÍODO.
// ---------------------------------------------------------------------------

const TRANSPORTE_INSURANCE_BILLING_SWEEP_DEFAULT_MS = 24 * 60 * 60 * 1000;

function resolveTransporteInsuranceBillingSweepIntervalMs(): number {
  const raw = Number(process.env.TRANSPORTE_INSURANCE_BILLING_SWEEP_MS);
  if (!Number.isFinite(raw)) {
    return TRANSPORTE_INSURANCE_BILLING_SWEEP_DEFAULT_MS;
  }
  return raw;
}

let lastTransporteInsuranceBillingSweepAt = 0;

export function resetTransporteInsuranceBillingSweepClockForTests() {
  lastTransporteInsuranceBillingSweepAt = 0;
}

async function enqueueTransporteInsuranceBillingSweepIfNeeded() {
  const intervalMs = resolveTransporteInsuranceBillingSweepIntervalMs();
  if (intervalMs <= 0) {
    return;
  }

  const now = Date.now();
  if (lastTransporteInsuranceBillingSweepAt && (now - lastTransporteInsuranceBillingSweepAt) < intervalMs) {
    return;
  }
  lastTransporteInsuranceBillingSweepAt = now;

  try {
    const period = previousPeriodMonth(new Date(now).toISOString().slice(0, 10));
    const periods = await prepareBillingPeriodsForSweep(period);
    for (const billingPeriod of periods) {
      await insertJobDeduplicated({
        jobId: createPrefixedId('job'),
        commandId: createPrefixedId('cmd'),
        entityType: 'insurance_billing_period',
        entityId: billingPeriod.id,
        operation: 'transporte.seguros.apuracao.close',
        payload: {
          billingPeriodId: billingPeriod.id,
          policyId: billingPeriod.policyId,
          integrationAccountId: billingPeriod.integrationAccountId,
          period
        },
        status: 'queued',
        maxAttempts: 3,
        correlationId: billingPeriod.correlationId,
        priority: 5,
        retryStrategy: 'exponential',
        baseDelayMs: 5000,
        maxDelayMs: 60000,
        tags: extractJobTags({ operation: 'transporte.seguros.apuracao.close', entityType: 'insurance_billing_period', status: 'queued' })
      });
    }
  } catch (error: unknown) {
    console.warn(`[worker] varredura de apuração mensal não pôde ser enfileirada: ${getErrorMessage(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Varredura periódica do Regulatory Watch (PR-H1) — mesmo molde estrutural das sweeps acima (relógio
// próprio, `0`/negativo desliga, falha nunca derruba o loop do worker), com UMA diferença
// deliberada: só enfileira quando `config.regulatoryWatchMode === 'live'` — em `off` (default) nem
// chega a criar o job, porque não há verificação real a fazer (o job SERIA um no-op limpo se
// rodasse, mas nem vale gastar um slot de fila com isso). Default de 24h (bem mais espaçado que as
// sweeps de reconciliação de 5min): fontes normativas não mudam de hora em hora, e o disparo manual
// (`POST /v1/transporte/watch/verificar-agora`) cobre a urgência pontual.
// ---------------------------------------------------------------------------

const TRANSPORTE_REGULATORY_WATCH_SWEEP_DEFAULT_MS = 24 * 60 * 60 * 1000;

function resolveTransporteRegulatoryWatchSweepIntervalMs(): number {
  const raw = Number(process.env.TRANSPORTE_REGULATORY_WATCH_SWEEP_MS);
  if (!Number.isFinite(raw)) {
    return TRANSPORTE_REGULATORY_WATCH_SWEEP_DEFAULT_MS;
  }
  return raw;
}

let lastTransporteRegulatoryWatchSweepAt = 0;

export function resetTransporteRegulatoryWatchSweepClockForTests() {
  lastTransporteRegulatoryWatchSweepAt = 0;
}

async function enqueueTransporteRegulatoryWatchSweepIfNeeded() {
  if (config.regulatoryWatchMode !== 'live') {
    return;
  }

  const intervalMs = resolveTransporteRegulatoryWatchSweepIntervalMs();
  if (intervalMs <= 0) {
    return;
  }

  const now = Date.now();
  if (lastTransporteRegulatoryWatchSweepAt && (now - lastTransporteRegulatoryWatchSweepAt) < intervalMs) {
    return;
  }
  lastTransporteRegulatoryWatchSweepAt = now;

  try {
    await enqueueRegulatoryWatchSweep();
  } catch (error: unknown) {
    // Falha aqui NUNCA pode derrubar o loop do worker — mesma postura das demais varreduras.
    console.warn(`[worker] varredura do Regulatory Watch não pôde ser enfileirada: ${getErrorMessage(error)}`);
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Heartbeat de claim — POR LOTE, não por job.
 *
 * `claimJobs` marca os N jobs do lote como `running` e carimba `claim_heartbeat_at` no MESMO
 * instante; o consumo é SERIAL. Enquanto o job 1 roda, os jobs 2..N ficam `running` com o carimbo
 * congelado no claim — e `requeueStaleRunningJobs` (que varre a tabela inteira, de qualquer worker)
 * os reenfileira assim que passam de `workerClaimStaleTimeoutMs`. O job volta para `retry_wait`,
 * é reivindicado de novo e EXECUTA DE NOVO: `manifest.submit`, `manifest.cancel` e `cdf.generate`
 * atingem a CETESB, que não é idempotente.
 *
 * `updateJobIfOwned` NÃO fecha esse buraco — ele protege o DESFECHO (a linha só muda com
 * `claimed_by` e `status` batendo), não o EFEITO: quando o worker original termina, a chamada
 * externa já saiu. A guarda transforma execução dupla silenciosa em execução dupla com log de
 * "ownership perdido"; o pedido duplicado na CETESB continua lá.
 *
 * Correção: um único intervalo renova o lease de TODOS os jobs ainda pendentes do lote, do claim até
 * o fim do último. Cada job sai do conjunto quando termina (`release`), e o intervalo morre com o
 * lote (`stop`).
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

type ClaimHeartbeat = {
  /** Tira o job do lease: já terminou, não faz sentido continuar renovando. */
  release(jobId: string): void;
  stop(): void;
};

const NOOP_CLAIM_HEARTBEAT: ClaimHeartbeat = { release() {}, stop() {} };

function startBatchClaimHeartbeat(jobIds: string[], workerName: string): ClaimHeartbeat {
  if (config.workerClaimHeartbeatMs <= 0 || jobIds.length === 0) {
    return NOOP_CLAIM_HEARTBEAT;
  }

  const pending = new Set(jobIds);
  // Uma rodada lenta não pode empilhar a próxima: sem esta trava, um Postgres em stress viraria N
  // rodadas concorrentes de N updates cada.
  let roundInFlight = false;

  const interval = setInterval(async () => {
    if (roundInFlight || pending.size === 0) {
      return;
    }

    roundInFlight = true;
    try {
      // `allSettled` e não laço serial: um `update` pendurado num job não pode atrasar a renovação
      // dos outros — seria o mesmo defeito de novo, só que dentro do heartbeat.
      await Promise.allSettled([...pending].map(async (jobId) => {
        try {
          await dependencies.heartbeatJobClaim(jobId, workerName);
        } catch (error: unknown) {
          console.warn(`[worker] heartbeat de claim falhou para job ${jobId}: ${getErrorMessage(error)}`);
        }
      }));
    } finally {
      roundInFlight = false;
    }
  }, config.workerClaimHeartbeatMs);

  return {
    release(jobId: string) {
      pending.delete(jobId);
    },
    stop() {
      clearInterval(interval);
      pending.clear();
    }
  };
}

/**
 * O heartbeat do lote só segura o lease se ele couber MUITAS vezes dentro da janela de stale. Com
 * `workerClaimHeartbeatMs` desligado (`<= 0`) ou próximo de `workerClaimStaleTimeoutMs`, os jobs
 * 2..N voltam a ser candidatos a reenfileiramento — e o único sintoma em produção seria uma operação
 * CETESB repetida. Avisa uma vez no boot em vez de falhar: derrubar o worker por configuração
 * ruim pararia a emissão de MTR.
 */
export function warnIfClaimHeartbeatCannotHoldTheBatch() {
  if (config.workerBatchSize <= 1) {
    return;
  }

  const heartbeatMs = config.workerClaimHeartbeatMs;
  const staleMs = config.workerClaimStaleTimeoutMs;

  if (heartbeatMs <= 0) {
    console.warn(`[worker] WORKER_CLAIM_HEARTBEAT_MS desligado com WORKER_BATCH_SIZE=${config.workerBatchSize}: jobs do lote ainda não processados podem ser reenfileirados e EXECUTADOS DUAS VEZES. Use WORKER_BATCH_SIZE=1 ou ligue o heartbeat.`);
    return;
  }

  if (staleMs > 0 && heartbeatMs * 2 >= staleMs) {
    console.warn(`[worker] WORKER_CLAIM_HEARTBEAT_MS=${heartbeatMs} é alto demais para WORKER_CLAIM_STALE_TIMEOUT_MS=${staleMs}: um heartbeat perdido já torna o lote candidato a reenfileiramento (execução dupla).`);
  }
}

async function markJobSucceeded(job: JobEntity, workerName: string, startTime: number) {
  const current = await dependencies.updateJobIfOwned(job.jobId, workerName, {
    status: 'succeeded',
    finishedAt: new Date().toISOString(),
    executionTimeMs: Date.now() - startTime,
    tags: extractJobTags({ operation: job.operation, entityType: job.entityType, status: 'succeeded' })
  }, ['running', 'succeeded']);

  if (!current) {
    console.warn(`[worker] ownership perdido antes de concluir job ${job.jobId}; finalização ignorada`);
    return false;
  }

  const executionTimeMs = Date.now() - startTime;
  updateWorkerStats('succeeded', executionTimeMs);
  console.log(`[worker] job ${job.jobId} concluído em ${executionTimeMs}ms`);
  return true;
}

async function handleDlqTransition(job: JobEntity, workerName: string, transition: Extract<FailureTransition, { action: 'dlq' }>, error: unknown) {
  const effectJob = { ...job, payload: job.payload ?? {} };
  await applyAsyncOperationTerminalFailureSideEffect(effectJob, transition, error);
  // O 4º argumento é o que permite ao side-effect PERGUNTAR à CETESB se o MTR
  // nasceu antes de declarar falha. Sem ele o desfecho é `submit_unconfirmed` —
  // nunca `failed`, porque "não perguntei" não é "não existe".
  await applyManifestSubmitTerminalFailureSideEffect(effectJob, transition, error, submitReconcileDeps);
  await applyManifestCancelTerminalFailureSideEffect(effectJob, transition, error);
  await applyConversationArtifactTerminalFailureSideEffect(effectJob, transition, error);
  // Registrado AQUI e em `handleFailedTransition`. Registrar em só um dos dois produz a assimetria
  // mais difícil de enxergar em produção: falha definitiva avisa, DLQ não (ou o inverso).
  await applyWhatsAppInboundTerminalFailureSideEffect(effectJob, transition, error);
  // Par obrigatório do PR-C1: marca a verificação RNTRC `pending` como `failed` (nunca toca o party).
  await applyTransporteRntrcVerifyTerminalFailureSideEffect(effectJob, transition, error);
  // Par obrigatório do PR-C2 (DL-102 aplicado ao CIOT): resposta perdida DEPOIS do dispatch vira
  // `request_unconfirmed`, NUNCA `failed`; rejeição definitiva do provedor vira `rejected`.
  await applyTransporteCiotTerminalFailureSideEffect(effectJob, transition, error);
  // Par obrigatório do PR-D1 (DL-102 aplicado ao VPO): resposta perdida DEPOIS do dispatch vira
  // `acquisition_unconfirmed`, NUNCA falha definitiva; rejeição definitiva do provedor volta a
  // `applicable`.
  await applyTransporteVpoTerminalFailureSideEffect(effectJob, transition, error);
  // Par obrigatório do PR-G (DL-102 aplicado à emissão de DF-e): resposta perdida DEPOIS de
  // `submitting` vira `submit_unconfirmed`, NUNCA `failed_validation`; falha ANTES disso (dados
  // incompletos, tipo não suportado, flag desligada) vira `failed_validation` diretamente.
  await applyTransporteDfeIssuanceTerminalFailureSideEffect(effectJob, transition, error);
  // Par obrigatório do PR-I3 (DL-102 aplicado à averbação): resposta perdida DEPOIS do dispatch
  // vira `*_unconfirmed`, NUNCA `rejected`; flag desligada num declare que nunca dispatchou vira
  // `rejected` (nada a reconciliar).
  await applyTransporteAverbacaoTerminalFailureSideEffect(effectJob, transition, error);
  const ownedJob = { ...job, payload: job.payload ?? {}, claimedBy: workerName } as Parameters<typeof moveJobToDLQ>[0];
  const movedToDLQ = await dependencies.moveJobToDLQ(ownedJob, transition.dlqReason);
  if (!movedToDLQ) {
    console.warn(`[worker] ownership perdido antes de mover job ${job.jobId} para DLQ; transição ignorada`);
    return;
  }

  updateWorkerStats('dlq');
  await dependencies.logSystemEvent({
    eventType: 'JOB_DLQ_MOVED',
    severity: 'error',
    component: 'job-runner',
    message: `Job ${job.jobId} moved to DLQ`,
    details: {
      jobId: job.jobId,
      operation: job.operation,
      reason: transition.dlqReason,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts
    },
    correlationId: job.correlationId
  });
  console.error(`[worker] job ${job.jobId} movido para DLQ: ${transition.dlqReason}`);
}

async function handleFailedTransition(job: JobEntity, workerName: string, transition: Extract<FailureTransition, { action: 'failed' | 'retry_wait' }>, error: unknown, executionTimeMs: number) {
  const transitioned = await dependencies.updateJobIfOwned(job.jobId, workerName, transition.patch);
  if (!transitioned) {
    console.warn(`[worker] ownership perdido antes de aplicar transição ${transition.action} no job ${job.jobId}`);
    return;
  }

  if (transition.action === 'failed') {
    const effectJob = { ...job, payload: job.payload ?? {} };
    await applyAsyncOperationTerminalFailureSideEffect(effectJob, transition, error);
    // O 4º argumento é o que permite ao side-effect PERGUNTAR à CETESB se o MTR
  // nasceu antes de declarar falha. Sem ele o desfecho é `submit_unconfirmed` —
  // nunca `failed`, porque "não perguntei" não é "não existe".
  await applyManifestSubmitTerminalFailureSideEffect(effectJob, transition, error, submitReconcileDeps);
    await applyManifestCancelTerminalFailureSideEffect(effectJob, transition, error);
    await applyConversationArtifactTerminalFailureSideEffect(effectJob, transition, error);
    // Par obrigatório da chamada em `handleDlqTransition` — ver comentário lá.
    await applyWhatsAppInboundTerminalFailureSideEffect(effectJob, transition, error);
    await applyTransporteRntrcVerifyTerminalFailureSideEffect(effectJob, transition, error);
    await applyTransporteCiotTerminalFailureSideEffect(effectJob, transition, error);
    await applyTransporteVpoTerminalFailureSideEffect(effectJob, transition, error);
    await applyTransporteDfeIssuanceTerminalFailureSideEffect(effectJob, transition, error);
    await applyTransporteAverbacaoTerminalFailureSideEffect(effectJob, transition, error);
    updateWorkerStats('failed', executionTimeMs);
    console.error(`[worker] job ${job.jobId} falhou definitivamente (tentativa ${job.attempts}/${job.maxAttempts}): ${transition.patch.lastErrorCode}`);
    return;
  }

  const delayMs = transition.delayMs ?? 0;
  console.error(`[worker] job ${job.jobId} falhou (tentativa ${job.attempts}/${job.maxAttempts}). Próximo retry em ${Math.round(delayMs / 1000)}s usando estratégia ${job.retryStrategy}`);
}

async function processClaimedJob(job: JobEntity, workerName: string, claimHeartbeat: ClaimHeartbeat) {
  const startTime = Date.now();
  updateWorkerStats('claimed');

  try {
    await dependencies.processJob({ ...job, payload: job.payload ?? {} }, gateway);
    await markJobSucceeded(job, workerName, startTime);
  } catch (error: unknown) {
    if (isOwnershipError(error)) {
      console.warn(`[worker] ${error.message}`);
      return;
    }

    const executionTimeMs = Date.now() - startTime;
    console.error('[worker DEBUG] Erro completo:', error);
    if (hasRemoteBody(error)) {
      console.error('[worker DEBUG] CETESB remoteBody:', JSON.stringify(error.extras.remoteBody, null, 2));
    }

    const transition = resolveFailureTransition(job, error, executionTimeMs);
    if (transition.action === 'dlq') {
      await handleDlqTransition(job, workerName, transition, error);
      return;
    }

    await handleFailedTransition(job, workerName, transition, error, executionTimeMs);
  } finally {
    claimHeartbeat.release(job.jobId);
  }
}

export async function processWorkerIteration({ once, shutdownRequested, workerName }: { once: boolean; shutdownRequested: () => boolean; workerName: string }) {
  if (shutdownRequested()) {
    console.log('[worker] Shutdown detectado, interrompendo loop');
    return false;
  }

  await requeueStaleJobsIfNeeded();
  await enqueueManifestSubmitReconcileSweepIfNeeded();
  await enqueueTransporteCiotReconcileSweepIfNeeded();
  await enqueueTransporteVpoReconcileSweepIfNeeded();
  await enqueueTransporteDfeIssuanceReconcileSweepIfNeeded();
  await enqueueTransporteAverbacaoReconcileSweepIfNeeded();
  await enqueueTransporteInsuranceBillingSweepIfNeeded();
  await enqueueTransporteRegulatoryWatchSweepIfNeeded();
  // `WORKER_LANE` ausente ⇒ `'all'` ⇒ nenhum predicado extra: comportamento idêntico ao anterior.
  const jobs = await dependencies.claimJobs(config.workerBatchSize, { lane: resolveWorkerLane() });
  if (jobs.length === 0) {
    if (once) {
      return false;
    }
    await sleep(config.workerPollIntervalMs);
    return true;
  }

  // O lease começa AQUI, para o lote inteiro — não quando cada job chega à sua vez. Ver o bloco de
  // comentário de `startBatchClaimHeartbeat`.
  const claimHeartbeat = startBatchClaimHeartbeat(jobs.map((job) => job.jobId), workerName);
  try {
    for (const job of jobs) {
      await processClaimedJob(job, workerName, claimHeartbeat);
    }
  } finally {
    claimHeartbeat.stop();
  }

  return !once;
}

export async function runWorkerLoop({ once = false } = {}) {
  const workerId = `worker-${process.pid}-${Date.now()}`;
  const workerName = process.env.WORKER_NAME || `worker-${process.pid}`;
  warnIfClaimHeartbeatCannotHoldTheBatch();
  await registerWorkerLifecycle(workerId, workerName);
  const heartbeatInterval = startWorkerHeartbeat(workerId);
  const shutdownState = { requested: false };
  const cleanup = createCleanupHandler(workerId, heartbeatInterval, shutdownState);
  attachWorkerProcessHandlers(cleanup);

  while (await processWorkerIteration({ once, shutdownRequested: () => shutdownState.requested, workerName })) {
    continue;
  }

  clearInterval(heartbeatInterval);
  await stopWorker(workerId, 'Worker loop completed (once mode)');
}
