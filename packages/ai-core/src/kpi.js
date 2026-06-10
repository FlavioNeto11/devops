// kpi.js — catálogo CANÔNICO de KPIs da plataforma de IA.
//
// Fonte única dos nomes/definições/metas: dashboards (Grafana), evals (CI) e o
// ai-control-plane referenciam estes ids. Mudança aqui = mudança de contrato
// (SemVer). As metas default são pontos de partida do laboratório — ajustáveis
// por app no control-plane.

export const AI_KPIS = Object.freeze({
  groundedness: {
    id: 'groundedness',
    label: 'Groundedness',
    description: 'Resposta ancorada em evidencia (tool result / RAG), sem invencao.',
    unit: 'score01',
    target: 0.8,
    source: 'judge',
  },
  answer_relevance: {
    id: 'answer_relevance',
    label: 'Answer relevance',
    description: 'A resposta atende a pergunta feita.',
    unit: 'score01',
    target: 0.85,
    source: 'judge',
  },
  tool_call_accuracy: {
    id: 'tool_call_accuracy',
    label: 'Tool-call accuracy',
    description: 'Tool e argumentos corretos vs esperado no golden set.',
    unit: 'ratio',
    target: 0.9,
    source: 'eval',
  },
  task_completion_rate: {
    id: 'task_completion_rate',
    label: 'Task completion',
    description: 'Objetivo do usuario concluido (multi-turn).',
    unit: 'ratio',
    target: 0.75,
    source: 'trace',
  },
  deflection_rate: {
    id: 'deflection_rate',
    label: 'Deflection',
    description: 'Sessoes resolvidas sem handoff humano.',
    unit: 'ratio',
    target: 0.7,
    source: 'trace',
  },
  csat: {
    id: 'csat',
    label: 'CSAT (thumbs)',
    description: 'Feedback explicito do usuario (up / up+down).',
    unit: 'ratio',
    target: 0.8,
    source: 'feedback',
  },
  cost_per_conversation: {
    id: 'cost_per_conversation',
    label: 'Custo/conversa',
    description: 'USD somado por thread (ai_cost_usd_total / sessoes).',
    unit: 'usd',
    target: 0.1,
    direction: 'down',
    source: 'metrics',
  },
  latency_p95: {
    id: 'latency_p95',
    label: 'Latencia p95',
    description: 'p95 de ai_turn_latency_seconds (stage=turn).',
    unit: 'seconds',
    target: 15,
    direction: 'down',
    source: 'metrics',
  },
  escalation_rate: {
    id: 'escalation_rate',
    label: 'Escalation',
    description: 'Turnos que exigiram retry deep-path / modelo maior.',
    unit: 'ratio',
    target: 0.15,
    direction: 'down',
    source: 'metrics',
  },
});

/** Lista plana (para UI/dashboards). */
export function listKpis() {
  return Object.values(AI_KPIS);
}

/**
 * Resume um conjunto de resultados de eval (do harness) nos KPIs aplicáveis.
 * `results` = saída de runEval(). Retorna { kpiId: { value, target, ok } }.
 */
export function summarizeEvalKpis(results) {
  const out = {};
  const dims = results?.judgeAverages || {};
  if (typeof dims.groundedness === 'number') out.groundedness = wrap('groundedness', dims.groundedness);
  if (typeof dims.answer_relevance === 'number') out.answer_relevance = wrap('answer_relevance', dims.answer_relevance);
  if (typeof results?.toolCallAccuracy === 'number') out.tool_call_accuracy = wrap('tool_call_accuracy', results.toolCallAccuracy);
  return out;
}

function wrap(id, value) {
  const def = AI_KPIS[id];
  const ok = def.direction === 'down' ? value <= def.target : value >= def.target;
  return { value, target: def.target, ok };
}
