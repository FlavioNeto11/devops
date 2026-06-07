# 06-frontend-ux

## Objetivo da fase
Implementar renderizacao operacional rica no chat por `result.type`, com componentes especializados, acoes/confirmacoes, download de artifacts PDF/ZIP e estrutura componentizada sem concentrar logica em uma unica view.

## Arquivos analisados
- frontend/src/views/ConversationalChatAppView.vue
- frontend/src/components/conversation/InAppCopilotAssistant.vue
- frontend/src/components/conversation/StructuredMessageContent.vue
- frontend/src/composables/useConversationalChatApp.js
- frontend/src/composables/useInAppCopilot.js
- frontend/src/services/api.js
- frontend/src/stores/auth.js
- frontend/src/stores/operationalContext.js
- docs/handoffs/chat-copiloto-operacional/03-backend-contracts.md
- docs/handoffs/chat-copiloto-operacional/04-persistence-worker.md
- docs/handoffs/chat-copiloto-operacional/05-domain-rules.md
- docs/handoffs/chat-copiloto-operacional/07-observability-admin.md

## Decisoes
1. A renderizacao rica foi centralizada em um renderer unico (`ConversationResultRenderer`) e distribuida em subcomponentes por tipo operacional, mantendo as views enxutas.
2. O frontend agora consome `response.result` completo do backend (incluindo `type`, `artifacts`, `actions`) e nao apenas texto/facts.
3. Confirmacao explicita para acoes sensiveis foi implementada no frontend via `toolRequest` com `confirmed: true`, preservando a policy do backend.
4. Download de artifact conversacional foi implementado com fetch autenticado (Bearer) + blob local, para suportar PDF/ZIP mesmo sem cookie de sessao.
5. Estado operacional compartilhado recebeu contexto de artifacts recentes para continuidade entre interacoes no painel in-app.

## O que foi implementado

### Componentizacao e renderizacao por `result.type`
- Novo renderer raiz: `frontend/src/components/conversation/ConversationResultRenderer.vue`.
- Novos componentes especializados em `frontend/src/components/conversation/renderers/`:
  - `ManifestCardResult.vue` (`manifest_card`)
  - `ManifestListResult.vue` (`manifest_list`)
  - `CdfCardResult.vue` (`cdf_card`)
  - `JobCardResult.vue` (`job_card`)
  - `AuditCardResult.vue` (`audit_card`)
  - `DownloadArtifactResult.vue` (`download_artifact`)
  - `ArtifactListResult.vue` (`artifact_list`)
  - `ZipArtifactResult.vue` (`zip_artifact`)
  - `ActionConfirmationResult.vue` (`action_confirmation`)
  - `MissingFieldsResult.vue` (`missing_fields`)
  - `OperationProgressResult.vue` (`operation_progress`)
  - `ErrorExplanationResult.vue` (`error_explanation`)
  - `result-helpers.js` (normalizacao utilitaria)

### Integracao das UIs de chat
- `InAppCopilotAssistant.vue` e `ConversationalChatAppView.vue` passaram a usar `ConversationResultRenderer` por mensagem.
- Acoes de mensagem e download de artifacts agora sobem via eventos do renderer e sao processadas no composable.

### Fluxo de acoes e confirmacao backend
- `useInAppCopilot.js` e `useConversationalChatApp.js` evoluidos para:
  - propagar `result`, `policy`, `actions`, `confirmationAction` na mensagem;
  - mapear acoes do backend (`open_manifest`, `open_job`, `follow_up`, `confirm_tool_execution`);
  - enviar confirmacao explicita via `toolRequest` para `/v1/conversations/turns`;
  - suportar cancelamento local de confirmacao sem execucao sensivel.
- `options.allowActions` alterado para `true` nos dois fluxos de chat.

### Download PDF/ZIP clicavel
- `frontend/src/services/api.js` recebeu:
  - `getConversationArtifactStatus(...)`
  - `downloadConversationArtifactContent(...)`
- Fluxo de download:
  - valida status do artifact no backend (`available`/`partial`);
  - baixa blob autenticado com `Authorization`;
  - dispara download local com nome de arquivo resolvido por header/metadata.

### Stores de suporte
- `frontend/src/stores/auth.js`:
  - novo `conversationScope` computado (integrationAccountId/sessionContextId/accountId/userId).
- `frontend/src/stores/operationalContext.js`:
  - novo contexto conversacional de artifacts recentes (`conversationArtifacts`, `conversationUpdatedAt` + actions de set/clear).

## Contrato frontend consumido
- Endpoint: `POST /v1/conversations/turns`
- Envelope consumido no frontend:
  - `status`, `responseText`, `correlationId`, `toolCall`, `policy`
  - `result.type` (`list`, `detail`, `action`, `status`)
  - `result.data` (incluindo intents operacionais, faltantes, resumo de auditoria/CDF)
  - `result.artifacts[]` (tipos: `manifest_list`, `manifest_detail`, `job`, `document`, `zip_bundle`, `notice`)
  - `result.actions[]` (tipos operacionais do backend)
- Confirmacao frontend -> backend:
  - envio de `toolRequest: { name, arguments, confirmed: true }`
- Artifacts:
  - `GET /v1/conversations/artifacts/:artifactId`
  - `GET /v1/conversations/artifacts/:artifactId/content`

## Arquivos alterados
- frontend/src/components/conversation/InAppCopilotAssistant.vue
- frontend/src/components/conversation/ConversationResultRenderer.vue
- frontend/src/components/conversation/renderers/result-helpers.js
- frontend/src/components/conversation/renderers/ManifestCardResult.vue
- frontend/src/components/conversation/renderers/ManifestListResult.vue
- frontend/src/components/conversation/renderers/CdfCardResult.vue
- frontend/src/components/conversation/renderers/JobCardResult.vue
- frontend/src/components/conversation/renderers/AuditCardResult.vue
- frontend/src/components/conversation/renderers/DownloadArtifactResult.vue
- frontend/src/components/conversation/renderers/ArtifactListResult.vue
- frontend/src/components/conversation/renderers/ZipArtifactResult.vue
- frontend/src/components/conversation/renderers/ActionConfirmationResult.vue
- frontend/src/components/conversation/renderers/MissingFieldsResult.vue
- frontend/src/components/conversation/renderers/OperationProgressResult.vue
- frontend/src/components/conversation/renderers/ErrorExplanationResult.vue
- frontend/src/views/ConversationalChatAppView.vue
- frontend/src/composables/useInAppCopilot.js
- frontend/src/composables/useConversationalChatApp.js
- frontend/src/services/api.js
- frontend/src/stores/auth.js
- frontend/src/stores/operationalContext.js
- frontend/tests/ui/conversational-chat-app.spec.js

## Validacoes executadas
- `npm run build` (em `frontend/`) -> PASS
- `npx playwright test tests/ui/conversational-chat-app.spec.js` (em `frontend/`) -> PASS (7/7)

## Riscos residuais
1. O renderer frontend suporta os tipos operacionais mapeados nesta fase; se novos artifact/action types surgirem no backend, sera necessario mapear explicitamente no renderer.
2. Existe um aviso de qualidade preexistente em `frontend/src/services/api.js` sobre funcoes duplicadas de headers em bloco nao relacionado ao fluxo conversacional.

## Handoff para proximo owner
Proximo owner recomendado: `tester-qa-mtr`.

Prompt sugerido:
```text
WORK_ID: chat-copiloto-operacional
Fase atual concluida: 06-frontend-ux

Objetivo da proxima fase (QA): validar regressao frontend/backend do chat operacional com foco em result.type, acoes/confirmacao e artifacts PDF/ZIP.

Escopo minimo:
1) Validar renderizacao por result.type com artifacts/actions reais do backend.
2) Validar confirmacao explicita (toolRequest.confirmed=true) para acoes sensiveis.
3) Validar download de artifacts PDF/ZIP em estados available/partial e bloqueio em collecting/pending.
4) Regressao de fluxos de consulta (manifestos, job status, auditoria, dashboard).

Arquivos de entrada:
- docs/handoffs/chat-copiloto-operacional/06-frontend-ux.md
- frontend/src/components/conversation/ConversationResultRenderer.vue
- frontend/src/composables/useInAppCopilot.js
- frontend/src/composables/useConversationalChatApp.js
- frontend/src/services/api.js
- frontend/tests/ui/conversational-chat-app.spec.js

Entregaveis:
- docs/handoffs/chat-copiloto-operacional/09-qa-validation.md
- evidencias de testes (pass/fail) e gaps residuais
```

## Continuidade de cadeia
`next_agent_required`: runtime atual nao expoe `agent/runSubagent`; seguir com `tester-qa-mtr` usando o prompt sugerido acima.
