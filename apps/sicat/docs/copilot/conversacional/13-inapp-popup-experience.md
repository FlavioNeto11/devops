# Experiencia do popup interno

## Objetivo

Definir o comportamento do copiloto contextual dentro da plataforma principal do SICAT.

## Papel do popup

O popup interno nao e um chat generico.
Ele deve funcionar como copiloto da interface atual.

## O que ele deve saber

- rota atual
- nome da tela
- breadcrumbs
- conta CETESB ativa
- usuario autenticado
- manifesto ou entidade em foco
- acoes disponiveis na tela
- campos relevantes
- erros de validacao ou pendencias relevantes

## O que ele deve fazer

- responder duvidas sobre a plataforma
- explicar campos
- explicar status
- orientar navegacao
- sugerir proximos passos
- ajudar a preencher ou revisar campos
- disparar acoes permitidas via tools controladas
- preparar execucoes para confirmacao

## O que ele nao deve fazer

- fingir que sabe o contexto sem receber contexto real do frontend
- executar acoes sensiveis sem policy layer
- pular confirmacoes
- depender de parsing livre de DOM fragil como regra principal

## Componentes recomendados

```text
frontend/src/components/assistant/
  AssistantLauncher.vue
  AssistantPanel.vue
  AssistantThread.vue
  AssistantComposer.vue
  AssistantActionCard.vue
  AssistantContextHeader.vue
```

## Integracao com o shell

O ponto natural de integracao e o shell autenticado em `frontend/src/App.vue`, pois o shell ja concentra:
- usuario
- conta ativa
- contexto de pagina
- breadcrumb
- descricao de pagina
- navegacao principal
