# DL-059 — Nome do PDF com número do manifesto

## Status
- ✅ Concluído em 2026-03-14
- 🔗 Decision Log: [`docs/copilot/13-decision-log.md#dl-059`](../../13-decision-log.md#dl-059)

## Objetivo
Corrigir o nome do arquivo impresso para refletir o número final do manifesto assim que a integração CETESB estiver finalizada.

## Escopo técnico
- `src/services/manifest-service.js` (`getManifestDocumentStream`)

## Resultado
O header `Content-Disposition` passa a usar `mtr-{manifestNumber}.pdf` quando `manNumero` estiver disponível no manifesto.
