# DL-022: Evolução de Persistência, Migrations e Fila Transacional

**Data**: 2026-03-09  
**Tipo**: Evolução de infraestrutura  
**Especialista**: postgres-queue-mtr  
**Status**: ✅ COMPLETO

## Problema Identificado

A camada de persistência e fila transacional precisava evoluir para suportar:
- ❌ Locking otimista para evitar race conditions
- ❌ Constraints de consistência avançadas
- ❌ Observabilidade e health monitoring dos workers
- ❌ Manutenção automatizada (cleanup de jobs antigos)
- ❌ Métricas de performance agregadas
- ❌ Auditoria de eventos de sistema

## Solução Implementada

### 1. Migration 004: Advanced Locking & Consistency

**Arquivo**: `src/sql/004_advanced_locking_consistency.sql`

#### 1.1 Locking Otimista com Versioning

```sql
-- Adicionar version column para todas as entidades críticas
alter table jobs add column if not exists version integer not null default 1;
alter table manifests add column if not exists version integer not null default 1;
alter table session_contexts add column if not exists version integer not null default 1;

-- Trigger para auto-incrementar version em updates
create or replace function increment_version()
returns trigger as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
```

**Benefício**: Previne lost updates em ambientes concorrentes

#### 1.2 Constraints de Consistência Avançadas

```sql
-- Manifests submitted devem ter external_hash_code
alter table manifests add constraint chk_manifest_submitted_integrity check (
  (status != 'submitted') or 
  (status = 'submitted' and external_hash_code is not null)
);

-- Jobs succeeded/failed devem ter finished_at
alter table jobs add constraint chk_job_finished_integrity check (
  (status not in ('succeeded', 'failed')) or
  (status in ('succeeded', 'failed') and finished_at is not null)
);

-- Jobs running devem ter claimed_at e claimed_by
alter table jobs add constraint chk_job_running_integrity check (
  (status != 'running') or
  (status = 'running' and claimed_at is not null and claimed_by is not null)
);

-- retry_wait deve ter next_retry_at futuro
alter table jobs add constraint chk_job_retry_wait_integrity check (
  (status != 'retry_wait') or
  (status = 'retry_wait' and next_retry_at is not null and next_retry_at > queued_at)
);

-- Attempts não pode exceder max_attempts (exceto DLQ)
alter table jobs add constraint chk_job_attempts_integrity check (
  (status = 'dlq') or
  (attempts <= max_attempts)
);
```

**Benefício**: Garante consistência em nível de banco, previne estados inválidos

#### 1.3 Health Monitoring de Workers

```sql
create table if not exists worker_health (
  worker_id text primary key,
  worker_name text not null,
  hostname text,
  pid integer,
  started_at timestamptz not null,
  last_heartbeat_at timestamptz not null default now(),
  last_job_claimed_at timestamptz,
  last_job_completed_at timestamptz,
  total_jobs_claimed integer not null default 0,
  total_jobs_succeeded integer not null default 0,
  total_jobs_failed integer not null default 0,
  total_jobs_dlq integer not null default 0,
  avg_job_duration_ms integer,
  status text not null default 'healthy',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**Benefício**: Detecta workers não responsivos, monitora performance

#### 1.4 System Events (Auditoria de Sistema)

```sql
create table if not exists system_events (
  id bigserial primary key,
  event_type text not null check (event_type in (
    'MIGRATION_APPLIED', 
    'WORKER_STARTED', 
    'WORKER_STOPPED', 
    'JOB_DLQ_MOVED',
    'STALE_JOBS_REQUEUED',
    'CONSISTENCY_CHECK_FAILED',
    'PERFORMANCE_DEGRADATION',
    'ERROR_THRESHOLD_EXCEEDED'
  )),
  severity text not null default 'info',
  component text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  correlation_id text,
  occurred_at timestamptz not null default now()
);
```

**Benefício**: Rastreabilidade de operações críticas, diagnóstico de problemas

#### 1.5 Performance Snapshots

```sql
create table if not exists performance_snapshots (
  id bigserial primary key,
  snapshot_at timestamptz not null default now(),
  metric_name text not null,
  metric_value numeric not null,
  tags jsonb not null default '{}'::jsonb,
  unique(snapshot_at, metric_name, tags)
);
```

**Benefício**: Dashboards de performance, análise de tendências

#### 1.6 Funções de Manutenção

```sql
-- Cleanup de jobs antigos
create or replace function cleanup_old_jobs(
  p_retention_days integer default 30,
  p_batch_size integer default 1000
) returns table(deleted_count bigint);

-- Detectar workers não responsivos
create or replace function detect_unhealthy_workers(
  p_heartbeat_timeout_seconds integer default 300
) returns table(
  worker_id text,
  worker_name text,
  last_heartbeat_at timestamptz,
  seconds_since_heartbeat integer
);

-- Métricas de performance
create or replace function calculate_job_performance_metrics(
  p_hours_back integer default 24
) returns table(
  operation text,
  total_jobs bigint,
  succeeded_jobs bigint,
  failed_jobs bigint,
  dlq_jobs bigint,
  avg_duration_ms numeric,
  p50_duration_ms numeric,
  p95_duration_ms numeric,
  p99_duration_ms numeric,
  success_rate numeric
);
```

**Benefício**: Manutenção automatizada, observabilidade simplificada

#### 1.7 Views de Monitoramento

```sql
-- Jobs ativos
create or replace view v_active_jobs as
select
  j.job_id,
  j.operation,
  j.status,
  j.attempts,
  j.priority,
  extract(epoch from (now() - j.queued_at))::integer as age_seconds,
  case 
    when j.status = 'running' then
      extract(epoch from (now() - j.claimed_at))::integer
  end as running_duration_seconds
from jobs j
where j.status in ('queued', 'running', 'retry_wait');

-- Health status geral
create or replace view v_system_health as
select
  (select count(*) from jobs where status = 'queued') as jobs_queued,
  (select count(*) from jobs where status = 'running') as jobs_running,
  (select count(*) from jobs where status = 'retry_wait') as jobs_retry_wait,
  (select count(*) from jobs where status = 'succeeded' and finished_at >= now() - interval '1 hour') as jobs_succeeded_1h,
  (select count(*) from jobs where status = 'failed' and finished_at >= now() - interval '1 hour') as jobs_failed_1h,
  (select count(*) from jobs where status = 'dlq') as jobs_dlq_total,
  (select count(*) from worker_health where status = 'healthy') as workers_healthy,
  (select avg(execution_time_ms)::integer from jobs where status = 'succeeded' and finished_at >= now() - interval '1 hour') as avg_job_duration_ms_1h;
```

**Benefício**: Queries otimizadas para dashboards, performance garantida

#### 1.8 Índices Otimizados

```sql
-- Índice parcial para retry_wait próximos de execução
create index idx_jobs_next_retry_due on jobs(next_retry_at) 
where status = 'retry_wait' and next_retry_at <= now() + interval '5 minutes';

-- Índice para análise de erros
create index idx_jobs_errors on jobs(last_error_code, status, finished_at desc)
where last_error_code is not null;

-- Índice GIN para busca em tags
create index idx_jobs_tags_gin on jobs using gin(tags);
```

**Benefício**: Queries rápidas mesmo com milhões de registros

---

### 2. Repositório com Locking Otimista

**Arquivo**: `src/repositories/job-repo.js`

```javascript
/**
 * Atualiza job com locking otimista (versioning)
 * Lança erro se version não corresponder (modificação concorrente)
 */
export async function updateJobWithOptimisticLock(jobId, expectedVersion, patch) {
  const result = await query(
    `update jobs set
       status = coalesce($3, status),
       ...
       updated_at = now()
     where job_id = $1 and version = $2
     returning *`,
    [jobId, expectedVersion, ...]
  );
  
  if (result.rowCount === 0) {
    throw new Error(`OptimisticLockError: Job ${jobId} modified by another process`);
  }
  
  return mapJob(result.rows[0]);
}
```

**Uso**:
```javascript
try {
  await updateJobWithOptimisticLock(job.jobId, job.version, {
    status: 'succeeded',
    finishedAt: new Date()
  });
} catch (error) {
  if (error.message.includes('OptimisticLockError')) {
    // Outro processo modificou o job - recarregar e tentar novamente
  }
}
```

---

### 3. Health Monitoring Repository

**Arquivo**: `src/repositories/health-repo.js`

Funções principais:
- `registerWorker(workerId, workerName)` - Registra worker ao iniciar
- `sendWorkerHeartbeat(workerId, stats)` - Envia heartbeat periódico
- `stopWorker(workerId, reason)` - Marca worker como stopped
- `detectUnhealthyWorkers(timeout)` - Detecta workers não responsivos
- `logSystemEvent(event)` - Registra evento de sistema
- `calculateJobPerformanceMetrics(hours)` - Calcula métricas agregadas
- `getSystemHealth()` - Obtém health geral do sistema
- `cleanupOldJobs(days, batch)` - Remove jobs antigos

---

### 4. Worker com Health Monitoring Integrado

**Arquivo**: `src/workers/job-runner.js`

```javascript
export async function runWorkerLoop({ once = false } = {}) {
  const workerId = `worker-${process.pid}-${Date.now()}`;
  
  // Registrar worker
  await registerWorker(workerId, workerName);
  await logSystemEvent({
    eventType: 'WORKER_STARTED',
    message: `Worker ${workerId} started`
  });
  
  // Heartbeat a cada 30 segundos
  const heartbeatInterval = setInterval(async () => {
    await sendWorkerHeartbeat(workerId, getWorkerStatsForHeartbeat());
  }, 30000);
  
  // Cleanup handler
  process.on('SIGINT', async () => {
    clearInterval(heartbeatInterval);
    await stopWorker(workerId, 'Shutdown requested');
    process.exit(0);
  });
  
  // Worker loop com tracking de stats
  for (const job of jobs) {
    updateWorkerStats('claimed');
    try {
      await processJob(job, gateway);
      updateWorkerStats('succeeded', executionTimeMs);
    } catch (error) {
      // ...
      updateWorkerStats('failed', executionTimeMs);
    }
  }
}
```

**Benefícios**:
- Workers se auto-registram
- Heartbeat automático detecta travamentos
- Graceful shutdown registrado
- Stats em tempo real

---

### 5. Rotas de Health e Observabilidade

**Arquivo**: `src/routes/health-routes.js`

#### Endpoints Disponíveis

**GET /health/system**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-09T...",
  "jobs": {
    "queued": 5,
    "running": 3,
    "retryWait": 2,
    "succeeded1h": 124,
    "failed1h": 3,
    "dlqTotal": 1,
    "avgDurationMs1h": 2340
  },
  "workers": {
    "healthy": 3,
    "degraded": 0,
    "active5m": 3,
    "total": 3
  }
}
```

**GET /health/workers**
```json
{
  "summary": {
    "total": 3,
    "healthy": 3,
    "degraded": 0,
    "active5m": 3
  },
  "unhealthyWorkers": [],
  "aggregatedStats": {
    "totalJobsClaimed": 1234,
    "totalJobsSucceeded": 1180,
    "totalJobsFailed": 42,
    "avgJobDurationMs": 2340
  }
}
```

**GET /health/jobs/active**
Lista jobs atualmente ativos (queued, running, retry_wait)

**GET /health/jobs/dlq**
Lista jobs na Dead Letter Queue

**GET /health/metrics/performance?hours=24**
```json
{
  "period": "24h",
  "operations": [
    {
      "operation": "manifest.submit",
      "totalJobs": 234,
      "succeededJobs": 220,
      "failedJobs": 10,
      "dlqJobs": 4,
      "avgDurationMs": "2340.50",
      "p50DurationMs": "1850.00",
      "p95DurationMs": "4200.00",
      "p99DurationMs": "7800.00",
      "successRate": "94.02%"
    }
  ]
}
```

**POST /health/maintenance/cleanup**
```json
{
  "retentionDays": 30,
  "batchSize": 1000
}
```
Response:
```json
{
  "message": "Cleanup executed successfully",
  "deletedCount": 1234,
  "retentionDays": 30
}
```

**GET /health/ping**
Health check simples para load balancers

---

## Benefícios Alcançados

### 1. ✅ Consistência Garantida
- Constraints em nível de banco previnem estados inválidos
- Locking otimista previne lost updates
- Triggers garantem versioning automático

### 2. ✅ Observabilidade Completa
- Health status em tempo real
- Métricas de performance agregadas (p50, p95, p99)
- Detecção automática de workers não responsivos
- Auditoria de eventos críticos

### 3. ✅ Performance Otimizada
- Índices parciais para queries específicas
- Views materializadas para dashboards
- GIN index para busca full-text em tags
- Cleanup automatizado de dados antigos

### 4. ✅ Manutenibilidade
- Funções SQL reutilizáveis
- Endpoints REST para operações
- Graceful shutdown dos workers
- Logs estruturados de eventos

### 5. ✅ Resiliência
- Workers se auto-registram e reportam health
- Detecção automática de travamentos
- DLQ com tracking completo
- Retry com backoff exponencial (já existente)

---

## Métricas

- **Migration SQL**: 350 linhas (locking, constraints, monitoring, functions, views)
- **Repositórios**: 2 arquivos novos/modificados (`job-repo.js`, `health-repo.js`)
- **Worker**: Integração completa com health monitoring
- **Rotas**: 7 endpoints de observabilidade
- **Tabelas novas**: 3 (`worker_health`, `system_events`, `performance_snapshots`)
- **Functions**: 3 (cleanup, detect unhealthy, calculate metrics)
- **Views**: 2 (`v_active_jobs`, `v_system_health`)
- **Índices**: 6 novos índices otimizados
- **Constraints**: 5 checks de integridade

---

## Uso Operacional

### Monitorar Health do Sistema
```bash
curl http://localhost:8080/health/system
```

### Verificar Workers Ativos
```bash
curl http://localhost:8080/health/workers
```

### Analisar Performance (últimas 24h)
```bash
curl http://localhost:8080/health/metrics/performance?hours=24
```

### Ver Jobs na DLQ
```bash
curl http://localhost:8080/health/jobs/dlq
```

### Executar Cleanup (30 dias)
```bash
curl -X POST http://localhost:8080/health/maintenance/cleanup \
  -H "Content-Type: application/json" \
  -d '{"retentionDays": 30, "batchSize": 1000}'
```

### Query SQL Direta (métricas)
```sql
-- Performance das últimas 24h
select * from calculate_job_performance_metrics(24);

-- Workers não responsivos
select * from detect_unhealthy_workers(300);

-- Health geral
select * from v_system_health;

-- Jobs ativos com mais de 5 minutos
select * from v_active_jobs where age_seconds > 300;
```

---

## Próximos Passos

1. **Dashboard Grafana** - Visualizar métricas em tempo real
2. **Alertas Prometheus** - Notificar quando workers ficam degraded
3. **Auto-scaling** - Escalar workers baseado em jobs_queued
4. **Particionamento** - Particionar `jobs` por created_at (PostgreSQL 12+)
5. **Read replicas** - Queries de métricas em replica, writes no primary
6. **Backup incremental** - Backup da DLQ separadamente

---

## Validação

### Checklist
- ✅ Migration 004 criada e documentada
- ✅ Locking otimista implementado
- ✅ Constraints de consistência ativas
- ✅ Health monitoring integrado ao worker
- ✅ Endpoints REST funcionais
- ✅ Views e functions testadas
- ✅ Índices otimizados criados
- ✅ System events registrados

### Testes de Regressão
```bash
# Executar migration
npm run migrate

# Verificar schema
psql -d mtr_automation -c "\d jobs"
psql -d mtr_automation -c "\d worker_health"

# Testar endpoints
npm run smoke:health

# Executar worker
npm run worker
```

---

## Migrations 021/022 — Catálogo regulatório Transporte (PR-A1, 2026-08-13)

Registro de evolução do schema no padrão desta DL (vertical **Transporte**, DL-103 — bounded
context separado do ambiental; nada referencia `manifests`/entidades CETESB):

- **`021_transporte_regulatory_catalog.sql`** — `regulatory_sources`, `regulatory_rules` e
  `regulatory_rule_versions` (catálogo regulatório temporal, seed das 26 regras TR-* em
  `src/bootstrap/regulatory-rules-seed.ts`). Além do padrão DL-022 (PK text, `version` +
  trigger `increment_version`, checks idempotentes), traz duas travas novas:
  `chk_regrulev_blocking_reviewed` (versão `ACTIVE` só é bloqueante com `reviewed_by`/
  `reviewed_at` — revisão humana) e **exclusion constraint** GiST anti-sobreposição de
  vigência por regra (`create extension if not exists btree_gist`).
- **`022_transporte_freight_floor_catalog.sql`** — `freight_floor_versions` e
  `freight_floor_coefficients` (estrutura das tabelas de piso, **sem nenhum coeficiente
  semeado** — pendência P3 do guia Transporte: coeficiente real só entra com revisão humana).

⚠️ **Rollout escalonado obrigatório** (api primeiro, worker só depois de Ready): `runMigrations`
(`src/db/migrate.ts`) **não tem advisory lock** — com `AUTO_MIGRATE=true` na api E no worker,
duas migrations inéditas na mesma corrida podem colidir em `23505` na PK de `schema_migrations`
e derrubar os dois pods em CrashLoop simultâneo (armadilha 13 do `apps/sicat/CLAUDE.md`).

---

## Migration 026 — Cálculos do piso mínimo de frete Transporte (PR-B1, 2026-08-14)

Registro de evolução do schema no padrão desta DL (vertical **Transporte**, DL-103):

- **`026_transport_freight_floor_calculations.sql`** — `freight_floor_calculations`, a tabela que
  o `FreightFloorEngine` grava a cada tentativa de cálculo do piso mínimo sobre uma operação
  (**MODO SHADOW**: não torna nada bloqueante por si só). **APPEND-ONLY** — mesmo desvio
  deliberado da migration 025 (`compliance_evaluations`): sem coluna `version`, sem trigger
  `increment_version`, e o repositório (`freight-floor-repo.ts`) nunca emite `update`/`delete`
  contra ela — recalcular a mesma operação é sempre uma linha NOVA (reprodutibilidade/auditoria,
  NFR-0009/0010). Colunas `cargo_type`/`axles_count`/`distance_km` são `NOT NULL` por desenho —
  sentinela `''`/`0` quando o insumo bruto está ausente, com o motivo em
  `calculation_inputs_snapshot`/`calculation_trace` (nunca inferido da coluna sozinha). Índices
  `(operation_id, created_at desc)` e `(integration_account_id, created_at desc)` — mesmo padrão
  de leitura "mais recente primeiro" de `compliance_evaluations`.

Coeficientes REAIS da Tabela A (Res. ANTT 6.084/2026) entram por um script **MANUAL** do operador
(`npm run load:freight-floor`, `scripts/load-freight-floor-tables.js`) — nunca por seed de boot; a
meta-guarda 4 de `tests/regulatory/rule-catalog-invariants.test.js` (PR-A6) continua verde,
provando que `regulatory-rules-seed.ts` segue sem tocar `freight_floor_versions`/`_coefficients`.
Toda versão carregada nasce `review_status='pending_review'` — promoção a `reviewed` é ato humano
futuro (rota admin ainda não existe nesta fase).

⚠️ Mesmo aviso de rollout escalonado da seção anterior se aplica: migration inédita, api primeiro,
worker só depois de Ready.

---

## Migration 027 — Verificações RNTRC Transporte + `transporte.rntrc.verify` (PR-C1, 2026-08-14)

Registro de evolução do schema no padrão desta DL (vertical **Transporte**, DL-103) — e o
PRIMEIRO **job type novo** e o primeiro **gateway externo real** que a vertical Transporte
registra na fila desde a fundação (021–026 nunca tocaram `operation-handlers.ts`/`lib/retry.ts`).

- **`027_transport_rntrc_verifications.sql`** — `rntrc_verifications`. "APPEND-ONLY" no mesmo
  sentido de `compliance_evaluations`/`freight_floor_calculations` (sem coluna `version`, sem
  trigger `increment_version`), mas com uma nuance que as duas irmãs não têm: a estratégia
  `open_data` é ASSÍNCRONA, então a linha nasce `requested_status='pending'` (gravada ANTES da
  chamada ao gateway, mesmo molde de `status: 'submitting'` do fluxo de manifesto) e recebe
  EXATAMENTE UMA transição em `update` — `pending → succeeded` OU `pending → failed`, sempre
  restrita por `where requested_status = 'pending'` no repositório
  (`rntrc-verification-repo.ts`). Uma nova verificação NUNCA reabre uma linha terminal: sempre
  nasce outra linha. A estratégia `manual` não tem fase `pending` — nasce direto `succeeded`
  (síncrona, sem fila).

**Fila — 4 pontos tocados** (o resto da vertical nunca precisou, por ser 100% síncrona até aqui):

1. `src/workers/operation-handlers.ts` — novo `case 'transporte.rntrc.verify'` no switch de
   `processJob`, delegando a `handleTransporteRntrcVerify(job)` **sem** o parâmetro `gateway`
   (molde `handleWhatsAppInboundMessage`: dependências do corpo do job — em
   `transport-rntrc-verification-service.ts` — entram por import direto, nunca amplia o tipo
   inline de 14 métodos do gateway CETESB que `processJob` já expõe). Terminal (DLQ/failed)
   tratado por `applyTransporteRntrcVerifyTerminalFailureSideEffect` (par simétrico de
   `applyWhatsAppInboundTerminalFailureSideEffect`), registrado em `workers/job-runner.ts` nos
   dois pontos de despacho (`handleDlqTransition`/`handleFailedTransition`) — marca a linha
   `pending` como `failed`, nunca toca `transport_parties`.
2. `src/lib/retry.ts` — `transporte.rntrc.verify` entra em `RetryableOperation`,
   `calculateJobPriority` (4) e `getRetryConfig` (4 tentativas, exponencial 5s→120s). A
   classificação retryable/definitivo continua GENÉRICA por status HTTP
   (`isRetryableJobError`): o gateway (`antt-rntrc-gateway.ts`) devolve `AppError` com `.status`
   real (504/502 para timeout/rede, o próprio 4xx/5xx do CKAN para erro HTTP), então nenhuma
   regra nova por código foi necessária além de registrar `RNTRC_GATEWAY_TIMEOUT`/
   `_NETWORK_ERROR` em `RETRYABLE_ERROR_CODES` (redundância defensiva, mesmo molde de
   `CETESB_TIMEOUT`/`CETESB_NETWORK_ERROR`).
3. `src/lib/command-response.ts` (`buildCommandAccepted`) e o espelho em
   `src/services/job-service.ts` (`getJob`) — `entityType 'transport_party'` entrou no ternário de
   `links.entity` → `/v1/transporte/transportadores/{id}`.
4. Contrato: endpoint de comando novo (`POST .../verificar-rntrc`, `202` quando
   `strategy=open_data`) entrou em `commandEndpoints` de `scripts/validate-openapi.js` **e** do
   teste gêmeo `tests/integration/openapi-queue-contract.test.js` — os dois precisam concordar,
   por desenho (um valida o build, o outro é o gate de CI).

Gateway `src/gateways/antt-rntrc-gateway.ts` (TS — só `cetesb-gateway.js` é exceção JS, DL-093):
integra com o Portal de Dados Abertos da ANTT (CKAN público, `dados.antt.gov.br`, dataset
`"rntrc"`). `RNTRC_GATEWAY_MODE` (`mock` default | `open_data`) segue o padrão de
`CETESB_GATEWAY_MODE`/`CONVERSATION_PERMISSION_ENFORCEMENT`: valor desconhecido LANÇA no boot.
Detalhe da sondagem real que fixou o contrato e a estratégia de fallback (CSV streaming quando o
datastore do mês corrente não está ativo) em `docs/10-estado-atual/estado-atual.md` §3.9 e nos
comentários do próprio gateway.

⚠️ Mesmo aviso de rollout escalonado das duas seções anteriores se aplica: migration inédita, api
primeiro, worker só depois de Ready.

---

## Migration 028 — Ciclo do CIOT Transporte + 5 job types (PR-C2, 2026-08-14)

Registro de evolução do schema no padrão desta DL (vertical **Transporte**, DL-103) — o SEGUNDO
gateway externo da vertical (depois de `antt-rntrc-gateway.ts` no PR-C1), e o primeiro a aplicar o
padrão **DL-102** (marcador de correlação + `*_unconfirmed` + reconciliador) DESDE A CRIAÇÃO da
entidade, não como reparo posterior. NÃO existe provedor CIOT contratado
([EXTERNAL DEPENDENCY] P5 do guia do programa) — `provider` só implementa `mock`.

- **`028_transport_ciot.sql`** — `ciot_operations` (PK `text` via `createPrefixedId` (`ciot_`),
  `version` + trigger `increment_version()` — ao contrário de `rntrc_verifications`/
  `compliance_evaluations`, esta tabela TEM locking otimista porque sofre `update`s legítimos
  fora da criação: `pre_validation → requested → registered|rejected|request_unconfirmed`, depois
  `registered → rectified|cancelled|closed`) e `ciot_events` (APPEND-ONLY, sem `version`, trilha
  completa do ciclo — `pre_validated`, `request_dispatched`, `registered`, `rectify_requested`,
  `rectified`, `cancel_requested`, `cancelled`, `close_requested`, `closed`, `rejected`,
  `reconciled`, entre outros). `correlation_marker` é `unique` desde a criação da linha — gravado
  ANTES de qualquer chamada ao provedor, mesmo princípio de `manifest-correlation.ts` (réplica
  deliberada em `lib/transport/ciot-correlation.ts`, NÃO reuso — bounded context próprio).

**Fila — 4 pontos tocados, 5 job types novos** (`transporte.ciot.register|rectify|cancel|close|
reconcile`):

1. `src/workers/operation-handlers.ts` — 5 novos `case`s no switch de `processJob`, cada um
   delegando a um handler `handleTransporteCiot*(job)` **sem** o parâmetro `gateway` (mesmo molde
   de `transporte.rntrc.verify`); o corpo de cada job vive em `transport-ciot-service.ts`
   (`runCiot*Job`). Terminal (DLQ/failed) tratado por
   `applyTransporteCiotTerminalFailureSideEffect` (também definido em `transport-ciot-service.ts`
   e re-exportado por `operation-handlers.ts`, para `job-runner.ts` importar de UM lugar só, no
   mesmo molde dos outros `apply*TerminalFailureSideEffect`), registrado em `workers/job-runner.ts`
   nos dois pontos de despacho — distingue rejeição DEFINITIVA do provedor
   (`CIOT_PROVIDER_REJECTED_TEST` → `rejected`, operação permanece `ciot_pending`) de qualquer
   outro terminal DEPOIS do dispatch (→ `request_unconfirmed`, NUNCA `failed` — DL-102).
2. `src/lib/retry.ts` — as 5 operações entram em `RetryableOperation`, `calculateJobPriority`
   (mutações: 4; `reconcile`: 3 — ele já faz polling próprio contra o provedor, o orçamento de
   retry da fila cobre só infraestrutura em volta) e `getRetryConfig` (mutações: 4 tentativas
   exponencial 5s→120s, mesmo orçamento do RNTRC; `reconcile`: 3 tentativas, 5s→60s).
   `CIOT_PROVIDER_REJECTED_TEST`/`CIOT_PROVIDER_NOT_CONFIGURED`/`TRANSPORTE_CIOT_ALREADY_TERMINAL`
   entram em `NON_RETRYABLE_ERROR_CODES` (decisão definitiva/config ausente/retry tardio pós-commit
   — nenhum deles se beneficia de retentar); `CIOT_PROVIDER_LOST_RESPONSE_TEST`/
   `CIOT_RECONCILE_QUERY_FAILED` entram em `RETRYABLE_ERROR_CODES` (também cobertos por status
   504/502, redundância defensiva, mesmo molde do RNTRC).
3. `src/lib/command-response.ts` (`buildCommandAccepted`) ganhou um parâmetro NOVO, `entityLink`
   — a primeira vez que o link do contrato não é derivável só de `entityType`/`entityId`:
   `entityType 'ciot_operation'` usa `entityId = operationId` (a `transport_operations` PAI, para
   dedupe e dono do link fazerem sentido — a tentativa ativa vai em `payload.ciotOperationId`), e o
   GET do ciclo vive sob a operação (`/v1/transporte/operacoes/{operationId}/ciot`, sem rota por id
   de tentativa). O espelho em `src/services/job-service.ts` (`getJob`) ganhou o mesmo ramo no
   ternário (sem precisar de `entityLink` — `job.entityId` já É o `operationId`).
4. Contrato: 4 endpoints de comando novos (`solicitar`/`retificar`/`cancelar`/`encerrar`, todos
   `202`) entraram em `commandEndpoints` de `scripts/validate-openapi.js` **e** do teste gêmeo
   `tests/integration/openapi-queue-contract.test.js`.

Além da fila, uma **varredura periódica própria** em `workers/job-runner.ts`
(`enqueueTransporteCiotReconcileSweepIfNeeded`) — molde EXATO de
`enqueueManifestSubmitReconcileSweepIfNeeded` (relógio próprio, env var própria
`TRANSPORTE_CIOT_RECONCILE_SWEEP_MS`, default 5 min, `0`/negativo desliga, falha nunca derruba o
loop do worker) — é a rede de segurança para `ciot_operations` em `request_unconfirmed` cujo
enfileiramento de `reconcile` pelo side-effect terminal falhou ou nunca aconteceu (processo caiu
entre marcar unconfirmed e enfileirar).

Gateway `src/gateways/ciot-provider-gateway.ts` (TS): `mode: 'mock'` (default,
`CIOT_PROVIDER_MODE`) é STATEFUL EM MEMÓRIA POR PROCESSO — um `Map` module-level chaveado pelo
`correlationMarker`, para sobreviver à criação de novas instâncias do gateway a cada retry (e para
`queryCiotByMarker`, chamado pelo reconciliador `services/ciot-reconciler.ts`, "achar" o que uma
tentativa anterior registrou). `mode: 'real'` recusa `createCiotProviderGateway` com
`CIOT_PROVIDER_NOT_CONFIGURED` — mesma postura "aceita o valor, falha no uso" de
`resolveRntrcGatewayMode` para `antt`.

⚠️ Mesmo aviso de rollout escalonado das seções anteriores se aplica: migration inédita, api
primeiro, worker só depois de Ready.

---

## Migration 029 — Ciclo do VPO Transporte + 2 job types (PR-D1, 2026-08-15)

Registro de evolução do schema no padrão desta DL (vertical **Transporte**, DL-103) — o TERCEIRO
gateway externo da vertical (depois de `antt-rntrc-gateway.ts` no PR-C1 e
`ciot-provider-gateway.ts` no PR-C2), e a SEGUNDA aplicação do padrão **DL-102** (marcador de
correlação + `*_unconfirmed` + reconciliador), desta vez sobre um recurso MUTÁVEL em vez de
append-por-tentativa. NÃO existe fornecedora de VPO integrada tecnicamente
([EXTERNAL DEPENDENCY] P6 do guia do programa) — `gateways/vpo-gateway.ts` só implementa `mock`.

- **`029_transport_vpo.sql`** — `vpo_providers` (PK `text` via `createPrefixedId` (`vpoprov_`),
  cadastro de referência CONFIGURÁVEL, sem tenancy — `version` + trigger `increment_version()`),
  `vpo_allocations` (`vpoalloc_`, `version` + trigger) e `vpo_events` (`vpoev_`, APPEND-ONLY, sem
  `version`). **Decisão estrutural que diverge de `ciot_operations`**: `vpo_allocations` é
  MUTÁVEL — `unique(operation_id)` garante NO MÁXIMO uma linha por operação (a especificação do
  PR pediu "cria/atualiza", não "cada tentativa cria uma linha nova"); o histórico completo vive
  em `vpo_events`. `applicability_reason_code` é OBRIGATÓRIO quando `status='not_applicable'`
  (`chk_vpoalloc_not_applicable_reason`) — a exigência "até NOT_APPLICABLE deixa justificativa"
  virou constraint de banco, não convenção de código. `status` e `event_type` foram ESTENDIDOS além
  do conjunto mínimo da especificação (`pending/applicable/not_applicable/acquired/cancelled`) com
  dois estados de trânsito (`acquisition_requested`/`acquisition_unconfirmed`) e um evento
  (`reconciled`) — necessários para sustentar o padrão DL-102 pedido explicitamente para
  `.../vpo/adquirir`; sem eles não haveria como representar "dispatchado, aguardando confirmação"
  distinto de "resposta perdida", a mesma distinção que já motiva `ciot_operations.status`.

**Fila — 4 pontos tocados, 2 job types novos** (`transporte.vpo.acquire|reconcile`):

1. `src/workers/operation-handlers.ts` — 2 novos `case`s no switch de `processJob`, delegando a
   `handleTransporteVpoAcquire(job)`/`handleTransporteVpoReconcile(job)` **sem** o parâmetro
   `gateway` (mesmo molde do CIOT); o corpo de cada job vive em `transport-vpo-service.ts`
   (`runVpo*Job`). Terminal (DLQ/failed) tratado por
   `applyTransporteVpoTerminalFailureSideEffect` (definido em `transport-vpo-service.ts` e
   re-exportado por `operation-handlers.ts`, mesmo molde de `applyTransporteCiotTerminalFailureSideEffect`),
   registrado em `workers/job-runner.ts` nos dois pontos de despacho — distingue rejeição
   DEFINITIVA do provedor (`VPO_PROVIDER_REJECTED_TEST` → volta a `applicable`, SEM esperar
   reconciliação) de qualquer outro terminal DEPOIS do dispatch (→ `acquisition_unconfirmed`,
   NUNCA falha definitiva — DL-102).
2. `src/lib/retry.ts` — as 2 operações entram em `RetryableOperation`, `calculateJobPriority`
   (`acquire`: 4; `reconcile`: 3, mesmo racional do CIOT — já faz polling próprio) e
   `getRetryConfig` (`acquire`: 4 tentativas exponencial 5s→120s; `reconcile`: 3 tentativas,
   5s→60s). `VPO_PROVIDER_REJECTED_TEST`/`VPO_PROVIDER_NOT_CONFIGURED`/
   `TRANSPORTE_VPO_ALREADY_TERMINAL` entram em `NON_RETRYABLE_ERROR_CODES`;
   `VPO_PROVIDER_LOST_RESPONSE_TEST`/`VPO_RECONCILE_QUERY_FAILED` entram em
   `RETRYABLE_ERROR_CODES` (mesmo molde do CIOT).
3. `src/lib/command-response.ts` (`buildCommandAccepted`) — `entityType 'vpo_allocation'` usa
   `entityId = operationId` (mesmo padrão de `ciot_operation`, via o parâmetro `entityLink` já
   existente desde o PR-C2 — nenhuma mudança de assinatura foi necessária aqui).
4. Contrato: 1 endpoint de comando novo (`POST .../vpo/adquirir`, `202`) entrou em
   `commandEndpoints` de `scripts/validate-openapi.js`.

Além da fila, uma **varredura periódica própria** em `workers/job-runner.ts`
(`enqueueTransporteVpoReconcileSweepIfNeeded`) — molde EXATO de
`enqueueTransporteCiotReconcileSweepIfNeeded` (relógio próprio, env var própria
`TRANSPORTE_VPO_RECONCILE_SWEEP_MS`, default 5 min) — é a rede de segurança para `vpo_allocations`
em `acquisition_unconfirmed` cujo enfileiramento de `reconcile` pelo side-effect terminal falhou.

As DUAS escritas de `POST .../vpo/registrar-aquisicao` (`vpo_allocations` → `acquired` +
`transport_operations.vpo_amount` via CAS) rodam NUMA transação (`db/pool.ts#withTransaction`) —
primeira vez que um service da vertical Transporte usa transação explícita cruzando duas tabelas
(os PRs anteriores aceitavam a janela de corrida, documentada, entre `insert`/`update` e o CAS do
cabeçalho da operação).

Gateway `src/gateways/vpo-gateway.ts` (TS): `mode: 'mock'` (default, `VPO_PROVIDER_MODE`) é
STATEFUL EM MEMÓRIA POR PROCESSO, mesmo padrão do CIOT — calcula o valor do VPO a partir da
distância da rota (tarifa de SANDBOX, nunca real); sem rota/distância válida, rejeita com
`VPO_PROVIDER_REJECTED_TEST`. `mode: 'real'` recusa `createVpoProviderGateway` com
`VPO_PROVIDER_NOT_CONFIGURED`.

Cadastro de fornecedoras (`vpo_providers`) carregado por loader MANUAL e ADITIVO
(`scripts/load-vpo-providers.js`, `npm run load:vpo-providers`, molde
`load-freight-floor-tables.js`) a partir de `reference-data/vpo/fornecedoras-habilitadas.json` —
16 fornecedoras REAIS pesquisadas na fonte oficial gov.br/antt em 14/08/2026. O loader NUNCA roda
no boot (`AUTO_SEED`) e NUNCA toca `is_active` de uma linha existente (upsert por `name`).

⚠️ Mesmo aviso de rollout escalonado das seções anteriores se aplica: migration inédita, api
primeiro, worker só depois de Ready.

---

**Referências**:
- Migration: `src/sql/004_advanced_locking_consistency.sql`
- Repositórios: `src/repositories/job-repo.js`, `src/repositories/health-repo.js`
- Worker: `src/workers/job-runner.js`
- Rotas: `src/routes/health-routes.js`
- Decision log: `docs/copilot/13-decision-log.md` (DL-022, DL-102, DL-103)
