# AI Control Center — 04 · Frontend UI

> Agente 4 · Vue 3 + Vuetify + design system `Sicat*` · fala apenas com o backend SICAT.

## Navegação e rota

- **navigation.js** — item no grupo "Sistema" (após Jobs):
  ```js
  { to: '/sistema/ai-control', label: 'AI Control Center', icon: 'mdi-robot-outline',
    description: 'Governança, observabilidade e runtime da IA', requiresAdminAccess: true }
  ```
- **router.js** — rota lazy, admin-gated:
  ```js
  { path: '/sistema/ai-control', name: 'SistemaAiControlCenter',
    component: () => import('./views/ai-control/AiControlCenterView.vue'),
    meta: { requiresSicatAuth: true, requiresActiveCetesbAccount: false,
            requiresAdminAccess: true, audience: 'system',
            breadcrumb: ['Sistema', 'AI Control Center'] } }
  ```
  Gating admin é **automático** pelo guard existente (`ensureAdminRouteAccess` + `authStore.canAccessAdmin`). Nenhuma checagem manual de role nas telas.

## Arquivos criados

| Arquivo | Papel |
|---|---|
| `frontend/src/views/ai-control/AiControlCenterView.vue` | View principal: `SicatPageLayout` + `SicatPageHeader` + `v-tabs`/`v-window` com 8 abas. Inicia o SSE no mount e passa eventos ao Overview. Cada aba monta seu painel sob demanda (lazy `v-if` + mapa `visited`). |
| `frontend/src/features/ai-control/AiOverviewPanel.vue` | Métricas (`SicatMetricCard`), status provider/Langfuse, top tools, blocks por motivo, erros, confirmação, custo/tokens/latência e feed ao vivo (props do SSE). |
| `frontend/src/features/ai-control/AiRuntimeToolsPanel.vue` | Sub-abas Tools / Agents / Policies (`SicatDataTable`): policy + stats, editar policy, habilitar/desabilitar (confirma se `isAction`), ver schema/versões, abrir traces relacionados. |
| `frontend/src/features/ai-control/AiLangfuseTracesPanel.vue` | Filtros + lista de traces; clique → árvore via `AiTraceTree`; deep link quando disponível; alerta de fallback local quando `provider:'local'`. |
| `frontend/src/features/ai-control/AiTraceTree.vue` | Componente recursivo (self-recursion por filename) que renderiza a árvore de nós (nome/tipo/status/duração/tokens/custo). |
| `frontend/src/features/ai-control/AiPromptsPanel.vue` | Lista de prompts, versões, preview, diff simples, nova versão, ativar/rollback (confirma), sync Langfuse (confirma). |
| `frontend/src/features/ai-control/AiKnowledgePanel.vue` | Status do índice, fontes (toggle enabled), browser de chunks, teste de retrieval, reindex (confirma; mostra log tail). |
| `frontend/src/features/ai-control/AiMemoryPanel.vue` | Input `conversationSessionId` (+ `integrationAccountId`), snapshot (WM/patches/vetorial/IDs/dateRange/mensagens), export JSON, limpar (confirma destrutivo), rebuild summary, histórico. |
| `frontend/src/features/ai-control/AiEvalsPanel.vue` | Baterias + runs; disparar dry-run/sample/category/full (full confirma e respeita bloqueio); detalhe de run com casos e summary. |
| `frontend/src/features/ai-control/AiSettingsPanel.vue` | Settings somente-leitura: modelos do provider, LangSmith, Langfuse (status + `*Configured` como chips — **nunca a chave**), flags, retention, embedding model, health check. |
| `frontend/src/features/ai-control/AiJsonViewer.vue` | Helper compartilhado: botão → dialog com `<pre>` + copiar. Mantém JSON grande fora do render inline. |
| `frontend/src/composables/useAiControlStream.js` | Consome SSE via fetch-stream (espelha `useJobStream`): `events`/`streaming`/`streamError`, `start()`/`stop()`, auto-stop no unmount, ignora `heartbeat`, capa a 50 eventos. |

## API client (`services/api.js`)

Adicionada a seção AI Control com ~40 métodos (`getAiControlOverview`, `listAiControlTools`, `patchAiControlTool`, `listAiControlPolicies`, `patchAiControlPolicy`, `listAiControlPrompts`, `createAiControlPromptVersion`, `activateAiControlPrompt`, `syncAiControlPrompt`, `getAiControlKnowledgeSources`, `testAiControlRetrieval`, `reindexAiControlKnowledge`, `getAiControlMemory`, `clearAiControlMemory`, `exportAiControlMemory`, `rebuildAiControlMemory`, `listAiControlLocalTraces`, `getAiControlLangfuseStatus`, `listAiControlLangfuseTraces`, `getAiControlLangfuseTrace`, `getAiControlDeeplink`, `listAiControlEvals`, `runAiControlEval`, `getAiControlEvalRun`, …) usando o `request()` existente (token Bearer + correlationId injetados). SSE via `streamAiControlEvents(handlers)` ao lado de `streamJobEvents` (reusa a resolução de token + refresh 401).

## Segurança (UI)

- Nenhum segredo é exibido: o painel Settings só mostra `publicKeyConfigured`/`secretKeyConfigured` como chips "Configurada/Não configurada".
- Ações destrutivas/sensíveis usam `useConfirmDialog` (danger) e enviam `{ confirmed: true }`: limpar memória, reindex, full smoke, ativar/rollback de prompt, sync Langfuse, toggle de tool de ação.
- Feedback sempre via `useNotification` (sem `v-snackbar` inline).
- JSON grande (schemas, payloads de trace, snapshot de memória) só em dialog/expansão.

## Verificação

`node --check` OK em `api.js`, `useAiControlStream.js`, `navigation.js`, `router.js`. Imports/paths conferidos contra arquivos reais. Build Vite não foi executado (fora dos gates de aceite, que são backend) — ver 08.

## Observações / decisões

- `SicatStatusBadge` cobre manifest/job/cdf/dmr/account-health; para status de eval/run usou-se `domain="job"`; para saúde provider/Langfuse, chips coloridos + `SicatInlineAlert`.
- Painéis leem campos de resposta de forma defensiva (tolerância a variações de shape) sem inventar endpoints.
- `requiresActiveCetesbAccount:false` na rota (admin SRE não depende de conta CETESB ativa para governança).
