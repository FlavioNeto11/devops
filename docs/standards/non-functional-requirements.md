---
title: "Requisitos Não-Funcionais (NFR) — Plataforma DevOps Local"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Requisitos Não-Funcionais (NFR) — Plataforma DevOps Local

> Padrões transversais de **qualidade** que toda app da plataforma deve respeitar.
> Os números abaixo são **reconciliados com o que já está implantado** (não aspiracionais):
> servem de _default_ e de teto/piso ao desenhar um serviço novo. Regras operacionais
> derivadas destes números vivem em [`infra-standards.md`](./infra-standards.md).

## 1. Recursos (requests/limits) por tipo de serviço

`requests` = o que o scheduler reserva; `limits` = teto rígido. Valores de partida por tipo
(ajuste para cima só com evidência de uso real no Grafana):

| Tipo | CPU req | Mem req | CPU lim | Mem lim | Exemplo no cluster |
|---|---|---|---|---|---|
| `frontend` (SPA nginx) | 25m | 64–128Mi | 250m | 256Mi | `console-frontend`, `rmambiental-frontend` |
| `frontend` (SSR/Next.js) | 25m | 192Mi | 700m | 768Mi | `gymops-web` |
| `api` | 25–50m | 160–256Mi | 700m–1 | 512Mi–1Gi | `sicat-api`, `gymops-api` |
| `worker` | 10–50m | 128–256Mi | 400m–1 | 384Mi–1Gi | `sicat-worker`, `gymops-worker` |
| `db` (Postgres) | 25m | 128Mi | 500m | 512Mi | `gymops-postgres`, `sicat-postgres` |
| `cache` (Redis) | 10m | 32Mi | 200m | 128Mi | `gymops-redis` |

Regra: **todo container declara `resources.requests` e `resources.limits`**. Sem isso o pod
entra como BestEffort e é o primeiro a ser despejado sob pressão.

## 2. Health probes

- **`api`/`worker`**: endpoint `GET /health` (200 quando pronto). Worker sem HTTP expõe um
  `/health` mínimo (worker-health) ou usa `exec` probe.
- **`frontend`**: `GET /healthz` (nginx) ou a rota base.
- **readiness** com `initialDelaySeconds` pequeno (3–5s) e **liveness** mais folgada.
- **Migração no boot**: serviços que rodam migração no start usam `failureThreshold` **alto** na
  readiness para não serem mortos durante a migração (ex.: `sicat-api` usa `failureThreshold: 18`).

## 3. SLOs (apropriados ao laboratório single-node)

Este é um cluster **single-node** (Docker Desktop) — **sem HA**. Os alvos são best-effort:

- Disponibilidade: best-effort, **1 réplica** por serviço (sem PodDisruptionBudget útil em replica=1).
- Latência: `p95` de `GET /health` **< 300 ms**; primeira página útil do frontend **< 1,5 s**.
- Erro: 5xx sustentado em qualquer rota é incidente → ver [`runbooks/`](../runbooks/).
- Recuperação: pods se recriam sozinhos; o estado real (dados) está nos **PVCs** (ver §6).

> Em produção real (multi-node) estes alvos sobem para HA (≥2 réplicas, PDB, anti-affinity).
> A migração para esse cenário está fora do escopo do lab.

## 4. Observabilidade

- Métricas: kube-prometheus-stack (ns `observability`); retenção em
  [`platform/observability/prometheus-values.yaml`](../../platform/observability/prometheus-values.yaml).
- Logs: Loki/Promtail; retenção em
  [`platform/observability/loki-values.yaml`](../../platform/observability/loki-values.yaml).
- Dashboards: Grafana (`/grafana`); ver [`platform/observability/grafana-values.yaml`](../../platform/observability/grafana-values.yaml).
- Toda app **emite logs estruturados em stdout/stderr** (sem arquivos de log locais).
- Toda app expõe `/health`; quando fizer sentido, expõe métricas Prometheus em `/metrics`.

## 5. Segurança (baseline obrigatório)

- Containers **não-root** (`runAsNonRoot: true`, `runAsUser: 1000`), `allowPrivilegeEscalation: false`,
  `capabilities: drop: [ALL]`. Exemplar: `console/k8s/backend-deployment.yaml`.
- **Nenhum segredo em imagem nem em git**: Sealed Secrets (`kubeseal`) versiona o cifrado; o real
  nunca em plaintext. Segredo de build (ex.: índice RAG do SICAT) entra via **BuildKit `--secret`**,
  nunca como `COPY`/`ARG`.
- **RBAC mínimo**: ServiceAccounts só com o que precisam. Exemplar: `console-readonly` (só `get/list/watch`).
- **SSO**: OIDC no realm `nvit` (Keycloak). App com login próprio integra de forma **aditiva**
  (padrão SICAT: backend valida no `/userinfo` + emite a própria sessão). Ver [`sso-keycloak.md`](../sso-keycloak.md).
- Detalhes e escopos em [`SECURITY.md`](../../SECURITY.md).

## 6. Backup & recuperação (lab)

- Cada app com estado tem **Postgres com PVC** próprio.
- Backup: runbook de `pg_dump` (ver [`runbooks/`](../runbooks/)). Não há backup automático no lab.
- O cluster é **descartável/re-semeável**: `reset-platform.ps1` + `up.ps1` reconstroem a base;
  dados de demonstração vêm de `seed`. Não guarde no lab dado que não possa ser re-semeado.

## 7. Performance & escala (lab)

- 1 réplica por serviço; escalar horizontalmente não é suportado em nó único para apps com estado local.
- Imagens `:local` com `imagePullPolicy: IfNotPresent` (sem ida ao registry no lab).
- Builds reprodutíveis: lockfile + multi-stage; frontends buildados com base path `/<app>/`.

---
_Referências: [`infra-standards.md`](./infra-standards.md) (regras derivadas), [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`SECURITY.md`](../../SECURITY.md)._
