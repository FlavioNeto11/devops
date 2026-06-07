# 07-observability-admin

## Objetivo da fase
Fechar a observabilidade operacional da camada conversacional com trilha completa por turno e por execucao de tool, sanitizacao de segredos em logs/payloads persistidos e metricas operacionais expostas no health do backend.

## Escopo implementado
1. Rastreabilidade por turno e tool:
- `conversationSessionId`
- `conversationTurnId`
- `correlationId`
- `userId`
- `integrationAccountId`
- `sessionContextId`
- tool executada
- argumentos sanitizados
- policy aplicada
- confirmacao requerida/fornecida
- resultado resumido
- `jobId`
- artifacts gerados
- erro e `errorCode` quando houver

2. Sanitizacao de segredos:
- redacao de chaves sensiveis como `password`, `token`, `authorization`, `apiKey`, `cookie`, `secret`, `recaptcha`;
- redacao de `Bearer`, JWT e strings inline com pares `token=...` e `password=...` antes de persistir action logs e audit logs.

3. Metricas e visao operacional:
- contadores por canal;
- contadores por tool e outcome;
- metricas de confirmacao (`required`, `confirmed`, `blockedMissing`);
- total de artifacts gerados;
- erros por codigo;
- `recentEvents` com ultimos eventos operacionais do chat.

## Arquivos analisados
- src/services/conversation/conversation-service.ts
- src/services/conversation/conversation-observability.ts
- src/services/conversation/conversation-context-service.ts
- src/services/conversation/conversation-policy-service.ts
- src/repositories/conversation-action-log-repo.ts
- src/repositories/audit-repo.ts
- src/routes/health-routes.ts
- tests/unit/conversation-observability.test.js
- tests/integration/conversation-observability-admin.test.js
- docs/handoffs/chat-copiloto-operacional/03-backend-contracts.md
- docs/handoffs/chat-copiloto-operacional/04-persistence-worker.md
- docs/handoffs/chat-copiloto-operacional/05-domain-rules.md

## Arquivos alterados
- src/services/conversation/conversation-service.ts
- src/services/conversation/conversation-observability.ts
- src/services/conversation/conversation-sanitizer.ts
- tests/unit/conversation-observability.test.js
- tests/integration/conversation-observability-admin.test.js
- docs/handoffs/chat-copiloto-operacional/07-observability-admin.md

## Decisoes
1. A trilha principal continuou em `conversation_action_logs` e `audit_logs`, sem nova tabela, porque o modelo atual ja suportava JSON estruturado e correlacao por turno/job.
2. A sanitizacao foi centralizada em `conversation-sanitizer.ts` para virar ultima linha de defesa antes de persistencia e auditoria.
3. O envelope de observabilidade operacional foi padronizado em `traceVersion = conversation-operational-observability.v1` para facilitar consumo administrativo e evolucao compatível.
4. A telemetria em memoria foi enriquecida no modulo conversacional existente e reaproveitada pelo `GET /v1/health/system`, evitando endpoint paralelo desnecessario nesta fase.

## O que foi implementado

### Action logs e audit logs
- `conversation-service.ts` agora monta um envelope operacional estruturado para `turn.respond`, `tool.blocked`, `tool.execute`, `tool.unsupported` e `fallback.provider`.
- O envelope inclui contexto conversacional, policy, confirmacao, resumo do resultado, artifacts e erro.
- `persistConversationAction` e `persistAuditEntry` passaram a sanitizar payloads antes da escrita.

### Sanitizacao
- Novo modulo `conversation-sanitizer.ts` aplica redacao recursiva por chave sensivel e por padroes de string.
- Mensagens persistidas, `toolCalls`, `toolArguments`, `resultPayload`, metadados de contexto e `sanitizedBody` da auditoria passam pela sanitizacao.

### Metricas operacionais
- `conversation-observability.ts` agora agrega:
  - `turnsByChannel`
  - `tools[toolName].{total, responded, blocked, executed, failed}`
  - `confirmation.{requiredTotal, confirmedTotal, blockedMissingTotal}`
  - `artifactsGeneratedTotal`
  - `errorsByCode`
  - `recentEvents`
- Essas metricas continuam saindo via health do sistema sem quebrar a estrutura atual.

## Evidencias de sanitizacao
1. Teste de integracao `tests/integration/conversation-observability-admin.test.js` validou redacao em `conversation_action_logs.tool_arguments` e `audit_logs.sanitized_body`.
2. Evidencias verificadas no teste:
- `password -> [REDACTED]`
- `authorization -> [REDACTED]`
- `apiKey -> [REDACTED]`
- `nested.token -> [REDACTED]`
- string inline `password=secret-inline token=inline-token` sai redigida
3. O teste tambem valida ausencia dos segredos originais no JSON serializado final persistido.

## Validacoes executadas
- `npm run typecheck` -> PASS
- `npx tsx --test tests/unit/conversation-observability.test.js tests/integration/conversation-observability-admin.test.js` -> PASS (3 testes)

## Resultado da fase
- A camada conversacional agora deixa trilha operacional completa por turno/tool, com correlação suficiente para admin/observabilidade.
- Segredos deixam de ser persistidos em action logs e audit logs do chat.
- O health do backend passa a expor uma visao mais util para operacao da camada conversacional.

## Riscos residuais
1. A sanitizacao cobre as familias de segredo mais provaveis, mas novos campos sensiveis precisam continuar usando o sanitizador compartilhado para manter a garantia.
2. `recentEvents` fica em memoria de processo; para visao historica longa, o operador continua dependendo de `conversation_action_logs` e `audit_logs` persistidos.

## Proximo owner recomendado
`tester-qa-mtr`

## Prompt sugerido para o proximo owner
```text
WORK_ID: chat-copiloto-operacional
Fase atual concluida: 07-observability-admin

Objetivo da proxima fase: validar regressao operacional e cobertura de observabilidade da camada conversacional em cenarios reais de tool execution, erro e artifacts.

Escopo minimo:
1) Validar trilha persistida em conversation_action_logs e audit_logs para:
   - turn.respond
   - tool.blocked
   - tool.execute com jobId
   - tool.execute com erro
   - fallback.provider
2) Validar metricas expostas em GET /v1/health/system:
   - turnsByChannel
   - tools por outcome
   - confirmation
   - artifactsGeneratedTotal
   - errorsByCode
   - recentEvents
3) Validar sanitizacao adicional:
   - argumentos aninhados
   - strings inline com segredo
   - erros contendo tokens/authorization
4) Validar se artifacts persistidos aparecem corretamente na trilha de tool.execute.

Arquivos de entrada:
- docs/handoffs/chat-copiloto-operacional/07-observability-admin.md
- src/services/conversation/conversation-service.ts
- src/services/conversation/conversation-observability.ts
- src/services/conversation/conversation-sanitizer.ts
- tests/integration/conversation-observability-admin.test.js

Entregaveis:
- checkpoint docs/handoffs/chat-copiloto-operacional/09-qa-validation.md
- evidencias de regressao e gaps residuais
```