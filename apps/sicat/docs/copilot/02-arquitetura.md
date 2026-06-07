# Arquitetura

> **TypeScript** (DL-093 - 2026-04-16): todos os arquivos `src/**` foram migrados de `.js` para `.ts`. O `src/gateways/cetesb-gateway.js` permanece em JS por ser ficheiro de integração estável, compativel via ESM interop. Runtime de desenvolvimento: `tsx`. Build de produção: `tsc` para `dist/`.

## Camadas

### 1. Interface HTTP
Arquivos principais:
- `src/app.ts`
- `src/routes/api-routes.ts`
- `src/routes/generated-routes.ts`
- `src/routes/system-routes.ts`

Responsabilidade:
- receber request
- aplicar middlewares
- delegar para serviços
- devolver contrato consistente

### 2. Serviços
Arquivos principais:
- `src/services/session-context-service.ts`
- `src/services/manifest-service.ts`
- `src/services/catalog-service.ts`
- `src/services/cadastro-service.ts`
- `src/services/partner-service.ts`
- `src/services/job-service.ts`
- `src/services/audit-service.ts`

Responsabilidade:
- orquestrar regras de negócio
- persistir estado
- enfileirar operações
- chamar gateway externo via camada própria

### 2.5. Validadores ✅ NOVO (2026-03-08)
Arquivos principais:
- `src/lib/validators/manifest-validator.ts`

Responsabilidade:
- validar payloads antes de enviar para APIs externas
- normalizar dados para formato esperado
- fail fast com mensagens claras
- reduzir chamadas inválidas à CETESB

**Validadores implementados:**
- `validateManifestPayload()`: valida 9 categorias de campos obrigatórios
- `normalizeExpeditionDate()`: previne duplicação de timestamp
- **Cobertura**: 26 testes unitários (100% aprovados)

### 3. Persistência
Arquivos principais:
- `src/repositories/*` (todos `.ts`)
- `src/db/*` (pool.ts, migrate.ts)
- `src/sql/001_init.sql`
- `src/sql/002_queue_improvements.sql`
- `src/sql/003_audit_logs.sql`
- `src/sql/004_advanced_locking_consistency.sql` ✅ NOVO (DL-022)

Responsabilidade:
- SQL explícito
- leitura e escrita em Postgres
- sem lógica externa ou HTTP
- locking otimista com versioning (DL-022)
- health monitoring de workers (DL-022)

Evolução recente da fila (`jobs`):
- priorização por `priority`
- retries configuráveis por estratégia (`retry_strategy`, `base_delay_ms`, `max_delay_ms`)
- trilha de execução (`claimed_at`, `claimed_by`, `execution_time_ms`)
- movimentação para DLQ (`dlq_moved_at`, `dlq_reason`)
- suporte operacional por `job_dead_letter_queue` e `job_metrics_hourly`
- **versioning otimista** (`version` column + triggers) para prevenir race conditions (DL-022)
- **constraints de consistência** (5 checks para garantir estados válidos) (DL-022)
- **health monitoring** (`worker_health`, `system_events`, `performance_snapshots`) (DL-022)

### 4. Assíncrono
Arquivos principais:
- `src/worker.js`
- `src/workers/job-runner.js`
- `src/workers/operation-handlers.js`
- `src/lib/retry.js`

Responsabilidade:
- consumir jobs
- executar side effects
- atualizar estados e resultados
- calcular retry/backoff por operação
- mover jobs irrecuperáveis para DLQ

### 5. Gateway externo
Arquivo principal:
- `src/gateways/cetesb-gateway.js`

Responsabilidade:
- centralizar autenticação, headers, timeouts, parsing e endpoints reais observados

### 6. Observabilidade ✅ NOVO (DL-022)
Arquivos principais:
- `src/routes/health-routes.js`
- `src/repositories/health-repo.js`
- `src/sql/004_advanced_locking_consistency.sql`

Responsabilidade:
- health monitoring de workers (heartbeat, status, metrics)
- métricas de performance agregadas (p50, p95, p99)
- detecção de workers não responsivos
- auditoria de eventos de sistema
- cleanup automatizado de jobs antigos
- views otimizadas para dashboards

**Endpoints REST**:
- `GET /health/system` - Health status geral
- `GET /health/workers` - Workers e estatísticas
- `GET /health/jobs/active` - Jobs ativos
- `GET /health/jobs/dlq` - Dead letter queue
- `GET /health/metrics/performance` - Métricas agregadas
- `POST /health/maintenance/cleanup` - Limpeza de jobs antigos
- `GET /health/ping` - Health check simples

## Regra de dependência

routes -> services -> validators -> repositories / gateways / lib

Workers usam serviços e gateways, mas não devem duplicar regra de roteamento HTTP.

**Validadores** são invocados por:
- gateways (antes de enviar para API externa)
- services (quando necessário validar antes de persistir)
