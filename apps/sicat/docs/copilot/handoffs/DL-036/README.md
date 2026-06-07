# DL-036 — Fluxo frontend para criação de manifesto MTR

## Status
✅ COMPLETADO (2026-03-10)

## Objetivo
Implementar no frontend um fluxo operacional para criar manifesto MTR com suporte a APIs auxiliares (catálogos e parceiros), usando corretamente o contexto de sessão/integração e mantendo aderência à sequência observada no HAR `mtr.cetesb.sp.gov.br_gerar_mtr.har`.

## Escopo implementado
- Formulário de criação de manifesto no frontend.
- Busca de transportador/destinador por APIs auxiliares.
- Carga de catálogos de resíduo necessários ao payload.
- Criação de rascunho (`POST /v1/manifestos`).
- Submissão opcional imediata (`POST /v1/manifestos/{id}/submit`).

## Arquivos principais
- `frontend/src/components/ManifestCreateForm.vue`
- `frontend/src/services/api.js`
- `frontend/src/views/ManifestsView.vue`

## Referências
- Decision log: `docs/copilot/13-decision-log.md#dl-036`
- Estrutura Copilot: `docs/copilot/14-estrutura-copilot.md`
- HAR fonte de verdade: `docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har`
