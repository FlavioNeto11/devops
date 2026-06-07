# Checkpoint 10 — Documentation Final
**work_id:** `conversacional-sicat-consolidacao`
**Data:** 2026-04-23
**Agente:** `documentador-mtr`
**Status:** ✅ Concluído

---

## Sumário executivo

Esta consolidação corrigiu dois problemas críticos da camada conversacional da primeira onda do SICAT:

1. **Arquitetura de IA sem integração real** — `llm-provider.ts` era puramente rule-based (keyword matching). Migrado para LangChain + LangGraph + LangSmith com `ai-config.ts` centralizado.
2. **Frontend conversacional fora do padrão** — app light (`ConversationalChatAppView.vue`) rodava fora do shell autenticado, com layout inflado, scroll quebrado e metadados de debug expostos. Popup interno (`InAppCopilotAssistant.vue`) era verboso e pesado. Ambos foram corrigidos.

**WhatsApp não é escopo desta consolidação.** Fica para a segunda onda.

---

## O que foi corrigido

### Fase 03 — Arquitetura de IA (backend)

| Problema | Solução |
|---|---|
| `llm-provider.ts` 100% rule-based, sem LLM | Migrado para `ChatOpenAI` + `StateGraph(MessagesAnnotation)` do LangChain/LangGraph |
| Nenhuma env var de IA era lida | `ai-config.ts` criado: lê `OPENAI_API_KEY`, `OPENAI_MODEL`, propaga `LANGSMITH_*` |
| `LlmPlan.provider` hardcoded como `'rule-based'` | Agora retorna `'langchain'` |
| Tracing inexistente | LangSmith auto-instrumentado via env vars (`LANGCHAIN_*`) |
| Dependências ausentes | Instaladas: `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`, `langsmith` |

### Fase 06 — Frontend conversacional (UX)

| Problema | Solução |
|---|---|
| Router com `hideShell: true` e `fullBleed: true` | Removidos; rota agora integra o shell autenticado normalmente |
| `ConversationalChatAppView.vue` sem shell, layout inflado | Refatorado: `height: calc(100dvh - 280px)`, thread com scroll interno, composer ancorado |
| Metadados de debug (`source`, `toolName`, `correlationId`) expostos nas mensagens | Removidos da view e do painel |
| Inputs guiados (manifestId/jobId) ocupando espaço na thread | Removidos da view; composable mantém estado interno |
| `InAppCopilotAssistant.vue` com context-card pesado, kicker badge, subtitle | Substituídos por uma única linha de contexto (`[account] [badge]`) |
| Quick actions como cards altos em grid 2 colunas | Reescritos como pills horizontais com `overflow-x: auto` |

---

## Arquitetura de IA — estado atual (pós-consolidação)

```
Mensagem do usuário
      |
      v
conversation-service.ts
      |
      v
llm-provider.ts  ←─── ai-config.ts (lê env vars, propaga LANGSMITH_*)
      |
      v
ChatOpenAI (LangChain)
      |
      v
StateGraph (LangGraph) — nó único "agent"
      |
   ┌──┴──────────────────┐
   │  AIMessage.tool_calls  │   →  LlmToolCall[] (name + arguments)
   │  AIMessage.content     │   →  outputText (PT-BR)
   └─────────────────────┘
      |
      v
LlmPlan { provider: 'langchain', outputText, toolCall, confidence }
```

**Todo acesso ao modelo de IA passa por `ai-config.ts`.** Nenhum serviço, worker ou rota instancia LLM diretamente.

### 8 ferramentas registradas (function calling)

`navigateDashboard` · `createManifest` · `listManifests` · `viewManifest` ·
`printManifest` · `listActiveJobs` · `getJobStatus` · `navigateHelp`

---

## Superfícies da primeira onda

| Superfície | Arquivo | Status |
|---|---|---|
| Popup interno (in-app) | `frontend/src/components/conversation/InAppCopilotAssistant.vue` | ✅ Corrigido |
| App light (chat full) | `frontend/src/views/ConversationalChatAppView.vue` | ✅ Corrigido |
| WhatsApp | — | 🔲 Segunda onda |

---

## Env vars obrigatórias para operação

```dotenv
# Obrigatória — sem esta variável, o módulo conversacional lança AppError 503
OPENAI_API_KEY=sk-...

# Opcional — default: gpt-4o-mini
OPENAI_MODEL=gpt-4o-mini
```

### Env vars para tracing (LangSmith — opcionais)

```dotenv
LANGSMITH_API_KEY=ls__...
LANGSMITH_PROJECT=sicat-conversacional
LANGSMITH_TRACING=true
```

> `ai-config.ts` propaga automaticamente `LANGSMITH_*` → `LANGCHAIN_*`.
> LangChain auto-instrumenta sem código extra de tracing.

---

## Erros esperados por configuração

| Situação | HTTP | Tipo |
|---|---|---|
| `OPENAI_API_KEY` ausente | `503` | `AppError` lançado em `getAiConfig()` |
| Falha na chamada LLM (rede, rate limit) | `502` | `AppError` propagado pelo provider |

---

## Critérios de pronto verificados

| Critério | Status |
|---|---|
| `npm run typecheck` sem erros | ✅ |
| `npm run build` (frontend) sem erros | ✅ (6.61s) |
| Interface `LlmProvider.plan()` preservada | ✅ `conversation-service.ts` sem alteração |
| `LlmPlan.provider` retorna `'langchain'` | ✅ |
| Popup sem metadados de debug | ✅ |
| App light no shell autenticado | ✅ `hideShell` removido |
| Thread com scroll interno | ✅ `flex: 1 1 0; min-height: 0; overflow-y: auto` |
| Composer sempre visível | ✅ `flex-shrink: 0` |
| Quick actions como pills | ✅ |

---

## Arquivos alterados

### Backend

| Arquivo | Operação |
|---|---|
| `src/services/conversation/ai-config.ts` | Criado |
| `src/services/conversation/llm-provider.ts` | Refatorado (rule-based → LangChain+LangGraph) |

### Frontend

| Arquivo | Operação |
|---|---|
| `frontend/src/router.js` | Removido `hideShell`, `fullBleed`; adicionado `breadcrumb` |
| `frontend/src/views/ConversationalChatAppView.vue` | Refatorado (layout, mensagens, composer, pills) |
| `frontend/src/components/conversation/InAppCopilotAssistant.vue` | Limpo (context card, kicker, debug fields) |
| `frontend/src/components/conversation/ChatQuickActionCards.vue` | Reescrito como pills horizontais |

### Pacotes instalados (production)

```
@langchain/core@1.1.41
@langchain/langgraph@1.2.9
@langchain/openai@1.4.4
langsmith@0.5.22
```

---

## Documentação canônica atualizada

| Artefato | Ação |
|---|---|
| `docs/copilot/16-camada-conversacional.md` | Atualizado com estado atual pós-LangChain |
| `docs/copilot/13-decision-log.md` | DL-096 e DL-097 registrados |

---

## Handoff para operação

A camada conversacional está pronta para testes de integração end-to-end com chave real.

**Pré-requisitos para ativar:**
1. Definir `OPENAI_API_KEY` no `.env` ou no ambiente do servidor
2. Opcionalmente, definir `LANGSMITH_*` para observabilidade de tracing
3. Reiniciar o backend (`npm run dev` ou `npm run start`)
4. Acessar `/conversacional/chat` logado — o shell autenticado deve exibir o chat normalmente

**Segunda onda (não coberta aqui):**
- Canal WhatsApp (identidade de canal, vinculação telefone ↔ usuário SICAT)
- Políticas e limites específicos de mensageria externa
- Fallback de canal externo
