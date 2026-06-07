# Handoff Summary — DL-059

## Handoff 1 — Backend
- Ajustada a resolução de `fileName` no stream de documento de manifesto.
- O nome agora é recalculado dinamicamente com base no estado atual do manifesto, priorizando `externalReference.manNumero`.

## Handoff 2 — Validação
- Build e smoke executados para garantir ausência de regressões operacionais.

## Entrega
O download do PDF deixa de ficar preso a nome transitório e passa a refletir o número final do manifesto quando disponível.
