/**
 * Centro Operacional da vertical Transporte (PR-H1, DL-103) — `GET /v1/transporte/operations/overview`.
 *
 * REÚSA a infraestrutura existente do Centro Operacional (fase 04, `operations-repo.ts`/
 * `operations-service.ts`) — mesmo padrão de agregados SQL, mesma taxonomia de status (`lib/
 * operational-status.ts`) para os jobs `transporte.*` — em vez de um segundo framework de métricas.
 * `GET /v1/dashboard/overview` (ambiental) e `GET /v1/operations/overview` (genérico de jobs/
 * manifestos) NÃO são tocados: este é um overview NOVO, escopado à vertical Transporte.
 *
 * Tenancy: `integrationAccountId` obrigatório, mesmo padrão de toda a vertical — EXCETO os dois
 * agregados GLOBAIS do catálogo regulatório (bloqueios por regra usam as avaliações DESTA conta,
 * mas o catálogo em si e os itens do Regulatory Watch em `human_review` são compartilhados neste
 * operador único, sem `integration_account_id` — ver `regulatory-repo.ts`/
 * `regulatory-watch-repo.ts`). O campo `watch.pendingHumanReviewGlobal` deixa isso explícito no
 * nome, não só no comentário.
 */

import { AppError } from '../lib/problem.js';
import {
  getOperationsCountByStatus,
  getTopBlockedRules,
  getBelowFloorOffersCount,
  getCiotCountByStatus,
  getVpoApplicableNotAcquiredCount,
  getFiscalDocumentsByValidationStatus,
  getStaleRntrcCarriersCount,
  getTransportJobsRetryAndDlqCount
} from '../repositories/transport-operations-overview-repo.js';
import { countWatchItemsInHumanReview } from '../repositories/regulatory-watch-repo.js';
import { listInsuranceExpirationAlertsService } from './transport-insurance-service.js';

type LooseRecord = Record<string, unknown>;

const TOP_BLOCKED_RULES_LIMIT = 10;
const INSURANCE_EXPIRATION_WINDOW_DAYS = 30;

function requireNonEmptyString(value: unknown, detail: string, code: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new AppError(400, 'Bad Request', detail, { code });
  return normalized;
}

function requireIntegrationAccountId(source: LooseRecord): string {
  return requireNonEmptyString(
    source.integrationAccountId,
    'integrationAccountId é obrigatório.',
    'TRANSPORT_OPERATIONS_OVERVIEW_FIELD_REQUIRED'
  );
}

function toCountMap(rows: Array<{ status: string; count: number }>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) map[row.status] = row.count;
  return map;
}

export type TransportOperationsOverviewResponse = {
  generatedAt: string;
  operationsByStatus: Record<string, number>;
  compliance: {
    topBlockedRules: Array<{ ruleCode: string; blockCount: number; rawBlockCount: number }>;
    belowFloorOffers: number;
  };
  ciot: {
    byStatus: Record<string, number>;
    unconfirmedPending: number;
  };
  vpo: {
    applicableNotAcquired: number;
  };
  fiscalDocuments: {
    invalid: number;
    warnings: number;
  };
  insurance: {
    expiringOrExpiredCount: number;
    windowDays: number;
  };
  rntrc: {
    staleCarriers: number;
    freshnessDays: number;
  };
  jobs: {
    retryWait: number;
    dlq: number;
  };
  watch: {
    /** GLOBAL — não filtrado por conta (o Regulatory Watch é compartilhado neste operador único). */
    pendingHumanReviewGlobal: number;
  };
};

export async function getTransportOperationsOverviewService(query: LooseRecord = {}): Promise<TransportOperationsOverviewResponse> {
  const integrationAccountId = requireIntegrationAccountId(query);

  const [
    operationsByStatus,
    topBlockedRules,
    belowFloorOffers,
    ciotByStatus,
    vpoApplicableNotAcquired,
    fiscalByValidation,
    insuranceAlerts,
    staleRntrcCarriers,
    transportJobs,
    watchPendingHumanReview
  ] = await Promise.all([
    getOperationsCountByStatus(integrationAccountId),
    getTopBlockedRules(integrationAccountId, TOP_BLOCKED_RULES_LIMIT),
    getBelowFloorOffersCount(integrationAccountId),
    getCiotCountByStatus(integrationAccountId),
    getVpoApplicableNotAcquiredCount(integrationAccountId),
    getFiscalDocumentsByValidationStatus(integrationAccountId),
    listInsuranceExpirationAlertsService({ integrationAccountId, windowDays: INSURANCE_EXPIRATION_WINDOW_DAYS }),
    getStaleRntrcCarriersCount(integrationAccountId),
    getTransportJobsRetryAndDlqCount(integrationAccountId),
    countWatchItemsInHumanReview()
  ]);

  const ciotStatusMap = toCountMap(ciotByStatus);
  const fiscalMap = toCountMap(
    fiscalByValidation.map((row) => ({ status: row.validation_status, count: row.count }))
  );

  return {
    generatedAt: new Date().toISOString(),
    operationsByStatus: toCountMap(operationsByStatus),
    compliance: {
      topBlockedRules: topBlockedRules.map((row) => ({
        ruleCode: row.rule_code,
        blockCount: row.block_count,
        rawBlockCount: row.raw_block_count
      })),
      belowFloorOffers
    },
    ciot: {
      byStatus: ciotStatusMap,
      unconfirmedPending: ciotStatusMap.request_unconfirmed || 0
    },
    vpo: {
      applicableNotAcquired: vpoApplicableNotAcquired
    },
    fiscalDocuments: {
      invalid: fiscalMap.invalid || 0,
      warnings: fiscalMap.warnings || 0
    },
    insurance: {
      expiringOrExpiredCount: insuranceAlerts.total,
      windowDays: INSURANCE_EXPIRATION_WINDOW_DAYS
    },
    rntrc: {
      staleCarriers: staleRntrcCarriers,
      // Espelha `RNTRC_VERIFICATION_FRESHNESS_DAYS` — só para o contrato não precisar hardcodar 90.
      freshnessDays: 90
    },
    jobs: {
      retryWait: transportJobs.retry_wait,
      dlq: transportJobs.dlq
    },
    watch: {
      pendingHumanReviewGlobal: watchPendingHumanReview
    }
  };
}
