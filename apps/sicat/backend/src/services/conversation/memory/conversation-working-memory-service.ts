import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { createPrefixedId } from '../../../lib/ids.js';
import {
  findConversationMemory,
  upsertConversationMemory
} from '../../../repositories/conversation-memory-repo.js';
import { createChatModel, getAiConfig, hasOpenAiApiKey } from '../ai-config.js';
import {
  WORKING_MEMORY_KIND,
  WORKING_MEMORY_VERSION,
  emptyWorkingMemory,
  workingMemoryDraftSchema,
  type WorkingMemory,
  type WorkingMemoryDateWindow,
  type WorkingMemoryDraft
} from './conversation-working-memory-types.js';

/**
 * Serviço da Working Memory: a IA mantém (via LLM) e recupera um estado raciocinado
 * por conversa, dando continuidade real entre chamadas. Degrada graciosamente: sem
 * chave/LLM, o update vira merge determinístico (não perde estado nem quebra o turno).
 */

type LooseRecord = Record<string, unknown>;

const MEMORY_TTL_MS = 72 * 60 * 60 * 1000;

const MEMORY_SYSTEM_PROMPT =
  'Voce mantem a MEMORIA DE TRABALHO de uma conversa operacional do SICAT (plataforma MTR/CETESB de residuos). ' +
  'Recebe o ESTADO ANTERIOR e o TURNO ATUAL (mensagem do usuario, resposta do assistente, intent e entidades observadas) e ' +
  'retorna a memoria ATUALIZADA. Objetivo: capturar o que importa para os PROXIMOS turnos raciocinarem com continuidade. ' +
  'Chaves do JSON de saida: goal (SEMPRE infira o objetivo operacional atual do usuario a partir do pedido + historico — ex.: "consultar/listar manifestos de <periodo>", "emitir CDF dos manifestos selecionados", "diagnosticar a operacao", "receber MTR"; so use null se nao houver objetivo operacional, como em uma saudacao), ' +
  'operationalFocus { partnerRole (gerador/transportador/destinador, se houver), ' +
  'activeDateWindow {dateFrom, dateTo, label} (a JANELA DE DATAS em que o usuario esta trabalhando, formato YYYY-MM-DD), ' +
  'activeManifestIds[], activeJobIds[], activeCdfIds[] }, establishedFacts[] (fatos confirmados nesta conversa), ' +
  'openThreads[] (pendencias/proximos passos ainda nao resolvidos), narrative (resumo curto, no maximo 3 frases). ' +
  'Regras: (1) CARREGUE o estado anterior — so mude um campo quando o turno realmente mudar; ' +
  '(2) a janela de datas e uma ANCORA: atualize-a quando o usuario citar/alterar o periodo, e mantenha-a para resolver pedidos relativos ("e os de ontem", "amplia uma semana"); ' +
  '(3) remova de openThreads o que foi resolvido; (4) nao invente IDs nem datas — use as entidades observadas e o que o usuario disse; ' +
  '(5) seja conciso. Responda SOMENTE o objeto JSON, sem texto fora dele.';

let cachedLlm: ChatOpenAI | null | undefined;

/** Data operacional atual (YYYY-MM-DD) no fuso America/Sao_Paulo. */
export function operationalTodayIso(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function resolveMemoryModel(): string {
  const explicit = process.env.OPENAI_MEMORY_MODEL?.trim();
  if (explicit) return explicit;
  const compat = process.env.OPENAI_MODEL?.trim();
  if (compat) return compat;
  return 'gpt-4o-mini';
}

function getMemoryLlm(): ChatOpenAI | null {
  if (cachedLlm !== undefined) {
    return cachedLlm;
  }
  if (!hasOpenAiApiKey()) {
    cachedLlm = null;
    return null;
  }
  try {
    const config = getAiConfig();
    cachedLlm = createChatModel(resolveMemoryModel(), config.openAiApiKey);
  } catch {
    cachedLlm = null;
  }
  return cachedLlm;
}

function toRecord(value: unknown): LooseRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as LooseRecord;
  }
  return {};
}

function toNullableString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function dedupe(values: readonly string[] | undefined, max: number): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = toNullableString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}

function clip(value: string, max: number): string {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function normalizeWindow(window: unknown): WorkingMemoryDateWindow | null {
  const record = toRecord(window);
  const dateFrom = toNullableString(record.dateFrom);
  const dateTo = toNullableString(record.dateTo);
  const label = toNullableString(record.label);
  if (!dateFrom && !dateTo && !label) return null;
  return { dateFrom, dateTo, label };
}

/** Projeta uma WorkingMemory completa na forma "draft" (sem version/updatedAt) para alimentar o LLM. */
function toDraftView(wm: WorkingMemory): WorkingMemoryDraft {
  return {
    goal: wm.goal,
    operationalFocus: {
      partnerRole: wm.operationalFocus.partnerRole,
      activeDateWindow: wm.operationalFocus.activeDateWindow,
      activeManifestIds: wm.operationalFocus.activeManifestIds,
      activeJobIds: wm.operationalFocus.activeJobIds,
      activeCdfIds: wm.operationalFocus.activeCdfIds
    },
    establishedFacts: wm.establishedFacts,
    openThreads: wm.openThreads,
    narrative: wm.narrative
  };
}

function coerceStoredWorkingMemory(payload: unknown): WorkingMemory | null {
  const record = toRecord(payload);
  const parsed = workingMemoryDraftSchema.safeParse(record);
  if (!parsed.success) return null;
  const updatedAt = toNullableString(record.updatedAt) || new Date(0).toISOString();
  return buildUpdatedWorkingMemory(emptyWorkingMemory(updatedAt), parsed.data, updatedAt);
}

/** Aplica um draft sobre o estado anterior: campo ausente (undefined) mantém o anterior. */
function buildUpdatedWorkingMemory(
  previous: WorkingMemory,
  draft: WorkingMemoryDraft,
  updatedAt: string
): WorkingMemory {
  const focus = draft.operationalFocus || {};
  return {
    version: WORKING_MEMORY_VERSION,
    goal: draft.goal !== undefined ? toNullableString(draft.goal) : previous.goal,
    operationalFocus: {
      partnerRole:
        focus.partnerRole !== undefined ? toNullableString(focus.partnerRole) : previous.operationalFocus.partnerRole,
      activeDateWindow:
        focus.activeDateWindow !== undefined ? normalizeWindow(focus.activeDateWindow) : previous.operationalFocus.activeDateWindow,
      activeManifestIds:
        focus.activeManifestIds !== undefined ? dedupe(focus.activeManifestIds, 40) : previous.operationalFocus.activeManifestIds,
      activeJobIds:
        focus.activeJobIds !== undefined ? dedupe(focus.activeJobIds, 40) : previous.operationalFocus.activeJobIds,
      activeCdfIds:
        focus.activeCdfIds !== undefined ? dedupe(focus.activeCdfIds, 40) : previous.operationalFocus.activeCdfIds
    },
    establishedFacts:
      draft.establishedFacts !== undefined ? dedupe(draft.establishedFacts, 20) : previous.establishedFacts,
    openThreads: draft.openThreads !== undefined ? dedupe(draft.openThreads, 15) : previous.openThreads,
    narrative: draft.narrative !== undefined ? toNullableString(draft.narrative) : previous.narrative,
    updatedAt
  };
}

function parseDraft(content: unknown): WorkingMemoryDraft | null {
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((part) => (typeof part === 'string' ? part : toNullableString(toRecord(part).text) || ''))
      .join('');
  }
  const cleaned = text.trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    const parsed = workingMemoryDraftSchema.safeParse(obj);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

type TurnContext = {
  today: string;
  userMessage: string;
  assistantText: string;
  intent: string | null;
  observedManifestIds: string[];
  observedJobIds: string[];
  observedCdfIds: string[];
  dateRange: { dateFrom: string | null; dateTo: string | null } | null;
  toolResultSummary: string | null;
};

/** Fallback sem LLM: carrega o anterior e incorpora as entidades/janela observadas no turno. */
function deterministicDraft(previous: WorkingMemory, turn: TurnContext): WorkingMemoryDraft {
  const hasRange = Boolean(turn.dateRange && (turn.dateRange.dateFrom || turn.dateRange.dateTo));
  return {
    goal: previous.goal,
    operationalFocus: {
      partnerRole: previous.operationalFocus.partnerRole,
      activeDateWindow: hasRange
        ? { dateFrom: turn.dateRange?.dateFrom ?? null, dateTo: turn.dateRange?.dateTo ?? null, label: null }
        : previous.operationalFocus.activeDateWindow,
      activeManifestIds: turn.observedManifestIds.length ? turn.observedManifestIds : previous.operationalFocus.activeManifestIds,
      activeJobIds: turn.observedJobIds.length ? turn.observedJobIds : previous.operationalFocus.activeJobIds,
      activeCdfIds: turn.observedCdfIds.length ? turn.observedCdfIds : previous.operationalFocus.activeCdfIds
    },
    establishedFacts: previous.establishedFacts,
    openThreads: previous.openThreads,
    narrative: previous.narrative
  };
}

export async function loadWorkingMemory(input: {
  conversationSessionId: string;
  integrationAccountId: string | null;
}): Promise<WorkingMemory | null> {
  try {
    const row = await findConversationMemory(input.conversationSessionId, input.integrationAccountId, WORKING_MEMORY_KIND);
    if (!row) return null;
    return coerceStoredWorkingMemory(row.summaryPayload);
  } catch {
    return null;
  }
}

async function persistWorkingMemory(
  input: { conversationSessionId: string; integrationAccountId: string | null; sessionContextId: string | null },
  wm: WorkingMemory
): Promise<void> {
  try {
    await upsertConversationMemory({
      id: createPrefixedId('cmem'),
      conversationSessionId: input.conversationSessionId,
      summaryKind: WORKING_MEMORY_KIND,
      summaryText: clip(wm.narrative || wm.goal || 'memoria de trabalho', 480),
      summaryPayload: {
        ...wm,
        integrationAccountId: input.integrationAccountId,
        sessionContextId: input.sessionContextId
      },
      validUntil: new Date(Date.now() + MEMORY_TTL_MS).toISOString()
    });
  } catch {
    // best-effort: a memória não pode derrubar o turno
  }
}

/**
 * Recalcula a Working Memory a partir do estado anterior + turno atual (raciocinado por LLM)
 * e persiste. Pensado para rodar ASSÍNCRONO pós-resposta (não bloqueia o usuário).
 */
export async function updateAndPersistWorkingMemory(input: {
  conversationSessionId: string;
  integrationAccountId: string | null;
  sessionContextId: string | null;
  userMessage: string;
  assistantText: string;
  intent?: string | null;
  activeManifestIds?: string[];
  activeJobIds?: string[];
  activeCdfIds?: string[];
  dateRange?: { dateFrom: string | null; dateTo: string | null } | null;
  toolResultSummary?: string | null;
  today: string;
}): Promise<WorkingMemory | null> {
  const previous = (await loadWorkingMemory(input)) || emptyWorkingMemory(input.today);
  const turn: TurnContext = {
    today: input.today,
    userMessage: clip(input.userMessage, 1500),
    assistantText: clip(input.assistantText, 1800),
    intent: input.intent || null,
    observedManifestIds: dedupe(input.activeManifestIds, 20),
    observedJobIds: dedupe(input.activeJobIds, 20),
    observedCdfIds: dedupe(input.activeCdfIds, 20),
    dateRange: input.dateRange || null,
    toolResultSummary: input.toolResultSummary ? clip(input.toolResultSummary, 800) : null
  };

  const llm = getMemoryLlm();
  let draft: WorkingMemoryDraft | null = null;

  if (llm) {
    try {
      const response = await llm.invoke([
        new SystemMessage(MEMORY_SYSTEM_PROMPT),
        new HumanMessage(
          `ESTADO ANTERIOR (JSON):\n${JSON.stringify(toDraftView(previous))}\n\n` +
          `TURNO ATUAL (JSON):\n${JSON.stringify(turn)}\n\n` +
          'Retorne a MEMORIA DE TRABALHO ATUALIZADA como JSON valido (apenas o objeto).'
        )
      ]);
      draft = parseDraft(response.content);
    } catch {
      draft = null;
    }
  }

  if (!draft) {
    draft = deterministicDraft(previous, turn);
  }

  const updated = buildUpdatedWorkingMemory(previous, draft, input.today);
  await persistWorkingMemory(input, updated);
  return updated;
}

/**
 * Monta o bloco de contexto da Working Memory para injetar nos prompts (classify/plan/synthesis).
 * Inclui o relógio operacional (today) e o estado lembrado — substitui a injeção solta de data.
 */
export function buildWorkingMemoryContextBlock(wm: WorkingMemory | null, today: string = operationalTodayIso()): string {
  const lines: string[] = [`Data operacional atual: ${today} (timezone America/Sao_Paulo).`];

  if (!wm) {
    lines.push('Memoria de trabalho: nova conversa, sem estado anterior.');
    return lines.join('\n');
  }

  lines.push(
    'Memoria de trabalho desta conversa (continuidade entre turnos — use para entender o contexto, resolver referencias ' +
    'como "e os de ontem?", "esses", "o mesmo", e dar sequencia sem repetir do zero):'
  );
  if (wm.goal) lines.push(`- Objetivo atual do usuario: ${wm.goal}`);
  const focus = wm.operationalFocus;
  if (focus.partnerRole) lines.push(`- Papel/conta em foco: ${focus.partnerRole}`);
  if (focus.activeDateWindow && (focus.activeDateWindow.dateFrom || focus.activeDateWindow.dateTo)) {
    const w = focus.activeDateWindow;
    lines.push(
      `- Janela de datas ativa: ${w.dateFrom || '...'} a ${w.dateTo || '...'}${w.label ? ` (${w.label})` : ''} ` +
      '— ancore pedidos relativos a esta janela.'
    );
  }
  if (focus.activeManifestIds.length) lines.push(`- Manifestos em foco: ${focus.activeManifestIds.slice(0, 12).join(', ')}`);
  if (focus.activeJobIds.length) lines.push(`- Jobs em foco: ${focus.activeJobIds.slice(0, 8).join(', ')}`);
  if (focus.activeCdfIds.length) lines.push(`- CDFs em foco: ${focus.activeCdfIds.slice(0, 8).join(', ')}`);
  if (wm.establishedFacts.length) lines.push(`- Fatos estabelecidos: ${wm.establishedFacts.slice(0, 8).join(' | ')}`);
  if (wm.openThreads.length) lines.push(`- Pendencias em aberto: ${wm.openThreads.slice(0, 6).join(' | ')}`);
  if (wm.narrative) lines.push(`- Resumo do estado: ${wm.narrative}`);

  return lines.join('\n');
}
