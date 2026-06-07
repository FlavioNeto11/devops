# Checkpoint 06 — Frontend UX
**work_id:** `conversacional-sicat-consolidacao`
**Data:** 2026-04-23
**Agente:** `frontend-vue-ux-mtr`
**Status:** ✅ Concluído

---

## Objetivo

Corrigir profundamente a camada conversacional do frontend para que:
1. `ConversationalChatAppView.vue` seja um chat real integrado no shell autenticado
2. `InAppCopilotAssistant.vue` tenha header e mensagens limpos, sem ruído de debug
3. Router integre `/conversacional/chat` no shell normalmente (sem `hideShell`/`fullBleed`)
4. `ChatQuickActionCards.vue` seja compactado de cards altos para pills horizontais

---

## Arquivos Analisados

| Arquivo | Motivo |
|---|---|
| `frontend/src/router.js` | Meta da rota `/conversacional/chat` |
| `frontend/src/views/ConversationalChatAppView.vue` | View principal do chat |
| `frontend/src/components/conversation/InAppCopilotAssistant.vue` | Painel popup |
| `frontend/src/components/conversation/ChatQuickActionCards.vue` | Quick actions |
| `frontend/src/composables/useConversationalChatApp.js` | API do composable |
| `frontend/src/composables/useInAppCopilot.js` | API do composable do painel |
| `frontend/src/App.vue` | Shell autenticado (`showShell`, `layout-page`) |
| `frontend/src/views/DashboardView.vue` | Padrão visual das views |
| `docs/handoffs/conversacional-sicat-consolidacao/03-backend-contracts.md` | Contexto do backend |

---

## Decisões

| # | Decisão | Justificativa |
|---|---|---|
| 1 | Remover `hideShell: true` e `fullBleed: true` do router | Chat agora vive dentro do shell autenticado; o `showShell` em `App.vue` passa a `true`, exibindo navbar, drawer mobile e `InAppCopilotAssistant` |
| 2 | Adicionar `breadcrumb: ['Chat operacional']` | Shell exibe título e breadcrumb via `page-context-panel` automaticamente |
| 3 | `ConversationalChatAppView.vue` usa `height: calc(100dvh - 280px)` | Compensa navbar (~78px) + page-context-panel (~100px) + footer (~60px) + padding (~42px) = ~280px; `min-height: 480px` para telas pequenas |
| 4 | Thread: `flex: 1 1 0; min-height: 0; overflow-y: auto` | Scroll interno do thread; a página nunca rola |
| 5 | Composer `flex-shrink: 0` | Sempre visível, ancorado na base do flex container |
| 6 | Remover `source`, `toolName`, `correlationId` das mensagens (view e painel) | Campos de debug; não devem aparecer para o usuário final |
| 7 | Remover inputs guiados (manifestId/jobId) da view principal | Reduzem espaço do thread; o composable já os mantém em estado interno |
| 8 | Remover `ChatQuickActionCards` da view; usar pills inline | Mesmo visual; evita dependência desnecessária no slot de quick actions |
| 9 | `ChatQuickActionCards.vue` atualizado para pills | Caso seja reutilizado, mantém o mesmo padrão visual |
| 10 | `InAppCopilotAssistant`: remover kicker badge + subtitle do header | Verbosidade desnecessária; painel é contextual, o título da tela é o identificador |
| 11 | `InAppCopilotAssistant`: substituir context-card grid por uma linha | Rota, tipo de conta, manifestId, jobId em grid 2 colunas era pesado; `[account] [badge]` é suficiente |
| 12 | `grid-template-rows`: de 6 para 5 (removida linha do context-card) | Alinhado com a nova estrutura do painel |

---

## Arquivos Alterados

### `frontend/src/router.js`
- Removido: `hideShell: true`, `fullBleed: true`
- Adicionado: `breadcrumb: ['Chat operacional']`

### `frontend/src/views/ConversationalChatAppView.vue`
- **Script:** removidos imports `ChatQuickActionCards`, `focusedManifestId`, `focusedJobId`
- **Template:**
  - Removido: outer `<main class="chat-app-page">` com gradiente
  - Removido: shell wrapper com backdrop, border-radius, box-shadow
  - Removido: kicker badge, `<h1>`, subtitle longa
  - Removido: seção de guided inputs (dois text-fields)
  - Removido: `<ChatQuickActionCards>` → substituído por pills inline no template
  - Mensagens: removidas `<small>` de `source`, `toolName`, `correlationId`
  - Loading: spinner inline dentro da mensagem, sem banner separado
  - Composer: `rows=1`, `max-rows=4`, hint compacto em uma linha
- **Style:**
  - Layout: `display: flex; flex-direction: column; height: calc(100dvh - 280px)`
  - Thread: `flex: 1 1 0; min-height: 0; overflow-y: auto`
  - Composer: `flex-shrink: 0`
  - Pills: `overflow-x: auto; scrollbar-width: none`

### `frontend/src/components/conversation/InAppCopilotAssistant.vue`
- **Template:**
  - Removido: `<span class="copilot-panel-kicker">`
  - Removido: `<p class="copilot-panel-subtitle">`
  - Removido: `<section class="copilot-context-card">` (grid completo com rota, conta, manifestId, jobId)
  - Adicionado: `.copilot-context-line` no header (uma linha com account + badge)
  - Mensagens: removidas `<small>` de `source`, `toolName`, `correlationId`
- **Style:**
  - `grid-template-rows`: `auto auto auto minmax(0,1fr) auto auto` → `auto auto minmax(0,1fr) auto auto`
  - Removidas classes: `.copilot-panel-kicker`, `.copilot-context-kicker`, `.copilot-panel-subtitle`
  - Removidas classes: `.copilot-context-card`, `.copilot-context-head`, `.copilot-context-grid`
  - Removida classe: `.copilot-message-correlation`
  - Adicionadas: `.copilot-panel-header-main`, `.copilot-context-line`, `.copilot-context-account`, `.copilot-panel-title` (atualizado)
  - Media query `@media (max-width: 640px)`: `grid-template-rows` atualizado para 5 linhas

### `frontend/src/components/conversation/ChatQuickActionCards.vue`
- Reescrito de cards altos (`min-height: 122px`, grid 2 colunas) para pills horizontais
- Sem título de seção, sem ícones grandes, sem descrição visível
- `overflow-x: auto` para overflow horizontal

---

## Resultado do Build

```
✓ built in 6.61s
```

Sem erros de compilação. Aviso esperado de chunk size (~1.2MB JS gzipado: 382KB) — não relacionado às mudanças desta fase.

---

## Integração do Shell

Com `hideShell` e `fullBleed` removidos do router:
- `showShell` em `App.vue` = `isAuthenticated && hasActiveCetesbAccount` (sem override) → `true`
- A view renderiza dentro de `.layout-page > main.content-wrapper > .container-xxl > router-view`
- O shell exibe navbar (horizontal top), página de breadcrumb `Chat operacional`, InAppCopilotAssistant (floating)
- Nenhum gradiente de fundo próprio na view; o shell tem o seu próprio background

---

## Validações

| Check | Status |
|---|---|
| Build `npm run build` | ✅ Sucesso (6.61s) |
| Sem `source`/`toolName`/`correlationId` nas mensagens | ✅ Removidos |
| Thread com scroll interno apenas | ✅ `flex: 1 1 0; min-height: 0; overflow-y: auto` |
| Composer sempre visível | ✅ `flex-shrink: 0` |
| Quick actions pills horizontais | ✅ `overflow-x: auto; scrollbar-width: none` |
| Rota `/conversacional/chat` no shell autenticado | ✅ `hideShell` removido |
| InAppCopilotAssistant sem context card pesado | ✅ Substituído por uma linha |
| InAppCopilotAssistant sem kicker/subtitle | ✅ Removidos |

---

## Handoff para Próxima Fase

**Próximo agente:** `documentador-mtr`
**Fase:** `10-documentation-final`
**work_id:** `conversacional-sicat-consolidacao`

### Contexto relevante para o documentador:
- Frontend integrado no shell; todas as 4 correções implementadas e buildadas
- Backend (fase 03): `llm-provider.ts` migrado para LangChain+LangGraph; provider retorna `'langchain'`
- Variáveis de ambiente necessárias: `OPENAI_API_KEY` (obrigatória), `OPENAI_MODEL` (default `gpt-4o-mini`), `LANGSMITH_*` (opcionais para tracing)
- Pacotes instalados no backend: `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`, `langsmith`
- Arquivos-chave de documentar: `src/services/conversation/llm-provider.ts`, `src/services/conversation/ai-config.ts`, `frontend/src/views/ConversationalChatAppView.vue`, `frontend/src/components/conversation/InAppCopilotAssistant.vue`, `frontend/src/router.js`
