# AI Control Center — 01 · Fundação de Dados (migration + repositórios)

> Work ID: `ai-control-center` · Branch: `feature/ai-control-center-langfuse`
> FASE 1 · Depende de: convenções de `migrate` · Habilita: registry, traces, evals, services admin

## 1. Objetivo

Entregar a camada de persistência do AI Control Center: a migration `017_ai_control_center.sql`
(11 tabelas + 3 views) e 6 repositórios que seguem o padrão `route → service → repository`
(SQL **somente** aqui). As linhas dessas tabelas são **OVERRIDES** sobre os defaults de código —
sem linhas, o runtime usa exatamente o comportamento atual (backward compatible).

## 2. Migration `src/sql/017_ai_control_center.sql`

Idempotente (`create table if not exists`, `create index if not exists`, `create or replace view`).
1 transação por arquivo, registrada em `schema_migrations` por `src/db/migrate.ts`.

### Por que o próximo número era **017**

O baseline (handoff 00, tabela de convenções) confirmou que o último arquivo aplicado era `016_*`
e o próximo livre era **017**. Toda a feature cabe em uma única migration nova; nenhuma migration
anterior foi alterada (mantém o histórico imutável esperado por `schema_migrations`).

### 2.1 Tabelas (11)

| # | Tabela | Propósito | Colunas-chave | Índices |
|---|---|---|---|---|
| 1 | `ai_tools` | Overrides do catálogo de tools (defaults em `tool-registry.ts`). | `tool_name` (unique), `enabled`, `default_policy_json` (jsonb), `schema_json` (jsonb), `source` (default `db`), `active_version_id` | `idx_ai_tools_enabled (enabled, tool_name)` |
| 2 | `ai_tool_versions` | Histórico versionado de schema/policy por tool. | `tool_id` → `ai_tools(id)` `on delete cascade`, `version`, `policy_json` (jsonb), `schema_json` (jsonb), `changelog`, `activated_at` | `idx_ai_tool_versions_tool (tool_id, created_at desc)` |
| 3 | `ai_agents` | Overrides de agentes/especialistas (defaults em `conversation-specialists.ts`). | `agent_name` (unique), `specialist_type`, `tool_names` (jsonb), `prompt_name`, `enabled`, `config_json` (jsonb) | — |
| 4 | `ai_prompts` | Prompts administráveis (system/classifier/planner/synthesis/escalation/judge). | `prompt_name` (unique), `provider_source` (default `local`), `active_version_id` | — |
| 5 | `ai_prompt_versions` | Versões de prompt com label/model e link opcional ao Langfuse. | `prompt_id` → `ai_prompts(id)` cascade, `version`, `prompt_text` (not null), `prompt_config_json` (jsonb), `langfuse_prompt_id`, `langfuse_version` (int), `activated_at` | `idx_ai_prompt_versions_prompt (prompt_id, created_at desc)` |
| 6 | `ai_knowledge_sources` | Metadados das fontes indexadas (RAG). | `source_key` (unique), `source_type` (default `file`), `path_or_uri`, `enabled`, `embedding_model`, `last_indexed_at`, `chunk_count`, `status` (default `unknown`), `metadata_json` (jsonb) | — |
| 7 | `ai_knowledge_chunks` | Espelho opcional de chunks. **Sem pgvector**: `embedding_vector` é `jsonb`. | `source_id` → `ai_knowledge_sources(id)` cascade, `chunk_key`, `text` (not null), `embedding_vector` (jsonb), `score_metadata_json` (jsonb) | `idx_ai_knowledge_chunks_source (source_id, created_at desc)` |
| 8 | `ai_memory_admin_events` | Auditoria de operações administrativas de memória. | `conversation_session_id` (not null), `action`, `before_payload`/`after_payload` (jsonb), `requested_by`, `correlation_id` | `idx_ai_memory_admin_events_session (conversation_session_id, created_at desc)` |
| 9 | `ai_trace_events` | **Trace store unificado** local (SICAT) + Langfuse. | `trace_source` (default `sicat`), `trace_id`, `observation_id`, `conversation_session_id`, `conversation_turn_id`, `correlation_id`, `tool_name`, `event_type` (not null), `status`, `latency_ms`, `token_input`, `token_output`, `cost` (numeric), `payload_json` (jsonb) | 6 índices (ver §2.3) |
| 10 | `ai_eval_runs` | Execuções de bateria de smoke/eval. | `run_key` (unique), `mode`, `status` (default `queued`), `started_at`/`finished_at`, `summary_json` (jsonb), `langfuse_dataset_run_id` | `idx_ai_eval_runs_created (created_at desc)` |
| 11 | `ai_eval_cases` | Casos de uma execução de eval. | `run_id` → `ai_eval_runs(id)` cascade, `case_id`, `category`, `prompt`, `expected_json`/`actual_json`/`score_json` (jsonb), `status`, `trace_id` | `idx_ai_eval_cases_run (run_id, created_at desc)` |

### 2.2 `ai_trace_events` como trace store unificado

É a tabela central de observabilidade. `trace_source` distingue `'sicat'` (eventos operacionais
locais, gravados pela ponte em `ai-control-observability-service.ts`) de `'langfuse'` (reservado
para sincronização externa). O `LocalObservabilityProvider` lê desta tabela e **reconstrói árvores
de trace por turno** quando o Langfuse está indisponível — por isso a tela de traces nunca fica
vazia. As 3 views agregam exatamente sobre ela.

### 2.3 Índices de `ai_trace_events`

`idx_ai_trace_events_created (created_at desc)`, `_session (conversation_session_id, created_at desc)`,
`_turn (conversation_turn_id, created_at desc)`, `_correlation (correlation_id, created_at desc)`,
`_trace (trace_id)`, `_tool (tool_name, created_at desc)`. Cobrem os filtros expostos em
`AiTraceEventFilters` e a leitura por turno (`listAiTraceEventsByTurn`).

### 2.4 Views (3)

| View | Origem | Saída |
|---|---|---|
| `v_ai_control_tool_usage` | `ai_trace_events where tool_name is not null`, `group by tool_name` | `tool_name, total, executed, blocked, failed, last_used_at` (counts por `status`) |
| `v_ai_control_errors` | `ai_trace_events where status = 'failed'`, `group by coalesce(payload_json->>'errorCode','UNKNOWN')` | `error_code, total, last_seen_at` |
| `v_ai_control_recent_turns` | `ai_trace_events where event_type in ('final-response','response.done','turn.started')` | `conversation_session_id, conversation_turn_id, correlation_id, tool_name, event_type, status, latency_ms, created_at` (order by `created_at desc`) |

## 3. Repositórios (6)

Todos seguem o padrão do repo (`conversation-action-log-repo.ts`): `import { query } from '../db/pool.js'`,
Row type snake_case + `mapXxx(row)` → camelCase, `toIso()` para timestamps, `JSON.stringify` + cast
`::jsonb` no insert, IDs via `createPrefixedId(prefixo)`.

### 3.1 `ai-trace-event-repo.ts`

Prefixo de ID `aitrace`. Funções:

| Função | Retorno | Notas |
|---|---|---|
| `insertAiTraceEvent(input: AiTraceEventInput)` | `AiTraceEvent \| null` | `traceSource` default `sicat`; `cost` é `numeric` no DB e normalizado por `toNumberOrNull`. |
| `listAiTraceEvents(filters: AiTraceEventFilters)` | `AiTraceEvent[]` | Filtros `pushEq` (trim) por sessão/turno/correlation/tool/user/status/source; `limit` clamp `1..500` (default 100); `order by created_at desc`. |
| `listAiTraceEventsByTurn(conversationTurnId)` | `AiTraceEvent[]` | `order by created_at asc limit 500` (ordem cronológica p/ árvore). |
| `getAiToolUsageStats()` | `AiToolUsageStat[]` | Lê a view `v_ai_control_tool_usage`. |
| `pruneAiTraceEvents(retentionDays)` | `number` (linhas removidas) | `delete ... where created_at < now() - ($1 \|\| ' days')::interval`; clamp mínimo 1, default 30. |

Record `AiTraceEvent` (DTO em `ai-control-types.ts`): `id, traceSource('sicat'|'langfuse'), traceId,
observationId, conversationSessionId, conversationTurnId, correlationId, userId, toolName, eventType,
status, latencyMs, tokenInput, tokenOutput, cost, payload, createdAt`.

### 3.2 `ai-tool-admin-repo.ts`

Cobre **tools, versões de tool e agents** (3 grupos). Prefixos: `aitool`, `aitoolver`, `aiagent`.

| Função | Retorno |
|---|---|
| `listAiToolOverrides()` / `findAiToolOverride(toolName)` | `AiToolOverrideRecord[]` / `… \| null` |
| `upsertAiToolOverride(input: UpsertAiToolInput)` | `AiToolOverrideRecord \| null` — `on conflict (tool_name)`; `coalesce` preserva campos não enviados, mas **`default_policy_json`/`enabled`/`source` são sempre substituídos**. |
| `insertAiToolVersion(input)` / `listAiToolVersions(toolId)` | `AiToolVersionRecord \| null` / `[]` (limit 100, `created_at desc`) |
| `listAiAgentOverrides()` / `findAiAgentOverride(agentName)` | `AiAgentRecord[]` / `… \| null` |
| `upsertAiAgentOverride(input)` | `AiAgentRecord \| null` — `on conflict (agent_name)` com `coalesce`. |

Records: `AiToolOverrideRecord { id, toolName, category, objective, dependencies[], schemaJson,
defaultPolicyJson, enabled, source, activeVersionId, createdAt, updatedAt }`;
`AiToolVersionRecord { id, toolId, version, schemaJson, policyJson, changelog, createdBy, createdAt,
activatedAt }`; `AiAgentRecord { id, agentName, description, specialistType, toolNames[], promptName,
enabled, config, createdAt, updatedAt }`. `toStringArray` protege os campos `jsonb` de array.

### 3.3 `ai-prompt-admin-repo.ts`

Cobre **prompts e versões de prompt**. Prefixos: `aiprompt`, `aipromptver`.

| Função | Retorno |
|---|---|
| `listAiPrompts()` / `findAiPrompt(promptName)` | `AiPromptRecord[]` / `… \| null` |
| `upsertAiPrompt(input)` | `AiPromptRecord \| null` — `on conflict (prompt_name)`. |
| `setAiPromptActiveVersion(promptId, versionId)` | `void` |
| `listAiPromptVersions(promptId)` / `findAiPromptVersionById(versionId)` | `AiPromptVersionRecord[]` (limit 100) / `… \| null` |
| `insertAiPromptVersion(input)` | `AiPromptVersionRecord \| null` |
| `markAiPromptVersionActivated(versionId)` | `void` (set `activated_at = now()`) |
| `findActivePromptVersionByName(promptName)` | `AiPromptVersionRecord \| null` — **join** `ai_prompt_versions` ⨝ `ai_prompts.active_version_id`; é o resolver de runtime usado por `getActivePromptText`. |

Records: `AiPromptRecord { id, promptName, description, providerSource, activeVersionId, createdAt,
updatedAt }`; `AiPromptVersionRecord { id, promptId, version, label, model, promptText, promptConfig,
langfusePromptId, langfuseVersion, createdBy, createdAt, activatedAt }`.

### 3.4 `ai-knowledge-admin-repo.ts`

Prefixo `aiksrc`. Cobre `ai_knowledge_sources` (a tabela de chunks é apenas espelho opcional e não
tem repo dedicado — o índice canônico vive em `artifacts/conversation-knowledge-index.json`).

| Função | Retorno |
|---|---|
| `listAiKnowledgeSources()` / `findAiKnowledgeSource(sourceKey)` | `AiKnowledgeSourceRecord[]` / `… \| null` |
| `upsertAiKnowledgeSource(input)` | `AiKnowledgeSourceRecord \| null` — `on conflict (source_key)`. |
| `setAiKnowledgeSourceEnabled(sourceKey, enabled)` | `AiKnowledgeSourceRecord \| null` |

Record `AiKnowledgeSourceRecord { id, sourceKey, sourceType, title, pathOrUri, enabled,
embeddingModel, lastIndexedAt, chunkCount, status, metadata, createdAt, updatedAt }`.

### 3.5 `ai-eval-admin-repo.ts`

Cobre **eval runs e eval cases**. Prefixos: `aieval`, `aievalcase`.

| Função | Retorno |
|---|---|
| `insertAiEvalRun(input)` | `AiEvalRunRecord \| null` (status default `queued`) |
| `updateAiEvalRun(runId, patch)` | `AiEvalRunRecord \| null` — `coalesce` por campo. |
| `getAiEvalRun(runId)` / `listAiEvalRuns(limit=50)` | `… \| null` / `[]` (clamp `1..200`) |
| `insertAiEvalCases(runId, cases[])` | `number` (inseridos; loop, 1 insert por caso) |
| `listAiEvalCases(runId, limit=500)` | `AiEvalCaseRecord[]` (clamp `1..1000`, `created_at asc`) |

Records: `AiEvalRunRecord { id, runKey, mode, status, startedAt, finishedAt, requestedBy, summary,
langfuseDatasetRunId, createdAt }`; `AiEvalCaseRecord { id, runId, caseId, category, prompt, expected,
actual, score, status, traceId, createdAt }`.

### 3.6 `ai-memory-admin-repo.ts`

Prefixo `aimemev`. Auditoria + a operação destrutiva de limpeza.

| Função | Retorno |
|---|---|
| `insertAiMemoryAdminEvent(input)` | `AiMemoryAdminEventRecord \| null` |
| `listAiMemoryAdminEvents(conversationSessionId, limit=50)` | `[]` (clamp `1..200`, `created_at desc`) |
| `clearSessionMemory(conversationSessionId, integrationAccountId)` | `{ memoryRows, semanticRows }` — `delete from conversation_memory` + `delete from conversation_semantic_memory` (`is not distinct from` no `integration_account_id` nullable). **Não apaga `conversation_messages`** (histórico preservado). |

Record `AiMemoryAdminEventRecord { id, conversationSessionId, action, beforePayload, afterPayload,
requestedBy, correlationId, createdAt }`.

## 4. Convenções seguidas

- **IDs** prefixados por `createPrefixedId(...)` (text PK); `created_at`/`updated_at` `timestamptz default now()`.
- **JSONB** para todo payload estruturado (`*_json`, `dependencies`, `tool_names`, `config_json`,
  `payload_json`, `embedding_vector`); `JSON.stringify` + cast `::jsonb` no insert; default `'{}'::jsonb`/`'[]'::jsonb`.
- **timestamptz** sempre normalizado a ISO via `toIso()` no mapper.
- **Idempotência da migration**: `if not exists` em tudo; reaplicar é no-op.
- **Idempotência de escrita**: tabelas de catálogo (`ai_tools`, `ai_agents`, `ai_prompts`,
  `ai_knowledge_sources`) usam `on conflict (<chave única>) do update` — re-upsert é seguro.
- **Numéricos defensivos**: `toNumberOrNull` / `toIntOrNull` / `toIntOrZero` toleram `numeric` vindo
  como string do driver `pg`.

## 5. Pendências conhecidas

- `ai_knowledge_chunks.embedding_vector` é `jsonb` (sem extensão `pgvector`); não há busca vetorial
  no banco — o retrieval continua sendo servido pelo índice em arquivo. Ver handoff 05 e 08.
- A migration **não foi aplicada neste ambiente** (sem DB). Comando: `npm run migrate`. Ver handoff 08.
