/**
 * DMR validator — fase 06-domain-rules (cadeia `dmr-fluxo-base`).
 *
 * Centraliza as regras declaratórias do ciclo DMR
 * (rascunho → consolidação → submissão → confirmação remota).
 *
 * Erros são levantados como `AppError` (serializados em
 * `application/problem+json` por `src/middlewares/error-handler.ts`),
 * sempre com `code` estável (DMR_*) para que frontend/observabilidade
 * possam reagir.
 *
 * Códigos de erro (canônicos):
 *   - DMR_PERIOD_INVALID            → período mal formado / fora da janela aceitável
 *   - DMR_ROLE_INVALID              → role fora do enum DmrRole
 *   - DMR_PERIOD_OVERLAP            → período conflita com outra DMR não-cancelada
 *                                     do mesmo (integration_account_id, role)
 *   - DMR_STATUS_TRANSITION_INVALID → transição de status proibida
 *   - DMR_ITEM_INVALID              → item DMR com payload incoerente
 *   - DMR_NOT_CONSOLIDATABLE        → DMR não consolidável (status terminal,
 *                                     coleção vazia, etc.)
 *   - DMR_NOT_SUBMITTABLE           → DMR não submetível (status, período,
 *                                     conta inválida, papel incoerente)
 *   - DMR_NOT_DELETABLE             → DMR fora do conjunto cancelável
 *
 * Boundary: este módulo só faz validação. Não fala SQL diretamente — quando
 * precisa cruzar dados (overlap de período, manifesto pertencente à mesma
 * conta) recebe os dados via repositório DMR/manifest passado pelo service.
 */

import { AppError } from '../problem.js';
import {
  type DmrItemRecord,
  type DmrRecord,
  type DmrRole,
  type DmrStatus,
  findOverlappingDmr
} from '../../repositories/dmr-repo.js';
import { findManifestById } from '../../repositories/manifest-repo.js';

const DMR_ROLES: ReadonlyArray<DmrRole> = [
  'gerador',
  'transportador',
  'destinador',
  'armazenador_temporario'
];

const DMR_QUANTITY_UNITS: ReadonlyArray<DmrItemRecord['quantityUnit']> = [
  'kg',
  't',
  'm3',
  'L'
];

const DMR_PARTNER_ROLES: ReadonlyArray<DmrItemRecord['partnerRole']> = [
  'transportador',
  'destinador',
  'armazenador'
];

/**
 * Janela mínima aceitável para period_start.
 * Anterior a 2015 é considerado fora do horizonte declaratório SIGOR/CETESB.
 */
const MIN_PERIOD_YEAR = 2015;

/**
 * Tolerância máxima futura para period_end (em dias).
 * Permite cadastrar DMR para um período prestes a fechar (ex.: último dia do
 * mês), mas barra entradas obviamente erradas (ex.: ano + 1).
 */
const MAX_FUTURE_DAYS = 31;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tabela de transições válidas no ciclo declaratório DMR.
 *
 * Origem → destinos permitidos. Cobre tanto transições humanas (service)
 * quanto automáticas (worker). Entradas vazias = estado terminal sem saída.
 */
const STATUS_TRANSITIONS: Readonly<Record<DmrStatus, ReadonlySet<DmrStatus>>> = {
  draft: new Set(['consolidating', 'pending_review', 'cancelled']),
  consolidating: new Set(['pending_review', 'failed_validation']),
  pending_review: new Set(['consolidating', 'enqueued', 'cancelled']),
  enqueued: new Set(['submitting', 'failed_validation', 'cancelled']),
  submitting: new Set(['awaiting_remote', 'submitted', 'failed_remote', 'failed_validation']),
  awaiting_remote: new Set(['submitted', 'failed_remote', 'consolidating']),
  submitted: new Set(),
  failed_validation: new Set(['consolidating', 'pending_review', 'cancelled']),
  failed_remote: new Set(['enqueued', 'consolidating', 'pending_review', 'cancelled']),
  cancelled: new Set()
};

const CONSOLIDATABLE_FROM: ReadonlySet<DmrStatus> = new Set([
  'draft',
  'pending_review',
  'failed_validation',
  'failed_remote',
  'awaiting_remote' // só com force=true (validado no service)
]);

const SUBMITTABLE_FROM: ReadonlySet<DmrStatus> = new Set([
  'pending_review',
  'failed_validation',
  'failed_remote'
]);

const DELETABLE_FROM: ReadonlySet<DmrStatus> = new Set([
  'draft',
  'pending_review',
  'failed_validation'
]);

const ITEM_MUTABLE_FROM: ReadonlySet<DmrStatus> = new Set([
  'draft',
  'pending_review',
  'failed_validation'
]);

export type DmrPeriodInput = {
  periodStart: string;
  periodEnd: string;
};

export type DmrNewInput = DmrPeriodInput & {
  integrationAccountId: string;
  role: string;
};

function dmrError(
  status: number,
  title: string,
  detail: string,
  code: string,
  context?: Record<string, unknown>
): AppError {
  return new AppError(status, title, detail, {
    code,
    ...(context ? { context } : {})
  });
}

function parseIsoDate(value: string, field: string): Date {
  if (!DATE_REGEX.test(value)) {
    throw dmrError(
      400,
      'DMR Period Invalid',
      `${field} inválido: esperado formato YYYY-MM-DD (recebido "${value}").`,
      'DMR_PERIOD_INVALID',
      { field, value }
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw dmrError(
      400,
      'DMR Period Invalid',
      `${field} não representa uma data válida (recebido "${value}").`,
      'DMR_PERIOD_INVALID',
      { field, value }
    );
  }
  return parsed;
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/**
 * Valida formato + janela aceitável + ordem do par (periodStart, periodEnd).
 * Retorna as datas normalizadas (Date UTC) para usos subsequentes.
 */
export function validateDmrPeriod(input: DmrPeriodInput): { start: Date; end: Date } {
  const start = parseIsoDate(input.periodStart, 'periodStart');
  const end = parseIsoDate(input.periodEnd, 'periodEnd');

  if (start.getTime() > end.getTime()) {
    throw dmrError(
      400,
      'DMR Period Invalid',
      'periodEnd deve ser maior ou igual a periodStart.',
      'DMR_PERIOD_INVALID',
      { periodStart: input.periodStart, periodEnd: input.periodEnd }
    );
  }

  if (start.getUTCFullYear() < MIN_PERIOD_YEAR) {
    throw dmrError(
      400,
      'DMR Period Invalid',
      `periodStart anterior a ${MIN_PERIOD_YEAR}-01-01 não é aceito.`,
      'DMR_PERIOD_INVALID',
      { periodStart: input.periodStart, minYear: MIN_PERIOD_YEAR }
    );
  }

  const upperBound = addDays(todayUtc(), MAX_FUTURE_DAYS);
  if (end.getTime() > upperBound.getTime()) {
    throw dmrError(
      400,
      'DMR Period Invalid',
      `periodEnd não pode ultrapassar hoje + ${MAX_FUTURE_DAYS} dias.`,
      'DMR_PERIOD_INVALID',
      { periodEnd: input.periodEnd, maxFutureDays: MAX_FUTURE_DAYS }
    );
  }

  return { start, end };
}

export function validateDmrRole(role: string): DmrRole {
  if (!DMR_ROLES.includes(role as DmrRole)) {
    throw dmrError(
      400,
      'DMR Role Invalid',
      `role inválido: deve ser um de ${DMR_ROLES.join(', ')} (recebido "${role}").`,
      'DMR_ROLE_INVALID',
      { role, allowed: DMR_ROLES }
    );
  }
  return role as DmrRole;
}

/**
 * Valida transição de status segundo o ciclo declaratório.
 * Se `to === from`, é considerado no-op válido (idempotência operacional).
 */
export function validateStatusTransition(from: DmrStatus, to: DmrStatus): void {
  if (from === to) return;
  const allowed = STATUS_TRANSITIONS[from];
  if (!allowed?.has(to)) {
    throw dmrError(
      400,
      'DMR Status Transition Invalid',
      `Transição de status proibida: ${from} → ${to}.`,
      'DMR_STATUS_TRANSITION_INVALID',
      { from, to, allowed: Array.from(allowed ?? []) }
    );
  }
}

/**
 * Garante que não há outra DMR ativa cobrindo o mesmo período para o par
 * (integration_account_id, role). DMRs canceladas são ignoradas.
 */
export async function validatePeriodNotOverlapping(args: {
  integrationAccountId: string;
  role: DmrRole;
  periodStart: string;
  periodEnd: string;
  excludeId?: string | null;
}): Promise<void> {
  const conflict = await findOverlappingDmr({
    integrationAccountId: args.integrationAccountId,
    role: args.role,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    excludeId: args.excludeId ?? null
  });
  if (conflict) {
    throw dmrError(
      409,
      'DMR Period Overlap',
      `Já existe DMR (${conflict.id}, status=${conflict.status}) cobrindo o período ${args.periodStart}..${args.periodEnd} para a mesma conta e papel.`,
      'DMR_PERIOD_OVERLAP',
      {
        integrationAccountId: args.integrationAccountId,
        role: args.role,
        conflictId: conflict.id,
        conflictStatus: conflict.status,
        conflictPeriodStart: conflict.periodStart,
        conflictPeriodEnd: conflict.periodEnd
      }
    );
  }
}

/**
 * Validação de criação de DMR (POST /v1/dmr).
 * Combina período válido + role permitido + ausência de overlap.
 */
export async function validateNewDmr(input: DmrNewInput): Promise<{
  role: DmrRole;
  periodStart: string;
  periodEnd: string;
}> {
  validateDmrPeriod(input);
  const role = validateDmrRole(input.role);
  await validatePeriodNotOverlapping({
    integrationAccountId: input.integrationAccountId,
    role,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    excludeId: null
  });
  return { role, periodStart: input.periodStart, periodEnd: input.periodEnd };
}

export type DmrItemMutationInput = {
  manifestId?: string | null;
  mtrNumber?: string | null;
  residueClass?: string | null;
  quantityValue?: number | null;
  quantityUnit?: string | null;
  partnerRole?: string | null;
  partnerCnpj?: string | null;
};

/**
 * Validações estruturais de um item antes de inserir.
 * - quantidade > 0
 * - unidade canônica
 * - partner role canônico
 * - se manifest_id presente, manifesto existe e pertence à mesma
 *   integration_account.
 */
export async function validateItemMutation(
  dmr: DmrRecord,
  item: DmrItemMutationInput
): Promise<void> {
  if (!ITEM_MUTABLE_FROM.has(dmr.status)) {
    throw dmrError(
      400,
      'DMR Item Invalid',
      `DMR em status ${dmr.status} não aceita mutação de itens (esperado: ${[...ITEM_MUTABLE_FROM].join(', ')}).`,
      'DMR_ITEM_INVALID',
      { dmrId: dmr.id, status: dmr.status }
    );
  }

  if (typeof item.mtrNumber !== 'string' || item.mtrNumber.trim().length === 0) {
    throw dmrError(
      400,
      'DMR Item Invalid',
      'mtrNumber é obrigatório no item DMR.',
      'DMR_ITEM_INVALID',
      { field: 'mtrNumber' }
    );
  }

  if (typeof item.residueClass !== 'string' || item.residueClass.trim().length === 0) {
    throw dmrError(
      400,
      'DMR Item Invalid',
      'residueClass é obrigatório no item DMR.',
      'DMR_ITEM_INVALID',
      { field: 'residueClass' }
    );
  }

  if (
    typeof item.quantityValue !== 'number'
    || !Number.isFinite(item.quantityValue)
    || item.quantityValue <= 0
  ) {
    throw dmrError(
      400,
      'DMR Item Invalid',
      'quantityValue deve ser numérico e maior que zero.',
      'DMR_ITEM_INVALID',
      { field: 'quantityValue', value: item.quantityValue }
    );
  }

  if (!DMR_QUANTITY_UNITS.includes(item.quantityUnit as DmrItemRecord['quantityUnit'])) {
    throw dmrError(
      400,
      'DMR Item Invalid',
      `quantityUnit inválido: esperado um de ${DMR_QUANTITY_UNITS.join(', ')}.`,
      'DMR_ITEM_INVALID',
      { field: 'quantityUnit', value: item.quantityUnit, allowed: DMR_QUANTITY_UNITS }
    );
  }

  if (!DMR_PARTNER_ROLES.includes(item.partnerRole as DmrItemRecord['partnerRole'])) {
    throw dmrError(
      400,
      'DMR Item Invalid',
      `partnerRole inválido: esperado um de ${DMR_PARTNER_ROLES.join(', ')}.`,
      'DMR_ITEM_INVALID',
      { field: 'partnerRole', value: item.partnerRole, allowed: DMR_PARTNER_ROLES }
    );
  }

  if (typeof item.partnerCnpj !== 'string' || item.partnerCnpj.trim().length === 0) {
    throw dmrError(
      400,
      'DMR Item Invalid',
      'partnerCnpj é obrigatório no item DMR.',
      'DMR_ITEM_INVALID',
      { field: 'partnerCnpj' }
    );
  }

  if (item.manifestId) {
    const manifest = await findManifestById(item.manifestId);
    if (!manifest) {
      throw dmrError(
        400,
        'DMR Item Invalid',
        `Manifesto ${item.manifestId} referenciado no item DMR não foi encontrado.`,
        'DMR_ITEM_INVALID',
        { field: 'manifestId', value: item.manifestId }
      );
    }
    if (manifest.integrationAccountId !== dmr.integrationAccountId) {
      throw dmrError(
        400,
        'DMR Item Invalid',
        `Manifesto ${item.manifestId} pertence a outra conta CETESB (${manifest.integrationAccountId}); DMR aponta para ${dmr.integrationAccountId}.`,
        'DMR_ITEM_INVALID',
        {
          field: 'manifestId',
          manifestId: item.manifestId,
          manifestAccountId: manifest.integrationAccountId,
          dmrAccountId: dmr.integrationAccountId
        }
      );
    }
  }
}

/**
 * Validação para consolidate (POST /v1/dmr/:id/consolidate).
 * - status deve permitir consolidação
 * - awaiting_remote só consolida com force=true
 * - precisa ter pelo menos 1 item (após consolidação real os itens já
 *   existem; aqui validamos coleção atual antes da reconsolidação para
 *   evitar transições vazias).
 */
export function validateConsolidate(
  dmr: DmrRecord,
  items: ReadonlyArray<DmrItemRecord>,
  options: { force: boolean }
): void {
  if (!CONSOLIDATABLE_FROM.has(dmr.status)) {
    throw dmrError(
      400,
      'DMR Not Consolidatable',
      `DMR em status ${dmr.status} não pode ser consolidada.`,
      'DMR_NOT_CONSOLIDATABLE',
      { dmrId: dmr.id, status: dmr.status, allowed: [...CONSOLIDATABLE_FROM] }
    );
  }

  if (dmr.status === 'awaiting_remote' && !options.force) {
    throw dmrError(
      400,
      'DMR Not Consolidatable',
      'DMR aguardando confirmação remota — use force=true para reconsolidar.',
      'DMR_NOT_CONSOLIDATABLE',
      { dmrId: dmr.id, status: dmr.status }
    );
  }

  // Para reconsolidação a partir de pending_review/failed_*, exigimos
  // que a próxima transição seja válida (consolidating).
  validateStatusTransition(dmr.status, 'consolidating');

  // Coleção pode estar vazia em rascunho recém-criado — só barramos
  // explicitamente se a fase de consolidação real (futura) não for
  // popular itens automaticamente. Aqui mantemos o gate como soft:
  // status diferente de draft DEVE ter ao menos 1 item.
  if (dmr.status !== 'draft' && items.length === 0) {
    throw dmrError(
      400,
      'DMR Not Consolidatable',
      `DMR ${dmr.id} não possui itens para consolidar (status=${dmr.status}).`,
      'DMR_NOT_CONSOLIDATABLE',
      { dmrId: dmr.id, status: dmr.status, itemCount: 0 }
    );
  }
}

export type DmrSubmitContext = {
  account: { id: string } | null;
  sessionContextExists: boolean;
};

/**
 * Validação para submit (POST /v1/dmr/:id/submit).
 * - status deve permitir submit
 * - precisa ter ≥1 item
 * - período fechado (period_end <= hoje)
 * - conta CETESB existente
 * - papel da DMR coerente com partnerRole agregado dos itens
 *   (gerador → transportador/destinador; transportador/destinador/
 *   armazenador_temporario → ao menos 1 item com partnerRole compatível).
 */
export function validateSubmit(
  dmr: DmrRecord,
  items: ReadonlyArray<DmrItemRecord>,
  ctx: DmrSubmitContext
): void {
  if (!SUBMITTABLE_FROM.has(dmr.status)) {
    throw dmrError(
      400,
      'DMR Not Submittable',
      `DMR em status ${dmr.status} não pode ser submetida (esperado: ${[...SUBMITTABLE_FROM].join(', ')}).`,
      'DMR_NOT_SUBMITTABLE',
      { dmrId: dmr.id, status: dmr.status, allowed: [...SUBMITTABLE_FROM] }
    );
  }

  validateStatusTransition(dmr.status, 'enqueued');

  if (items.length === 0) {
    throw dmrError(
      400,
      'DMR Not Submittable',
      `DMR ${dmr.id} não possui itens para submissão.`,
      'DMR_NOT_SUBMITTABLE',
      { dmrId: dmr.id, itemCount: 0 }
    );
  }

  const today = todayUtc();
  const end = parseIsoDate(dmr.periodEnd, 'periodEnd');
  if (end.getTime() > today.getTime()) {
    throw dmrError(
      400,
      'DMR Not Submittable',
      `DMR ${dmr.id} não pode ser submetida antes de o período declaratório encerrar (period_end=${dmr.periodEnd}, hoje=${today.toISOString().slice(0, 10)}).`,
      'DMR_NOT_SUBMITTABLE',
      { dmrId: dmr.id, periodEnd: dmr.periodEnd, today: today.toISOString().slice(0, 10) }
    );
  }

  if (!ctx.account) {
    throw dmrError(
      400,
      'DMR Not Submittable',
      `Conta CETESB ${dmr.integrationAccountId} não foi encontrada — não é possível submeter a DMR.`,
      'DMR_NOT_SUBMITTABLE',
      { dmrId: dmr.id, integrationAccountId: dmr.integrationAccountId }
    );
  }

  if (!ctx.sessionContextExists) {
    throw dmrError(
      400,
      'DMR Not Submittable',
      `sessionContext informado para a DMR ${dmr.id} não foi encontrado.`,
      'DMR_NOT_SUBMITTABLE',
      { dmrId: dmr.id }
    );
  }

  validateRoleCoherence(dmr.role, items);
}

/**
 * Garante que ao menos um item da DMR é coerente com o papel declarado.
 * Mapeamento canônico (alinhado a docs/04-arquitetura/dmr-sicat.md §3.3):
 *   role=gerador               → partnerRole ∈ {transportador, destinador, armazenador}
 *   role=transportador         → partnerRole ∈ {destinador, armazenador}
 *   role=destinador            → partnerRole ∈ {transportador}
 *   role=armazenador_temporario → partnerRole ∈ {transportador, destinador}
 */
function validateRoleCoherence(role: DmrRole, items: ReadonlyArray<DmrItemRecord>): void {
  const expected: Record<DmrRole, ReadonlySet<DmrItemRecord['partnerRole']>> = {
    gerador: new Set(['transportador', 'destinador', 'armazenador']),
    transportador: new Set(['destinador', 'armazenador']),
    destinador: new Set(['transportador']),
    armazenador_temporario: new Set(['transportador', 'destinador'])
  };
  const allowed = expected[role];
  const ok = items.some((item) => allowed.has(item.partnerRole));
  if (!ok) {
    throw dmrError(
      400,
      'DMR Not Submittable',
      `Itens da DMR não são coerentes com o papel declarado (role=${role}). Esperado pelo menos um item com partnerRole ∈ ${[...allowed].join('/')}.`,
      'DMR_NOT_SUBMITTABLE',
      { role, allowedPartnerRoles: [...allowed] }
    );
  }
}

export function validateDelete(dmr: DmrRecord): void {
  if (!DELETABLE_FROM.has(dmr.status)) {
    throw dmrError(
      400,
      'DMR Not Deletable',
      `DMR em status ${dmr.status} não pode ser cancelada (esperado: ${[...DELETABLE_FROM].join(', ')}).`,
      'DMR_NOT_DELETABLE',
      { dmrId: dmr.id, status: dmr.status, allowed: [...DELETABLE_FROM] }
    );
  }
  validateStatusTransition(dmr.status, 'cancelled');
}

export const DMR_VALIDATOR_INTERNALS = Object.freeze({
  STATUS_TRANSITIONS,
  CONSOLIDATABLE_FROM,
  SUBMITTABLE_FROM,
  DELETABLE_FROM,
  ITEM_MUTABLE_FROM,
  DMR_ROLES,
  DMR_QUANTITY_UNITS,
  DMR_PARTNER_ROLES,
  MIN_PERIOD_YEAR,
  MAX_FUTURE_DAYS
});
