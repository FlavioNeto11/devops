---
title: "ai-control-plane — Contrato de Agentes"
status: canonical
applies_to: [ai-control-plane]
updated: 2026-06-11
language: pt-BR
---

# ai-control-plane — Contrato de Operação (Agentes)

> Fronteiras para qualquer agente que atue neste app. Contexto e stack:
> [`CLAUDE.md`](./CLAUDE.md). Plataforma: [`../../AGENTS.md`](../../AGENTS.md).

## Seguras (autônomas)

- Ler código/manifests; rodar `node --test` em `api/`; build local da imagem.
- GETs na API (reads são abertos): `/health`, `/v1/prompts*`, `/v1/feedback/summary`,
  `/v1/eval-runs`, `/v1/overview`.

## Com aprovação

- Writes na API de produção (criar/ativar versão de prompt, ingestão manual) — promote de
  prompt MUDA o comportamento da IA dos apps em ≤60s.
- `kubectl apply`/rollout do serviço; alterações de schema (migrations).

## Proibidas

- Commitar segredo (token/DATABASE_URL) — secrets são imperativos, `*.example.yaml` só com
  placeholders.
- Abrir writes sem token (remover o fail-closed do auth).
- Criar dependência síncrona dos apps neste serviço (quebra a regra "fora do caminho
  crítico").
- Deletar versões de prompt (histórico é a base do rollback/auditoria).
