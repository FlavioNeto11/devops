---
title: "Plataforma de IA — estrutura única (F0+)"
status: canonical
applies_to: [platform, sicat, gymops]
updated: 2026-06-10
language: pt-BR
---

# Plataforma de IA (estrutura única)

> Re-engenharia da camada de IA dos apps (SICAT chat/copiloto, GymOps assistente) rumo a uma
> estrutura "GPT-like": tools com authz/dry-run/confirmação, grafo orquestrador↔especialistas,
> memória em 3 horizontes, RAG em pgvector, observabilidade e KPIs. Fases F0→F5 — o plano completo
> (diagnóstico + arquitetura-alvo) vive no plano aprovado da sessão; este doc registra o que JÁ está
> entregue e como usar.

## Entregue na F0 (fundação)

| Peça | Onde | O quê |
|---|---|---|
| **`@flavioneto11/ai-core`** | [`packages/ai-core`](../packages/ai-core/README.md) | contrato `AiTool` (authz por identidade, dry-run, confirmação, R1/R3/R4), métricas `ai_*`, tracer plugável (Langfuse default/LangSmith via env), KPIs canônicos, harness de eval (golden sets JSONL + LLM-as-judge). Re-exporta o `ai-kit`. |
| **Langfuse self-hosted** | [`platform/observability/langfuse`](../platform/observability/langfuse/README.md) | promovido do compose do SICAT a serviço da plataforma (Argo `langfuse`); UI em `http://langfuse.localhost`; projeto `nvit-ai`; apps enviam traces com as chaves do secret. |
| **Métricas nos apps** | sicat `src/lib/ai-metrics.ts` · gymops `src/ai/ai-metrics.ts` | `/metrics` em porta dedicada **9464** (NUNCA roteada pelo Traefik) + `ServiceMonitor` (`k8s/servicemonitor.yaml`) — o kube-prometheus-stack raspa tudo. SICAT instrumenta o turno conversacional + tools + falhas; GymOps instrumenta `callAI` por feature (`draft`/`checklist`/`delay-analysis`/`chat`). Só telemetria — zero mudança de comportamento. |
| **Langfuse ON no SICAT** | `apps/sicat/k8s/backend.yaml` | `LANGFUSE_ENABLED=true` apontando ao serviço da plataforma; chaves via Secret `sicat-langfuse` (opcional — sem ele o provider degrada desligado). |
| **Golden set GymOps** | `apps/gymops/docs/ai-eval/golden-set.jsonl` | 12 casos (draft/checklist/delay/chat/summary) + runner `pnpm ai:eval` (mock valida harness; `--real` chama o modelo; `--sample N` p/ PRs). O do SICAT são os 466 cenários existentes (`docs/ai-chat/intents/`). |
| **Dashboard Grafana** | `platform/observability/dashboards/ai-platform.json` (UID `ai-platform`) | latência p95 por estágio, chamadas por outcome, tokens/modelo, custo 24h, erros, tool calls, judge score. Publicado via ConfigMap `grafana_dashboard=1`. |

## Métricas canônicas (`ai_*`)
`ai_turn_latency_seconds{app,stage,outcome}` · `ai_tokens_total{app,model,direction}` ·
`ai_cost_usd_total{app,model}` · `ai_tool_calls_total{app,tool,outcome}` ·
`ai_errors_total{app,stage,code}` · `ai_judge_score{app,dimension}` · `ai_escalation_total{app,reason}`.
Nomes são contrato (`AI_METRIC_NAMES` no ai-core) — dashboards e alertas dependem deles.

## KPIs canônicos
groundedness · answer_relevance · tool_call_accuracy · task_completion_rate · deflection_rate ·
csat · cost_per_conversation · latency_p95 · escalation_rate — definições e metas em
`packages/ai-core/src/kpi.js` (`AI_KPIS`).

## Entregue na F1 (grafo piloto no GymOps)

| Peça | Onde | O quê |
|---|---|---|
| **Grafo de raciocínio** | `packages/ai-core` 0.2.0 (`createAiGraph` + `createOpenAiLlm`) | ROUTER (nano classifica complexidade/especialista) → fast-path (resposta direta) ou deep-path (especialista em **loop ReAct com tools** via `dispatchTool`: authz por identidade, dry-run, confirmação) → **VERIFY** (judge de groundedness em runtime; score baixo → 1 retry deep = escalation). Métricas/custo por nó; motor explícito sobre adapter estrutural (F3 pluga checkpointer Postgres; F4 roda os nós no LangGraph do SICAT). |
| **Tools read-only do GymOps** | `apps/api/src/ai/graph/tools.ts` | `query_overdue`, `get_daily_stats`, `list_units` — Prisma + **authz por membership real** (a IA nunca vê além do usuário); `organizationId` vem do contexto validado na rota, nunca do LLM. |
| **Flag `AI_GRAPH`** | `apps/api/src/ai/graph/index.ts` + rota `/ai/chat` | default **off** (caminho legado byte-idêntico); `on` → turno roteia pelo grafo; erro no grafo → fallback gracioso ao legado. Modelos por env (`OPENAI_ROUTER_MODEL`, `OPENAI_DEEP_MODEL`, ...); `AI_GRAPH_VERIFY=off` desliga o judge. |
| **Eval do grafo** | `pnpm ai:eval --graph` | grafo REAL + LLM simulado + tools mock — valida roteamento fast/deep, escolha de tool e ancoragem (casos tag `graph` no golden set). |

## Entregue na F2 (RAG pgvector no SICAT)
`ai-core` 0.3.0 módulo `rag` (chunking heading-aware, embedder estrutural, store pgvector
incremental por hash, re-ranker LLM). SICAT: migration `018` (extensão vector +
`knowledge_sources`/`knowledge_chunks` vector(1536) + HNSW), postgres → `pgvector/pgvector:pg16`,
ingestão incremental no boot do worker (`npm run rag:ingest` manual; base ~545 chunks),
retrieval = embed → HNSW top-K → híbrido lexical → re-rank (`KNOWLEDGE_RERANK=off` desliga).
O índice em arquivo foi aposentado (nem chegava à imagem — RAG estava morto em produção).

## Entregue na F3 (memória em 3 horizontes)
- `ai-core` 0.4.0 módulo `memory`: `createThreadStore` (threads em Postgres),
  `createRollingSummarizer` (sumarização progressiva), `createUserMemory` (memória longa por
  usuário em pgvector, TTL, recall **escopado por user_id**), `extractMemoryFacts` (extração
  assíncrona). O grafo aceita `memory:{...}`: thread do servidor prevalece sobre o history do
  front, resumo+memórias entram no contexto, turno persiste (compactação em background).
- **GymOps**: migration Prisma `ai_memory` (`ai_chat_threads` + `ai_user_memory` vector+HNSW);
  `/ai/chat` com `threadId = chat:{org}:{user}` — a conversa **sobrevive a reload e a restart do
  pod**; extração de fatos a cada 3 turnos (verificado E2E: "Nome: Carla" extraído e recall sem
  vazamento cross-user).
- **SICAT**: `MemorySaver` (volátil, por-processo) → **`PostgresSaver`**
  (`@langchain/langgraph-checkpoint-postgres`): estado do planning sobrevive a restart e é
  compartilhado api↔worker; init no boot; rollback via `CONVERSATION_CHECKPOINTER=memory`.

## Próximas fases (resumo)
F4 migração do grafo do SICAT para o ai-core (gate: 466 cenários) · F5 evals na esteira
(gate de regressão) + `ai-control-plane` + mutações com dry-run/confirmação no GymOps.

## Armadilhas
- A porta 9464 não passa pelo Traefik de propósito — não criar IngressRoute para ela.
- `langfuse.localhost` precisa de entrada no hosts (Next.js não suporta subpath).
- Ao subir versão do `ai-core`: `scripts/vendor-packages.ps1` + commitar os `.tgz` nos apps
  (o tgz do sicat vive em `apps/sicat/backend/vendor/` — o script copia para `apps/sicat/vendor/`,
  mova para `backend/vendor/`).
