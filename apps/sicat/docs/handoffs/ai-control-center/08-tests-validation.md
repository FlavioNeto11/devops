# AI Control Center — 08 · Testes & Validação

> Work ID: `ai-control-center` · Branch: `feature/ai-control-center-langfuse`
> FASE 7 · Depende de: tudo · Critérios de aceite técnicos (handoff 00 §8)

## 1. Gates executados pelo orquestrador

| Gate | Comando | Resultado |
|---|---|---|
| Typecheck | `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) | **PASS** |
| Build TS | `npm run build:ts` (`tsc -p tsconfig.build.json`) | **PASS** |
| Catálogo de chat (offline) | `npm run validate:ai-chat-catalog` | **PASS** |
| Testes unit/integração | `npm test` (`tsx --test tests/**/*.test.js`) | **371 pass / 0 fail / 23 cancelled** |
| Smoke dry-run | `npm run smoke:ai-chat:dry-run` | **24/24** |

Os **23 cancelled** são as suítes que dependem de banco/serviços externos: o test runner as cancela
em ambiente sem DB. Nenhuma falha. Os critérios técnicos de aceite (typecheck, build, catálogo,
`/v1/conversations/turns` e `/v1/conversations/tools` preservados, SQL só em repos/migrations, nenhum
segredo no frontend) estão satisfeitos.

## 2. Gates NÃO executados aqui (exigem servidor/DB/OpenAI)

Este ambiente não tem Postgres up, servidor SICAT up nem `OPENAI_API_KEY` válido (e o default de
código aponta para modelos proibidos — ver memória: usar `.env` com `gpt-4o-mini`/`gpt-4.1`/
`text-embedding-3-small`). Portanto **não** foram rodados:

| O quê | Comando | Pré-requisitos |
|---|---|---|
| Aplicar a migration 017 | `npm run migrate` | Postgres acessível (`DATABASE_URL`/pool). |
| Smoke **sample** (backend real + juiz) | `npm run smoke:ai-chat:sample` | servidor up + token SICAT + `OPENAI_API_KEY`. |
| Smoke por **categoria** | `npm run smoke:ai-chat:category -- <categoria>` | idem sample. |
| Smoke **full** | `npm run smoke:ai-chat:full` | idem + `AI_CONTROL_ALLOW_FULL_SMOKE=true` (via API). |
| Reindex RAG | `npm run build:rag` | `OPENAI_API_KEY` (consome embeddings). |
| Bateria de eval | `npm run chat:eval` | servidor + OpenAI (juiz LLM). |

Recomenda-se, ao subir um ambiente com DB+OpenAI: `npm run migrate` → smoke `sample` via
`/v1/ai-control/evals/run` (ou CLI) → conferir overview/traces na tela.

## 3. Como validar manualmente (smoke funcional da feature)

1. `npm run migrate` (cria as 11 tabelas + 3 views; idempotente).
2. Subir o backend; autenticar com usuário admin.
3. `GET /v1/ai-control/health` → `ok:true`, `database.ok:true`, `langfuse.status` coerente com a env.
4. `GET /v1/ai-control/runtime/tools` → catálogo completo (mesma contagem do inventory) com `stats`.
5. `PATCH` um tool não-action (ex.: desabilitar) → confirmar que some da function-calling no próximo
   turn e que a policy bloqueia com `TOOL_DISABLED`; reabilitar.
6. `POST /v1/ai-control/evals/run` `{mode:'dry-run'}` → 202 e, em seguida, `GET /evals/:runId` com casos.
7. Abrir `GET /v1/ai-control/events/stream` e disparar um turno → ver eventos `tool.done`/`response.done`.

## 4. Gaps conhecidos (carregados para o resumo final)

| Área | Gap | Mitigação atual |
|---|---|---|
| Prompts (hot-path) | Resolver `getActivePromptText` pronto, mas prompts inline (`buildSystemPrompt` etc.) ainda não o consomem. | Fallback de código preserva comportamento; religamento incremental. Handoff 05 §3.1. |
| Prompts (Langfuse) | Sync traz **referência** (labels/versão), não o texto-completo da versão Langfuse. | Cliente expõe listagem, não conteúdo por versão. Handoff 05 §3.2. |
| RAG | **pgvector ausente** — `ai_knowledge_chunks.embedding_vector` é `jsonb`; sem busca vetorial no DB. | Retrieval continua pelo índice em arquivo (`build:rag`); DB é espelho/metadado. Handoff 01/05. |
| Langfuse | Adapter é **leitura**; não há push ativo de spans para o Langfuse externo nesta fase. | Traces SICAT persistidos em `ai_trace_events`; `trace_source='langfuse'` reservado. Handoff 03 §8. |
| Métricas | `avgLatencyMs` do provider Langfuse é `null` (daily-metrics não expõe). | Métricas locais cobrem latência. Handoff 03 §8. |
| Evals | `runEval` síncrono no request; sem cancelamento; `traceId`/accuracy/regressions `null`. | Histórico + SSE entregues. Handoff 06 §7. |
| Tools | Edição de **schema** de tool não exposta na API (só policy/enabled); `version` é timestamp, não SemVer. | Schema propagado do código atual. Handoff 02 §7. |
| QA | Migration e smokes live não rodados aqui (sem DB/OpenAI). | Comandos exatos em §2. |
