# Experiencia do app light tipo chat

## Objetivo

Definir o app simplificado do SICAT como principal superficie conversacional externa da primeira onda.

## Posicionamento

O app light nao deve ser apenas uma versao pobre do sistema principal.
Ele deve ser uma experiencia propria, orientada a conversa e a operacao guiada.

## Publico principal

- transportadores
- pequenos operadores
- usuarios simples
- usuarios com baixa familiaridade com sistemas complexos

## Capacidades esperadas

- thread conversacional persistida
- cards de acao
- atalhos operacionais
- autenticacao SICAT
- conta CETESB ativa
- consultas operacionais
- explicacoes contextuais
- proximos passos sugeridos
- transicao para a plataforma completa quando necessario

## Limitacoes esperadas

- nem toda acao da plataforma completa deve existir aqui
- acoes mais sensiveis devem exigir confirmacao ou redirecionamento
- a interface deve priorizar clareza sobre densidade funcional

## Componentes e telas recomendadas

```text
frontend/src/views/
  ConversationalAppView.vue

frontend/src/components/light-chat/
  LightChatShell.vue
  LightChatThread.vue
  LightChatComposer.vue
  LightChatActionCard.vue
  LightChatEmptyState.vue
  LightChatContextBadge.vue
```

## Regra de UX

A experiencia deve parecer:
- simples
- direta
- operacional
- segura
- orientada por proximo passo

Nao deve parecer:
- uma tela administrativa reduzida
- um clone do WhatsApp
- um chatbot solto sem contexto operacional
