# Checkpoint 03 — Backend Contracts
**work_id:** `conversacional-sicat-consolidacao`
**Data:** 2026-04-23
**Agente:** `programador-backend-mtr`
**Status:** ✅ Concluído

---

## Objetivo

Refatorar `src/services/conversation/llm-provider.ts` de rule-based (keyword matching) para
LangChain + LangGraph + LangSmith, usando env vars centralizadas e sem nenhum hardcode.

---

## Arquivos Analisados

| Arquivo | Motivo |
|---|---|
| `src/services/conversation/llm-provider.ts` | Arquivo principal refatorado |
| `src/services/conversation/conversation-service.ts` | Mapeamento de `LlmPlan.provider` → `llm.provider: string` |
| `package.json` | Verificação de dependências ausentes |
| `src/lib/problem.ts` | Padrão `AppError` para erros de configuração/LLM |

---

## Decisões

| # | Decisão | Justificativa |
|---|---|---|
| 1 | `LlmPlan.provider` tipo `string` (era `'rule-based'`) | Backward-compatible; `conversation-service.ts` já usa `provider: string` no output |
| 2 | `FunctionTool[]` com cast `as unknown as LooseRecord[]` em `bindTools` | Evita conflito de tipos entre o formato local e o overloads do LangChain |
| 3 | `graphResult.messages.at(-1)` + guard `undefined` | Exigência do TypeScript strict; evita `TS18048` |
| 4 | Sem fallback rule-based | Objetivo é substituição completa; erros propagam como `AppError 502` |
| 5 | LangSmith via propagação de env vars (`LANGSMITH_*` → `LANGCHAIN_*`) | LangChain auto-instrumenta por env vars; sem código extra de tracing |

---

## Pacotes Instalados (production dependencies)

```
@langchain/core@1.1.41
@langchain/langgraph@1.2.9
@langchain/openai@1.4.4
langsmith@0.5.22
```

---

## Arquivos Alterados

### Criado
- `src/services/conversation/ai-config.ts`
  - Lê `OPENAI_API_KEY` (obrigatória, lança `AppError 503` se ausente)
  - `OPENAI_MODEL` (default `gpt-4o-mini`)
  - Propaga `LANGSMITH_API_KEY` → `LANGCHAIN_API_KEY`, `LANGSMITH_PROJECT` → `LANGCHAIN_PROJECT`, `LANGSMITH_TRACING=true` → `LANGCHAIN_TRACING_V2=true`
  - Exporta `getAiConfig(): AiConfig`

### Refatorado
- `src/services/conversation/llm-provider.ts`
  - Remove todo keyword matching rule-based
  - `ChatOpenAI` instanciado com `apiKey` e `model` de `getAiConfig()`
  - 8 ferramentas definidas em `CONVERSATION_TOOLS` (formato OpenAI function calling)
  - LangGraph `StateGraph(MessagesAnnotation)` com nó `agent` único
  - `AIMessage.tool_calls` extraídos para `LlmToolCall`
  - `LlmPlan.provider` agora retorna `'langchain'`
  - Mantém `LlmProvider`, `LlmPlan`, `LlmPlanningInput`, `LlmToolCall` inalterados

---

## Variáveis de Ambiente

| Variável | Obrigatória | Default | Finalidade |
|---|---|---|---|
| `OPENAI_API_KEY` | **sim** | — | Autenticação na API OpenAI |
| `OPENAI_MODEL` | não | `gpt-4o-mini` | Modelo LLM utilizado |
| `LANGSMITH_API_KEY` | não | — | Autenticação LangSmith (tracing) |
| `LANGSMITH_PROJECT` | não | — | Projeto LangSmith |
| `LANGSMITH_TRACING` | não | `false` | Habilita rastreamento LangSmith |

---

## Validações

- `npm run typecheck` → ✅ Zero erros
- Interface `LlmProvider.plan()` e `LlmPlan` preservadas → `conversation-service.ts` sem alteração necessária

---

## Handoff para próxima fase

**Próximo agente:** `frontend-vue-ux-mtr`

**Contexto para o frontend:**
- O provider agora responde com `provider: 'langchain'` no campo `llm.provider`
- `outputText` vem diretamente da resposta textual do LLM (em PT-BR)
- `toolCall` pode vir `null` (intenção ambígua) ou com `name` + `arguments`
- Confiança: `0.9` com tool call, `0.6` com resposta apenas textual, `0.3` fallback
- Erros de configuração retornam HTTP 503; erros de chamada LLM retornam HTTP 502
