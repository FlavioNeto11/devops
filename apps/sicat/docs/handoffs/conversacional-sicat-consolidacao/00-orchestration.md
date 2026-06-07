# Orquestração — conversacional-sicat-consolidacao

**Data:** 2026-04-23  
**Orquestrador:** orquestrador-mtr  
**Status:** ✅ CONCLUÍDO — todas as fases executadas (2026-04-23)

---

## Demanda resumida

Consolidar e corrigir a camada conversacional do SICAT (primeira onda, sem WhatsApp):

1. Refatorar arquitetura de IA: `llm-provider.ts` atualmente é rule-based sem nenhuma integração real. Precisa usar LangChain + LangGraph + LangSmith via env vars centralizadas.
2. Corrigir popup interno (`InAppCopilotAssistant.vue`): verboso, poluído, metadados de debug expostos.
3. Corrigir tela app light (`ConversationalChatAppView.vue`): sem shell, layout inflado, scroll errado, fora do padrão SICAT.
4. Garantir coerência visual e de rota com o shell autenticado.
5. Atualizar documentação canônica da primeira onda.

---

## Classificação

```yaml
orchestration:
  work_id: "conversacional-sicat-consolidacao"
  intent: "fix"
  complexity: "complex"
  domains:
    - "backend-contract"
    - "frontend-ux"
    - "docs"
  first_agent: "programador-backend-mtr"
  phase_sequence:
    - phase: "03-backend-contracts"
      agent: programador-backend-mtr
      required: true
      reason: "refatorar llm-provider.ts para LangChain+LangGraph+LangSmith via env centralizadas"
    - phase: "06-frontend-ux"
      agent: frontend-vue-ux-mtr
      required: true
      reason: "corrigir layout app light, popup interno e integração com shell autenticado"
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: "consolidar docs canônicas: primeira onda, AI centralizada, popup, app light"
```

---

## Diagnóstico técnico (executado pelo orquestrador)

### Backend — `src/services/conversation/llm-provider.ts`

**CRÍTICO:** Nenhuma integração LLM existe. Toda a lógica é rule-based com keyword matching.

```typescript
// Estado atual — INCORRETO
export type LlmPlan = {
  provider: 'rule-based';  // hardcoded, não usa OpenAI
  ...
};

export function createLlmProvider(): LlmProvider {
  return {
    async plan(input): Promise<LlmPlan> {
      const text = normalizeText(input.messageText);
      // só keyword matching, sem LLM
      if (includesAny(text, ['dashboard', ...])) { ... }
      ...
    }
  };
}
```

Nenhuma das env vars usadas em nenhum arquivo:
- `OPENAI_API_KEY` → ausente
- `OPENAI_MODEL` → ausente
- `LANGSMITH_API_KEY` → ausente
- `LANGSMITH_PROJECT` → ausente
- `LANGSMITH_TRACING` → ausente

**Pacotes necessários:** `@langchain/openai`, `@langchain/core`, `@langchain/langgraph`, `langsmith`

### Frontend — `ConversationalChatAppView.vue`

**Router**: `hideShell: true, fullBleed: true` → completamente fora do shell autenticado. A tela não se comporta como parte do SICAT.

**Layout inflado:**
1. Kicker + H1 + subtitle (muito verboso)
2. Botões back + clear
3. Seção de contexto (conta + chip)
4. Dois campos (manifestId + jobId) sempre visíveis
5. ChatQuickActionCards
6. Thread (sem altura controlada → scroll da página toda)
7. Banner de erro
8. Composer (some ao rolar)

**Metadados debug em mensagens:** `source`, `toolName`, `correlationId` visíveis ao usuário.

### Frontend — `InAppCopilotAssistant.vue`

**Header verboso:** kicker + h2 + subtitle + botões.

**Context card pesado:** grid 2 colunas com rota, conta, manifesto, job.

**Cada mensagem expõe:** role label (backend/contexto local), toolName, correlationId.

### Router — `router.js`

`/conversacional/chat` usa:
```js
meta: { requiresSicatAuth: true, requiresActiveCetesbAccount: true, hideShell: true, fullBleed: true }
```

Deve remover `hideShell` e `fullBleed` — a tela deve usar o shell autenticado com breadcrumb.

---

## Escopo da Fase 1 — `programador-backend-mtr`

### Objetivo
Refatorar `src/services/conversation/llm-provider.ts` para usar uma arquitetura de IA centralizada com:
- **OpenAI** via `@langchain/openai` baseado em `process.env.OPENAI_API_KEY` e `process.env.OPENAI_MODEL`
- **LangChain** para integração com o modelo e definição de tools
- **LangGraph** para orquestrar o fluxo conversacional (planejar → executar tool → responder)
- **LangSmith** para tracing e observabilidade via `process.env.LANGSMITH_API_KEY`, `process.env.LANGSMITH_PROJECT`, `process.env.LANGSMITH_TRACING`

### Arquivos a modificar/criar

#### Modificar
- `src/services/conversation/llm-provider.ts` — substituir rule-based por LangChain+LangGraph+LangSmith
- `package.json` — adicionar dependências: `@langchain/openai`, `@langchain/core`, `@langchain/langgraph`, `langsmith`

#### Criar (se necessário)
- `src/services/conversation/ai-config.ts` — provider de configuração centralizado lendo env vars
- `src/services/conversation/conversation-graph.ts` — grafo LangGraph para o fluxo conversacional

### Requisitos obrigatórios

1. **Sem valores hardcoded** para API keys, model names ou endpoints.
2. **Fallback seguro**: se `OPENAI_API_KEY` não estiver configurado, lançar erro claro no startup (não silenciosamente no runtime).
3. **LangSmith tracing**: ativo quando `LANGSMITH_TRACING=true`, usando `LANGSMITH_PROJECT` como nome do projeto.
4. **Tools LangChain**: as 5 tools existentes (`list_manifests`, `get_manifest_details`, `get_dashboard_overview`, `get_job_status`, `get_audit_trail`) devem ser definidas como tools LangChain.
5. **LangGraph**: grafo com nó de planejamento (LLM decide tool), nó de execução (dispatcher existente), nó de resposta final.
6. **Compatibilidade**: manter a interface `LlmProvider` e `LlmPlan` para não quebrar `conversation-service.ts`.
7. **Tipo de provider**: atualizar `LlmPlan.provider` para incluir `'openai'` além de `'rule-based'` (fallback).

### Variáveis de ambiente esperadas

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # ou outro
LANGSMITH_API_KEY=ls__...
LANGSMITH_PROJECT=sicat-conversacional
LANGSMITH_TRACING=true
```

### Validação da Fase 1

- `npm run typecheck` sem erros
- `npm run build:ts` sem erros
- Log de startup deve mostrar o provider carregado (`openai/gpt-4o-mini`)
- Se `OPENAI_API_KEY` ausente, startup deve falhar com mensagem clara
- Nenhum valor hardcoded nos arquivos

---

## Escopo da Fase 2 — `frontend-vue-ux-mtr`

> Iniciar apenas após checkpoint `03-backend-contracts.md` estar preenchido.

### Router
- Remover `hideShell: true` e `fullBleed: true` de `/conversacional/chat`
- Adicionar `breadcrumb: ['Chat operacional']`

### ConversationalChatAppView.vue
- Header compacto: apenas título + botão voltar (sem kicker, sem subtitle, sem botão clear separado)
- Layout estrutural: `display: flex; flex-direction: column; height: 100%` (ou `height: calc(100vh - nav)`)
- Thread: `flex: 1 1 0; overflow-y: auto` — só o thread rola, nunca a página
- Composer: ancorado, sempre visível na base
- Quick actions: compactas, não dominando a tela (pills discretas)
- Contexto operacional: uma linha só (account label + chip de status), não seção separada pesada
- Guided inputs (manifestId, jobId): mover para dentro do composer ou tornar colapsáveis/opcionais
- Mensagens: remover `source`, `toolName`, `correlationId` da UI. Manter apenas: texto + role + facts úteis

### InAppCopilotAssistant.vue
- Header: apenas título página + botão fechar. Remover kicker, subtitle, botão reset destacado
- Context: compactar para uma linha (account + badge). Remover grid com rota/conta/manifesto/job
- Ações rápidas: manter mas mais compactas
- Mensagens: remover labels `backend/contexto local`, `toolName`, `correlationId`
- Thread ocupa a maior parte do painel; composer sempre visível na base

### Padrão visual
- Usar tokens do shell autenticado atual (`--v-theme-*`)
- Sem gradientes de fundo na tela do app light (conflita com o shell)
- Espaçamentos, bordas e superfícies coerentes com `DashboardView.vue`, `ManifestsView.vue`

---

## Escopo da Fase 3 — `documentador-mtr`

> Iniciar após checkpoint `06-frontend-ux.md` estar preenchido.

- Atualizar/criar `docs/copilot/` com doc canônica da camada conversacional primeira onda
- Registrar: sem WhatsApp na primeira onda, AI centralizada com env, popup vs app light
- Atualizar `10-documentation-final.md` neste handoff
- Registrar DL (decision log) para a mudança de llm-provider de rule-based para LangChain

---

## Critérios de pronto (work-level)

- [ ] `llm-provider.ts` usa LangChain + LangGraph + LangSmith via env vars, sem hardcode
- [ ] `npm run typecheck` sem erros
- [ ] Router: `/conversacional/chat` usa shell autenticado
- [ ] App light: layout chat real (header + thread + composer), scroll só no thread
- [ ] Popup: header limpo, context compacto, mensagens sem debug noise
- [ ] Tela app light visualmente coerente com DashboardView/ManifestsView
- [ ] Docs canônicas consolidadas

---

## Checkpoints esperados

- `docs/handoffs/conversacional-sicat-consolidacao/03-backend-contracts.md`
- `docs/handoffs/conversacional-sicat-consolidacao/06-frontend-ux.md`
- `docs/handoffs/conversacional-sicat-consolidacao/10-documentation-final.md`
