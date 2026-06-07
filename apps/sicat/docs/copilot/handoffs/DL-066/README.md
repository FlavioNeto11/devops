# DL-066 — Correção de filtros e UX da listagem de manifestos

## Overview
Handoff focado em corrigir falhas reportadas nos filtros operacionais e estabilizar a disposição visual do bloco de filtros da listagem.

## Escopo
- `src/repositories/manifest-repo.js`
- `frontend/src/views/ManifestsView.vue`
- `docs/copilot/13-decision-log.md`
- `docs/copilot/14-estrutura-copilot.md`

## Objetivos
- Garantir aplicação correta dos filtros por `Número MTR`, `Transportador` e `Destinador`.
- Remover status `Impresso` do seletor de filtro.
- Reorganizar completamente a disposição dos campos (incluindo `Data inicial` e `Data final`) para melhor UX.
- Melhorar apresentação de parceiro quando dado vier numérico.

## Status
✅ Concluído em 2026-03-14.

## Referências
- `docs/copilot/13-decision-log.md#dl-066`
- `docs/copilot/14-estrutura-copilot.md`
