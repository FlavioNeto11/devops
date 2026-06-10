---
title: "Argo CD — GitOps"
status: reference
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Argo CD — GitOps (`platform/argocd/`)

> **Propósito:** GitOps da plataforma. O Argo CD reconcilia o que está declarado em `platform/` e
> `apps/*/k8s` com o cluster Docker Desktop. **Namespace:** `argocd`. Servido atrás do Traefik em
> `/argocd`. Índice da infra: [`../README.md`](../README.md). Fronteiras de operação:
> [`../../AGENTS.md` §5](../../AGENTS.md).

## App-of-apps `devops-platform`

A Application raiz [`apps/devops-platform.yaml`](./apps/devops-platform.yaml) é o ponto de entrada do
GitOps:

- **Source:** repo `https://github.com/FlavioNeto11/devops`, path `platform/argocd/apps`, revision `main`.
- **`directory.recurse: true`** → descobre e gerencia todas as Applications filhas em
  [`apps/`](./apps/) (`keycloak`, `devops-console`, `sicat`, `gymops`, `rmambiental`).
- **`syncPolicy.automated`:** `prune: true` + `selfHeal: true` → sincroniza sozinho a cada mudança no
  Git e reverte alterações manuais no cluster. `syncOptions: CreateNamespace=true`.

> Gerenciando esta única Application você gerencia toda a plataforma de forma declarativa. Repo
> público → o Argo clona sem credenciais.

## `helm-values.yaml` (chart `argo/argo-cd`) — pontos-chave

Perfil **laboratório local** (footprint reduzido). Ver [`helm-values.yaml`](./helm-values.yaml):

| Item | Valor | Motivo |
|---|---|---|
| `redis-ha`, `dex`, `notifications`, `applicationSet` | `enabled: false` | reduzir footprint; app-of-apps usa Applications estáticas |
| `controller`/`repoServer`/`server` | `replicas: 1` + `requests`/`limits` | uma réplica por componente no laboratório |
| `server.ingress.enabled` | `false` | usamos a IngressRoute do Traefik, não o Ingress nativo do chart |
| `configs.params.server.insecure` | `true` | TLS terminado na borda (Traefik); server sem TLS próprio |
| `configs.params.server.rootpath` | `/argocd` | server atende sob o subpath (equivale a `--rootpath`) |
| `configs.params.server.basehref` | `/argocd/` | a UI resolve assets sob o subpath |
| `configs.cm.url` | `https://dev.nvit.com.br/argocd` | URL externa para links/callbacks (host real futuro) |

> A IngressRoute do Argo (`/argocd`) é definida nos manifests do Traefik, **não** neste values (o
> Ingress nativo do chart fica desabilitado). O `--insecure` + `rootpath`/`basehref` fazem a UI e a
> API funcionarem sob `/argocd` sem StripPrefix.

## OIDC via Keycloak (realm `nvit`)

SSO configurado em `configs.cm.oidc.config` + `configs.rbac` ([`helm-values.yaml`](./helm-values.yaml)):

- **Issuer:** `https://dev.nvit.com.br/auth/realms/nvit`; **clientID:** `argocd`.
- **clientSecret:** referenciado como `$argocd-oidc:client_secret` — vem do SealedSecret
  [`sealed-argocd-oidc.yaml`](./sealed-argocd-oidc.yaml) (Secret `argocd-oidc`, label
  `app.kubernetes.io/part-of: argocd`). Decifrado pelo controller `sealed-secrets`.
- **RBAC:** `policy.csv: g, platform-admins, role:admin` + `scopes: "[groups]"` → membros do grupo
  Keycloak `platform-admins` viram admin. O usuário **`admin` local** continua como fallback.

Contexto completo de SSO: [`../../docs/sso-keycloak.md`](../../docs/sso-keycloak.md).

## Operações comuns

```powershell
# Senha inicial do admin local (Secret argocd-initial-admin-secret, base64)
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}"

# UI via port-forward (recomendado — ver troubleshooting abaixo)
kubectl port-forward svc/argocd-server -n argocd 8080:80   # http://localhost:8080

# Estado das Applications
kubectl get applications -n argocd

# Sincronizar manualmente a raiz (se o automated estiver desligado)
argocd app sync devops-platform
```

## Troubleshooting

- **UI atrás do subpath serve `<base href>` quebrado** → use **port-forward** (`svc/argocd-server`
  porta `8080:80`) e acesse `http://localhost:8080`. Armadilha conhecida da plataforma (ver
  [`../../CLAUDE.md`](../../CLAUDE.md)).
- **Application `OutOfSync` / `selfHeal` revertendo sua mudança** → o Argo é a fonte da verdade;
  edite o Git (este diretório), não o cluster (ver [`../../docs/standards/hard-constraints.md` §4](../../docs/standards/hard-constraints.md)).
- **Habilitar/desligar auto-sync** → é por Application (`spec.syncPolicy.automated`), não no values do
  Helm (ver nota ao final de [`helm-values.yaml`](./helm-values.yaml)).

> Operações com efeito no cluster (sync forçado, alterar Application viva) são **com aprovação** do
> operador — ver [`../../AGENTS.md` §5](../../AGENTS.md).

---
_Infra: [`../README.md`](../README.md) · Regras HARD: [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md) · SSO: [`../../docs/sso-keycloak.md`](../../docs/sso-keycloak.md)._
