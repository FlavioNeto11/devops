---
title: "Plataforma — Infraestrutura GitOps"
status: reference
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Plataforma — Infraestrutura GitOps (`platform/`)

> Índice dos componentes de infraestrutura da plataforma DevOps local. Tudo aqui é **declarativo** e
> sincronizado pelo Argo CD (app-of-apps `devops-platform`). Para o contrato de agentes e as
> fronteiras de operação, leia [`../AGENTS.md`](../AGENTS.md); para o mapa do monorepo,
> [`../CLAUDE.md`](../CLAUDE.md).

> **`platform/*` é a fonte da verdade do GitOps.** O Argo CD reconcilia este diretório com o cluster
> usando `prune: true` + `selfHeal: true` — mudanças manuais no cluster são revertidas. Não altere
> `metadata.name`/labels de um recurso **vivo** sem planejar a recriação. Ver
> [`../docs/standards/hard-constraints.md` §4](../docs/standards/hard-constraints.md).

## Componentes

| Componente | Namespace | Propósito | Manifests / Doc |
|---|---|---|---|
| **Traefik** | `traefik` | Ingress controller (IngressRoute/Middleware, entrypoints `web`/`websecure`); dashboard em `traefik.localhost/dashboard/` | [`traefik/values.yaml`](./traefik/values.yaml), [`traefik/middlewares.yaml`](./traefik/middlewares.yaml), [`traefik/dashboard-ingressroute.yaml`](./traefik/dashboard-ingressroute.yaml) |
| **Argo CD** | `argocd` | GitOps; app-of-apps `devops-platform`; UI/API em `/argocd` | [`argocd/README.md`](./argocd/README.md) |
| **Keycloak** | `identity` | IdP/SSO OIDC (realm `nvit`) + Postgres dedicado; servido em `/auth` | [`keycloak/README.md`](./keycloak/README.md) |
| **Observability** | `observability` | kube-prometheus-stack (Prometheus + Grafana) + Loki/Promtail; Grafana em `/grafana` | [`observability/README.md`](./observability/README.md) |
| **Registry (GHCR)** | — (externo) | Convenção e fluxo de imagens `ghcr.io/flavioneto11/<app>/<service>` | [`registry/ghcr-guide.md`](./registry/ghcr-guide.md) |
| **Namespaces** | (cluster) | Cria os 7 namespaces gerenciados (`apps`, `apps-dev`, `apps-prod-local`, etc.) com labels canônicos | [`namespaces/namespaces.yaml`](./namespaces/namespaces.yaml) |

## Argo Applications (app-of-apps)

A Application raiz [`argocd/apps/devops-platform.yaml`](./argocd/apps/devops-platform.yaml) aponta para
`platform/argocd/apps` com `directory.recurse: true` e descobre todas as Applications filhas:

| Application | Path no Git | Namespace de destino |
|---|---|---|
| `devops-platform` (raiz) | `platform/argocd/apps` | `argocd` |
| `keycloak` | `platform/keycloak` (kustomize) | `identity` |
| `devops-console` | (ver manifest) | `devops-system` |
| `sicat` · `gymops` · `rmambiental` | `apps/<app>/k8s` | `apps` |

> Traefik e a observabilidade são instalados via **Helm** pelos scripts da plataforma (ordem importa:
> Traefik antes do kube-prometheus-stack — ver nota no [`traefik/values.yaml`](./traefik/values.yaml)),
> e não por uma Application do Argo neste conjunto. As Applications acima cobrem o que é sincronizado
> declarativamente pelo app-of-apps.

## Segredos

Nenhum segredo real em git. Cada componente que precisa de segredo versiona um **SealedSecret**
(cifrado; só o controller `kube-system/sealed-secrets-controller` decifra): `keycloak-secrets`
([`keycloak/sealed-keycloak-secrets.yaml`](./keycloak/sealed-keycloak-secrets.yaml)), `grafana-oidc`
([`observability/sealed-grafana-oidc.yaml`](./observability/sealed-grafana-oidc.yaml)), `argocd-oidc`
([`argocd/sealed-argocd-oidc.yaml`](./argocd/sealed-argocd-oidc.yaml)). Detalhes:
[`../docs/sso-keycloak.md` §3](../docs/sso-keycloak.md).

## Regras inegociáveis

Antes de editar qualquer manifest aqui, leia [`../docs/standards/hard-constraints.md`](../docs/standards/hard-constraints.md)
(labels, roteamento, segredos, GitOps, imagens) e o [`../AGENTS.md` §5](../AGENTS.md) (fronteiras:
mexer em `platform/*` é operação **com aprovação**).

---
_Plataforma: [`../AGENTS.md`](../AGENTS.md) · [`../CLAUDE.md`](../CLAUDE.md) · SSO/segredos: [`../docs/sso-keycloak.md`](../docs/sso-keycloak.md)._
