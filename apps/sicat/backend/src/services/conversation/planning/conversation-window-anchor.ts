/**
 * Ancoragem DETERMINÍSTICA da janela de datas conversacional em HOJE.
 *
 * Problema real observado em produção (revalidação 2026-08-02): perguntado
 * "quantos manifestos estão aguardando baixa?" — pergunta SEM período — o
 * planner emitiu por conta própria `selection.dateFrom=2024-06-17` /
 * `selection.dateTo=2026-06-17`: uma janela de DOIS ANOS terminando 46 dias no
 * PASSADO. Como o filtro de datas é aplicado sobre a data de expedição, os 38
 * manifestos aguardando baixa (todos recentes) ficaram FORA e a resposta virou
 * "0 manifestos" — contradizendo a própria tela.
 *
 * A origem não é um default de range amplo no código: é o LLM ancorando a
 * janela num "hoje" alucinado. A correção não pode ser heurística de frase
 * (diretriz do produto: decisão via LLM, nada de mapa de palavras-chave), então
 * usamos o único sinal determinístico disponível: o CLASSIFICADOR extrai
 * `entities.dateFrom/dateTo` APENAS quando o usuário cita um período explícito
 * (contrato declarado no prompt do classificador). Logo:
 *
 * - usuário CITOU período  -> janela é dele, fica intocada (inclusive histórica);
 * - usuário NÃO citou      -> a janela foi INVENTADA pelo planner e é reancorada
 *                             para TERMINAR na data operacional de hoje,
 *                             preservando a amplitude que o planner escolheu.
 *
 * Assim "últimos 2 anos" continua sendo 2 anos, mas 2 anos ATÉ HOJE.
 */

const DAY_MS = 86_400_000;

export type ConversationDateWindow = {
  dateFrom: string | null;
  dateTo: string | null;
};

export type AnchoredConversationDateWindow = ConversationDateWindow & {
  /** `none` = janela preservada; `reanchored` = deslocada para terminar hoje. */
  anchor: 'none' | 'reanchored';
  /** Janela original, para trilha/auditoria quando houve reancoragem. */
  originalDateFrom: string | null;
  originalDateTo: string | null;
};

export function getOperationalTimezone(): string {
  const raw = process.env.SICAT_OPERATIONAL_TIMEZONE || 'America/Sao_Paulo';
  const trimmed = raw.trim();
  return trimmed || 'America/Sao_Paulo';
}

export function getOperationalTodayIso(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: getOperationalTimezone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toUtcTimestamp(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`);
}

function shiftIsoDate(isoDate: string, deltaMs: number): string {
  return new Date(toUtcTimestamp(isoDate) + deltaMs).toISOString().slice(0, 10);
}

const DATE_ENTITY_KEYS = ['dateFrom', 'dateTo', 'from', 'to', 'startDate', 'endDate'] as const;
const RELATIVE_ENTITY_KEYS = ['lastDays', 'recentDays', 'daysWindow', 'relativePeriod'] as const;

function hasDateValue(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((key) => {
    const value = record[key];
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    return false;
  });
}

/**
 * O usuário nomeou um período? Verdade extraída das ENTIDADES do classificador
 * (que só as preenche diante de período explícito na frase) — nunca do que o
 * planner inventou em `selection`.
 */
export function userNamedPeriod(entities: unknown): boolean {
  if (!entities || typeof entities !== 'object' || Array.isArray(entities)) return false;
  const record = entities as Record<string, unknown>;

  if (hasDateValue(record, DATE_ENTITY_KEYS)) return true;
  if (hasDateValue(record, RELATIVE_ENTITY_KEYS)) return true;

  const nested = record.dateRange;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return hasDateValue(nested as Record<string, unknown>, DATE_ENTITY_KEYS);
  }

  return false;
}

/**
 * Reancora, quando aplicável, a janela para TERMINAR na data operacional de
 * hoje, preservando a amplitude original. Sem `dateTo` não há o que reancorar
 * (janela aberta já alcança hoje).
 */
export function anchorConversationDateWindow(input: {
  dateFrom: unknown;
  dateTo: unknown;
  userNamedPeriod: boolean;
  todayIso?: string;
}): AnchoredConversationDateWindow {
  const dateFrom = isIsoDate(input.dateFrom) ? input.dateFrom : null;
  const dateTo = isIsoDate(input.dateTo) ? input.dateTo : null;
  const unchanged: AnchoredConversationDateWindow = {
    dateFrom,
    dateTo,
    anchor: 'none',
    originalDateFrom: dateFrom,
    originalDateTo: dateTo
  };

  if (input.userNamedPeriod) return unchanged;
  if (!dateTo) return unchanged;

  const todayIso = isIsoDate(input.todayIso) ? input.todayIso : getOperationalTodayIso();
  if (dateTo === todayIso) return unchanged;

  const deltaMs = toUtcTimestamp(todayIso) - toUtcTimestamp(dateTo);
  if (!Number.isFinite(deltaMs) || deltaMs === 0) return unchanged;

  return {
    dateFrom: dateFrom ? shiftIsoDate(dateFrom, deltaMs) : null,
    dateTo: todayIso,
    anchor: 'reanchored',
    originalDateFrom: dateFrom,
    originalDateTo: dateTo
  };
}
