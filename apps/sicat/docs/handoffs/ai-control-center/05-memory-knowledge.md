# AI Control Center — 05 · Memória, Prompts e Conhecimento (RAG)

> Work ID: `ai-control-center` · Branch: `feature/ai-control-center-langfuse`
> FASE 4 · Depende de: repos 017, observability provider · Habilita: abas Memória/Prompts/Knowledge

## 1. Objetivo

Administrar, de forma governada e auditável, os três insumos "vivos" da IA: a **memória** da conversa,
os **prompts** versionados e a **base de conhecimento** (RAG). Nenhuma dessas superfícies altera o
fluxo de retrieval/inferência em produção; o caminho atual permanece preservado por fallback.

## 2. Memória — `ai-memory-admin-service.ts`

Inspeção e mutação da memória conversacional, chaveada por `(conversationSessionId,
integrationAccountId)`. Toda **mutação** grava `ai_memory_admin_events` (auditoria).

| Função | Ação | Auditoria (`action`) |
|---|---|---|
| `getMemorySnapshot(sessionId, accountId)` | Lê working memory (`loadWorkingMemory`), patch (`conversation_memory` kind=`memory_patch`), memória vetorial (`listConversationSemanticMemory`, top 10) e mensagens recentes (top 15). Deriva `activeManifestIds`/`askedManifestIds`/`activeJobIds`/`artifactIds`/`dateRange` unindo WM + patch. | — (leitura) |
| `clearMemory(...)` | **Destrutivo.** `clearSessionMemory` (apaga `conversation_memory` + `conversation_semantic_memory`; **mantém mensagens**). Retorna `{memoryRows, semanticRows}`. | `memory.clear` (grava snapshot `before` + linhas apagadas) |
| `exportMemorySnapshot(...)` | Retorna o snapshot completo (rota seta `Content-Disposition: attachment`). | `memory.export` |
| `rebuildMemorySummary(...)` | Recomputa a working memory via `updateAndPersistWorkingMemory` usando as últimas mensagens user/assistant + `operationalTodayIso()`. | `memory.rebuild_summary` |
| `listMemoryAdminHistory(sessionId)` | Lista o histórico de auditoria da sessão. | — (leitura) |

`clearSessionMemory` (repo, handoff 01) usa `is not distinct from` para casar
`integration_account_id` nullable. DTO de saída: `AiMemorySnapshot` (ver `ai-control-types.ts`).

## 3. Prompts — `ai-prompt-admin-service.ts`

Fonte de verdade DB (`ai_prompts`/`ai_prompt_versions`) **com fallback de código**. Há um catálogo
embutido `KNOWN_PROMPTS` (6 entradas): `conversation.{system,classifier,planner,synthesis,escalation,judge}`.

| Função | Comportamento |
|---|---|
| `listPrompts()` | Une `KNOWN_PROMPTS` (source `code`) + prompts do DB (source `db`); inclui `versionsCount`, `activeVersion`. |
| `getPrompt(name)` | Detalhe + `versions[]` (cada uma com flag `active`) + `localFallbackAvailable` (true se está em `KNOWN_PROMPTS`). 404 se não existe em nenhum dos dois. |
| `createPromptVersion(name, payload, actor)` | Upsert do prompt (`providerSource:'manual'`) + nova versão (`promptText` obrigatório). Ativa automaticamente se `activate:true` **ou** se ainda não há versão ativa. |
| `activatePromptVersion(name, versionId, actor)` | `setAiPromptActiveVersion` + `markAiPromptVersionActivated` (ativa/rollback — a rota exige `confirmed:true`). |
| `syncPromptFromLangfuse(name, actor)` | Lê `provider.listPrompts()`, cria uma versão **de referência** com `langfusePromptId`/`langfuseVersion` (rota exige `confirmed:true`). |
| `getActivePromptText(name)` | **Resolver de runtime**: `findActivePromptVersionByName` → texto da versão ativa, ou `null` (= usar fallback de código). Engole erros (retorna `null`). |

### 3.1 Gap documentado (hot-path)

`getActivePromptText` já é o resolver canônico, **mas os prompts inline do runtime ainda não foram
religados a ele** — `buildSystemPrompt` (`llm-provider.ts:659`) e demais prompts continuam usando o
texto embutido em código. Isso é intencional nesta fase: a superfície administrável está completa
(criar/versionar/ativar/sincronizar), e o fallback de código preserva 100% do comportamento atual.
O religamento de cada prompt ao resolver é incremental. Ver handoff 08 (pendências).

### 3.2 Sync Langfuse — escopo

A versão sincronizada do Langfuse é **apenas referência** (texto-marcador com labels/versão); o
texto-completo do prompt no Langfuse **não é buscado** nesta fase (o cliente expõe a listagem de
prompts, não o conteúdo por versão). Ver handoff 08.

## 4. Conhecimento (RAG) — `ai-knowledge-admin-service.ts`

Lê o índice prebuilt `artifacts/conversation-knowledge-index.json` (modelo `text-embedding-3-small`,
constante `KNOWLEDGE_EMBEDDING_MODEL`), espelha as fontes em `ai_knowledge_sources` e testa retrieval.
**Não altera** `conversation-knowledge-service` (o retrieval de produção permanece igual).

| Função | Comportamento |
|---|---|
| `getKnowledgeIndexStatus()` | Lê o índice + `listAiKnowledgeSources`; agrupa chunks por `source`, infere `sourceType`, marca `disabled`/`indexed`. `available:false` se o índice não existe. |
| `listKnowledgeChunks({source,search,limit})` | Filtra/clampa chunks do índice (limite 500, texto truncado 1200). |
| `testKnowledgeRetrieval(question, k?)` | Chama `retrieveKnowledge(question, {k})` (mesmo retrieval do chat); `k` clamp `1..12` (default 6). |
| `setKnowledgeSourceEnabledByKey(sourceKey, enabled)` | Upsert + `setAiKnowledgeSourceEnabled` (espelho de DB). |
| `reindexKnowledge()` | `execFile(process.execPath, ['scripts/rag/build-knowledge-index.mjs'])` (timeout 180 s), espelha fontes no DB, devolve `logTail` (últimas 15 linhas). 502 `KNOWLEDGE_REINDEX_FAILED` em erro. A rota exige `confirmed:true` (consome OpenAI). |

`scripts/rag/build-knowledge-index.mjs` é exatamente o que `npm run build:rag` executa.

### 4.1 RAG / `build:rag` inalterados

O reindex administrativo **invoca o mesmo script** de sempre; não há um pipeline paralelo. O índice
em arquivo continua sendo o artefato canônico de retrieval — `ai_knowledge_sources` é metadado/espelho
para a tela (toggle de `enabled`, status, contagem). Sem busca vetorial no DB (`embedding_vector` é
`jsonb`, sem pgvector). Ver handoff 01 e 08.

## 5. Pendências conhecidas

- **Hot-path de prompts**: resolver `getActivePromptText` pronto, mas prompts inline ainda não
  consomem (fallback de código preservado). §3.1.
- **Texto-completo do prompt Langfuse**: sync é referência-only. §3.2.
- **pgvector ausente**: retrieval só pelo índice em arquivo; chunks no DB são espelho. §4.1.
