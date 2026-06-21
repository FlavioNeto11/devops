// Grafo de raciocínio do GymOps (F1+F3) — router fast/deep → especialista `ops`
// com tools read-only → VERIFY (judge), com MEMÓRIA em 3 horizontes (F3):
// thread server-side em Postgres (sobrevive a reload/restart), rolling summary
// e memória longa por usuário em pgvector. Atrás da flag AI_GRAPH (default off).
import OpenAI from 'openai';
import {
  createAiGraph, createLlm, createAiTracer,
  createThreadStore, createRollingSummarizer, createUserMemory, createEmbedder, extractMemoryFacts,
  type GraphTurn, type GraphResult, type LlmAdapter,
} from '@flavioneto11/ai-core';
import { getOpenAI } from '../ai.service.js';
import { env } from '../../env.js';
import { aiMetrics } from '../ai-metrics.js';
import { gymopsToolRegistry } from './tools.js';
import { db } from '../../lib/prisma.js';

export const AI_GRAPH_ENABLED = (): boolean =>
  (process.env.AI_GRAPH ?? 'off').trim().toLowerCase() === 'on';

// systemPrompt inline = FALLBACK (F5): quando AI_CONTROL_PLANE_URL está setada,
// refreshSpecialistPrompt() substitui o texto pelo prompt ATIVO servido pelo
// control-plane (promote/rollback sem deploy). O grafo lê por referência a
// cada turno, então a troca vale no turno seguinte.
const FALLBACK_OPS_PROMPT = `Você é o Especialista Operacional do GymOps (modelo Organização → Unidade → Área → Atividade).
Ajuda o operador a entender o estado real da operação e a agir com clareza.
- Consulte as tools para QUALQUER número, lista ou status — nunca estime.
- Aponte riscos (atrasos longos, prioridade crítica) e o próximo passo recomendado.
- Você PODE propor a criação de atividades operacionais com a tool create_activity (informe unidade/área por NOME); toda criação gera uma PRÉVIA e só é salva após confirmação explícita do usuário.
- Outras ações de escrita você ainda não executa: oriente o operador (passo a passo no GymOps) quando ele pedir mudanças.`;

const SPECIALISTS = [
  {
    id: 'ops',
    description:
      'operação da academia: atividades, atrasos, prioridades, estatísticas do dia, unidades e áreas — qualquer pergunta que precise de NÚMEROS/LISTAS reais do sistema, ou pedido de criação de atividade',
    systemPrompt: FALLBACK_OPS_PROMPT,
  },
];

// ── F5: prompt do especialista servido pelo ai-control-plane ────────────────
// GET /v1/prompts/gymops.chat.system/active (timeout 2s). 200 → aplica por
// referência em SPECIALISTS[0]; 404/erro → mantém o atual (fallback inline).
/** Versão ativa aplicada via control-plane (null = fallback inline). */
export let specialistPromptVersion: number | null = null;

export async function refreshSpecialistPrompt(): Promise<void> {
  const base = process.env.AI_CONTROL_PLANE_URL?.trim();
  if (!base) return;
  try {
    const token = process.env.AI_CONTROL_PLANE_TOKEN || '';
    const res = await fetch(`${base.replace(/\/+$/, '')}/v1/prompts/gymops.chat.system/active`, {
      signal: AbortSignal.timeout(2000),
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return; // 404 (sem prompt ativo) ou erro → mantém o atual
    const json = (await res.json()) as
      | { data?: { promptText?: string; version?: number }; promptText?: string; version?: number }
      | null;
    const data = json && typeof json === 'object' && 'data' in json && json.data ? json.data : json;
    const text = typeof data?.promptText === 'string' ? data.promptText.trim() : '';
    if (!text || text === SPECIALISTS[0]!.systemPrompt) return;
    SPECIALISTS[0]!.systemPrompt = text; // o grafo lê por referência a cada turno
    specialistPromptVersion = typeof data?.version === 'number' ? data.version : null;
    console.info(`[ai] prompt gymops.chat.system v${specialistPromptVersion ?? '?'} aplicado (control-plane)`);
  } catch {
    // timeout/rede → mantém o prompt atual (fallback gracioso)
  }
}

// Boot: aplica fire-and-forget e re-checa a cada 60s (unref → não segura o processo).
if (process.env.AI_CONTROL_PLANE_URL?.trim()) {
  void refreshSpecialistPrompt();
  setInterval(() => { void refreshSpecialistPrompt(); }, 60_000).unref();
}

// Adapter SQL cru sobre o Prisma para os stores do ai-core (rows/rowCount).
const rawQuery = async (sql: string, params: readonly unknown[] = []) => {
  if (/^\s*select/i.test(sql)) {
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...(params as unknown[]));
    return { rows, rowCount: rows.length };
  }
  const count = await db.$executeRawUnsafe(sql, ...(params as unknown[]));
  return { rows: [] as Record<string, unknown>[], rowCount: count };
};

let graph: ReturnType<typeof createAiGraph> | null = null;
let userMemory: ReturnType<typeof createUserMemory> | null = null;
let memoryLlm: LlmAdapter | null = null;

function getGraph() {
  if (graph) return graph;
  const client = getOpenAI();
  if (!client) return null; // sem credencial → caller usa o caminho legado/fallback
  const provider = (process.env.AI_PROVIDER ?? 'openai').trim().toLowerCase();
  const isAnthropic = provider === 'anthropic';
  // Modelo do estágio "deep" + um modelo "barato" (router/synth/judge) por provider.
  const model = isAnthropic
    ? (process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6')
    : (process.env.OPENAI_MODEL?.trim() || 'gpt-5-nano');
  const cheap = isAnthropic ? 'claude-haiku-4-5-20251001' : 'gpt-5-nano';
  const llm = createLlm({ provider, client, defaultModel: model });
  memoryLlm = llm;

  // F3: memória. Embeddings são SEMPRE OpenAI (Anthropic não expõe /embeddings) — usa um cliente
  // OpenAI dedicado se houver OPENAI_API_KEY; sem ele, a memória longa (pgvector) degrada (fail-soft).
  const embedClient = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : (isAnthropic ? null : (client as OpenAI));
  const threadStore = createThreadStore({ query: rawQuery });
  const summarizer = createRollingSummarizer({ llm, keepRecent: 8, triggerAt: 16 });
  if (embedClient) {
    const embedder = createEmbedder({
      embedFn: async (texts: string[]) => {
        const res = await embedClient.embeddings.create({ model: 'text-embedding-3-small', input: texts });
        return res.data.map((d) => d.embedding);
      },
      dimensions: 1536,
    });
    userMemory = createUserMemory({ query: rawQuery, embedder, ttlDays: 180 });
  }

  graph = createAiGraph({
    llm,
    registry: gymopsToolRegistry,
    specialists: SPECIALISTS,
    models: {
      router: process.env.AI_ROUTER_MODEL?.trim() || cheap,
      deep: process.env.AI_DEEP_MODEL?.trim() || model,
      synth: process.env.AI_SYNTH_MODEL?.trim() || model,
      judge: process.env.AI_JUDGE_MODEL?.trim() || cheap,
    },
    metrics: aiMetrics,
    tracer: createAiTracer({ metrics: aiMetrics, app: 'gymops' }),
    memory: { threadStore, summarizer, userMemory: userMemory ?? undefined },
    verify: (process.env.AI_GRAPH_VERIFY ?? 'on').trim().toLowerCase() !== 'off',
  });
  return graph;
}

/** Executa um turno do chat pelo grafo (thread por usuário+org). */
export async function runGraphChatTurn(turn: GraphTurn & { organizationId: string }): Promise<GraphResult> {
  const g = getGraph();
  if (!g) throw new Error('AI graph indisponivel (sem OPENAI_API_KEY)');
  const userId = String(turn.identity?.sub || 'anon');
  const result = await g.runTurn({
    ...turn,
    threadId: `chat:${turn.organizationId}:${userId}`,
    channel: 'inapp',
    toolContext: { organizationId: turn.organizationId },
  });

  // Memória LONGA: extração de fatos ASSÍNCRONA (a cada 3 turnos; nunca no caminho da resposta).
  const turnCount = result.memory?.turnCount ?? 0;
  if (userMemory && memoryLlm && turn.identity?.sub && turnCount > 0 && turnCount % 3 === 0) {
    const convo = `user: ${turn.message}\nassistant: ${result.text}`;
    void extractMemoryFacts({ llm: memoryLlm, conversationText: convo })
      .then((facts) => (facts.length ? userMemory!.store(String(turn.identity!.sub), facts) : 0))
      .catch(() => aiMetrics.countError('memory', 'extract'));
  }
  return result;
}
