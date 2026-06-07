# AI Control Center — 00 · Orquestração

> Work ID: `ai-control-center` · Branch: `feature/ai-control-center-langfuse`
> Orquestrador: Agente 0 · Data de início: 2026-05-30

## 1. Objetivo

Implementar um **AI Control Center** administrativo dentro do SICAT que permita
observar, acompanhar em tempo quase real e alterar de forma governada tudo que a
IA conversacional usa hoje: agentes/especialistas, tools, policies, prompts,
bases de conhecimento (RAG), memória da conversa, traces locais, e a camada
externa de observabilidade **Langfuse** (traces, observations, generations,
spans, scores, custo/tokens/latência).

## 2. Decisão arquitetural

- **SICAT é a fonte de verdade** para catálogo de tools, agents, skills, policies,
  permissões, memória operacional, base de conhecimento, flags de runtime e ações
  sensíveis.
- **Langfuse é camada externa** de observabilidade/tracing/prompt/eval, encapsulada
  no backend por um **provider/adapter** seguro. Nunca em iframe; nunca com chaves
  no frontend.
- O frontend Vue fala **apenas** com o backend SICAT (`/v1/ai-control/*`).
- Tudo respeita `route → service → repository`. SQL só em repositories/migrations.
- Erros em `application/problem+json` via `AppError`. Segredos sanitizados antes de
  qualquer log/trace/payload.

## 3. Convenções confirmadas no repositório (baseline)

| Tema | Padrão | Referência |
|---|---|---|
| Migrations | `src/sql/NNN_nome.sql`, aplicadas por `scripts/migrate.js` → `src/db/migrate.ts`, registradas em `schema_migrations`, 1 transação por arquivo, idempotentes (`create table if not exists`). Próximo número: **017**. | `src/db/migrate.ts` |
| DB access | `import { query } from '../db/pool.js'`; `query<Row>(sql, params)` com `$1..$N`; cast `::jsonb`. | `src/db/pool.ts` |
| Repo | Row type snake_case + `mapXxx(row)` → camelCase + `toIso()`; `JSON.stringify` no insert; `is not distinct from` p/ nullable. | `src/repositories/conversation-action-log-repo.ts` |
| IDs | `createPrefixedId('prefixo')`, `createCorrelationId()`. | `src/lib/ids.ts` |
| Rotas | `createXxxRouter()` → `express.Router()`; `router.METHOD(path, sicatAuthMiddleware, asyncHandler(async (req,res)=>...))`. | `src/routes/api-routes.ts` |
| Auth admin | `sicatAuthMiddleware` injeta `req.sicatUser={userId,email,name,roles[]}`; admin via `resolveAdminAccessSummary(sicatUser)` → `{allowed,source}` (token-role/database). | `src/middlewares/sicat-auth.ts`, `src/services/access-admin-service.ts:59` |
| Correlação | `req.correlationId` / `res.locals.correlationId` via `requestContextMiddleware`. | `src/middlewares/request-context.ts` |
| Erros | `new AppError(status, title, detail, { code })`; serializado em problem+json. | `src/lib/problem.ts` |
| App wiring | `app.use(createXxxRouter())` em `createApp()`. | `src/app.ts` |
| Frontend nav | grupo "Sistema" com `requiresAdminAccess:true`; item `{to,label,icon,description,requiresAdminAccess}`. | `frontend/src/config/navigation.js` |
| Frontend router | `meta:{requiresSicatAuth,requiresActiveCetesbAccount,requiresAdminAccess,audience:'system',breadcrumb}`; guard `ensureAdminRouteAccess` + `authStore.canAccessAdmin`. | `frontend/src/router.js` |
| Frontend API | `request(path, options)`; base `VITE_API_BASE_URL`; método `export function x(params){ return request('/v1/...'+toQueryString(params)) }`. | `frontend/src/services/api.js` |
| Design system | `SicatPageLayout/PageHeader/Card/MetricCard/DataTable/StatusBadge/ActionBar/FiltersPanel/ConfirmDialog/InlineAlert/Loading/Empty/ErrorState`; tabs = Vuetify `v-tabs`+`v-window` (não há `SicatTabs`). | `frontend/src/components/sicat/*` |
| Composables | `useNotification` (success/error/warning/info), `useConfirmDialog` (confirm→Promise<bool>), stream via fetch+NDJSON (`streamJobEvents`). | `frontend/src/composables/*` |

### Pontos de integração da IA

- **Tools (metadados+policy):** `tool-registry.ts` `TOOL_INVENTORY` (20 tools) — `getConversationToolInventory()`.
- **Schemas function-calling:** `CONVERSATION_TOOLS[]` em `llm-provider.ts:199`, consumido em `createEscalationGraph` (`:1816`) e `conversationToolsForSpecialist` (`:1876`) via `bindTools`; grafos cacheados por especialista.
- **Policy:** `evaluateConversationPolicy()` em `conversation-policy-service.ts` (lê do registry via `toToolPolicy`).
- **Config:** `getAiConfig()` (`ai-config.ts`) — OPENAI_*, LangSmith. Defaults legados citam `gpt-5.x` (proibidos: usar `.env`).
- **Observabilidade:** `conversation-observability.ts` — `state` singleton em memória; `registerConversationOperationalEvent`, `getConversationTelemetrySnapshot()`, `recentEvents` (últimos 20).
- **System prompt:** `buildSystemPrompt(context)` em `llm-provider.ts:649`.
- **Memória:** working (`loadWorkingMemory`), patches (`conversation_memory` kind=`memory_patch`), vetorial (`recallConversationSemanticMemory`), chaveada por `(conversationSessionId, integrationAccountId)`.
- **Knowledge:** `retrieveKnowledge(q,{k})` + `isKnowledgeIndexAvailable()`; índice em `artifacts/conversation-knowledge-index.json` (`text-embedding-3-small`, 511 chunks).
- **Smoke/eval:** `scripts/ai-smoke/run-sicat-ai-smoke.mjs` (flags `--catalog --category --dry-run --no-fail-fast`); `--dry-run` não chama backend/LLM; relatório JSON/MD em `artifacts/ai-smoke/`. Sample=24, full=466. `npm run validate:ai-chat-catalog` é offline.

## 4. Matriz de dependências (fases)

```
FASE 1 Data foundation ── migration 017 + config + repos ─┐
                                                          ├─► FASE 4 Admin APIs ──► FASE 5 Frontend
FASE 2 Runtime dinâmico ─ registry + policy + llm-provider┤
FASE 3 Observabilidade ─ providers + langfuse + SSE ──────┘
FASE 6 Security (revisão transversal) ───────────────────────► FASE 7 QA ──► FASE 8 Docs
```

| Componente | Depende de | Habilita |
|---|---|---|
| `017_ai_control_center.sql` | convenções migrate | repos, registry, traces, evals |
| `ai-control-types.ts` | tool-types, observability | tudo (contrato) |
| `ai-control-config.ts` | env | langfuse provider, eval guard, settings |
| repos `ai-*-repo.ts` | migration | services admin |
| `ai-runtime-registry-service.ts` | tool-registry, ai-tool-admin-repo | llm-provider, policy, tools API |
| policy overrides | registry | confirmação/readonly governados |
| observability providers | config | overview, traces, SSE |
| `ai-control-routes.ts` | todos services | frontend |
| frontend | contrato DTO + rotas | UX |

## 5. Matriz de riscos

| Risco | Sev | Mitigação |
|---|---|---|
| Quebrar `/v1/conversations/turns` ao tornar tools dinâmicos | Alta | Registry retorna defaults quando não há overrides no DB; fallback total em erro; comportamento idêntico sem linhas em `ai_tools`. Cache de grafo invalidado por versão. |
| Quebrar testes existentes | Alta | Não alterar contratos públicos; `getConversationToolInventory`/`listConversationTools`/`dispatchConversationTool` preservados. |
| Langfuse fora do ar trava conversa | Alta | Provider isolado, timeouts, nunca lançado no fluxo do turn; status `degraded`. |
| Vazamento de segredo (Langfuse/JWT) p/ frontend | Alta | Backend só expõe `*Configured:boolean`; sanitização antes de trace/log. |
| Ação destrutiva sem confirmação | Alta | `requiresConfirmation`/admin + `AI_CONTROL_READONLY`; DELETE memory, full smoke, prompt rollback/sync, toggle de action tool exigem confirmação. |
| Full smoke em produção | Média | Bloqueado salvo `AI_CONTROL_ALLOW_FULL_SMOKE=true`. |
| Migration em ambiente sem DB (CI) | Média | Idempotente; QA documenta se DB ausente. |
| pgvector ausente | Baixa | `ai_knowledge_chunks.embedding_vector` como `jsonb` nullable (sem pgvector). |

## 6. Variáveis de ambiente (novas)

```
LANGFUSE_ENABLED=false
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_PROJECT_ID=
LANGFUSE_FLUSH_INTERVAL_MS=5000
LANGFUSE_SYNC_TIMEOUT_MS=8000

AI_CONTROL_ENABLED=true
AI_CONTROL_READONLY=false
AI_CONTROL_ALLOW_FULL_SMOKE=false
AI_CONTROL_TRACE_RETENTION_DAYS=30
AI_CONTROL_ENABLE_SSE=true
```

LangSmith legado preservado; AI Control prioriza Langfuse quando `LANGFUSE_ENABLED=true`.

## 7. Checklist de arquivos (planejado)

### Backend
- [ ] `src/sql/017_ai_control_center.sql`
- [ ] `src/services/ai-control/ai-control-config.ts`
- [ ] `src/services/ai-control/ai-control-types.ts`
- [ ] `src/repositories/ai-trace-event-repo.ts`
- [ ] `src/repositories/ai-tool-admin-repo.ts`
- [ ] `src/repositories/ai-prompt-admin-repo.ts`
- [ ] `src/repositories/ai-knowledge-admin-repo.ts`
- [ ] `src/repositories/ai-eval-admin-repo.ts`
- [ ] `src/services/conversation/tools/conversation-tool-schemas.ts` (extração dos defaults)
- [ ] `src/services/ai-control/ai-runtime-registry-service.ts`
- [ ] `src/services/ai-control/ai-tool-admin-service.ts`
- [ ] `src/services/ai-control/ai-agent-admin-service.ts`
- [ ] `src/services/ai-control/ai-prompt-admin-service.ts`
- [ ] `src/services/ai-control/ai-knowledge-admin-service.ts`
- [ ] `src/services/ai-control/ai-memory-admin-service.ts`
- [ ] `src/services/ai-control/ai-eval-admin-service.ts`
- [ ] `src/services/ai-control/ai-control-observability-service.ts`
- [ ] `src/services/ai-control/ai-control-service.ts`
- [ ] `src/services/ai-control/providers/ai-observability-provider.ts`
- [ ] `src/services/ai-control/providers/noop-observability-provider.ts`
- [ ] `src/services/ai-control/providers/local-observability-provider.ts`
- [ ] `src/services/ai-control/langfuse/langfuse-types.ts`
- [ ] `src/services/ai-control/langfuse/langfuse-client.ts`
- [ ] `src/services/ai-control/langfuse/langfuse-provider.ts`
- [ ] `src/services/ai-control/langfuse/langfuse-mapper.ts`
- [ ] `src/services/ai-control/langfuse/langfuse-deeplink.ts`
- [ ] `src/routes/ai-control-routes.ts`
- [ ] `src/app.ts` (registrar router)
- [ ] `conversation-policy-service.ts` (overrides — aditivo)
- [ ] `llm-provider.ts` (consumir registry — aditivo, fallback)

### Frontend
- [ ] `frontend/src/config/navigation.js` (item)
- [ ] `frontend/src/router.js` (rota)
- [ ] `frontend/src/services/api.js` (métodos `aiControl*`)
- [ ] `frontend/src/views/ai-control/AiControlCenterView.vue`
- [ ] `frontend/src/features/ai-control/Ai*Panel.vue` (Overview/RuntimeTools/Agents/LangfuseTraces/TraceTree/Prompts/Knowledge/Memory/Evals/Settings)
- [ ] `frontend/src/composables/useAiControlStream.js` (SSE)

## 8. Critérios de aceite (resumo)

Técnicos: `npm run typecheck`, `npm run build:ts`, `npm run validate:ai-chat-catalog` passam;
`/v1/conversations/turns` e `/v1/conversations/tools` preservados; SQL só em repos/migrations;
nenhum segredo no frontend. Funcionais: admin acessa a tela; overview com métricas locais +
status Langfuse; tools com policy/stats editáveis; mutação sensível exige confirmação; memória
inspeccionável; trace local em SSE; full smoke bloqueado sem flag.

## 9. Status por fase

- FASE 0 Baseline — **em andamento** (branch, leitura, contratos).
- FASE 1..8 — pendentes (ver handoffs 01–09).
