// Grafo de raciocínio do GymOps (F1) — router fast/deep → especialista `ops`
// com tools read-only → VERIFY (judge). Atrás da flag AI_GRAPH (default off):
// off = caminho legado (callAI/chatText) intacto; on = /ai/chat roteia por aqui.
import { createAiGraph, createOpenAiLlm, createAiTracer, type GraphTurn, type GraphResult } from '@flavioneto11/ai-core';
import { getOpenAI } from '../ai.service.js';
import { aiMetrics } from '../ai-metrics.js';
import { gymopsToolRegistry } from './tools.js';

export const AI_GRAPH_ENABLED = (): boolean =>
  (process.env.AI_GRAPH ?? 'off').trim().toLowerCase() === 'on';

const SPECIALISTS = [
  {
    id: 'ops',
    description:
      'operação da academia: atividades, atrasos, prioridades, estatísticas do dia, unidades e áreas — qualquer pergunta que precise de NÚMEROS/LISTAS reais do sistema',
    systemPrompt: `Você é o Especialista Operacional do GymOps (modelo Organização → Unidade → Área → Atividade).
Ajuda o operador a entender o estado real da operação e a agir com clareza.
- Consulte as tools para QUALQUER número, lista ou status — nunca estime.
- Aponte riscos (atrasos longos, prioridade crítica) e o próximo passo recomendado.
- Você ainda não executa ações de escrita: oriente o operador (passo a passo no GymOps) quando ele pedir mudanças.`,
  },
];

let graph: ReturnType<typeof createAiGraph> | null = null;

function getGraph() {
  if (graph) return graph;
  const client = getOpenAI();
  if (!client) return null; // sem OPENAI_API_KEY → caller usa o caminho legado/fallback
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5-nano';
  graph = createAiGraph({
    llm: createOpenAiLlm(client, { defaultModel: model }),
    registry: gymopsToolRegistry,
    specialists: SPECIALISTS,
    models: {
      router: process.env.OPENAI_ROUTER_MODEL?.trim() || 'gpt-5-nano',
      deep: process.env.OPENAI_DEEP_MODEL?.trim() || model,
      synth: process.env.OPENAI_SYNTH_MODEL?.trim() || model,
      judge: process.env.OPENAI_JUDGE_MODEL?.trim() || 'gpt-5-nano',
    },
    metrics: aiMetrics,
    tracer: createAiTracer({ metrics: aiMetrics, app: 'gymops' }),
    verify: (process.env.AI_GRAPH_VERIFY ?? 'on').trim().toLowerCase() !== 'off',
  });
  return graph;
}

/** Executa um turno do chat pelo grafo. Lança se o grafo não estiver disponível. */
export async function runGraphChatTurn(turn: GraphTurn & { organizationId: string }): Promise<GraphResult> {
  const g = getGraph();
  if (!g) throw new Error('AI graph indisponivel (sem OPENAI_API_KEY)');
  return g.runTurn({
    ...turn,
    channel: 'inapp',
    toolContext: { organizationId: turn.organizationId },
  });
}
