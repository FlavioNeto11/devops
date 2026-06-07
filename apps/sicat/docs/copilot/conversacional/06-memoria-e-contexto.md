# Memoria e contexto

## Problema

Uma experiencia conversacional operacional precisa lembrar o suficiente para ser util, mas nao tanto a ponto de se tornar opaca ou insegura.

## Tipos de contexto

### 1. Contexto de identidade
- usuario SICAT
- conta CETESB ativa
- integrationAccountId
- sessionContextId
- perfil do usuario
- canal atual

### 2. Contexto de tela
Mais relevante para o chat interno:
- rota atual
- manifesto aberto
- modulo atual
- breadcrumbs
- descricao da pagina
- estado relevante da UI

### 3. Contexto conversacional recente
- ultimas mensagens
- ultima intencao
- entidade ativa
- acao em andamento
- ultima confirmacao pedida

### 4. Memoria resumida
- preferencias do usuario
- apelidos uteis
- padrao recorrente de consulta
- resumo de conversa longa
- ultimo manifesto relevante

### 5. Contexto operacional persistido
- acoes executadas
- jobs iniciados pela IA
- links para documentos
- mensagens de erro recentes
- handoff feito para UI principal

## Estrategia recomendada

### Janela curta
Usar ultimos turnos brutos para manter coerencia imediata.

### Resumo de conversa
Resumir conversas longas em blocos curtos reutilizaveis.

### Estado operacional explicito
Manter objeto estruturado com:
- activeManifestId
- activeJobId
- activeScreen
- pendingConfirmation
- pendingAction
- currentChannel

### Nao depender so do texto da conversa
O modelo deve receber contexto estruturado, nao apenas historico textual.

## Memoria por canal

### WhatsApp
- mais curta
- mais objetiva
- fortemente associada ao telefone e vinculacao com usuario

### App simplificado
- memoria melhor
- historico de conversa e preferencia
- cards e anexos associados

### Chat interno
- menos necessidade de "lembrar tudo"
- mais necessidade de ler o contexto da tela atual em tempo real

## Regras de privacidade

- nao persistir segredos em texto livre
- nao persistir credenciais de CETESB
- nao usar memoria para burlar autorizacao
- expirar contexto temporario e confirmacoes pendentes
- diferenciar historico de conversa de log de execucao

## Estrutura recomendada de resumo

```json
{
  "summaryVersion": 1,
  "userProfileHint": "operador_simples",
  "lastKnownChannel": "whatsapp",
  "activeAccountId": "acc_x",
  "activeManifestId": "man_123",
  "pendingConfirmation": {
    "actionType": "cancel_manifest",
    "expiresAt": "2026-05-01T12:00:00Z"
  },
  "usefulFacts": [
    "usuario costuma consultar manifestos do dia",
    "usuario prefere receber documento em PDF"
  ]
}
```

## Regra pratica

Memoria deve melhorar continuidade.
Memoria nao deve inventar autorizacao, nem assumir operacao.
