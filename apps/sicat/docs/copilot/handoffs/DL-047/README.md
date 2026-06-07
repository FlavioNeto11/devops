# DL-047 — Persistência de erro 500 CETESB com conta já salva

## Status
- ✅ COMPLETADO em 2026-03-13

## Objetivo
Corrigir cenário em que, após selecionar uma conta CETESB já autenticada, o sistema continuava falhando com `500` em `pesquisaManifesto ... /all`.

## Escopo
- Ajuste backend em `src/gateways/cetesb-gateway.js`
- Cobertura de regressão em `tests/unit/cetesb-gateway.test.js`
- Atualização de documentação Copilot

## Referências
- `docs/copilot/13-decision-log.md#dl-047`
- `docs/copilot/14-estrutura-copilot.md`
