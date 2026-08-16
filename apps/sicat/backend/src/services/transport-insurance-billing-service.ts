/**
 * Apuração mensal do prêmio de averbação (PR-I4 do Módulo Transportadora, REQ-SICAT-0035).
 *
 * A conta que o circuito real do TRC faz no fim do mês (doc Irmãos PADILHA): soma o transportado,
 * soma os prêmios das averbações e cobra o MAIOR entre esse total e o custo mínimo mensal da
 * apólice. Este serviço materializa a conta num período consultável, com trilha reproduzível.
 *
 * Camadas (fronteira do repo): tudo que é decisão de cálculo vive no motor PURO
 * `insurance-premium-engine.ts`; aqui é orquestração — ler declarações, resolver a taxa vigente no
 * fechamento, gravar o snapshot e a execução append-only.
 *
 * IDEMPOTÊNCIA: `recomputePeriod` de um período ABERTO pode rodar quantas vezes for — recalcula do
 * zero a partir das declarações e sobrescreve o snapshot. Período FECHADO é imutável (a fatura já
 * saiu); reabrir é ação administrativa explícita, e ela também deixa rastro na trilha.
 */

import { AppError } from '../lib/problem.js';
import { createCorrelationId } from '../lib/ids.js';
import {
  computeBillingPeriodCents,
  selectApplicableRate,
  type RateScheduleForSelection
} from '../lib/transport/insurance-premium-engine.js';
import {
  firstDayToPeriodMonth,
  periodMonthLastDay,
  periodMonthToFirstDay,
  type InsuranceBillingPeriod,
  type InsuranceBillingRunTrigger,
  type InsuranceBillingStatementItem
} from '../lib/transport/insurance-billing-types.js';
import {
  closePeriodRow,
  findPeriodById,
  findPeriodByIdInternal,
  findPeriodByPolicyMonth,
  insertBillingRun,
  insertPeriod,
  listBillingRuns,
  listDeclaredDeclarationsForPeriod,
  listPeriodsForAccount,
  listPolicyIdsForBillingSweep,
  reopenPeriodRow,
  updatePeriodTotals
} from '../repositories/insurance-billing-repo.js';
import { getPolicyById, listRateSchedulesForPolicy } from '../repositories/transport-insurance-repo.js';

type LooseRecord = Record<string, unknown>;

function toTrimmedString(value: unknown): string {
  return String(value ?? '').trim();
}

/** Mesma catraca de tenancy das demais superfícies da vertical (molde `transport-averbacao-service`). */
function requireIntegrationAccountId(source: LooseRecord): string {
  const value = toTrimmedString(source.integrationAccountId);
  if (!value) {
    throw new AppError(400, 'Bad Request', 'integrationAccountId é obrigatório.', {
      code: 'TRANSPORTE_INTEGRATION_ACCOUNT_REQUIRED'
    });
  }
  return value;
}

/** Reais → centavos inteiros (o motor só trabalha em centavos). */
function toCents(amount: number): number {
  return Math.round(Number(amount || 0) * 100);
}

/** Centavos → reais com 2 casas (o que vai para o banco/contrato). */
function toAmount(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function periodNotFound(periodId: string): AppError {
  return new AppError(404, 'Not Found', `Período de apuração ${periodId} não encontrado nesta conta.`, {
    code: 'TRANSPORTE_BILLING_PERIOD_NOT_FOUND'
  });
}

/**
 * Recalcula (ou cria) o período de uma apólice/mês a partir das averbações `declared`.
 *
 * O custo mínimo vem da taxa VIGENTE NO ÚLTIMO DIA DO MÊS — é a condição comercial que valia quando
 * a conta fechou. Sem taxa vigente o mínimo é 0 e o período registra a observação no `statement`
 * (não é erro: a apólice pode ter sido cadastrada sem condições comerciais).
 */
export async function recomputeBillingPeriod(opts: {
  policyId: string;
  integrationAccountId: string;
  period: string;
  trigger?: InsuranceBillingRunTrigger;
  correlationId?: string;
}): Promise<InsuranceBillingPeriod> {
  const period = String(opts.period || '').trim();
  const periodFirstDay = periodMonthToFirstDay(period);
  const periodLastDay = periodMonthLastDay(period);
  const correlationId = opts.correlationId || createCorrelationId();
  const trigger: InsuranceBillingRunTrigger = opts.trigger || 'manual';

  const policy = await getPolicyById(opts.policyId, opts.integrationAccountId);
  if (!policy) {
    throw new AppError(404, 'Not Found', `Apólice ${opts.policyId} não encontrada nesta conta.`, {
      code: 'TRANSPORTE_INSURANCE_POLICY_NOT_FOUND'
    });
  }

  let periodRow = await findPeriodByPolicyMonth(opts.policyId, periodFirstDay);
  if (!periodRow) {
    periodRow = await insertPeriod({
      integrationAccountId: opts.integrationAccountId,
      policyId: opts.policyId,
      periodMonthFirstDay: periodFirstDay,
      correlationId
    });
  }

  if (periodRow.status === 'closed') {
    throw new AppError(409, 'Conflict', 'Período já fechado: reabra explicitamente antes de recalcular.', {
      code: 'TRANSPORTE_BILLING_PERIOD_CLOSED'
    });
  }

  const declarations = await listDeclaredDeclarationsForPeriod({
    policyId: opts.policyId,
    periodMonthFirstDay: periodFirstDay
  });

  const schedules = await listRateSchedulesForPolicy(opts.policyId, opts.integrationAccountId);
  // O motor decide pela VIGÊNCIA (não precisa do id); o id volta por fora só para a trilha do run —
  // mesmo arranjo do `averbarOperacaoService`.
  type SelectableWithId = RateScheduleForSelection & { id: string };
  const selectable: SelectableWithId[] = schedules.map((schedule) => ({
    id: schedule.id,
    ratePercent: schedule.ratePercent,
    routeScope: schedule.routeScope,
    monthlyMinimumAmount: schedule.monthlyMinimumAmount,
    validFrom: schedule.validFrom,
    validUntil: schedule.validUntil,
    status: schedule.status
  }));
  // Mínimo é da apólice (não do percurso): a seleção usa o escopo default (routeScope null).
  const applicableRate = selectApplicableRate(selectable, {
    referenceDate: periodLastDay,
    routeScope: null
  }) as SelectableWithId | null;

  const notes: string[] = [];
  if (!applicableRate) {
    notes.push('Sem tabela de taxa vigente no fechamento: custo mínimo considerado como zero.');
  }
  const minimumAmount = applicableRate ? Number(applicableRate.monthlyMinimumAmount || 0) : 0;

  const totals = computeBillingPeriodCents({
    declarations: declarations.map((declaration) => ({
      declaredCargoAmountCents: toCents(declaration.declaredCargoAmount),
      premiumAmountCents: toCents(declaration.premiumAmount)
    })),
    minimumAmountCents: toCents(minimumAmount)
  });

  const items: InsuranceBillingStatementItem[] = declarations.map((declaration) => ({
    declarationId: declaration.declarationId,
    operationId: declaration.operationId,
    declaredCargoAmount: declaration.declaredCargoAmount,
    appliedRatePercent: declaration.appliedRatePercent,
    premiumAmount: declaration.premiumAmount,
    declaredAt: declaration.declaredAt
  }));

  const updated = await updatePeriodTotals({
    id: periodRow.id,
    declaredTotalAmount: toAmount(totals.declaredTotalCents),
    premiumTotalAmount: toAmount(totals.premiumTotalCents),
    minimumAmount,
    billedAmount: toAmount(totals.billedCents),
    billingBasis: totals.billingBasis,
    statement: { items, ...(notes.length > 0 ? { notes } : {}) }
  });

  const finalPeriod = updated || periodRow;

  await insertBillingRun({
    billingPeriodId: periodRow.id,
    trigger,
    inputs: {
      policyId: opts.policyId,
      period,
      declarationCount: declarations.length,
      rateScheduleId: applicableRate?.id ?? null,
      minimumAmount
    },
    result: {
      declaredTotalAmount: finalPeriod.declaredTotalAmount,
      premiumTotalAmount: finalPeriod.premiumTotalAmount,
      billedAmount: finalPeriod.billedAmount,
      billingBasis: finalPeriod.billingBasis,
      ...(notes.length > 0 ? { notes } : {})
    },
    correlationId
  });

  return finalPeriod;
}

/** Fecha o período (recalcula antes — a conta fechada precisa refletir o estado final do mês). */
export async function closeBillingPeriod(opts: {
  periodId: string;
  integrationAccountId: string;
  correlationId?: string;
}): Promise<InsuranceBillingPeriod> {
  const existing = await findPeriodById(opts.periodId, opts.integrationAccountId);
  if (!existing) throw periodNotFound(opts.periodId);
  if (existing.status === 'closed') return existing; // idempotente: fechar de novo é NO-OP

  await recomputeBillingPeriod({
    policyId: existing.policyId,
    integrationAccountId: opts.integrationAccountId,
    period: firstDayToPeriodMonth(existing.periodMonth),
    trigger: 'recompute',
    correlationId: opts.correlationId
  });

  const closed = await closePeriodRow(existing.id);
  return closed || (await findPeriodById(opts.periodId, opts.integrationAccountId))!;
}

/**
 * Reabre um período fechado — ação ADMINISTRATIVA explícita (`force`), com rastro obrigatório na
 * trilha: a fatura do mês não se reabre por acidente.
 */
export async function reopenBillingPeriod(opts: {
  periodId: string;
  integrationAccountId: string;
  reason?: string;
  correlationId?: string;
}): Promise<InsuranceBillingPeriod> {
  const existing = await findPeriodById(opts.periodId, opts.integrationAccountId);
  if (!existing) throw periodNotFound(opts.periodId);
  if (existing.status === 'open') return existing;

  const reopened = await reopenPeriodRow(existing.id);
  await insertBillingRun({
    billingPeriodId: existing.id,
    trigger: 'recompute',
    inputs: { reopened: true, reason: opts.reason || null },
    result: { status: 'open' },
    correlationId: opts.correlationId || createCorrelationId()
  });
  return reopened || existing;
}

/** Recurso HTTP do período — `periodMonth` sai como `YYYY-MM` (o banco guarda o dia 1). */
function toPeriodResource(period: InsuranceBillingPeriod) {
  return { ...period, periodMonth: firstDayToPeriodMonth(period.periodMonth) };
}

// -------------------------------------------------------------------------------------------------
// Superfície HTTP (recebe a query/body crus; molde `listSegurosAverbacoesService`)
// -------------------------------------------------------------------------------------------------

export async function listApuracaoService(query: LooseRecord): Promise<{
  items: ReturnType<typeof toPeriodResource>[];
  total: number;
  period: string | null;
}> {
  const integrationAccountId = requireIntegrationAccountId(query);
  const period = toTrimmedString(query.period) || null;
  const periodFirstDay = period ? periodMonthToFirstDay(period) : null;
  const items = await listPeriodsForAccount({ integrationAccountId, periodMonthFirstDay: periodFirstDay });
  return { items: items.map(toPeriodResource), total: items.length, period };
}

export async function getApuracaoService(periodId: string, query: LooseRecord) {
  const integrationAccountId = requireIntegrationAccountId(query);
  const period = await findPeriodById(toTrimmedString(periodId), integrationAccountId);
  if (!period) throw periodNotFound(periodId);
  const runs = await listBillingRuns(period.id);
  return { ...toPeriodResource(period), runs };
}

export async function recalcularApuracaoService(periodId: string, body: LooseRecord) {
  const integrationAccountId = requireIntegrationAccountId(body);
  const existing = await findPeriodById(toTrimmedString(periodId), integrationAccountId);
  if (!existing) throw periodNotFound(periodId);
  const recomputed = await recomputeBillingPeriod({
    policyId: existing.policyId,
    integrationAccountId,
    period: firstDayToPeriodMonth(existing.periodMonth),
    trigger: 'manual'
  });
  return toPeriodResource(recomputed);
}

export async function fecharApuracaoService(periodId: string, body: LooseRecord) {
  const integrationAccountId = requireIntegrationAccountId(body);
  const closed = await closeBillingPeriod({ periodId: toTrimmedString(periodId), integrationAccountId });
  return toPeriodResource(closed);
}

export async function reabrirApuracaoService(periodId: string, body: LooseRecord) {
  const integrationAccountId = requireIntegrationAccountId(body);
  const reason = toTrimmedString(body.reason) || undefined;
  const reopened = await reopenBillingPeriod({ periodId: toTrimmedString(periodId), integrationAccountId, reason });
  return toPeriodResource(reopened);
}

/** Usado pelo worker (job de fechamento) — resolve a linha sem tenancy, pelo payload do job. */
export async function closeBillingPeriodFromJob(billingPeriodId: string, correlationId: string): Promise<void> {
  const period = await findPeriodByIdInternal(billingPeriodId);
  if (!period) return; // período sumiu (base recriada): nada a fazer, job não deve falhar
  if (period.status === 'closed') return;
  await recomputeBillingPeriod({
    policyId: period.policyId,
    integrationAccountId: period.integrationAccountId,
    period: firstDayToPeriodMonth(period.periodMonth),
    trigger: 'sweep',
    correlationId
  });
  await closePeriodRow(period.id);
}

/**
 * Alvos do fechamento mensal: para cada apólice com movimento (ou com mínimo devido) no mês, garante
 * o período criado e devolve os ids para a sweep enfileirar um job por período.
 */
export async function prepareBillingPeriodsForSweep(period: string): Promise<InsuranceBillingPeriod[]> {
  const periodFirstDay = periodMonthToFirstDay(period);
  const periodLastDay = periodMonthLastDay(period);
  const candidates = await listPolicyIdsForBillingSweep({ periodMonthFirstDay: periodFirstDay, periodLastDay });

  const prepared: InsuranceBillingPeriod[] = [];
  for (const candidate of candidates) {
    let periodRow = await findPeriodByPolicyMonth(candidate.policyId, periodFirstDay);
    if (!periodRow) {
      periodRow = await insertPeriod({
        integrationAccountId: candidate.integrationAccountId,
        policyId: candidate.policyId,
        periodMonthFirstDay: periodFirstDay,
        correlationId: createCorrelationId()
      });
    }
    if (periodRow.status === 'open') prepared.push(periodRow);
  }
  return prepared;
}
