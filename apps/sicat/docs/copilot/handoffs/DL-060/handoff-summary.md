# Handoff Summary — DL-060

## Handoff 1 — Backend
- `storeManifestPdf` atualizado para padrão `mtr_<valor>.pdf`.
- `getManifestDocumentStream` atualizado para recalcular nome com `manNumero` quando disponível.

## Handoff 2 — Frontend fallback
- `downloadManifestDocument` agora aceita preferência explícita de nome/numero.
- Fluxo de impressão (`ManifestsView`) envia `manifestNumber` resolvido para garantir nome correto mesmo com documento legado.

## Handoff 3 — Validação
- Build frontend executado com sucesso.
- Smoke health backend executado com sucesso.

## Entrega
Padrão final de nome de arquivo do PDF impresso consolidado para `mtr_<numeroMTR>.pdf`.
