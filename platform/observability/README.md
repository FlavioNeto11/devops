---
title: "Observabilidade — Métricas e Logs"
status: reference
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Observabilidade (`platform/observability/`)

> **Propósito:** métricas (Prometheus) e logs (Loki) da plataforma, visualizados no Grafana.
> **Namespace:** `observability`. Grafana servido atrás do Traefik em `/grafana`. Índice da infra:
> [`../README.md`](../README.md). Fronteiras de operação: [`../../AGENTS.md` §5](../../AGENTS.md).

## Componentes

| Componente | Chart | O que faz | Values |
|---|---|---|---|
| **Prometheus** (+ node-exporter, kube-state-metrics) | `kube-prometheus-stack` | coleta métricas do cluster e do host | [`prometheus-values.yaml`](./prometheus-values.yaml) |
| **Grafana** | sub-chart do `kube-prometheus-stack` | dashboards; datasources Prometheus + Loki | [`grafana-values.yaml`](./grafana-values.yaml) |
| **Loki** | `grafana/loki` (single-binary) | armazena logs (filesystem, PVC 2Gi) | [`loki-values.yaml`](./loki-values.yaml) |
| **Promtail** | `grafana/promtail` (instalado à parte) | coleta logs dos pods → `http://loki.observability:3100` | ver nota em [`loki-values.yaml`](./loki-values.yaml) |

> Prometheus + Grafana vêm do **mesmo** chart (`kube-prometheus-stack`): aplique
> `prometheus-values.yaml` **e** `grafana-values.yaml` juntos (`-f … -f …`). O Loki é um chart
> separado; o **Promtail** é instalado **separadamente** (este chart sobe só o Loki).

## Perfil enxuto (laboratório)

- **Prometheus** ([`prometheus-values.yaml`](./prometheus-values.yaml)): `alertmanager.enabled: false`;
  `retention: 2d`; sem `storageSpec` (emptyDir efêmero). Selectores com
  `serviceMonitorSelectorNilUsesHelmValues: false` (e pod/rule/probe) → raspa **todos** os
  ServiceMonitor/PodMonitor do cluster, não só os do chart.
- **Loki** ([`loki-values.yaml`](./loki-values.yaml)): `deploymentMode: SingleBinary`,
  `auth_enabled: false`, `storage: filesystem`, `retention_period: 72h`, PVC 2Gi; caches memcached e
  self-monitoring desabilitados; demais alvos de escala zerados.

## Grafana — SSO + admin

[`grafana-values.yaml`](./grafana-values.yaml) (bloco de topo `grafana:`):

- **Subpath:** `server.root_url: https://dev.nvit.com.br/grafana` + `serve_from_sub_path: true` (atrás
  do Traefik em `/grafana`).
- **SSO (Keycloak, realm `nvit`):** `auth.generic_oauth.enabled: true`, `client_id: grafana`,
  endpoints do issuer `…/auth/realms/nvit`, `use_pkce: true`. `role_attribute_path` mapeia o grupo
  `platform-admins` → `Admin` (demais → `Viewer`); `allow_assign_grafana_admin: true`.
  - **`login_attribute_path: email`** — usar o e-mail evita a colisão do `preferred_username` `admin`
    com o usuário interno do Grafana (quebraria o `user.sync`).
  - **clientSecret:** `envFromSecret: grafana-oidc` → `GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET`, vindo do
    SealedSecret [`sealed-grafana-oidc.yaml`](./sealed-grafana-oidc.yaml).
- **Admin local (fallback):** `adminPassword: "admin"` (trivial, **só laboratório**); o login form
  continua disponível. Em produção, usar `admin.existingSecret`.
- **Datasources:** Prometheus (criado pelo chart) + **Loki** (`http://loki.observability:3100`).
- **Sidecar de dashboards:** provisiona ConfigMaps com label `grafana_dashboard` (`searchNamespace: ALL`).
  Dashboards versionados em [`dashboards/`](./dashboards/) (ex.: `cluster-overview.json`) — ver
  [`dashboards/README.md`](./dashboards/README.md).

## Caveat — node-exporter no WSL2

No Docker Desktop (WSL2) o mount do rootfs do host (`/` → `/host/root`) falha com
*"path / is mounted on / but it is not a shared or slave mount"*, levando o pod a `CrashLoopBackOff`.
Por isso [`prometheus-values.yaml`](./prometheus-values.yaml) define
`prometheus-node-exporter.hostRootFsMount.enabled: false` — o node-exporter segue coletando via
`/proc` e `/sys` (métricas de filesystem do host ficam limitadas, aceitável no laboratório). Ver
[`../../TROUBLESHOOTING.md`](../../TROUBLESHOOTING.md) (seção 13).

> ⚠️ O ServiceMonitor do **Traefik** fica desabilitado por padrão (o Traefik é instalado antes da CRD
> `ServiceMonitor` existir); reative após subir a observabilidade — ver nota em
> [`../traefik/values.yaml`](../traefik/values.yaml).

## Operações comuns

```powershell
# Senha admin do Grafana (também provisionada via adminPassword no values)
kubectl -n observability get secret kube-prometheus-stack-grafana -o jsonpath="{.data.admin-password}"

# Estado da stack
kubectl get pods,svc -n observability

# Acesso: http://nvit.localhost/grafana  (login local admin/admin ou "Sign in with Keycloak")
```

> Reaplicar values (`helm upgrade`) em recurso vivo é operação **com aprovação** — ver
> [`../../AGENTS.md` §5](../../AGENTS.md).

---
_Infra: [`../README.md`](../README.md) · Dashboards: [`dashboards/README.md`](./dashboards/README.md) · WSL2: [`../../TROUBLESHOOTING.md`](../../TROUBLESHOOTING.md) · SSO: [`../../docs/sso-keycloak.md`](../../docs/sso-keycloak.md)._
