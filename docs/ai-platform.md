---
title: "Plataforma de IA — estrutura única (F0+)"
status: canonical
applies_to: [platform, sicat, gymops]
updated: 2026-06-11
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

## Entregue na F4 (engine ai-core no SICAT, atrás de flag)
- `ai-core` 0.5.0: `createAiGraph({ proposeTools })` — o deep-path **propõe** a tool
  (`status='proposed'`) em vez de despachá-la; o app executa pelo pipeline próprio
  (policy → dispatch → síntese → guardrails). `routerContext` injeta dicas de roteamento
  do app no ROUTER. É o modo de paridade do SICAT.
- SICAT `conversation-engine-ai-core.ts`: `CONVERSATION_ENGINE=ai-core` faz o `plan()` do
  turno rodar no grafo da plataforma — ROUTER (gpt-5-nano + intents do SICAT) → fast-path
  conversacional/conceitual (working memory + RAG) **verificado pelo judge** (reprovou →
  planner legado) → complex vai ao planner legado, OU (rollout incremental) ao deep
  propose por especialista (`CONVERSATION_ENGINE_DEEP=propose` +
  `CONVERSATION_ENGINE_SPECIALISTS=catalog,operations`). Adapter AiTool das 20 tools com
  **authz por identidade** na proposta (sem identidade/conta CETESB → não propõe ação).
  QUALQUER falha do engine cai no provider legado — o turno nunca quebra.
- Rollout/rollback sem deploy durante o gate: ConfigMap imperativo `sicat-engine-flags`
  (hook `envFrom optional` no Deployment); estado final das flags fica no manifesto.
- **Gate de paridade (2026-06-11, judge `gpt-5-nano`)**: sample 23 cenários — legado
  **10/24** vs engine **10/24** (paridade exata); nas superfícies do engine, **+2 líquido**
  ("o que é DMR"/"o que é MTR provisório" saíram de 0 → PASS 0.82 via fast-path com RAG) e
  todas as perdas foram variância do caminho legado (`provider=layered-llm` idêntico nos
  dois lados). Full 471 interrompido aos **165 cenários por custo** (decisão do operador):
  nenhum modo de falha específico do engine encontrado; categorias fracas (ex.
  `cdf_consulta` 10%) são fracas no PLANNER LEGADO sob o judge novo — o catálogo foi
  calibrado para `gpt-4o-mini` (`minimum_score 0.78`), inexistente neste projeto OpenAI.
  Log parcial: `apps/sicat/backend/artifacts/ai-smoke/full-gate-partial-2026-06-11.log`
  (local). **Veredito: `CONVERSATION_ENGINE=ai-core` é o DEFAULT no manifesto**; rollback =
  `legacy` (1 env). Recalibrar o catálogo para o judge gpt-5-nano ficou como evolução.

## Entregue na F5 (governança completa)
- **`ai-control-plane`** (app novo na esteira, `/ai-control`, ns `apps`, Postgres próprio,
  Argo `prune:false`): prompts versionados (`POST versions`, `POST activate` com
  `confirmed:true` e `previous` para rollback), rollup cross-app de feedback, registro de
  eval runs, overview. Writes com bearer token (fail-closed: sem env → 503); reads abertos.
  FORA do caminho crítico: apps consomem com timeout 2s + cache + fallback inline.
- **Thumbs 👍/👎** por resposta da IA nos DOIS frontends: SICAT (chat `/conversacional/chat`
  + copiloto in-app; `POST /v1/conversations/feedback` → `conversation_feedback` migration
  019) e GymOps (widget; `POST /ai/feedback` → `ai_feedback` Prisma). Métrica
  `ai_feedback_total{app,surface,kind}` + encaminhamento best-effort ao control-plane
  (rollup verificado com os 2 apps).
- **Promote/rollback DEMONSTRADO** (GymOps `gymops.chat.system`): v1 baseline → v2 com
  regra observável promovida → pod aplicou em ≤60s **sem deploy** (refresh 60s por
  referência no specialist) → turno real respondeu com o prefixo da v2 → rollback à v1 →
  turno real limpo. Fallback inline garante operação com o control-plane fora do ar.
- **GymOps age com confirmação**: tool `create_activity` (R3, `mutates`,
  `supportsDryRun`) — RBAC real (`hasUnitRole`), resolve unidade/área por NOME, dry-run
  vira **prévia assinada** (HMAC `JWT_SECRET`, exp 10min) no `meta.pendingAction`; o
  clique do usuário chama `POST /ai/confirm` que re-despacha determinístico
  (`confirmedToolCallId`) **sem segunda viagem ao LLM**. "IA nunca salva direto"
  preservado: a confirmação É o salvar do usuário. E2E em cluster: prévia → confirmação →
  atividade no banco.
- Runners de eval (sicat smoke + gymops ai-eval) registram o run no control-plane quando
  `AI_CONTROL_PLANE_URL` estiver setada (best-effort).

## Entregue na F5-parcial (gate de evals na esteira)
Workflow [`ai-evals.yml`](../.github/workflows/ai-evals.yml): PR/push que toca superfície de IA
(ai-core/ai-kit, grafo+golden set do GymOps, conversação+catálogo do SICAT, vendor) roda em
`ubuntu-latest`:
- **ai-core** — `npm test` (28 testes: tools/graph/rag/memory/eval);
- **gymops** — `node scripts/ai-eval.mjs --enforce-kpis` (mock) e `--graph --enforce-kpis`
  (grafo real + LLM simulado) — `--enforce-kpis` falha o processo se qualquer KPI ficar
  abaixo da meta (gate de regressão; sabotagem verificada: caso quebrado → exit 1);
- **sicat** — `node scripts/ai-smoke/validate-sicat-chat-catalog.mjs` (catálogo full + sample,
  estrutura/cobertura/anti-heurística; dependency-free);
- **nightly** (cron 03:00 / dispatch) — eval com LLM real (`--real --sample 8 --enforce-kpis`)
  só quando o secret `OPENAI_API_KEY` existir no repo; sem chave, pula com aviso (os jobs
  determinísticos seguem bloqueantes).

## Contratos canônicos de portal (captura real × acesso do SICAT)

> Feature de plataforma (genérica, multi-portal): capturar a estrutura **real** de um portal
> externo (ex.: a API da CETESB) e compará-la com como um app a acessa hoje, gerando um relatório
> que a Claude lê para alinhar o app aos padrões do portal. Doc raiz:
> [`docs/portal-contracts/README.md`](portal-contracts/README.md).

- **Contrato canônico** versionado no repo: `docs/portal-contracts/<portal>/<versão>/endpoints.jsonl`
  (1 linha/endpoint: método, path_template, auth/token_header_mode, request/response schema inferido,
  `requires_captcha`, exemplos **redigidos**) + `manifest.json` com `content_hash` (detector de drift
  temporal do próprio portal via `git diff` entre versões datadas). O `cetesb/2026-06-11` nasceu como
  **seed** escrito a partir do `cetesb-gateway.js` (16 endpoints); capturas reais virão do
  `portal-recorder` e substituem o seed.
- **Validador** [`scripts/portal-contracts/validate-portal-contract.mjs`](../scripts/portal-contracts/validate-portal-contract.mjs)
  (dependency-free): shape, dedup (id + método+path), `content_hash`, baixa-confiança. `--write-hash`
  carimba o manifest. **Sempre bloqueia** no CI.
- **Comparador** [`compare-sicat-cetesb.mjs`](../scripts/portal-contracts/compare-sicat-cetesb.mjs)
  (+ `lib/contract-diff.mjs` puro, 11 testes): casa o contrato com o **mapa declarativo** do
  consumidor (`apps/sicat/backend/docs/portal-contracts/sicat-cetesb-endpoint-map.jsonl`, com
  `anchors` validados contra o gateway) e emite **`drift-report.md`** versionado por severidade
  (método/path = `critical`; token_header_mode/campo required = `high`; etc.). **Bloqueia só em
  `critical`** (`--fail-on critical`) — drifts menores guiam a refatoração sem travar o trunk.
- **Gate**: job `portal-contracts` no [`ai-evals.yml`](../.github/workflows/ai-evals.yml).
- **A Claude consome** o `drift-report.md` da versão `LATEST` como lista de tarefas de alinhamento.
  A verdade da API **real** da CETESB vive aí — não no OpenAPI interno do SICAT.
- **App de captura** `portal-recorder` (browser remoto CDP/Playwright, app na esteira) alimenta o
  contrato com amostras reais — ver o próprio app quando entregue.

## Evoluções futuras (pós F0–F5)
Migração do deep-path COMPLETO do SICAT para o grafo (hoje: fast-path + propose
incremental por especialista; planner de ações legado continua para manifest/cdf até o
gate aprovar) · golden sets/replay no control-plane · mais tools mutantes no GymOps
(update/cancel) sob o mesmo contrato de confirmação.

## Armadilhas
- A porta 9464 não passa pelo Traefik de propósito — não criar IngressRoute para ela.
- `langfuse.localhost` precisa de entrada no hosts (Next.js não suporta subpath).
- Ao subir versão do `ai-core`: `scripts/vendor-packages.ps1` + commitar os `.tgz` nos apps
  (o tgz do sicat vive em `apps/sicat/backend/vendor/` — o script copia para `apps/sicat/vendor/`,
  mova para `backend/vendor/`).
- O validador do catálogo do SICAT roda de `apps/sicat/backend/` e exige full **e** sample em
  `backend/docs/ai-chat/intents/` (ao atualizar o catálogo em `apps/sicat/docs/`, sincronize as
  cópias do backend — full é também a fonte da ingestão RAG).
