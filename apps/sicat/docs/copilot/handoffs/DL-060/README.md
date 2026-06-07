# DL-060 — Nome final do PDF no padrão `mtr_<numeroMTR>.pdf`

## Status
- ✅ Concluído em 2026-03-14
- 🔗 Decision Log: [`docs/copilot/13-decision-log.md#dl-060`](../../13-decision-log.md#dl-060)

## Objetivo
Corrigir definitivamente o nome do arquivo impresso para que, após o número MTR estar disponível, o download use o padrão `mtr_<numeroMTR>.pdf`.

## Escopo
- Backend: `src/services/manifest-service.js`
- Frontend: `frontend/src/services/api.js`, `frontend/src/views/ManifestsView.vue`

## Resultado
Downloads passam a usar número final do MTR com underscore (`mtr_260010801657.pdf`) e não mais identificadores transitórios.
