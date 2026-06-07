# DL-064 — Correções de filtros na listagem de manifestos

## Overview
Este handoff consolida ajustes de UX e estado na tela de listagem de manifestos para evitar perda de contexto e remover exposição de dado técnico de sessão.

## Escopo
- `frontend/src/views/ManifestsView.vue`
- `frontend/src/stores/manifests.js`

## Objetivos
- Ocultar o campo `Integration Account` para o usuário final.
- Fazer `Limpar Filtros` retornar as datas para hoje.
- Preservar filtros ao navegar para detalhe e voltar à listagem.

## Status
✅ Concluído em 2026-03-14.

## Referências
- `docs/copilot/13-decision-log.md#dl-064`
- `docs/copilot/14-estrutura-copilot.md`
