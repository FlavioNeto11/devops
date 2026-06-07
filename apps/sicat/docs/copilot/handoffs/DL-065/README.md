# DL-065 — Evolução dos filtros da listagem de manifestos

## Overview
Entrega multi-camada para melhorar a experiência de filtragem na listagem de manifestos e ampliar critérios operacionais de busca.

## Escopo
- Backend: `src/services/manifest-service.js`, `src/repositories/manifest-repo.js`
- Frontend: `frontend/src/stores/manifests.js`, `frontend/src/views/ManifestsView.vue`
- Contrato: `openapi/mtr_automacao_openapi_interna.yaml`, `examples/get_v1_manifestos_request.json`, `src/generated/operations.js`

## Objetivos
- Melhorar disposição dos itens no bloco de filtros.
- Permitir filtro por `Status`.
- Permitir filtro por `Número MTR`.
- Permitir filtro por `Transportador`.
- Permitir filtro por `Destinador`.

## Status
✅ Concluído em 2026-03-14.

## Referências
- Decision log: `docs/copilot/13-decision-log.md#dl-065`
- Estrutura: `docs/copilot/14-estrutura-copilot.md`
