# Telemetria, auditoria e rastreabilidade

## Objetivo

Garantir que a camada conversacional seja observavel e auditavel no mesmo nivel de seriedade do resto do SICAT.

## Metas

- rastrear cada conversa
- rastrear cada turn
- rastrear cada tool call
- rastrear cada acao executada
- vincular acoes a correlationId e jobId
- permitir troubleshooting e investigacao

## Correlacao recomendada

### conversationSessionId
Identifica a sessao conversacional.

### conversationTurnId
Identifica um turno especifico.

### correlationId
Identificador tecnico por request / execucao.

### actionId
Identificador de uma acao operacional disparada pela IA.

### jobId
Quando a tool aciona fluxo assincrono.

## Eventos que devem ser medidos

### Entrada
- mensagem recebida
- canal
- usuario resolvido
- conta ativa resolvida
- screen context resolvido

### Inferencia
- intencao classificada
- nivel de confianca
- ferramentas candidatas
- decisao final (responder, orientar, executar, bloquear)

### Execucao
- tool chamada
- argumentos
- validacao de policy
- necessidade de confirmacao
- confirmacao recebida
- resultado da tool
- job criado

### Saida
- resposta enviada
- latencia total
- latencia por ferramenta
- tipo de resposta

## Tabelas / logs recomendados

- `conversation_sessions`
- `conversation_messages`
- `conversation_action_logs`

E complementarmente:
- integracao com auditoria existente do SICAT;
- correlationId coerente com padrao atual do repositorio;
- snapshots operacionais para investigacao.

## Indicadores recomendados

### Produto
- taxa de sucesso por canal
- consultas por tipo
- percentual de usuarios que concluem operacao pela conversa
- top intencoes
- top bloqueios
- handoff rate

### Operacao
- tool success rate
- latencia media por tool
- latencia media por canal
- taxa de confirmacao
- taxa de bloqueio por politica
- falhas por contexto insuficiente

### Seguranca
- tentativas bloqueadas
- acoes sensiveis por canal
- uso por perfil
- step-up auth acionado

## Regra de ouro

Sem auditoria suficiente, nao ha execucao segura por IA.
