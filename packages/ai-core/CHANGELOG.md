# Changelog — @flavioneto11/ai-core

## 0.2.0 (2026-06-11)
- F1: `createAiGraph` — grafo padrão de raciocínio (router fast/deep por complexidade →
  especialista em loop ReAct com `dispatchTool` → VERIFY judge em runtime com escalation/retry),
  com métricas/custo por nó e tracing por span. Motor explícito sobre adapter estrutural;
  F3 adota checkpointer Postgres (LangGraph) e F4 roda os mesmos nós no LangGraph do SICAT.
- `createOpenAiLlm` — adapter estrutural do SDK OpenAI (function-calling) p/ o grafo.
- `AiTool.parameters` — JSON Schema dos argumentos para o function-calling.

## 0.1.0 (2026-06-10)
- Primeira versão (F0 da re-engenharia da camada de IA).
- `provider`: tabela de preços por modelo (env-overridável) + `estimateCostUsd` + `extractTokenUsage`.
- `tools`: contrato `AiTool` (authz por identidade, dry-run, confirmação, riscos R1/R3/R4),
  `createToolRegistry`, `dispatchTool` e erros tipados.
- `observability`: métricas Prometheus canônicas `ai_*` (`createAiMetrics`) e tracer plugável
  (`createAiTracer`) com Langfuse estrutural; LangSmith via env do LangChain.
- `kpi`: catálogo canônico (`AI_KPIS`, `summarizeEvalKpis`).
- `eval`: golden sets JSONL (`parseGoldenSetJsonl`) + harness `runEval` (assertions + LLM-as-judge).
- Re-exporta `@flavioneto11/ai-kit` (contrato gpt-5).
