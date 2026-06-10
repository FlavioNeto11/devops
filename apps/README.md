---
title: "Apps de Negócio"
status: reference
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Apps de Negócio (`apps/`)

> Apps implantáveis na esteira da plataforma. Cada um é um monorepo próprio com seu `devops.yaml`
> e sua camada de meta-documentação. Para criar um app novo, siga o
> [golden path](../docs/standards/golden-path.md). Mapa geral do repositório:
> [`../CLAUDE.md`](../CLAUDE.md).

## Apps

| App | basePath | Stack (resumo) | Meta-doc | Login |
|---|---|---|---|---|
| [`sicat`](./sicat/) | `/sicat` | Vue + Node/Express + Postgres + worker; MTR/CETESB; IA (LangChain) | `CLAUDE.md` + `AGENTS.md` | OIDC Keycloak (aditivo) |
| [`gymops`](./gymops/) | `/gymops` | Next.js + Fastify + Prisma/Postgres + Redis | `CLAUDE.md` + `AGENTS.md` (**padrão-ouro**) | SSO Keycloak |
| [`rmambiental`](./rmambiental/) | `/rmambiental` | SPA estática (Vite/React) | `CLAUDE.md` + `AGENTS.md` | — |

## Onde está o quê

- **Contrato de cada app:** `apps/<app>/devops.yaml` (schema: [`../schema/devops-schema.json`](../schema/devops-schema.json)).
- **Argo Application:** `platform/argocd/apps/<app>.yaml` (GitOps; auto-sync).
- **Para agentes de IA:** leia o `AGENTS.md` do app **antes de agir** (fronteiras + matriz de
  decisão), depois o `CLAUDE.md` (contexto específico do Claude). Padrão em
  [`../docs/standards/meta-doc-standard.md`](../docs/standards/meta-doc-standard.md).

## Adicionar um app novo

1. `scripts/new-app.ps1 -Name <app> -Services frontend,api[,api2,worker]` (gera scaffold no padrão).
2. Escreva os meta-docs a partir de [`../templates/meta/`](../templates/meta/).
3. Siga o [`../docs/standards/golden-path.md`](../docs/standards/golden-path.md) e o
   [`../docs/project-onboarding-checklist.md`](../docs/project-onboarding-checklist.md).
4. Adicione este app à tabela acima.
