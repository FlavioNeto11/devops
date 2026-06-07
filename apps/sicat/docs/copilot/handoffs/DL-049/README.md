# DL-049 - Troca de conta CETESB sem logout SICAT

## Objetivo
Permitir que o usuário já autenticado no SICAT volte para a tela de seleção de contas CETESB para escolher outra conta vinculada, sem encerrar a sessão SICAT.

## Escopo
- Frontend shell: `frontend/src/App.vue`
- Store de autenticação: `frontend/src/stores/auth.js`
- Documentação Copilot: `docs/copilot/13-decision-log.md`, `docs/copilot/14-estrutura-copilot.md`

## Resultado
- Novo botão **Trocar conta CETESB** no shell autenticado.
- O botão limpa apenas o contexto CETESB ativo (conta/sessão/integrationAccountId) e navega para `/login/cetesb`.
- O botão **Sair** mantém comportamento de logout completo.

## Status
✅ Concluído em 2026-03-13
