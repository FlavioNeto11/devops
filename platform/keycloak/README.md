---
title: "Keycloak — Identidade/SSO (OIDC)"
status: reference
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Keycloak — Identidade/SSO (`platform/keycloak/`)

> **Propósito:** IdP/SSO OIDC da plataforma (realm `nvit`) + Postgres dedicado. Grafana, Argo CD e o
> DevOps Console logam via este Keycloak. **Namespace:** `identity`. Servido atrás do Traefik em
> `/auth`. Índice da infra: [`../README.md`](../README.md). Contexto completo de SSO:
> [`../../docs/sso-keycloak.md`](../../docs/sso-keycloak.md).

## O que sobe aqui

[`keycloak.yaml`](./keycloak.yaml) declara, no namespace `identity`:

| Recurso | Detalhe |
|---|---|
| `Namespace identity` | label `app.kubernetes.io/part-of: keycloak` |
| `Deployment keycloak` | `quay.io/keycloak/keycloak:26.0`, `args: ["start"]`, port `8080` (http) + `9000` (management) |
| `Deployment keycloak-postgres` + `PVC keycloak-pgdata` (1Gi) | `postgres:16`, strategy `Recreate`, banco persistente |
| `Service keycloak` / `keycloak-postgres` | ClusterIP `8080` / `5432` |
| `IngressRoute keycloak` | `PathPrefix(/auth)`, **sem strip** (priority `20`), middleware `compress` |

**Config-chave** (subpath atrás do Traefik/Cloudflare, TLS na borda):

- `KC_HOSTNAME=https://dev.nvit.com.br/auth` · `KC_HTTP_RELATIVE_PATH=/auth` (Keycloak já serve sob
  `/auth`, por isso **sem StripPrefix** no Traefik).
- `KC_PROXY_HEADERS=xforwarded` · `KC_HTTP_ENABLED=true` · `KC_HOSTNAME_STRICT=false` · `KC_HEALTH_ENABLED=true`.
- `KC_DB=postgres`, `KC_DB_URL=jdbc:postgresql://keycloak-postgres:5432/keycloak`.
- Probes em `:9000/auth/health/{ready,live}`.

## Realm e OIDC

- **Realm de aplicações:** `nvit`. **Issuer:** `https://dev.nvit.com.br/auth/realms/nvit`.
- **Discovery:** `…/auth/realms/nvit/.well-known/openid-configuration`.
- **Grupo:** `platform-admins` → mapeado para admin no Grafana, Argo CD e DevOps Console.
- **Usuário inicial:** `admin@nvit.com.br` (no grupo `platform-admins`).
- **Console admin do Keycloak:** `https://dev.nvit.com.br/auth/admin/` (realm `master`, usuário `admin`).

Onboardar um app/ferramenta ao SSO (criar client confidential, selar o secret, mapear `platform-admins`):
ver [`../../docs/sso-keycloak.md` §2](../../docs/sso-keycloak.md).

## Sealed Secrets

O Secret `keycloak-secrets` (admin bootstrap + credenciais do Postgres) **nunca** vai em plaintext.
Ele é versionado como SealedSecret cifrado em [`sealed-keycloak-secrets.yaml`](./sealed-keycloak-secrets.yaml)
e injetado via `envFrom.secretRef` nos dois Deployments. Chaves: `KC_BOOTSTRAP_ADMIN_USERNAME`,
`KC_BOOTSTRAP_ADMIN_PASSWORD`, `KC_DB_USERNAME`, `KC_DB_PASSWORD`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
`POSTGRES_DB`. Só o controller `kube-system/sealed-secrets-controller` decifra. Fluxo de selar/atualizar:
[`../../docs/sso-keycloak.md` §3](../../docs/sso-keycloak.md).

## GitOps

[`kustomization.yaml`](./kustomization.yaml) agrega `keycloak.yaml` + `sealed-keycloak-secrets.yaml`. A
Application [`../argocd/apps/keycloak.yaml`](../argocd/apps/keycloak.yaml) (descoberta pelo app-of-apps
`devops-platform`) sincroniza este diretório no namespace `identity` com `prune: true` + `selfHeal: true`.

## Operações comuns

```powershell
# Senha do admin bootstrap (Secret keycloak-secrets, base64)
kubectl -n identity get secret keycloak-secrets -o jsonpath="{.data.KC_BOOTSTRAP_ADMIN_PASSWORD}"

# Estado do Keycloak e do Postgres
kubectl get pods,svc,ingressroute -n identity

# Logs do Keycloak
kubectl logs -n identity deploy/keycloak
```

> Editar segredos (`sealed-keycloak-secrets.yaml`) ou trocar credenciais é operação **proibida sem
> processo** — siga o fluxo de Sealed Secrets; ver [`../../AGENTS.md` §5](../../AGENTS.md) e
> [`../../docs/standards/hard-constraints.md` §3](../../docs/standards/hard-constraints.md).

---
_Infra: [`../README.md`](../README.md) · SSO/segredos: [`../../docs/sso-keycloak.md`](../../docs/sso-keycloak.md) · Regras HARD: [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md)._
