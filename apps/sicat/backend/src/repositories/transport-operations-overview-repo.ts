/**
 * Repositório do Centro Operacional da vertical Transporte (PR-H1, DL-103).
 *
 * Reaproveita a infraestrutura EXISTENTE do Centro Operacional ambiental
 * (`operations-repo.ts`/`operations-service.ts`, fase 04) — mesmo padrão de SQL agregado com
 * `count(*) filter (where ...)`, tenancy sempre por `integration_account_id` — em vez de um segundo
 * framework de métricas. As poucas fontes GLOBAIS do catálogo regulatório (bloqueios por regra e
 * itens do Watch em `human_review`) são a exceção deliberada: `regulatory_rule_versions` e
 * `regulatory_watch_items` não têm `integration_account_id` (o catálogo é compartilhado neste
 * operador único — ver `regulatory-repo.ts`), então esses dois agregados NÃO são filtrados por
 * conta, e o service documenta isso no campo de resposta.
 */

import { query } from '../db/pool.js';
import { RNTRC_VERIFICATION_FRESHNESS_DAYS } from '../lib/transport/rule-evaluators.js';

export type OperationsByStatusRow = { status: string; count: number };

export async function getOperationsCountByStatus(integrationAccountId: string): Promise<OperationsByStatusRow[]> {
  const result = await query<OperationsByStatusRow>(
    `select status, count(*)::int as count
       from transport_operations
      where integration_account_id = $1
      group by status`,
    [integrationAccountId]
  );
  return result.rows;
}

export type BlockedRuleRow = { rule_code: string; block_count: number; raw_block_count: number };

/**
 * Top N regras que mais bloqueiam, considerando só a AVALIAÇÃO MAIS RECENTE de cada (operação,
 * gate) desta conta — evita que o histórico append-only (`compliance_evaluations`) infle a contagem
 * com avaliações antigas já superadas por uma nova.
 */
export async function getTopBlockedRules(integrationAccountId: string, limit: number): Promise<BlockedRuleRow[]> {
  const result = await query<BlockedRuleRow>(
    `with latest_evals as (
       select distinct on (ce.operation_id, ce.gate) ce.id
         from compliance_evaluations ce
        where ce.integration_account_id = $1
        order by ce.operation_id, ce.gate, ce.evaluated_at desc
     )
     select cc.rule_code,
            count(*) filter (where cc.status = 'block')::int as block_count,
            count(*) filter (where cc.raw_status = 'block')::int as raw_block_count
       from compliance_checks cc
       inner join latest_evals le on le.id = cc.evaluation_id
      group by cc.rule_code
     having count(*) filter (where cc.status = 'block') > 0
         or count(*) filter (where cc.raw_status = 'block') > 0
      order by block_count desc, raw_block_count desc
      limit $2`,
    [integrationAccountId, limit]
  );
  return result.rows;
}

export async function getBelowFloorOffersCount(integrationAccountId: string): Promise<number> {
  const result = await query<{ count: number }>(
    `with latest_calc as (
       select distinct on (operation_id) operation_id, compliant
         from freight_floor_calculations
        where integration_account_id = $1
        order by operation_id, created_at desc
     )
     select count(*) filter (where compliant = false)::int as count from latest_calc`,
    [integrationAccountId]
  );
  return result.rows[0]?.count || 0;
}

export type CiotByStatusRow = { status: string; count: number };

export async function getCiotCountByStatus(integrationAccountId: string): Promise<CiotByStatusRow[]> {
  const result = await query<CiotByStatusRow>(
    `select status, count(*)::int as count
       from ciot_operations
      where integration_account_id = $1
      group by status`,
    [integrationAccountId]
  );
  return result.rows;
}

export async function getVpoApplicableNotAcquiredCount(integrationAccountId: string): Promise<number> {
  const result = await query<{ count: number }>(
    `select count(*)::int as count
       from vpo_allocations
      where integration_account_id = $1
        and status = 'applicable'`,
    [integrationAccountId]
  );
  return result.rows[0]?.count || 0;
}

export type FiscalDocumentValidationRow = { validation_status: string; count: number };

export async function getFiscalDocumentsByValidationStatus(integrationAccountId: string): Promise<FiscalDocumentValidationRow[]> {
  const result = await query<FiscalDocumentValidationRow>(
    `select validation_status, count(*)::int as count
       from fiscal_documents
      where integration_account_id = $1
        and validation_status in ('invalid', 'warnings')
      group by validation_status`,
    [integrationAccountId]
  );
  return result.rows;
}

/**
 * Transportadores (papel `carrier`) com operação NÃO-TERMINAL em aberto cuja última verificação
 * RNTRC bem-sucedida está STALE (> `RNTRC_VERIFICATION_FRESHNESS_DAYS`) ou nunca aconteceu — mesmo
 * limite de frescor que `rule-evaluators.ts#evaluateRntrc00x` já usa no motor de compliance
 * (reaproveitado, não reinventado).
 */
export async function getStaleRntrcCarriersCount(integrationAccountId: string): Promise<number> {
  const result = await query<{ count: number }>(
    `select count(distinct top.party_id)::int as count
       from transport_operation_parties top
       inner join transport_operations o on o.id = top.operation_id
       left join lateral (
         select completed_at
           from rntrc_verifications rv
          where rv.party_id = top.party_id and rv.requested_status = 'succeeded'
          order by rv.completed_at desc
          limit 1
       ) latest on true
      where o.integration_account_id = $1
        and top.role = 'carrier'
        and o.status <> 'cancelled'
        and (latest.completed_at is null or latest.completed_at < now() - ($2 || ' days')::interval)`,
    [integrationAccountId, RNTRC_VERIFICATION_FRESHNESS_DAYS]
  );
  return result.rows[0]?.count || 0;
}

export type JobsByOperationPrefixRow = { retry_wait: number; dlq: number };

/** Jobs `transporte.*` desta conta em `retry_wait`/`dlq` — job-repo filtrado por prefixo de operação. */
export async function getTransportJobsRetryAndDlqCount(integrationAccountId: string): Promise<JobsByOperationPrefixRow> {
  const result = await query<JobsByOperationPrefixRow>(
    `select
       count(*) filter (where status = 'retry_wait')::int as retry_wait,
       count(*) filter (where status = 'dlq')::int as dlq
     from jobs
     where operation like 'transporte.%'
       and payload ->> 'integrationAccountId' = $1`,
    [integrationAccountId]
  );
  return result.rows[0] || { retry_wait: 0, dlq: 0 };
}
