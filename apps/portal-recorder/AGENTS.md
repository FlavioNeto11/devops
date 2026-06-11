---
title: "portal-recorder — Contrato de Agentes"
status: canonical
applies_to: [portal-recorder]
updated: 2026-06-11
language: pt-BR
---

# portal-recorder — Contrato de Operação (Agentes)

> Fronteiras para qualquer agente que atue neste app. Contexto: [`CLAUDE.md`](./CLAUDE.md).
> Plataforma: [`../../AGENTS.md`](../../AGENTS.md).

## Seguras (autônomas)

- Ler código/manifests; `node --test` na `api/` e no `recorder/`; build local das imagens.
- GETs na API (reads abertos): portais, sessões, eventos redigidos, contratos.

## Com aprovação

- Abrir uma **sessão de captura contra um portal real** (ex.: CETESB) — usa credenciais reais do
  usuário, atinge o portal externo. Operação manual e isolada.
- Writes na API de produção (registrar portal, criar/parar sessão, normalizar contrato).
- `kubectl apply`/rollout do app; migrations.

## Proibidas

- Commitar segredo ou **qualquer captura crua** (token/cookie/senha/payload real) — só vai ao
  Postgres do app, redigido; `*.example.yaml` com placeholders.
- Persistir token/cookie/senha **sem redação** (a redação é na origem, no recorder, antes do banco).
- Expor corpo cru de captura por qualquer rota da API ou ao frontend de revisão.
- Rodar mais de `MAX_CONCURRENT_SESSIONS` browsers ou deixar contexto Chromium órfão (vazamento de RAM).
- Rotear a porta interna do recorder (8090) ou o stream sem o token/priority corretos no Traefik.
