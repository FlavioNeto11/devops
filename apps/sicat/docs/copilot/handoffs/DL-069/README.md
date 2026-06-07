# DL-069 - Remoção real de manifesto com falha

## Status
- ✅ COMPLETADO
- Data: 2026-03-14

## Objetivo
Corrigir o botão `Remover` na listagem de manifestos para executar exclusão persistente no backend, limitada a manifestos em estado de falha.

## Escopo
- Backend: rota + service + repository
- Frontend: integração do botão `Remover` com API
- Contrato: OpenAPI + examples + operações geradas

## Referências
- Decision log: `docs/copilot/13-decision-log.md#dl-069`
- Estrutura: `docs/copilot/14-estrutura-copilot.md`
