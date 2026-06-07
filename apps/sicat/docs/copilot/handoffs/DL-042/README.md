# DL-042 — Dupla camada de login SICAT + contas CETESB

## Overview
Esta entrega implementa o fluxo de autenticação em duas etapas:
1. autenticação inicial do usuário no SICAT;
2. seleção (ou adição) de uma conta CETESB vinculada ao usuário para operação.

## Escopo implementado
- Contrato OpenAPI para endpoints ` /v1/sicat/* `.
- Persistência dedicada para usuários/sessões SICAT e contas CETESB vinculadas.
- Backend com login SICAT, refresh de sessão, listagem/adição/ativação de contas CETESB e sessão ativa.
- Frontend com nova jornada:
  - ` /login ` (SICAT)
  - ` /login/cetesb ` (cards de contas CETESB)
  - acesso ao shell operacional apenas com conta CETESB ativa.

## Artefatos
- `handoff-summary.md`
- `technical-decisions.md`
- `validation-report.md`

## Referências
- Decision log: `docs/copilot/13-decision-log.md#dl-042`
- Estrutura Copilot: `docs/copilot/14-estrutura-copilot.md`
- Modelo de dados: `docs/copilot/05-modelo-de-dados.md`
