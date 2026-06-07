# Technical Decisions - DL-027

## Decision 1: Internal Health Endpoints (No CETESB)
**Context:** Health endpoints são para observabilidade interna do sistema

**Decision:** Implementar health endpoints como INTERNOS, sem dependências CETESB

**Rationale:**
- Health endpoints servem para monitoramento do sistema (database, workers, jobs)
- Não há integração com CETESB gateway necessária
- Simplifica validação e testes (não precisa de mocks CETESB)
- Reduz dependências externas

**Implementation:**
- x-internal-observability metadata adicionada ao OpenAPI
- x-cetesb-source-of-truth confirmado como N/A
- Health-repo.js não importa cetesb-gateway

**Impact:**
- ✅ Simplifica deployment (não depende de CETESB_GATEWAY_MODE)
- ✅ Reduz complexidade de testes
- ✅ Zero dependências externas

**Alternatives Considered:**
- Integração com CETESB gateway: Descartado (sem justificativa técnica)

---

## Decision 2: Graceful Error Handling
**Context:** Health endpoints devem sempre retornar status operacional

**Decision:** Implementar graceful error handling com fallback values

**Rationale:**
- Health endpoints são para observabilidade, não devem falhar
- Retornar status parcial é melhor que retornar 500
- Permite debugging mesmo quando banco está indisponível
- Alinhado com best practices de health checks

**Implementation:**
- try/catch em todas funções de health-repo.js
- Fallback values retornados em caso de erro:
  ```javascript
  catch (error) {
    logger.error({ correlationId, error }, 'Failed to get system health');
    return {
      database: { status: 'unknown', error: error.message },
      workers: { status: 'unknown' },
      jobQueue: { status: 'unknown' }
    };
  }
  ```
- Logs de erro preservados para debugging
- Status HTTP ainda 200 (não 5xx)

**Impact:**
- ✅ Health endpoints nunca retornam 5xx
- ✅ Partial degradation em caso de falhas
- ✅ Observabilidade preservada mesmo em estado de erro

**Alternatives Considered:**
- Retornar 500 em erro: Descartado (health checks devem ser resilientes)
- Retry logic: Descartado (health checks devem ser rápidos)

---

## Decision 3: Health Endpoints Status Codes
**Context:** Definir status HTTP para endpoints de observabilidade

**Decision:**
- 200 para GET endpoints (ping, health/*, metrics/*)
- 202 para POST /maintenance/cleanup (operação async)

**Rationale:**
- GET endpoints retornam dados imediatamente → 200 OK
- POST cleanup cria job assíncrono → 202 Accepted (padrão REST)
- Alinhado com OpenAPI REST conventions
- Consistente com outros endpoints async do sistema (manifest submit, cancel, etc.)

**Implementation:**
```javascript
// GET endpoints
router.get('/v1/ping', asyncHandler(async (req, res) => {
  const { correlationId } = req;
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}));

// POST cleanup
router.post('/v1/maintenance/cleanup', asyncHandler(async (req, res) => {
  const { correlationId } = req;
  const result = await triggerCleanup(correlationId);
  res.status(202).json(result);
}));
```

**Impact:**
- ✅ Status codes consistentes com OpenAPI
- ✅ Alinhado com REST best practices
- ✅ Consistente com outros endpoints async

**Alternatives Considered:**
- 200 para cleanup: Descartado (cleanup é assíncrono)
- 204 No Content: Descartado (retornamos payload com job ID)

---

## Decision 4: SQL Queries vs. ORM
**Context:** Escolher abordagem para queries de health

**Decision:** Usar SQL raw queries (node-postgres) sem ORM

**Rationale:**
- Health queries são simples (SELECT COUNT, SELECT MAX, etc.)
- SQL raw é mais eficiente (sem overhead de ORM)
- Queries de health devem ser rápidas (latência baixa)
- Não há necessidade de mapeamento objeto-relacional
- Consistente com resto do repositório (job-repo.js usa SQL raw)

**Implementation:**
```javascript
const query = `
  SELECT 
    COUNT(*) AS active_count,
    COUNT(*) FILTER (WHERE status = 'running') AS running,
    COUNT(*) FILTER (WHERE status = 'queued') AS queued
  FROM jobs
  WHERE status IN ('running', 'queued')
`;
const result = await pool.query(query);
```

**Impact:**
- ✅ Queries rápidas (sem ORM overhead)
- ✅ Código simples e direto
- ✅ Consistente com resto do projeto

**Alternatives Considered:**
- Prisma/TypeORM: Descartado (overhead desnecessário para queries simples)
- Knex.js: Descartado (já temos node-postgres)

---

## Decision 5: Separate Health Repository
**Context:** Organizar código de health endpoints

**Decision:** Criar `src/repositories/health-repo.js` dedicado

**Rationale:**
- Separação de responsabilidades (health queries isoladas)
- Facilita manutenção e evolução
- Evita poluir job-repo.js com queries de observabilidade
- Permite reutilização (worker, api, CLI tools)
- Segue padrão repository layer do projeto

**Implementation:**
- 6 funções core exportadas:
  1. getSystemHealth
  2. getWorkersHealth
  3. getActiveJobsHealth
  4. getDLQJobsHealth
  5. getPerformanceMetrics
  6. triggerCleanup
- 5 aliases exportados (getWorkers, getActiveJobs, etc.)
- Imports em api-routes.js:
  ```javascript
  import {
    getSystemHealth,
    getWorkersHealth,
    getActiveJobsHealth,
    getDLQJobsHealth,
    getPerformanceMetrics,
    triggerCleanup
  } from '../repositories/health-repo.js';
  ```

**Impact:**
- ✅ Código organizado e modular
- ✅ Fácil manutenção
- ✅ Reusável em outros contextos (CLI, scripts)

**Alternatives Considered:**
- Adicionar em job-repo.js: Descartado (mistura responsabilidades)
- Service layer: Descartado (health queries são simples, não precisam de orquestração)

---

## Decision 6: Smoke Test + Integration Tests
**Context:** Estratégia de testes para health endpoints

**Decision:** Implementar smoke test (rápido) + integration tests (completo)

**Rationale:**
- Smoke test para validação rápida (CI/CD, desenvolvimento local)
- Integration tests para cobertura completa (edge cases, error handling)
- Dois níveis de confiança: rápido (smoke) e completo (integration)
- Alinhado com práticas de testing pyramid

**Implementation:**

**Smoke Test (scripts/smoke-health.js):**
- 7 endpoints testados
- Validação básica: status code + response structure
- Rápido: ~1-2 segundos
- Uso: `npm run smoke:health`

**Integration Tests (tests/integration/health-endpoints.test.js):**
- 35 testes
- Cobertura completa: sucesso, erro, edge cases
- Validação detalhada: campos, tipos, correlationId
- Uso: `npm run test:integration`

**Impact:**
- ✅ CI/CD rápido (smoke test)
- ✅ Confiabilidade alta (integration tests)
- ✅ 100% cobertura dos 7 endpoints

**Alternatives Considered:**
- Só integration tests: Descartado (muito lento para CI/CD)
- Só smoke test: Descartado (cobertura insuficiente)
- E2E tests: Descartado (overhead desnecessário para health endpoints)

---

## Summary

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Internal endpoints (no CETESB) | Simplifica validação, zero deps externas | ✅ Reduz complexidade |
| Graceful error handling | Health checks devem ser resilientes | ✅ Nunca retorna 5xx |
| Status codes (200/202) | REST conventions, consistência | ✅ Alinhado com OpenAPI |
| SQL raw queries | Performance, simplicidade | ✅ Queries rápidas |
| Separate health-repo | Separação de responsabilidades | ✅ Código modular |
| Smoke + Integration tests | Rápido + Completo | ✅ CI/CD eficiente |

**All decisions align with:**
- Project conventions (contract-first, repository pattern)
- Best practices (graceful degradation, REST conventions)
- Performance requirements (fast health checks)
- Maintainability (modular code, comprehensive tests)
