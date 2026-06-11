// @flavioneto11/ai-core — núcleo compartilhado da plataforma de IA.
//
// Camadas (F0 da re-engenharia — ver plano "Re-engenharia da camada de IA"):
//   provider       → preços/custo por token (estimateCostUsd, extractTokenUsage)
//   tools          → contrato AiTool (authz por identidade, dry-run, confirmação) + registry + dispatcher
//   observability  → métricas Prometheus ai_* + tracer plugável (Langfuse default; LangSmith via env LangChain)
//   kpi            → catálogo canônico de KPIs (groundedness, tool accuracy, custo/conversa, ...)
//   eval           → harness de golden sets (assertions determinísticas + LLM-as-judge)
//
// O contrato de modelo (gpt-5/reasoning_effort/timeout/fallback) continua no
// @flavioneto11/ai-kit, re-exportado aqui — apps novos importam só o ai-core.

export * from '@flavioneto11/ai-kit';

export { priceForModel, estimateCostUsd, extractTokenUsage } from './provider.js';
export {
  TOOL_RISKS,
  AiToolError, AiToolDeniedError, AiToolConfirmationRequiredError, AiToolInvalidInputError,
  assertValidTool, createToolRegistry, dispatchTool,
} from './tools.js';
export { createAiMetrics, createAiTracer, AI_METRIC_NAMES } from './observability.js';
export { createOpenAiLlm, toOpenAiToolDef } from './llm.js';
export { createAiGraph } from './graph.js';
export { AI_KPIS, listKpis, summarizeEvalKpis } from './kpi.js';
export { parseGoldenSetJsonl, runEval } from './eval.js';
