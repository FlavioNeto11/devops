# FieldServe — Manual para Claude Code

> **Gerado pela FORGE 2.0** como prova de que a esteira gera **sistemas robustos** (nível SICAT),
> não só CRUD. Plataforma: [`../../CLAUDE.md`](../../CLAUDE.md). Catálogo de blocos:
> [`../../specs/forge/capabilities/`](../../specs/forge/capabilities/). Blocos resolvidos deste app:
> [`.forge/applied-capabilities.json`](./.forge/applied-capabilities.json).

## O que é

Gestão de **ordens de serviço de campo** multi-empresa. Exercita os blocos de capacidade:
`camadas-rigidas`, `migrations-versionadas`, `observabilidade`, **`worker-queue-transacional`**,
**`gateway-externo`**, `idempotencia`, `structured-outputs`, `ia-grafo`, `oidc-sessao`.

| Componente | O quê |
|---|---|
| `api/` | Express, camadas route→service→repository. Servido em `/fieldserve/api` (stripPrefix). |
| `api/` (worker) | mesma imagem (`npm run worker`): consome a fila transacional. |
| `mock-central/` | central externa SIMULADA (prova o gateway + retry/DLQ). |
| Postgres | dados multi-tenant + fila `jobs` (FOR UPDATE SKIP LOCKED) + `idempotency_keys`. |

## Fluxo que prova "robusto, não CRUD"
1. `POST /v1/work-orders/:id/submit` → marca `submitting` + **enfileira** (idempotente por `job_key`).
2. O **worker** faz claim transacional (`SKIP LOCKED`), chama o **gateway** (`gateways/dispatch-gateway.js`)
   com timeout + retry/backoff; na falha esgota tentativas → **DLQ** + ordem `failed`.
3. **Observabilidade**: `/health`, `/v1/health/jobs`, métricas Prometheus na **:9464**
   (`fieldserve_*`), ServiceMonitor + PrometheusRule SLO.

## Verificar
```bash
BASE_URL=http://nvit.localhost/fieldserve node apps/fieldserve/test/integration.mjs
kubectl get pods -n apps -l app.kubernetes.io/part-of=fieldserve
```

## Armadilhas
- `gateway-externo`: HTTP externo SÓ pelo `gateways/`. Nunca de `routes/`/`services/`.
- O worker é a **mesma imagem** da api (`command: npm run worker`).
- Observabilidade fica em `apps/fieldserve/k8s/**` (ServiceMonitor/PrometheusRule) — passa no guard.
- `oidc-sessao` está no plano (env `OIDC_*`/`SESSION_SECRET`); o login real exige um client no Keycloak
  (realm `nvit`) — wiring de código pronto, ativação depende do secret.
