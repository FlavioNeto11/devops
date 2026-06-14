---
title: "Arquitetura da Plataforma DevOps Local"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Arquitetura da Plataforma DevOps Local

Este documento descreve em detalhe os componentes da plataforma, o fluxo completo da
esteira (do `devops.yaml` ao Console em tempo real), os namespaces, a convencao de
roteamento/strip-prefix, as portas e como as imagens fluem (local `:local` vs GHCR).

> Para a visao geral e o Quick Start, veja [`README.md`](./README.md).

---

## 1. Componentes

### 1.1 Cluster Kubernetes (Docker Desktop)
- Kubernetes embutido do **Docker Desktop**, rodando no host **Windows Server
  Datacenter x64**.
- Contexto kube: **`docker-desktop`**. Todos os scripts assumem esse contexto.
- Single-node: control-plane e workload no mesmo no.

### 1.2 Ingress Controller — Traefik
- Instalado via **Helm** no namespace **`traefik`**.
- Entrypoints: **`web`** (porta 80) e **`websecure`** (porta 443).
- Usa as **CRDs do Traefik** (`apiVersion: traefik.io/v1alpha1`):
  - **`IngressRoute`** — define rotas por `PathPrefix` e `priority`.
  - **`Middleware`** — define o `StripPrefix` para APIs/worker.
- Rotas locais usam `entryPoints: [web]` (HTTP). HTTPS (`websecure`) fica pendente
  (self-signed) — ver [`SECURITY.md`](./SECURITY.md).

### 1.3 Registry de imagens — GHCR
- **GitHub Container Registry**: `ghcr.io/flavioneto11/<app>/<service>:<tag>`.
- Namespace sempre em **minusculo**: `flavioneto11`.
- Tags publicadas pela esteira: **SHA do commit** (canonica), **tag de branch** e
  **`latest`**.
- No laboratorio, o GHCR e **opcional**: a `aplicacao1` e o Console rodam com imagens
  **locais** `:local` (ver secao 6).

### 1.4 CI/CD — GitHub Actions + runner self-hosted
- **GitHub Actions**: workflow disparado no `push` (e/ou alteracoes no `devops.yaml`).
- **Runner self-hosted**: roda na **propria maquina** (host Windows), como **servico**,
  o que da acesso ao Docker local e ao cluster `docker-desktop`.
- Etapas: build com **`docker buildx`** → push para **GHCR** → deploy com
  **`helm`/`kubectl apply`**, anotando o `Deployment` com metadados da esteira.

### 1.5 GitOps (opcional) — Argo CD
- Instalado no namespace **`argocd`**.
- Servido sob subpath: `argocd server --insecure` com **rootpath `/argocd`**.
- Permite reconciliacao declarativa dos manifests (auto-sync e evolucao futura).

### 1.6 Observabilidade — Prometheus, Grafana, Loki, Promtail
- Namespace **`observability`**.
- **Prometheus**: coleta de metricas.
- **Grafana**: dashboards, servido sob subpath (`serve_from_sub_path=true`,
  `root_url=.../grafana`), acessivel em `/grafana`.
- **Loki + Promtail**: agregacao de logs dos pods (Promtail coleta, Loki armazena/consulta).

### 1.7 DevOps Console (somente leitura)
- **Backend**: Node.js (**Express** + **`@kubernetes/client-node`**), **somente
  leitura**, com **SSE** (Server-Sent Events) para atualizacoes em tempo real.
- **Frontend**: **React + Vite**, build com base **`/devops/`**.
- Roda no namespace **`devops-system`** com **RBAC restrito**: `ServiceAccount` +
  `ClusterRole` com apenas `get`/`list`/`watch` (**sem** `create`/`update`/`delete`).
- Rotas: `/devops` (frontend, sem strip) e `/devops/api` (backend, com StripPrefix).

---

## 2. Fluxo da esteira (diagrama textual)

```
                         ┌──────────────────────────────────────────────┐
                         │  Desenvolvedor edita devops.yaml + codigo      │
                         │  git push  →  github.com/FlavioNeto11/devops   │
                         └───────────────────────┬──────────────────────┘
                                                 │ (push / mudanca no devops.yaml)
                                                 ▼
                         ┌──────────────────────────────────────────────┐
                         │  GitHub Actions (workflow)                     │
                         │  • le devops.yaml (app, services, paths)       │
                         │  • matriz de services a buildar                │
                         └───────────────────────┬──────────────────────┘
                                                 │ jobs agendados no...
                                                 ▼
                         ┌──────────────────────────────────────────────┐
                         │  Runner self-hosted (host Windows, servico)    │
                         │  • docker buildx build (por service)           │
                         │  • tags: <sha>, <branch>, latest               │
                         └───────────────────────┬──────────────────────┘
                                                 │ docker push
                                                 ▼
                         ┌──────────────────────────────────────────────┐
                         │  GHCR  ghcr.io/flavioneto11/<app>/<svc>:<sha>  │
                         └───────────────────────┬──────────────────────┘
                                                 │ (mesmo runner) deploy
                                                 ▼
                         ┌──────────────────────────────────────────────┐
                         │  helm/kubectl apply no contexto docker-desktop │
                         │  • Deployment ANOTADO (sha, branch, autor,     │
                         │    timestamp da esteira)                       │
                         │  • Service + IngressRoute + Middleware         │
                         └───────────────────────┬──────────────────────┘
                                                 │ rollout
                                                 ▼
                         ┌──────────────────────────────────────────────┐
                         │  Traefik publica as rotas (web:80)             │
                         │  /aplicacao1 → frontend (sem strip)            │
                         │  /aplicacao1/api → api (StripPrefix)           │
                         └───────────────────────┬──────────────────────┘
                                                 │ watch (get/list/watch)
                                                 ▼
                         ┌──────────────────────────────────────────────┐
                         │  DevOps Console (backend SSE → frontend React) │
                         │  mostra Deployments/Pods/rotas EM TEMPO REAL   │
                         │  http://nvit.localhost/devops                  │
                         └──────────────────────────────────────────────┘
```

No laboratorio (imagens `:local`), as etapas de **push GHCR** sao puladas: o
`publish-app.ps1` builda localmente e o deploy usa `imagePullPolicy: IfNotPresent`.

---

## 3. Namespaces

Todos os namespaces sao criados pela plataforma (pelo `bootstrap.ps1`).

| Namespace          | Proposito                                                                 |
|--------------------|--------------------------------------------------------------------------|
| `devops-system`    | DevOps Console (backend + frontend) e o `ServiceAccount`/RBAC de leitura. |
| `traefik`          | Ingress Controller Traefik e suas CRDs (`IngressRoute`, `Middleware`).   |
| `argocd`           | Argo CD (servidor, repo-server, controller) servido em `/argocd`.        |
| `observability`    | Prometheus, Grafana, Loki, Promtail.                                      |
| `apps`             | Aplicacoes do laboratorio (default), incluindo a `aplicacao1`.           |
| `apps-dev`         | Variante de ambiente de desenvolvimento das aplicacoes.                  |
| `apps-prod-local`  | Variante "producao local" das aplicacoes (ainda no cluster local).       |

---

## 4. Roteamento e strip-prefix

### 4.1 Convencao (critica e consistente em todos os arquivos)

| Tipo de servico   | `expose` | `stripPrefix` | Comportamento                                                                                   |
|-------------------|----------|---------------|-------------------------------------------------------------------------------------------------|
| Frontend (SPA)    | `true`   | **`false`**   | Servido no subpath; build com base `/<basePath>/` (ex.: `VITE_BASE_PATH=/aplicacao1/`).        |
| API / api2 / worker | `true` | **`true`**    | `Middleware` StripPrefix remove o prefixo COMPLETO (basePath+path); o processo ve rota na raiz. |

### 4.2 Prioridade

- No mesmo host, o `PathPrefix` mais **especifico/longo** deve vencer.
- Definimos **`priority` explicito** na `IngressRoute` para que `/<base>/api` tenha
  prioridade **MAIOR** que `/<base>`.
- O Traefik tambem usa o tamanho da regra para desempate, mas o `priority` explicito
  evita ambiguidade.

### 4.3 Tabela de rotas (host unico)

Host local: `nvit.localhost` | Host real futuro: `dev.nvit.com.br`.

| Path                  | Service               | StripPrefix              | Prioridade relativa | Notas                                              |
|-----------------------|-----------------------|--------------------------|---------------------|----------------------------------------------------|
| `/devops`             | `console-frontend`    | NAO                      | baixa               | SPA base `/devops/`.                               |
| `/devops/api`         | `console-backend`     | SIM (`/devops/api`)      | alta                | API somente leitura (SSE).                         |
| `/argocd`             | Argo CD `server`      | NAO                      | -                   | `--insecure`, rootpath `/argocd`.                  |
| `/grafana`            | Grafana               | NAO                      | -                   | `serve_from_sub_path`, `root_url=.../grafana`.     |
| `/aplicacao1`         | `aplicacao1-frontend` | NAO                      | baixa               | SPA `VITE_BASE_PATH=/aplicacao1/`.                 |
| `/aplicacao1/api`     | `aplicacao1-api`      | SIM (`/aplicacao1/api`)  | alta                | Backend ve `/health` para `/aplicacao1/api/health`.|
| `/aplicacao1/worker`  | `aplicacao1-worker`   | SIM (`/aplicacao1/worker`)| alta               | Health do worker (opcional).                       |

---

## 5. Portas

| Porta | Componente            | Entrypoint / uso                                           |
|-------|-----------------------|-----------------------------------------------------------|
| 80    | Traefik               | Entrypoint `web` (HTTP) — todas as rotas locais.          |
| 443   | Traefik               | Entrypoint `websecure` (HTTPS) — pendente (self-signed).  |
| 8080  | Console backend       | Porta interna do container (exemplo); exposta via Service. |
| 80    | Console frontend (nginx) | Porta interna do container que serve a SPA.            |
| 3000  | Grafana               | Porta interna do container; exposta via Service.          |
| 9090  | Prometheus            | Porta interna do container; exposta via Service.          |
| 3100  | Loki                  | Porta interna do container; exposta via Service.          |
| 8080  | Argo CD server        | Porta interna (`--insecure`); exposta via Service.        |

> As portas internas dos containers da `aplicacao1` sao definidas no campo `port` de
> cada service no `devops.yaml`. Para o host, apenas **80** e **443** (Traefik) sao
> publicadas.

---

## 6. Como as imagens fluem (local `:local` vs GHCR)

### 6.1 Imagens LOCAIS do laboratorio (NAO enviadas ao registry)
Buildadas localmente pelo `publish-app.ps1`, com `imagePullPolicy: IfNotPresent`:

| Aplicacao    | Imagens locais                                                        |
|--------------|----------------------------------------------------------------------|
| `aplicacao1` | `aplicacao1-frontend:local`, `aplicacao1-api:local`, `aplicacao1-worker:local` |
| Console      | `console-backend:local`, `console-frontend:local`                    |

Fluxo: `docker build -t <imagem>:local` no host → o Kubernetes do Docker Desktop usa o
**mesmo daemon Docker**, entao a imagem ja esta disponivel localmente → o pod sobe com
`IfNotPresent` (nao tenta puxar do registry).

### 6.2 Imagens via GHCR (esteira completa, opcional no lab)
Buildadas e publicadas pelo GitHub Actions + runner self-hosted:

```
ghcr.io/flavioneto11/<app>/<service>:<sha>     # canonica (SHA do commit)
ghcr.io/flavioneto11/<app>/<service>:<branch>  # tag de branch
ghcr.io/flavioneto11/<app>/<service>:latest    # conveniencia
```

Fluxo: `docker buildx build --push` → GHCR → `kubectl set image`/`helm upgrade`
referenciando a tag por **SHA** (deploy imutavel e rastreavel). Requer login no GHCR
com PAT (`write:packages`/`read:packages`) — ver [`SECURITY.md`](./SECURITY.md).

---

## 7. Descritor canonico — `devops.yaml`

Schema usado por templates e esteira:

```yaml
app:
  name: aplicacao1          # nome da aplicacao
  namespace: apps           # namespace de deploy
  host: nvit.localhost      # host (local) / dev.nvit.com.br (real)
  basePath: aplicacao1      # subpath base (sem barras)
services:
  frontend:                 # serviceName -> definicao
    type: frontend          # frontend | api | worker | api2
    path: /                 # path relativo ao basePath
    image: aplicacao1-frontend:local
    port: 80
    expose: true
    stripPrefix: false      # frontend NUNCA faz strip
    env:
      VITE_BASE_PATH: /aplicacao1/
    health:
      path: /
  api:
    type: api
    path: /api
    image: aplicacao1-api:local
    port: 8080
    expose: true
    stripPrefix: true       # API SEMPRE faz strip do prefixo completo
    env: {}
    health:
      path: /health
```

A partir desse descritor, os `templates/` geram `Deployment`, `Service`, `IngressRoute`
e `Middleware` coerentes com a convencao de roteamento descrita na secao 4.
