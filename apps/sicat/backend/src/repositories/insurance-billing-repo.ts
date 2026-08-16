/**
 * Repositório de `insurance_billing_periods`/`insurance_billing_runs` (PR-I4, REQ-SICAT-0035).
 *
 * TENANCY OBRIGATÓRIA na superfície HTTP (mesmo contrato de `insurance-declaration-repo.ts`); a
 * variante `*Internal` existe para o worker, que resolve a linha pelo payload do job.
 *
 * `insurance_billing_runs` é APPEND-ONLY — só `insert`, nunca `update`/`delete`: é a trilha que
 * torna a conta do mês REPRODUZÍVEL.
 */

import type { PoolClient } from 'pg';
import { query } from '../db/pool.js';
import { createPrefixedId } from '../lib/ids.js';
import type {
  InsuranceBillingBasis,
  InsuranceBillingPeriod,
  InsuranceBillingRun,
  InsuranceBillingRunTrigger,
  InsuranceBillingStatus
} from '../lib/transport/insurance-billing-types.js';

type DbClient = Pick<PoolClient, 'query'> | null;

function getQueryExecutor(client: DbClient = null) {
  return client?.query?.bind(client) || query;
}

type PeriodRow = {
  id: string;
  integration_account_id: string;
  policy_id: string;
  period_month: Date | string;
  declared_total_amount: string | number;
  premium_total_amount: string | number;
  minimum_amount: string | number;
  billed_amount: string | number;
  billing_basis: string;
  status: string;
  statement: unknown;
  closed_at: Date | string | null;
  correlation_id: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type RunRow = {
  id: string;
  billing_period_id: string;
  trigger: string;
  inputs: unknown;
  result: unknown;
  correlation_id: string;
  created_at: Date | string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** `date` do Postgres chega como Date (meia-noite local) ou string — só a parte YYYY-MM-DD importa. */
function toIsoDate(value: Date | string): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapPeriodRow(row: PeriodRow | undefined): InsuranceBillingPeriod | null {
  if (!row) return null;
  const statement = toJsonObject(row.statement);
  const items = Array.isArray(statement.items) ? statement.items : [];
  const notes = Array.isArray(statement.notes) ? (statement.notes as string[]) : undefined;
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    policyId: row.policy_id,
    periodMonth: toIsoDate(row.period_month),
    declaredTotalAmount: Number(row.declared_total_amount),
    premiumTotalAmount: Number(row.premium_total_amount),
    minimumAmount: Number(row.minimum_amount),
    billedAmount: Number(row.billed_amount),
    billingBasis: row.billing_basis as InsuranceBillingBasis,
    status: row.status as InsuranceBillingStatus,
    statement: { items: items as InsuranceBillingPeriod['statement']['items'], ...(notes ? { notes } : {}) },
    closedAt: toIso(row.closed_at),
    correlationId: row.correlation_id,
    version: Number(row.version),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapRunRow(row: RunRow | undefined): InsuranceBillingRun | null {
  if (!row) return null;
  return {
    id: row.id,
    billingPeriodId: row.billing_period_id,
    trigger: row.trigger as InsuranceBillingRunTrigger,
    inputs: toJsonObject(row.inputs),
    result: toJsonObject(row.result),
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at)
  };
}

const PERIOD_COLUMNS = `
  id, integration_account_id, policy_id, period_month, declared_total_amount, premium_total_amount,
  minimum_amount, billed_amount, billing_basis, status, statement, closed_at, correlation_id,
  version, created_at, updated_at
`;

export async function findPeriodByPolicyMonth(
  policyId: string,
  periodMonthFirstDay: string,
  client: DbClient = null
): Promise<InsuranceBillingPeriod | null> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `select ${PERIOD_COLUMNS} from insurance_billing_periods where policy_id = $1 and period_month = $2::date`,
    [policyId, periodMonthFirstDay]
  );
  return mapPeriodRow(result.rows[0] as PeriodRow | undefined);
}

export async function findPeriodById(
  id: string,
  integrationAccountId: string,
  client: DbClient = null
): Promise<InsuranceBillingPeriod | null> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `select ${PERIOD_COLUMNS} from insurance_billing_periods where id = $1 and integration_account_id = $2`,
    [id, integrationAccountId]
  );
  return mapPeriodRow(result.rows[0] as PeriodRow | undefined);
}

/** Sem tenancy — SÓ para o worker (resolve pelo `job.payload.billingPeriodId`). */
export async function findPeriodByIdInternal(id: string, client: DbClient = null): Promise<InsuranceBillingPeriod | null> {
  const exec = getQueryExecutor(client);
  const result = await exec(`select ${PERIOD_COLUMNS} from insurance_billing_periods where id = $1`, [id]);
  return mapPeriodRow(result.rows[0] as PeriodRow | undefined);
}

export async function listPeriodsForAccount(
  opts: { integrationAccountId: string; periodMonthFirstDay?: string | null; status?: InsuranceBillingStatus | null },
  client: DbClient = null
): Promise<InsuranceBillingPeriod[]> {
  const exec = getQueryExecutor(client);
  const params: unknown[] = [opts.integrationAccountId];
  const filters = ['integration_account_id = $1'];
  if (opts.periodMonthFirstDay) {
    params.push(opts.periodMonthFirstDay);
    filters.push(`period_month = $${params.length}::date`);
  }
  if (opts.status) {
    params.push(opts.status);
    filters.push(`status = $${params.length}`);
  }
  const result = await exec(
    `select ${PERIOD_COLUMNS} from insurance_billing_periods
      where ${filters.join(' and ')}
      order by period_month desc, policy_id asc`,
    params
  );
  return (result.rows as PeriodRow[]).map((row) => mapPeriodRow(row)!).filter(Boolean);
}

export async function insertPeriod(
  input: {
    integrationAccountId: string;
    policyId: string;
    periodMonthFirstDay: string;
    correlationId: string;
  },
  client: DbClient = null
): Promise<InsuranceBillingPeriod> {
  const exec = getQueryExecutor(client);
  const id = createPrefixedId('insbill');
  const result = await exec(
    `insert into insurance_billing_periods (id, integration_account_id, policy_id, period_month, correlation_id)
     values ($1, $2, $3, $4::date, $5)
     returning ${PERIOD_COLUMNS}`,
    [id, input.integrationAccountId, input.policyId, input.periodMonthFirstDay, input.correlationId]
  );
  return mapPeriodRow(result.rows[0] as PeriodRow)!;
}

/**
 * Grava o resultado do recálculo. UPDATE GUARDADO por `status = 'open'`: período fechado só muda
 * pelo caminho administrativo (`reopenPeriod`), nunca por um recálculo que chegou atrasado.
 */
export async function updatePeriodTotals(
  input: {
    id: string;
    declaredTotalAmount: number;
    premiumTotalAmount: number;
    minimumAmount: number;
    billedAmount: number;
    billingBasis: InsuranceBillingBasis;
    statement: Record<string, unknown>;
  },
  client: DbClient = null
): Promise<InsuranceBillingPeriod | null> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `update insurance_billing_periods
        set declared_total_amount = $2,
            premium_total_amount = $3,
            minimum_amount = $4,
            billed_amount = $5,
            billing_basis = $6,
            statement = $7::jsonb,
            updated_at = now()
      where id = $1 and status = 'open'
      returning ${PERIOD_COLUMNS}`,
    [
      input.id,
      input.declaredTotalAmount,
      input.premiumTotalAmount,
      input.minimumAmount,
      input.billedAmount,
      input.billingBasis,
      JSON.stringify(input.statement)
    ]
  );
  return mapPeriodRow(result.rows[0] as PeriodRow | undefined);
}

export async function closePeriodRow(id: string, client: DbClient = null): Promise<InsuranceBillingPeriod | null> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `update insurance_billing_periods
        set status = 'closed', closed_at = now(), updated_at = now()
      where id = $1 and status = 'open'
      returning ${PERIOD_COLUMNS}`,
    [id]
  );
  return mapPeriodRow(result.rows[0] as PeriodRow | undefined);
}

export async function reopenPeriodRow(id: string, client: DbClient = null): Promise<InsuranceBillingPeriod | null> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `update insurance_billing_periods
        set status = 'open', closed_at = null, updated_at = now()
      where id = $1 and status = 'closed'
      returning ${PERIOD_COLUMNS}`,
    [id]
  );
  return mapPeriodRow(result.rows[0] as PeriodRow | undefined);
}

export async function insertBillingRun(
  input: {
    billingPeriodId: string;
    trigger: InsuranceBillingRunTrigger;
    inputs: Record<string, unknown>;
    result: Record<string, unknown>;
    correlationId: string;
  },
  client: DbClient = null
): Promise<InsuranceBillingRun> {
  const exec = getQueryExecutor(client);
  const id = createPrefixedId('insbrun');
  const result = await exec(
    `insert into insurance_billing_runs (id, billing_period_id, trigger, inputs, result, correlation_id)
     values ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
     returning id, billing_period_id, trigger, inputs, result, correlation_id, created_at`,
    [id, input.billingPeriodId, input.trigger, JSON.stringify(input.inputs), JSON.stringify(input.result), input.correlationId]
  );
  return mapRunRow(result.rows[0] as RunRow)!;
}

export async function listBillingRuns(
  billingPeriodId: string,
  client: DbClient = null
): Promise<InsuranceBillingRun[]> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `select id, billing_period_id, trigger, inputs, result, correlation_id, created_at
       from insurance_billing_runs where billing_period_id = $1 order by created_at desc`,
    [billingPeriodId]
  );
  return (result.rows as RunRow[]).map((row) => mapRunRow(row)!).filter(Boolean);
}

/**
 * Averbações que entram na conta do mês: as que estão `declared` e foram criadas DENTRO do mês.
 *
 * Recorte por `created_at` da declaração (e não pela data do evento `declared`): é o instante em que
 * a viagem foi averbada e o prêmio congelado — o mesmo critério que a seguradora usa no extrato.
 * LIMITAÇÃO CONHECIDA E DELIBERADA: uma retificação feita em setembro sobre uma averbação de agosto
 * atualiza o prêmio da linha de agosto; o recálculo do período aberto reflete isso, um período já
 * FECHADO não — e é assim que deve ser (a fatura do mês fechado não muda sozinha).
 */
export async function listDeclaredDeclarationsForPeriod(
  opts: { policyId: string; periodMonthFirstDay: string },
  client: DbClient = null
): Promise<Array<{ declarationId: string; operationId: string; declaredCargoAmount: number; appliedRatePercent: number; premiumAmount: number; declaredAt: string | null }>> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `select id, operation_id, declared_cargo_amount, applied_rate_percent, premium_amount, created_at
       from insurance_shipment_declarations
      where policy_id = $1
        and status = 'declared'
        and created_at >= $2::date
        and created_at < ($2::date + interval '1 month')
      order by created_at asc`,
    [opts.policyId, opts.periodMonthFirstDay]
  );
  return (result.rows as Array<{
    id: string;
    operation_id: string;
    declared_cargo_amount: string | number;
    applied_rate_percent: string | number;
    premium_amount: string | number;
    created_at: Date | string;
  }>).map((row) => ({
    declarationId: row.id,
    operationId: row.operation_id,
    declaredCargoAmount: Number(row.declared_cargo_amount),
    appliedRatePercent: Number(row.applied_rate_percent),
    premiumAmount: Number(row.premium_amount),
    declaredAt: toIso(row.created_at)
  }));
}

/**
 * Apólices candidatas ao fechamento do mês: as que tiveram averbação `declared` no período OU têm
 * taxa vigente com custo mínimo > 0 (o mínimo é devido mesmo sem viagem nenhuma — é o piso).
 */
export async function listPolicyIdsForBillingSweep(
  opts: { periodMonthFirstDay: string; periodLastDay: string },
  client: DbClient = null
): Promise<Array<{ policyId: string; integrationAccountId: string }>> {
  const exec = getQueryExecutor(client);
  const result = await exec(
    `select distinct p.id as policy_id, p.integration_account_id
       from insurance_policies p
      where exists (
              select 1 from insurance_shipment_declarations d
               where d.policy_id = p.id
                 and d.status = 'declared'
                 and d.created_at >= $1::date
                 and d.created_at < ($1::date + interval '1 month')
            )
         or exists (
              select 1 from insurance_rate_schedules r
               where r.policy_id = p.id
                 and r.status = 'active'
                 and r.monthly_minimum_amount > 0
                 and r.valid_from <= $2::date
                 and (r.valid_until is null or r.valid_until >= $2::date)
            )
      order by p.id asc`,
    [opts.periodMonthFirstDay, opts.periodLastDay]
  );
  return (result.rows as Array<{ policy_id: string; integration_account_id: string }>).map((row) => ({
    policyId: row.policy_id,
    integrationAccountId: row.integration_account_id
  }));
}
