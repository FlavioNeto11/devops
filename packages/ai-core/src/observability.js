// observability.js — métricas Prometheus + tracing plugável (Langfuse default,
// LangSmith opcional) para TODO acesso de IA da plataforma.
//
// Desenho: clientes são ESTRUTURAIS e opcionais — o app passa `promClient`
// (prom-client) e/ou `langfuse` (instância de Langfuse) se quiser; sem eles,
// tudo vira no-op e o caminho de IA NUNCA quebra por causa de telemetria.
// LangSmith não precisa de código aqui: o LangChain ativa sozinho via env
// (LANGCHAIN_TRACING_V2=true + LANGCHAIN_API_KEY) — documentado no README.
import { providerForModel } from './provider.js';

const NAMES = Object.freeze({
  latency: 'ai_turn_latency_seconds',
  tokens: 'ai_tokens_total',
  cost: 'ai_cost_usd_total',
  toolCalls: 'ai_tool_calls_total',
  errors: 'ai_errors_total',
  judge: 'ai_judge_score',
  escalations: 'ai_escalation_total',
  feedback: 'ai_feedback_total',
});

const noop = () => {};
const NOOP_METRICS = Object.freeze({
  enabled: false,
  observeTurn: noop,
  addTokens: noop,
  addCost: noop,
  countToolCall: noop,
  countError: noop,
  observeJudgeScore: noop,
  countEscalation: noop,
  countFeedback: noop,
});

/**
 * Cria o conjunto canônico de métricas `ai_*` no registry do prom-client do app.
 * `app` rotula todas as séries (sicat | gymops | ...). Sem promClient → no-op.
 */
export function createAiMetrics({ promClient, app, registers } = {}) {
  if (!promClient || !app) return { ...NOOP_METRICS };
  const opts = registers ? { registers } : {};

  const latency = new promClient.Histogram({
    name: NAMES.latency,
    help: 'Latencia de um turno/chamada de IA (segundos), por estagio.',
    labelNames: ['app', 'stage', 'outcome'],
    buckets: [0.25, 0.5, 1, 2, 4, 8, 15, 30, 60, 120],
    ...opts,
  });
  const tokens = new promClient.Counter({
    name: NAMES.tokens,
    help: 'Tokens consumidos pelas chamadas de IA.',
    labelNames: ['app', 'provider', 'model', 'direction'],
    ...opts,
  });
  const cost = new promClient.Counter({
    name: NAMES.cost,
    help: 'Custo estimado (USD) das chamadas de IA.',
    labelNames: ['app', 'provider', 'model'],
    ...opts,
  });
  const toolCalls = new promClient.Counter({
    name: NAMES.toolCalls,
    help: 'Execucoes de tools de IA por resultado.',
    labelNames: ['app', 'tool', 'outcome'],
    ...opts,
  });
  const errors = new promClient.Counter({
    name: NAMES.errors,
    help: 'Erros no pipeline de IA por estagio.',
    labelNames: ['app', 'stage', 'code'],
    ...opts,
  });
  const judge = new promClient.Histogram({
    name: NAMES.judge,
    help: 'Score do judge (0..1) por dimensao (groundedness, relevance...).',
    labelNames: ['app', 'dimension'],
    buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
    ...opts,
  });
  const escalations = new promClient.Counter({
    name: NAMES.escalations,
    help: 'Escalations (retry deep-path / modelo maior) por motivo.',
    labelNames: ['app', 'reason'],
    ...opts,
  });
  const feedback = new promClient.Counter({
    name: NAMES.feedback,
    help: 'Feedback explicito do usuario (thumbs) por superficie e tipo.',
    labelNames: ['app', 'surface', 'kind'],
    ...opts,
  });

  return {
    enabled: true,
    observeTurn: (stage, outcome, seconds) => latency.labels(app, stage, outcome).observe(seconds),
    addTokens: (model, inputTokens, outputTokens) => {
      const provider = providerForModel(model);
      if (inputTokens) tokens.labels(app, provider, model, 'input').inc(inputTokens);
      if (outputTokens) tokens.labels(app, provider, model, 'output').inc(outputTokens);
    },
    addCost: (model, usd) => { if (usd > 0) cost.labels(app, providerForModel(model), model).inc(usd); },
    countToolCall: (tool, outcome) => toolCalls.labels(app, tool, outcome).inc(),
    countError: (stage, code) => errors.labels(app, stage, String(code || 'unknown')).inc(),
    observeJudgeScore: (dimension, score) => judge.labels(app, dimension).observe(score),
    countEscalation: (reason) => escalations.labels(app, reason).inc(),
    countFeedback: (surface, kind) => feedback.labels(app, surface, String(kind || 'unknown')).inc(),
  };
}

/**
 * Tracer plugável: span(name, meta, fn) cronometra, emite ao Langfuse (se
 * fornecido) e alimenta as métricas. Falha de telemetria nunca propaga.
 *
 * `langfuse` é estrutural: precisa de .trace({...}) → trace.span({...}) →
 * span.end({...}) (API do SDK oficial). `traceFor(turnMeta)` abre o trace do
 * turno; spans aninham via objeto retornado.
 */
export function createAiTracer({ langfuse, metrics = NOOP_METRICS, app = 'app' } = {}) {
  const safe = (fn) => { try { return fn(); } catch { return null; } };

  function traceFor(meta = {}) {
    const lfTrace = langfuse
      ? safe(() => langfuse.trace({ name: meta.name || 'ai-turn', userId: meta.userId, sessionId: meta.sessionId, metadata: { app, ...meta.metadata } }))
      : null;

    async function span(name, meta2, fn) {
      const startedAt = Date.now();
      const lfSpan = lfTrace ? safe(() => lfTrace.span({ name, input: meta2?.input, metadata: meta2?.metadata })) : null;
      try {
        const result = await fn();
        const seconds = (Date.now() - startedAt) / 1000;
        metrics.observeTurn(name, 'ok', seconds);
        if (lfSpan) safe(() => lfSpan.end({ output: meta2?.redactOutput ? undefined : result }));
        return result;
      } catch (err) {
        const seconds = (Date.now() - startedAt) / 1000;
        metrics.observeTurn(name, 'error', seconds);
        metrics.countError(name, err?.code || err?.name);
        if (lfSpan) safe(() => lfSpan.end({ level: 'ERROR', statusMessage: String(err?.message || err) }));
        throw err;
      }
    }

    function end(meta3 = {}) {
      if (lfTrace) safe(() => lfTrace.update({ output: meta3.output, metadata: meta3.metadata }));
    }

    return { span, end, raw: lfTrace };
  }

  return { traceFor };
}

export const AI_METRIC_NAMES = NAMES;
