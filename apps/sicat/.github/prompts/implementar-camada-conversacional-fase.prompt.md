---
name: implementar-camada-conversacional-fase
description: Implementar uma fase especifica da camada conversacional do SICAT
agent: executor-handoffs
argument-hint: "fase_id e objetivo_fase"
---

# Implementar fase da camada conversacional

Implemente apenas a fase solicitada, respeitando o estado atual do repositório e a trilha canônica da camada conversacional.

## Parametros esperados

- `fase_id`
- `objetivo_fase`

## Regras

- nao avancar para outra fase sem consolidacao
- registrar progresso no handoff
- manter WhatsApp fora do escopo imediato quando `fase_id` estiver entre 1 e 6
- usar o backend conversacional como nucleo reutilizavel
