# AI Control Center SICAT — Entrega Final

> Branch: `feature/ai-control-center-langfuse` · Work ID: `ai-control-center`

## O que foi implementado

Um **AI Control Center** administrativo (`/sistema/ai-control`) que observa e governa o
runtime da IA conversacional do SICAT, com o **Langfuse como camada externa opcional**
de observabilidade (encapsulada no backend; chaves nunca expostas). O SICAT permanece a
fonte de verdade de tools, agents, policies, prompts, conhecimento, memória e flags.
Tudo retrocompatível: sem linhas nas novas tabelas e com Langfuse desligado, o
comportamento atual é idêntico.

## Arquitetura

- `route → service → repository`; SQL só em `src/sql` e `src/repositories`.
- Runtime dinâmico via **snapshot stale-while-revalidate** (defaults de código + overrides do banco), fail-safe.
- Observabilidade por **provider abstrato** (`noop` / `local` / `langfuse`) com fallback local automático.
- Eventos locais em **SSE** alimentados por um hook best-effort na observabilidade conversacional (nunca bloqueia o turn).
- Erros em `application/problem+json`; segredos sanitizados antes de log/trace/payload.

## Backend (29 arquivos novos + 5 alterados)

- **Migration** `src/sql/017_ai_control_center.sql`: 11 tabelas (`ai_tools`, `ai_tool_versions`, `ai_agents`, `ai_prompts`, `ai_prompt_versions`, `ai_knowledge_sources`, `ai_knowledge_chunks`, `ai_memory_admin_events`, `ai_trace_events`, `ai_eval_runs`, `ai_eval_cases`) + 3 views.
- **Repositories** (6): `ai-trace-event-repo`, `ai-tool-admin-repo`, `ai-prompt-admin-repo`, `ai-knowledge-admin-repo`, `ai-eval-admin-repo`, `ai-memory-admin-repo`.
- **Services** `src/services/ai-control/*`: config, types, auth, sanitize, runtime-registry, tool/agent/prompt/knowledge/memory/eval admin, control (overview/health/settings), observability + `providers/*` + `langfuse/*`.
- **Rotas** `src/routes/ai-control-routes.ts` (registrada em `src/app.ts`).
- **Alterados (aditivos)**: `llm-provider.ts` (tools dinâmicos via `getRuntimeConversationToolSchemas()` + cache de grafo por versão), `conversation-policy-service.ts` (overlay de policy + `TOOL_DISABLED` + `AI_CONTROL_READONLY`), `conversation-observability.ts` (hook de assinatura), `app.ts`, `.env.example`.

## Frontend (12 arquivos novos + 3 alterados)

View `AiControlCenterView.vue` + 10 painéis em `features/ai-control/` + `useAiControlStream.js`; `navigation.js`/`router.js`/`api.js` atualizados. Design system `Sicat*`, `v-tabs`/`v-window`, confirmação em ações sensíveis, sem segredos. Detalhes em [04-frontend-ui.md](04-frontend-ui.md).

## Langfuse

`LANGFUSE_ENABLED=false` por padrão → status `disabled`, fallback local. Com `LANGFUSE_ENABLED=true` + chaves → `ready` (ou `degraded` se a API falhar, sem quebrar a conversa). Deep links para inspeção avançada. Chaves só no backend.

## Runtime dinâmico

`ai_tools` sobrepõe defaults de `tool-registry.ts`; `enabled=false` remove o tool do function-calling e bloqueia na policy; overrides de risco/canais/confirmação aplicados. Mudança administrativa faz `refresh` + `bump` de versão (invalida cache de grafo do planner). Sem overrides → idêntico ao atual.

## Segurança

Admin-only (`sicatAuthMiddleware` + `ensureAiControlAdmin`), `AI_CONTROL_READONLY` bloqueia mutações, confirmação (428) para limpar memória / reindex / full smoke / activate-rollback / sync prompt / toggle de action tool, sanitização de segredos, `AI_CONTROL_ENABLED` gate (404). Ver [07-security-rbac.md](07-security-rbac.md).

## Testes executados

| Comando | Resultado | Observação |
|---|---|---|
| `npm run typecheck` | ✅ PASS | zero erros |
| `npm run build:ts` | ✅ PASS | gera dist/ |
| `npm run validate:ai-chat-catalog` | ✅ PASS | catálogo íntegro |
| `npm test` | ✅ 371 pass / 0 fail | 23 suites canceladas (dependem de DB ausente) |
| `npm run smoke:ai-chat:dry-run` | ✅ 24/24 | pipeline OK |
| `npm run migrate` | ⏳ não executado | requer Postgres |
| `npm run smoke:ai-chat:sample` | ⏳ não executado | requer servidor + token + OpenAI |
| frontend build (vite) | ⏳ não executado | fora dos gates; `node --check` OK nos .js |

## Como configurar

1. `.env` (gitignored): definir `OPENAI_API_KEY` + modelos autorizados (`OPENAI_AGENT_MODEL`, etc.). Langfuse: `LANGFUSE_ENABLED=true`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_PROJECT_ID`. Flags `AI_CONTROL_*` conforme `.env.example`.
2. `npm run migrate` (aplica 017).
3. `npm run dev` / `npm run worker`; frontend `npm run dev` em `frontend/`.

## Como operar

Login admin → menu **Sistema → AI Control Center**. Abas: Overview, Runtime SICAT, Langfuse, Prompts, Knowledge Base, Memória, Evals/Smoke, Settings.

## Riscos residuais / gaps conhecidos

- Prompts: superfície admin completa, mas o **wiring dos prompts inline ao resolver** (`getActivePromptText`) é incremental — fallback de código preservado.
- Sync Langfuse de prompt grava **referência** (nome/versão/labels), não o texto completo (a API pública de get-by-name não foi adicionada ao client).
- **pgvector ausente**: `ai_knowledge_chunks.embedding_vector` é `jsonb` nullable.
- Live smoke (sample/full) e migração não rodaram aqui (sem DB/servidor/OpenAI nesta sessão).

## Próximos passos recomendados

1. Aplicar `017` e rodar `smoke:ai-chat:sample` num ambiente com DB+OpenAI.
2. Wire incremental dos prompts inline ao resolver (começando por `conversation.system`).
3. Buscar texto completo de prompt no Langfuse (`/api/public/v2/prompts/:name`).
4. (Opcional) flush ativo de traces para o Langfuse via SDK (hoje a leitura é pull; a escrita usa LangSmith legado + persistência local).
