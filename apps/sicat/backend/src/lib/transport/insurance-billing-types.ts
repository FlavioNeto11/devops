/**
 * Tipos da apuração mensal do prêmio de averbação (PR-I4 do Módulo Transportadora,
 * REQ-SICAT-0035).
 *
 * Espelha 1:1 os CHECKs da migration `037_transport_insurance_billing.sql` — mudou lá, muda aqui
 * no mesmo PR (mesmo contrato de `averbacao-types.ts`).
 */

export const INSURANCE_BILLING_STATUSES = ['open', 'closed'] as const;
export type InsuranceBillingStatus = (typeof INSURANCE_BILLING_STATUSES)[number];

/** Qual lado da conta venceu: o apurado pelas taxas ou o piso mensal da apólice. */
export const INSURANCE_BILLING_BASES = ['premium', 'minimum'] as const;
export type InsuranceBillingBasis = (typeof INSURANCE_BILLING_BASES)[number];

export const INSURANCE_BILLING_RUN_TRIGGERS = ['sweep', 'manual', 'recompute'] as const;
export type InsuranceBillingRunTrigger = (typeof INSURANCE_BILLING_RUN_TRIGGERS)[number];

/** Uma linha do extrato — o SNAPSHOT da averbação que entrou na conta daquele fechamento. */
export type InsuranceBillingStatementItem = {
  declarationId: string;
  operationId: string;
  declaredCargoAmount: number;
  appliedRatePercent: number;
  premiumAmount: number;
  declaredAt: string | null;
};

export type InsuranceBillingPeriod = {
  id: string;
  integrationAccountId: string;
  policyId: string;
  /** Sempre o dia 1 do mês em ISO (`YYYY-MM-01`); a API expõe `YYYY-MM`. */
  periodMonth: string;
  declaredTotalAmount: number;
  premiumTotalAmount: number;
  minimumAmount: number;
  billedAmount: number;
  billingBasis: InsuranceBillingBasis;
  status: InsuranceBillingStatus;
  statement: { items: InsuranceBillingStatementItem[]; notes?: string[] };
  closedAt: string | null;
  correlationId: string;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type InsuranceBillingRun = {
  id: string;
  billingPeriodId: string;
  trigger: InsuranceBillingRunTrigger;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  correlationId: string;
  createdAt: string | null;
};

/** `YYYY-MM` → primeiro dia do mês em ISO; lança em formato inválido (nunca mês silenciosamente errado). */
export function periodMonthToFirstDay(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || '').trim());
  if (!match) {
    throw new Error(`Período inválido: use o formato YYYY-MM (recebido "${String(period)}").`);
  }
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Período inválido: mês fora de 01..12 (recebido "${String(period)}").`);
  }
  return `${match[1]}-${match[2]}-01`;
}

/** ISO (`YYYY-MM-01` ou data completa) → `YYYY-MM` para a API/UI. */
export function firstDayToPeriodMonth(isoDate: string): string {
  return String(isoDate || '').slice(0, 7);
}

/** Último dia do mês em ISO — é a data de referência para escolher a taxa vigente no fechamento. */
export function periodMonthLastDay(period: string): string {
  const firstDay = periodMonthToFirstDay(period);
  const year = Number(firstDay.slice(0, 4));
  const month = Number(firstDay.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${firstDay.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
}

/** O mês ANTERIOR ao da data de referência — o alvo natural da sweep de fechamento. */
export function previousPeriodMonth(referenceIsoDate: string): string {
  const reference = new Date(`${String(referenceIsoDate).slice(0, 10)}T00:00:00.000Z`);
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth(); // 0-based: já é o mês anterior em base 1
  const target = month === 0 ? { year: year - 1, month: 12 } : { year, month };
  return `${target.year}-${String(target.month).padStart(2, '0')}`;
}
