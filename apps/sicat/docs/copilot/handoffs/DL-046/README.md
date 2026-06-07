# DL-046 — Fallback para erro 500 no pesquisaManifesto CETESB

## Status
- ✅ COMPLETADO em 2026-03-13

## Objetivo
Mitigar falha recorrente da CETESB (`500`) no endpoint `pesquisaManifesto` quando chamado com `tipoOperacao=all`, aplicando fallback automático para `tipoOperacao=0`.

## Escopo
- Ajuste em `src/gateways/cetesb-gateway.js` (método `searchManifests`)
- Cobertura de teste unitário em `tests/unit/cetesb-gateway.test.js`
- Atualização de rastreabilidade em docs/copilot

## Referências
- `docs/copilot/13-decision-log.md#dl-046`
- `docs/copilot/14-estrutura-copilot.md`
