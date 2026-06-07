# DL-063 — Regras de ações por status de erro na listagem

## Overview
Este handoff consolida o ajuste de UX operacional na listagem de manifestos para corrigir exibição indevida de ações em casos de erro.

## Escopo
- Arquivo principal: `frontend/src/views/ManifestsView.vue`
- Documentação: `docs/copilot/13-decision-log.md`, `docs/copilot/14-estrutura-copilot.md`

## Objetivo operacional
- Exibir `Reenviar` somente para cenários de erro.
- Ocultar `Imprimir` e `Cancelar` em cenários de erro.
- Exibir `Remover` em cenários de erro para limpeza da visualização atual.

## Status
✅ Concluído em 2026-03-14.

## Referências
- Decision log: `docs/copilot/13-decision-log.md#dl-063`
- Estrutura: `docs/copilot/14-estrutura-copilot.md`
