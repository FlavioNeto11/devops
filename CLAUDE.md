---
title: "Plataforma DevOps — Manual para Claude Code"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Plataforma DevOps — Manual para Claude Code

> **Comece por aqui.** Este é o ponto de entrada do Claude no monorepo `C:\devops`. As **fronteiras
> de operação** (o que é seguro/precisa-aprovação/proibido) e a **matriz de decisão** vivem no
> [`AGENTS.md`](./AGENTS.md) — leia-o antes de agir. Este arquivo dá o mapa e o contexto específico
> do Claude. Padrão desta camada: [`docs/standards/meta-doc-standard.md`](./docs/standards/meta-doc-standard.md).

## O que é este repositório

Plataforma DevOps local de **operador único** sobre o Kubernetes do Docker Desktop. Hospeda apps de
negócio, componentes de plataforma, libs compartilhadas e a infraestrutura GitOps que os publica e
observa. Stack: Traefik (ingress) · Argo CD (GitOps) · Keycloak (SSO/OIDC) · kube-prometheus-stack +
Loki (observabilidade) · Sealed Secrets · DevOps Console (`/devops`).

> **Contrato da máquina:** [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md) — idioma
> (prosa pt-BR, código/identificadores em inglês), Windows Server + PowerShell 7, regra de ouro de
> roteamento, comandos úteis. **Não repetimos** esse conteúdo aqui — apontamos.

## Ordem de leitura para o Claude

1. **Este arquivo** — mapa e contexto.
2. [`AGENTS.md`](./AGENTS.md) — fronteiras de operação e matriz de decisão (**obrigatório antes de agir**).
3. [`docs/standards/hard-constraints.md`](./docs/standards/hard-constraints.md) — o que nunca quebrar.
4. [`docs/standards/golden-path.md`](./docs/standards/golden-path.md) — fluxo do zero ao app no ar.
5. [`docs/new-project-contract.md`](./docs/new-project-contract.md) + [`schema/devops-schema.json`](./schema/devops-schema.json) — `devops.yaml`.
6. [`docs/README.md`](./docs/README.md) — índice completo da documentação.

**Trabalhando dentro de um app/componente?** Leia também o `CLAUDE.md`/`AGENTS.md` daquele escopo
(ver mapa abaixo) antes de mexer nele.

## Mapa do monorepo

| Escopo | Local | Meta-doc | O que é |
|---|---|---|---|
| **apps** | `apps/` | `apps/README.md` | apps de negócio (monorepos próprios) |
| · sicat | `apps/sicat/` | `CLAUDE.md` + `AGENTS.md` | MTR/CETESB (Vue + Node/Express + Postgres + worker), OIDC |
| · gymops | `apps/gymops/` | `CLAUDE.md` + `AGENTS.md` (padrão-ouro) | gestão operacional multiunidade (Next.js + Fastify + Prisma) |
| · rmambiental | `apps/rmambiental/` | `CLAUDE.md` + `AGENTS.md` | SPA estática (Vite/React) |
| **console** | `console/` | `AGENTS.md` + `README.md` | DevOps Console (backend read-only k8s + frontend React) |
| **portal** | `portal/` | `AGENTS.md` + `README.md` | landing pública na raiz `/` (nginx estático) |
| **packages** | `packages/` | `AGENTS.md` por lib | `@flavioneto11/*`: `ai-kit`, `oidc-kit` |
| **platform** | `platform/` | `platform/README.md` | infra GitOps: argocd, traefik, keycloak, observability, registry, namespaces |
| **templates** | `templates/` | `app-template/README.md` | Helm chart + workflows + `meta/` (templates de meta-doc) |
| **scripts** | `scripts/` | (header de cada `.ps1`) | automação PowerShell 7 |
| **docs** | `docs/` | `docs/README.md` | documentação humana (guias + standards + runbooks) |

## Como o Claude deve operar aqui

- **Antes de agir, classifique a operação** pelas fronteiras do [`AGENTS.md` §5](./AGENTS.md):
  seguras (autônomas), com aprovação (efeito colateral/produção), proibidas (segredos, force push,
  recurso vivo sob Argo). Na dúvida, trate como "com aprovação".
- **Antes de gerar manifests / `devops.yaml` / Dockerfile**, leia
  [`hard-constraints.md`](./docs/standards/hard-constraints.md) (labels, roteamento, segredos, GitOps,
  imagens).
- **Não duplique contexto** — referencie o doc canônico. Schema → `schema/devops-schema.json`; regra
  de roteamento → `hard-constraints.md`; máquina → `~/.claude/CLAUDE.md`.
- **Plataforma instável (Docker/k8s)?** Não force-kill o Docker; use
  [`docs/runbooks/docker-desktop-recovery.md`](./docs/runbooks/docker-desktop-recovery.md) /
  `scripts/recover-docker.ps1`.

## Armadilhas conhecidas (nível plataforma)

- **PATH numa sessão nova:** se `kubectl`/`helm`/`docker` "não forem encontrados", recarregue o PATH
  do processo (ver `~/.claude/CLAUDE.md`).
- **`docker desktop restart` trava em "stopping"** nesta máquina → recupere com `recover-docker.ps1`.
- **Editar `settings-store.json` com o Docker rodando é revertido** (ex.: `AutoStart`) — use o toggle
  da GUI ou edite com o Docker parado.
- **Argo CD UI atrás de subpath** serve `<base href>` quebrado → use port-forward.
- Armadilhas específicas de cada app/componente estão no `CLAUDE.md` do respectivo escopo.

## Atalhos úteis

```powershell
scripts\up.ps1                      # sobe tudo (idempotente)
scripts\validate-platform.ps1       # 17 checks de saúde (read-only)
scripts\new-app.ps1 -Name <app> -Services frontend,api,worker   # scaffold no padrão
scripts\publish-app.ps1 -App <name> # apply + rollout + smoke (com aprovação)
kubectl get pods,svc,ingressroute -A
```

---
_Fronteiras e decisão: [`AGENTS.md`](./AGENTS.md) · Regras HARD: [`docs/standards/hard-constraints.md`](./docs/standards/hard-constraints.md) · Índice: [`docs/README.md`](./docs/README.md)._
