// =============================================================================
// Grafo do assistente "Pergunte ao seu WhatsApp" (router→ReAct→judge) sobre o
// @flavioneto11/ai-core, com memória durável (threadStore + rolling summary +
// userMemory pgvector) e proposeTools=true (ações mutantes propostas, nunca
// executadas direto). Espelha apps/gymops/.../ai/graph/index.ts. Lazy (ESM).
// =============================================================================
import type { GraphResult, GraphTurn, LlmAdapter } from '@flavioneto11/ai-core';
import { env } from '../../config/env';
import { query } from './pg';
import { getClient, activeProvider, getEmbedder } from './ai.service';
import { getAiMetrics } from './ai-metrics';
import { getToolRegistry } from './tools';
import { getAssistantPrompt, refreshAssistantPrompt } from './prompts';
import { loadAiCore } from './ai-core-loader';

// boot opcional: prompt do assistente via control-plane.
if (process.env.AI_CONTROL_PLANE_URL?.trim()) {
  void refreshAssistantPrompt();
  setInterval(() => void refreshAssistantPrompt(), 60_000).unref();
}

let graph: { runTurn(turn: GraphTurn): Promise<GraphResult> } | null = null;
let userMemory: { recall: Function; store: (u: string, f: Array<{ kind?: string; content: string }>) => Promise<number> } | null = null;
let memoryLlm: LlmAdapter | null = null;

async function buildGraph(): Promise<{ runTurn(turn: GraphTurn): Promise<GraphResult> } | null> {
  if (graph) return graph;
  const client = getClient();
  if (!client) return null; // sem credencial de reasoning → caller faz fallback
  const core = await loadAiCore();
  const provider = activeProvider();
  const isAnthropic = provider === 'anthropic';
  const model = isAnthropic ? env.ai.anthropicModel || 'claude-sonnet-4-6' : process.env.OPENAI_MODEL?.trim() || 'gpt-5-nano';
  const cheap = isAnthropic ? 'claude-haiku-4-5-20251001' : 'gpt-5-nano';
  const llm = core.createLlm({ provider, client, defaultModel: model });
  memoryLlm = llm;

  const threadStore = core.createThreadStore({ query });
  const summarizer = core.createRollingSummarizer({ llm, keepRecent: 8, triggerAt: 16 });
  const embedderObj = getEmbedder();
  if (embedderObj) {
    const embedder = core.createEmbedder({ embedFn: (texts: string[]) => embedderObj.embedFn(texts), dimensions: 1536 });
    userMemory = core.createUserMemory({ query, embedder, ttlDays: 180 }) as typeof userMemory;
  }

  const registry = await getToolRegistry();
  // forceSpecialist NÃO está no .d.ts (mantido à mão), mas é suportado no runtime
  // (graph.js: todo turno NÃO-trivial vai SEMPRE pro deep-path com tools) — é o que
  // garante que o assistente USE as tools em vez de responder genérico. Cast consciente.
  const graphOpts: Record<string, unknown> = {
    llm,
    registry,
    forceSpecialist: 'assistant',
    specialists: [
      {
        id: 'assistant',
        description: 'conversas/mensagens/contatos do WhatsApp do usuário — busca, leitura, resumo, e propor envio/reação/marcar lida',
        systemPrompt: getAssistantPrompt(),
      },
    ],
    models: {
      router: process.env.AI_ROUTER_MODEL?.trim() || cheap,
      deep: process.env.AI_DEEP_MODEL?.trim() || model,
      synth: process.env.AI_SYNTH_MODEL?.trim() || model,
      judge: process.env.AI_JUDGE_MODEL?.trim() || cheap,
    },
    metrics: getAiMetrics() as never,
    tracer: core.createAiTracer({ metrics: getAiMetrics() as never, app: 'zapbridge' }),
    memory: { threadStore, summarizer, userMemory: (userMemory as never) ?? undefined },
    proposeTools: true,
    maxToolRounds: 4, // permite list_chats → get_recent_messages → responder
    // Empurra o ROUTER para o deep-path (com tools) sempre que a resposta dependa
    // das conversas reais do usuário — senão o fast-path responde genérico "não tenho acesso".
    routerContext:
      'CONTEXTO ZAPBRIDGE (WhatsApp do PRÓPRIO usuário): QUALQUER pergunta cuja resposta dependa das ' +
      'CONVERSAS, MENSAGENS, CONTATOS ou HISTÓRICO reais do usuário é SEMPRE "complex" — exige tools ' +
      '(list_chats, get_recent_messages, search_history_semantic, search_knowledge). Inclui: "o que falo/combinei ' +
      'com X", "resuma a conversa com Y", "onde está Z no histórico", "responda o cliente W", quem/quando/quanto. ' +
      'Use "trivial" só para saudação/agradecimento/social puro. Você TEM acesso ao histórico via tools — ' +
      'NUNCA responda que "não tem acesso às conversas".',
    verify: (process.env.AI_GRAPH_VERIFY ?? 'on').trim().toLowerCase() !== 'off',
  };
  graph = core.createAiGraph(graphOpts as never);
  return graph;
}

export function aiGraphEnabled(): boolean {
  return env.ai.graph;
}

/** Roda um turno do assistente (thread por usuário). Lança se sem credencial. */
export async function runAssistantTurn(turn: {
  message: string;
  userId: string;
  sessionId: string;
}): Promise<GraphResult> {
  const g = await buildGraph();
  if (!g) throw Object.assign(new Error('Assistente de IA indisponível (sem chave)'), { status: 503 });
  const result = await g.runTurn({
    message: turn.message,
    threadId: `chat:${turn.userId}`,
    identity: { sub: turn.userId },
    channel: 'whatsapp',
    toolContext: { userId: turn.userId, sessionId: turn.sessionId },
  });

  // Memória longa: extração de fatos/estilo assíncrona (a cada 3 turnos).
  const turnCount = result.memory?.turnCount ?? 0;
  if (userMemory && memoryLlm && turnCount > 0 && turnCount % 3 === 0) {
    const convo = `user: ${turn.message}\nassistant: ${result.text}`;
    const core = await loadAiCore();
    void core
      .extractMemoryFacts({ llm: memoryLlm, conversationText: convo })
      .then((facts) => (facts.length ? userMemory!.store(turn.userId, facts) : 0))
      .catch(() => getAiMetrics().countError('memory', 'extract'));
  }
  return result;
}

/** Recall de fatos/estilo do usuário (usado por smart-reply para soar como o usuário). */
export async function recallUserStyle(userId: string, queryText: string): Promise<Array<{ content: string }>> {
  try {
    await buildGraph();
    if (!userMemory) return [];
    const facts = (await userMemory.recall(userId, queryText, { k: 5, minScore: 0.25 })) as Array<{ content: string }>;
    return facts ?? [];
  } catch {
    return [];
  }
}

/** Extrai e grava fatos de estilo a partir das mensagens enviadas pelo usuário (bootstrap F9). */
export async function learnStyleFrom(userId: string, sentTexts: string[]): Promise<void> {
  if (!sentTexts.length) return;
  try {
    await buildGraph();
    if (!userMemory || !memoryLlm) return;
    const core = await loadAiCore();
    const convo = sentTexts.slice(0, 20).map((t) => `user: ${t}`).join('\n');
    const facts = await core.extractMemoryFacts({ llm: memoryLlm, conversationText: convo, maxFacts: 4 });
    if (facts.length) await userMemory.store(userId, facts);
  } catch {
    /* fail-soft */
  }
}
