# Changelog — @flavioneto11/ai-core

## 0.5.0 (2026-06-11)
- F4: `createAiGraph({ proposeTools: true })` — modo de paridade do SICAT: o deep-path
  PROPÕE a tool (`toolCalls[].status='proposed'`, `result.proposed=true`) em vez de
  despachá-la; VERIFY é pulado para propostas (o app sintetiza/valida após o dispatch
  pelo pipeline próprio: policy, dry-run, confirmação, guardrails). Escalation do
  fast-path que vira proposta é aceita direto.
- `createAiGraph({ routerContext })` — texto extra do app anexado ao system do ROUTER
  (intents conhecidas, dicas de roteamento).
- F5: métrica `ai_feedback_total{app,surface,kind}` + `metrics.countFeedback(surface, kind)`
  para os thumbs 👍/👎 dos frontends.

## 0.4.0 (2026-06-11)
- F3: módulo `memory` — `createThreadStore` (estado de conversa em Postgres),
  `createRollingSummarizer` (sumarização progressiva via LLM, defensiva),
  `createUserMemory` (memória longa por usuário em pgvector com TTL, recall escopado por user_id)
  e `extractMemoryFacts` (extração assíncrona de fatos para o worker).
- `createAiGraph` aceita `memory: { threadStore, summarizer, userMemory }`: thread do servidor
  prevalece sobre o history do caller, resumo+memórias entram no contexto, turno é persistido
  (append aguardado; compactação em background) e o resultado expõe `memory` meta.

## 0.3.0 (2026-06-11)
- F2: módulo `rag` — `hashContent`/`splitWithOverlap`/`chunkMarkdownSections` (chunking
  heading-aware com overlap), `createEmbedder` (estrutural por `embedFn`, batching, validação de
  dims), `createPgVectorStore` (upsert incremental por hash de fonte, prune, busca cosine no HNSW,
  stats) e `createReranker` (re-rank por LLM, defensivo).

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
