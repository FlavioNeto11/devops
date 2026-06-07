# DL-058 — Atualização automática pós-job na listagem

## Status
- ✅ Concluído em 2026-03-14
- 🔗 Decision Log: [`docs/copilot/13-decision-log.md#dl-058`](../../13-decision-log.md#dl-058)

## Objetivo
Garantir que a listagem de manifestos reflita automaticamente o status final após término do job relacionado ao manifesto, sem exigir clique manual em `Ressinc`.

## Escopo
- `frontend/src/views/ManifestDetailView.vue`
- `frontend/src/views/ManifestsView.vue`
- documentação de decisão e estrutura Copilot

## Resultado
Ao sair do detalhe de um manifesto acompanhado por job assíncrono, a listagem executa sincronização automática e já mostra o estado atualizado.
