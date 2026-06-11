---
title: "ai-control-plane — Manual para Claude Code"
status: canonical
applies_to: [ai-control-plane]
updated: 2026-06-11
language: pt-BR
---

# ai-control-plane — Manual para Claude Code

> **Comece por aqui.** Fronteiras de operação: [`AGENTS.md`](./AGENTS.md). Contrato de API e
> setup: [`README.md`](./README.md). Plataforma: [`../../CLAUDE.md`](../../CLAUDE.md).
> Contexto da re-engenharia de IA: [`../../docs/ai-platform.md`](../../docs/ai-platform.md).

## O que é

Serviço de **governança de IA** da plataforma (F5 da re-engenharia): prompts versionados com
promote/rollback, rollup cross-app de feedback (thumbs) e registro de eval runs dos apps
(SICAT/GymOps). API-only (Express + pg, ESM puro, sem build) + Postgres próprio.

Na plataforma: `basePath /ai-control`, namespace `apps`, API em `/ai-control/api` (strip — o
processo vê `/health`, `/v1/*` na raiz). Contrato: [`devops.yaml`](./devops.yaml).

## Regra de design (inegociável)

**FORA do caminho crítico dos apps.** Consumidores fazem fetch com timeout 2s + cache +
fallback local (prompt inline, feedback só local). Se este serviço cair, NENHUM turno de IA
quebra. Nunca introduza uma dependência síncrona dos apps neste serviço.

## Armadilhas

- **Writes exigem token** (`Authorization: Bearer` = secret `ai-control-plane-config/token`);
  sem a env o serviço responde 503 (fail-closed) — nunca abra writes sem auth.
- **Secrets são imperativos** (fora do git): `ai-control-plane-db` e `ai-control-plane-config`
  — ver [`k8s/secret.example.yaml`](./k8s/secret.example.yaml). Por isso a Application do
  Argo usa `prune: false`.
- `migrate()` roda no boot com retry/backoff; `/health` reporta `db:false` sem derrubar o pod.
- Promote exige `confirmed: true` no body; a resposta traz `previous` para rollback fácil.

## Como trabalhar aqui

```powershell
cd apps/ai-control-plane/api
npm install ; node --test            # 30 testes puros (sem banco)
docker build -t ai-control-plane-api:local .
kubectl apply -k ..\k8s              # ou aguarde o Argo (Application ai-control-plane)
curl http://xpto.localhost/ai-control/api/health
```
