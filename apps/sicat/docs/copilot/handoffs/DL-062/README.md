# DL-062 — Tratamento de execuções órfãs de manifesto

## Status
- ✅ Concluído em 2026-03-14
- 🔗 Decision Log: [`docs/copilot/13-decision-log.md#dl-062`](../../13-decision-log.md#dl-062)

## Objetivo
Resolver cenários de manifestos presos/órfãos sem job ativo ou DLQ, criando caminho operacional de recuperação e melhor diagnóstico.

## Escopo
- `src/services/manifest-service.js`
- `frontend/src/views/ManifestsView.vue`
- `frontend/src/views/ManifestDetailView.vue`

## Resultado
- Reconciliação automática de estados transitórios na listagem.
- Ação de `Reenviar` disponível para recuperação.
- Mensagem de falha detalhada exibida na visualização do manifesto.
