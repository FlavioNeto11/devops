---
name: evoluir-sessao-conta
description: 'Evolui a tela de Sessão e Conta CETESB do SICAT (contexto ativo, troca de conta, autenticação e robustez de sessão).'
agent: sessao-conta-mtr
argument-hint: descreva a melhoria desejada na tela de sessão/conta (status, troca de conta, fluxo de login, expiração)
---

# Evoluir Tela de Sessão e Conta CETESB

**Contexto:** aprimorar a tela de sessão e gerenciamento de contas CETESB do SICAT com foco em clareza operacional, robustez de autenticação e fluxo de troca sem fricção.

**Agente principal:** `sessao-conta-mtr`

## Demanda

${input:melhoria_sessao:Descreva a evolução desejada (ex.: indicador de sessão ativa, aviso de expiração, fluxo de troca de conta, status de autenticação CETESB)}

**Critérios de aceite (opcional):**
${input:criterios_aceite:Descreva critérios objetivos de pronto ou deixe em branco}

## Fluxo esperado

1. Analisar impacto em `frontend/src/views/SessionAccountView.vue`, `CetesbAccountSelectionView.vue` e `frontend/src/stores/auth.js`.
2. Propor e implementar melhoria com preservação de `sessionContextId`, `integrationAccountId` e `correlationId`.
3. Escalar para `integrador-cetesb-mtr` se houver mudança em token/sessão real CETESB.
4. Escalar para `programador-backend-mtr` se houver mudança em contrato de auth/session.
5. Validar cenários de troca de conta, expiração e relogin.
6. Atualizar decision-log quando comportamento de autenticação mudar.

## Resultado esperado

- tela comunica claramente sessão ativa, conta selecionada e ações disponíveis
- fluxos de troca/relogin/expiração com feedback adequado ao operador
- integração validada com testes aplicáveis
