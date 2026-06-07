# Estrutura alvo no repositorio

## Backend

```text
src/routes/
  conversation-routes.ts

src/services/conversation/
  conversation-service.ts
  conversation-policy-service.ts
  conversation-context-service.ts
  conversation-memory-service.ts
  conversation-tool-dispatcher.ts
  llm-provider.ts
  channel/
    whatsapp-channel-service.ts
    native-chat-channel-service.ts
    inapp-assistant-service.ts
  tools/
    ...
```

## Persistencia

```text
src/repositories/
  conversation-session-repo.ts
  conversation-message-repo.ts
  conversation-action-log-repo.ts
  conversation-memory-repo.ts
  conversation-channel-link-repo.ts

src/sql/
  005_conversation_layer.sql
```

## Frontend

```text
frontend/src/components/assistant/
  AssistantLauncher.vue
  AssistantPanel.vue
  AssistantThread.vue
  AssistantComposer.vue
  AssistantActionCard.vue
  AssistantContextHeader.vue

frontend/src/views/
  ConversationalAppView.vue
```

## Homepage

```text
frontend/src/components/landing/canvas/
  ConversationalChannelsCanvas.vue
```

## Documentacao

```text
docs/copilot/
  16-camada-conversacional.md
  conversacional/
    ...
docs/handoffs/conversacional-operacional-ia/
  ...
.github/prompts/
  planejar-camada-conversacional-sicat.prompt.md
  executar-camada-conversacional-sicat.prompt.md
  continuar-camada-conversacional-sicat.prompt.md
  implementar-camada-conversacional-fase.prompt.md
  incorporar-camada-conversacional-homepage.prompt.md
```
