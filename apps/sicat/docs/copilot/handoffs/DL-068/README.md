# DL-068 — Remoção de conta CETESB e tipo sem fallback

## Overview
Correção incremental para tornar a remoção de conta CETESB efetivamente operacional e remover fallback artificial de tipo para `gerador`.

## Escopo
- `src/services/auth-service.js`
- `src/services/sicat-account-service.js`
- `src/repositories/sicat-cetesb-account-repo.js`
- `frontend/src/views/CetesbAccountSelectionView.vue`

## Objetivos
- Permitir que o botão `Remover` funcione também para conta ativa.
- Garantir que `accountType` seja derivado do login CETESB, sem mascaramento por fallback.

## Status
✅ Concluído em 2026-03-14.

## Referências
- `docs/copilot/13-decision-log.md#dl-068`
- `docs/copilot/14-estrutura-copilot.md`
