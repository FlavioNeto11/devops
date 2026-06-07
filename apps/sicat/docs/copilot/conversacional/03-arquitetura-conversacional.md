# Arquitetura conversacional

## Objetivo

Desenhar a camada conversacional do SICAT sem quebrar a arquitetura atual do projeto.

## Regra de compatibilidade com a arquitetura atual

A arquitetura atual documentada segue a cadeia:

`routes -> services -> validators -> repositories / gateways / lib`

A camada conversacional deve respeitar isso.
Ela deve entrar como um novo dominio transversal, e nao como atalho tecnico.

## Visao em camadas

```text
Canais
  -> adaptadores de canal
  -> orquestrador conversacional
  -> policy / autorizacao
  -> dispatcher de tools
  -> servicos existentes do SICAT
  -> repositorios / gateway CETESB / jobs / auditoria
```

## Componentes propostos

### 1. Adaptadores de canal
Responsabilidade:
- receber mensagem/evento por canal
- normalizar payload
- resolver identidade e sessao do canal
- enviar resposta de volta ao canal

Propostas:
- `whatsapp-channel-service`
- `native-chat-channel-service`
- `inapp-assistant-service`

### 2. Conversation service
Responsabilidade:
- montar contexto conversacional
- classificar intencao
- decidir se responde, pergunta, orienta ou executa
- chamar o motor generativo
- coordenar tools
- registrar trilha

### 3. Conversation policy service
Responsabilidade:
- avaliar permissao por usuario, conta, canal e tipo de operacao
- decidir se exige confirmacao
- bloquear quando necessario
- aplicar step-up auth quando aplicavel

### 4. Conversation context service
Responsabilidade:
- recuperar usuario, conta ativa, session context, tela atual, manifesto atual e estado da conversa
- montar contexto minimo seguro para o modelo

### 5. Conversation tool dispatcher
Responsabilidade:
- mapear intencoes em tools
- validar argumentos
- chamar servicos internos
- devolver resultado estruturado para o modelo e para a UI

### 6. LLM provider abstraction
Responsabilidade:
- encapsular provider generativo
- receber mensagens estruturadas
- devolver plano, resposta e/ou chamadas de tools
- permitir troca futura de provider

### 7. Repositorios de conversa
Responsabilidade:
- sessao de conversa
- mensagens/turnos
- memoria resumida
- logs de acao
- vinculos de canal

## Reuso da infraestrutura existente

### API e servicos
O repositorio atual ja expoe APIs e servicos para:
- manifestos
- jobs
- auditoria
- parceiros
- contas CETESB
- dashboard / health
- sessao SICAT

A camada conversacional deve chamar essas capacidades por tools.
Nao duplicar regra.

### Queue e worker
A fila atual pode ser reaproveitada para:
- acoes conversacionais assincronas
- entrega de mensagens de retorno em canal externo
- operacoes demoradas iniciadas por IA
- retries de notificacao

### Auditoria
Toda acao da IA deve gerar trilha vinculada a:
- usuario
- canal
- conversationSessionId
- correlationId
- actionId
- toolName
- resultado
- jobId, quando existir

## Estrutura de pastas sugerida

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
    get-manifest-status-tool.ts
    list-pending-steps-tool.ts
    get-documents-tool.ts
    explain-field-tool.ts
    navigate-screen-tool.ts
    request-action-confirmation-tool.ts

src/repositories/
  conversation-session-repo.ts
  conversation-message-repo.ts
  conversation-action-log-repo.ts
  conversation-memory-repo.ts
  conversation-channel-link-repo.ts
```

## Modelo de dados recomendado

### conversation_sessions
- id
- channel_type
- channel_session_key
- user_id
- account_id
- integration_account_id
- session_context_id
- current_screen
- current_manifest_id
- status
- created_at
- updated_at

### conversation_messages
- id
- conversation_session_id
- role
- message_text
- structured_payload
- tool_calls
- created_at

### conversation_action_logs
- id
- conversation_session_id
- user_id
- channel_type
- action_type
- risk_level
- requires_confirmation
- confirmed_at
- blocked_reason
- tool_name
- tool_arguments
- result_payload
- correlation_id
- job_id
- created_at

### conversation_memory
- id
- conversation_session_id
- summary_kind
- summary_text
- valid_until
- created_at

### conversation_channel_links
- id
- channel_type
- external_user_key
- user_id
- verification_status
- verified_at
- created_at

## Fluxo base de uma mensagem

1. Canal recebe mensagem
2. Adaptador normaliza payload
3. Resolve identidade e sessao de conversa
4. Conversation context service monta contexto
5. Policy service classifica risco e escopo
6. LLM provider interpreta
7. Se houver tool:
   - dispatcher chama servico interno
   - resultado retorna
8. Modelo gera resposta final
9. Resposta e logs sao persistidos
10. Adaptador devolve ao canal

## Regra de ouro

Canal conversa.
Policy governa.
Tools executam.
Servicos do SICAT realizam.
Auditoria registra.
