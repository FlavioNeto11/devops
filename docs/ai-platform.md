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

## Próximas fases (resumo)
F1 grafo+tools no GymOps (flag `AI_GRAPH`) · F2 RAG pgvector+HNSW no SICAT · F3 memória
(checkpointer Postgres + rolling summary + memória longa por usuário) · F4 migração do grafo do
SICAT (gate: 466 cenários) · F5 evals na esteira (gate de regressão) + `ai-control-plane`.

## Armadilhas
- A porta 9464 não passa pelo Traefik de propósito — não criar IngressRoute para ela.
- `langfuse.localhost` precisa de entrada no hosts (Next.js não suporta subpath).
- Ao subir versão do `ai-core`: `scripts/vendor-packages.ps1` + commitar os `.tgz` nos apps
  (o tgz do sicat vive em `apps/sicat/backend/vendor/` — o script copia para `apps/sicat/vendor/`,
  mova para `backend/vendor/`).
