---
title: "Estrutura do repositório"
status: reference
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Estrutura do repositório (`C:\devops`)

> Mapa autoritativo. Marca o que é **consumido por automação** (Argo/CI/Console — mexer com
> cuidado) vs **só documentação**.

## Topo

| Caminho | Conteúdo | Consumido por |
|---|---|---|
| `apps/` | Apps de negócio: `sicat`, `gymops`, `rmambiental` (monorepos próprios) | Argo, CI, build |
| `console/` | DevOps Console: `backend` (read-only k8s), `frontend` (React), `k8s/`; **`pm-api/` + `k8s/pm/`** (Fase 3, módulo Projetos & Tarefas) | Argo (Fase 3), Console |
| `portal/` | Landing pública na raiz `/` (estático nginx) | Argo/k8s |
| `platform/` | Infra GitOps: `argocd/apps/` (app-of-apps), `traefik/`, `observability/`, `namespaces/`, `registry/` | **Argo (HARD)** |
| `packages/` | Libs compartilhadas `@flavioneto11/*`: `ai-kit`, `oidc-kit` (Fase 2) | apps (build), CI publish |
| `templates/` | `app-template` (Helm) + `github-actions/` (workflows) + `meta/` (templates de `CLAUDE.md`/`AGENTS.md`/README de app) | scaffolding, CI |
| `schema/` | `devops-schema.json` — JSON Schema canônico do `devops.yaml` (validação/CI) | CI, agentes |
| `scripts/` | Automação PowerShell 7 (bootstrap, build, deploy, diagnose) | operadores |
| `docs/` | Documentação (guias + `standards/` + `runbooks/` + `contributing/`) | humanos |
| `runner/` | GitHub Actions self-hosted runner (ignorado pelo git) | CI |
| raiz `*.md` | `README`, `ARCHITECTURE`, `SECURITY`, `TROUBLESHOOTING`, `ROADMAP`, `CONTRIBUTING` + **`CLAUDE.md`/`AGENTS.md`** (camada de agentes) | humanos + agentes |

## `docs/` (taxonomia)

```
docs/
  README.md            # hub/índice
  <8 guias>.md         # guias operacionais (no nível de docs/ — referrers apontam aqui)
  standards/           # FR, NFR, infra, golden-path, libs/versionamento, depreciação, fr/<app>.md
  runbooks/            # docker-desktop-recovery, platform-bootstrap-and-reset, rollback
  contributing/        # repo-structure (este arquivo)
```

> Os 8 guias ficam no **nível** de `docs/` (e não em `docs/guides/`) de propósito: dezenas de
> links relativos e o `CLAUDE.md` global já apontam para `docs/<guia>.md`; movê-los quebraria tudo
> sem ganho real. As subpastas acima são **aditivas**.

## Regras ao mexer
- `platform/argocd/apps/*` e qualquer `k8s/` são **fonte do Argo** (`prune`+`selfHeal`): não mude
  `metadata.name`/labels de recurso vivo sem planejar recriação.
- Segredos: só `*.example` + SealedSecret no git (ver [`SECURITY.md`](../../SECURITY.md)).
- Novo app/serviço → siga o [golden path](../standards/golden-path.md).
