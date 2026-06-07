# 🎯 Skill: CI/CD Validation & GitHub Actions

**Objetivo**: Padronizar validação de qualidade através de GitHub Actions, diagnóstico de falhas e feedback contínuo.

**Quando usar**: Validar mudanças antes de commit/push, diagnosticar falhas no CI, otimizar pipelines.

---

## Estrutura de Workflows

### Arquivo: `.github/workflows/ci-contract-queue.yml`

**Responsabilidade**: Validar contratos, fila, migrations e documentação  
**Triggers**: push (main), pull_request, workflow_dispatch  
**Duração esperada**: 5-8 min  

**Jobs**:
```yaml
contract-and-queue-checks:
  - Postgres 16 service
  - npm ci (clean install)
  - npm run migrate (apply migrations)
  - npm run test:contract (OpenAPI + examples)
  - npm run validate:cetesb-source + test:source-of-truth (HAR validation)
  - npm run validate:md-links (broken links)
  - npm run smoke:job:retry-dlq (queue smoke test)
```

---

## Checklist de Validação Local (Simular CI)

### Setup ambiente limpo
```bash
# Garantir estado limpo
docker compose down -v
docker compose up -d postgres

# Clean install (como CI faz)
rm -rf node_modules package-lock.json
npm install
```

### Por tipo de mudança

#### 1. Mudança em OpenAPI (`openapi/*.yaml`)
```bash
# Validar schema
npm run validate:openapi

# Regenerar operations
npm run gen:operations

# Validar contratos
npm run test:contract

# Validar examples matching schema
npm run validate:openapi:clean
```

**Critério de pronto**:
- ✅ 0 erros em validate:openapi
- ✅ generated/operations.js sincronizado
- ✅ Todos examples validando contra schema
- ✅ test:contract passando

#### 2. Mudança em Examples (`examples/*.json`)
```bash
# Validar schema compliance
npm run validate:openapi:clean

# Validar contratos
npm run test:contract

# Validar CETESB source-of-truth
npm run validate:cetesb-source
npm run test:source-of-truth
```

**Critério de pronto**:
- ✅ Examples matching OpenAPI schema
- ✅ Examples alinhados com HARs em docs/cetesb/
- ✅ Validators consistentes

#### 3. Mudança em Migrations (`src/sql/*.sql`)
```bash
# Limpar banco
docker compose down -v
docker compose up -d postgres

# Aplicar migrations
npm run migrate

# Validar schema
psql $DATABASE_URL -c "\d+ jobs"
psql $DATABASE_URL -c "\d+ worker_health"

# Testes de integração
npm run test:integration
```

**Critério de pronto**:
- ✅ Migration aplica sem erros
- ✅ Constraints criados corretamente
- ✅ Testes de integração passando
- ✅ Rollback documentado (se breaking change)

#### 4. Mudança em Source (`src/**/*.js`)
```bash
# Testes unitários
npm run test:unit

# Testes de integração
npm run test:integration

# Testes E2E (se routes mudaram)
npm run test:api

# Validar workers
npm run test:worker
```

**Critério de pronto**:
- ✅ Testes impactados passando
- ✅ Cobertura não regrediu
- ✅ Smoke tests funcionais

#### 5. Mudança em Documentação (`docs/**/*.md`)
```bash
# Validar links
npm run validate:md-links

# Validar referências
grep -r "docs/arquivo-deletado.md" .
```

**Critério de pronto**:
- ✅ 0 links quebrados
- ✅ Referências atualizadas
- ✅ Índices sincronizados

#### 6. Mudança em CETESB (`docs/cetesb/*.har`, `src/gateways/cetesb-gateway.js`)
```bash
# Validar source-of-truth
npm run validate:cetesb-source

# Testes de source-of-truth
npm run test:source-of-truth

# Testes de gateway
npm run test:integration -- cetesb-gateway
```

**Critério de pronto**:
- ✅ HARs alinhados com implementação
- ✅ Payloads matching evidência real
- ✅ Gateway respeitando contratos

---

## Diagnóstico de Falhas (Playbook)

### Falha: Migration Error

**Sintomas**:
```
Error: migration "004_advanced_locking_consistency.sql" failed
syntax error at or near "CONSTRAINT"
```

**Root Cause Checklist**:
- [ ] Syntax error no SQL?
- [ ] Constraint violada em dados existentes?
- [ ] Tipo de dado incompatível?
- [ ] Dependência circular entre constraints?

**Ações**:
1. Validar SQL localmente: `psql $DATABASE_URL < src/sql/004_*.sql`
2. Verificar estado do banco: `psql $DATABASE_URL -c "\d+ jobs"`
3. Se constraint violada: limpar dados inválidos primeiro
4. Se syntax error: corrigir SQL e re-run
5. Escalar para `postgres-queue-mtr` se complexo

---

### Falha: Contract Test

**Sintomas**:
```
AssertionError: expected 200 "OK", got 500 "Internal Server Error"
POST /v1/manifestos
```

**Root Cause Checklist**:
- [ ] Route handler não implementado?
- [ ] Validator rejeitando payload válido?
- [ ] Schema no OpenAPI inconsistente?
- [ ] Example JSON inválido?

**Ações**:
1. Verificar route existe: `grep -r "POST.*manifestos" src/routes/`
2. Validar example: `npm run validate:openapi:clean`
3. Testar payload local: `curl -X POST http://localhost:8080/v1/manifestos -d @examples/post_v1_manifestos_request.json`
4. Verificar logs do servidor: buscar stack trace
5. Escalar para `programador-backend-mtr` com erro completo

---

### Falha: CETESB Source-of-Truth

**Sintomas**:
```
Error: Mismatch in payload field 'manDataExpedicao'
Expected format: ISO 8601 with timezone
Actual: YYYY-MM-DD HH:mm:ss (no timezone)
HAR: docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har
```

**Root Cause Checklist**:
- [ ] Implementação não seguindo HAR?
- [ ] Validator não alinhado com CETESB?
- [ ] Timezone handling incorreto?
- [ ] Formato de data divergente?

**Ações**:
1. Abrir HAR e buscar campo problemático
2. Comparar com implementation: `src/gateways/cetesb-gateway.js`
3. Verificar validator: `src/lib/validators/manifest-validator.js`
4. Corrigir para matching HAR (source of truth)
5. Escalar para `validador-cetesb-mtr` se divergência complexa

---

### Falha: Broken Links

**Sintomas**:
```
Error: Broken link in docs/copilot/01-visao-geral.md
Link: [Estrutura](../../../docs/copilot/14-estrutura-copilot.md) → File not found
```

**Root Cause Checklist**:
- [ ] Arquivo foi movido sem update de referências?
- [ ] Typo no path?
- [ ] Link absoluto vs relativo?
- [ ] Arquivo deletado ainda referenciado?

**Ações**:
1. Verificar se arquivo existe: `ls docs/copilot/14-estrutura-copilot.md`
2. Buscar todas referências: `grep -r "14-estrutura-copilot.md" docs/`
3. Corrigir paths relativos
4. Re-run validação: `npm run validate:md-links`
5. Escalar para `documentador-mtr` se muitos links quebrados

---

### Falha: Queue Smoke Test

**Sintomas**:
```
Error: Job stuck in 'retry_wait' after max attempts
Job ID: job_abc123
Operation: manifest.submit
```

**Root Cause Checklist**:
- [ ] Worker não processando jobs?
- [ ] Retry logic com bug?
- [ ] DLQ threshold muito alto?
- [ ] Gateway sempre retornando erro retryable?

**Ações**:
1. Verificar jobs table: `psql $DATABASE_URL -c "SELECT * FROM jobs WHERE job_id = 'job_abc123'"`
2. Verificar DLQ: `psql $DATABASE_URL -c "SELECT * FROM job_dead_letter_queue WHERE job_id = 'job_abc123'"`
3. Testar worker local: `npm run worker:once`
4. Verificar retry strategy: `src/repositories/job-repo.js`
5. Escalar para `postgres-queue-mtr` se lógica de fila problemática

---

## Otimização de Workflows

### Tornar CI mais rápido

#### 1. Cache de dependências
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'  # ← Adicionar cache
```

**Ganho esperado**: 30-60s (pular npm ci se lockfile não mudou)

#### 2. Conditional execution
```yaml
- name: Contract checks
  if: contains(github.event.head_commit.modified, 'openapi/')
  run: npm run test:contract
```

**Ganho esperado**: Pular steps irrelevantes

#### 3. Matrix paralelo
```yaml
jobs:
  test:
    strategy:
      matrix:
        test-suite: [unit, integration, api, worker]
    steps:
      - run: npm run test:${{ matrix.test-suite }}
```

**Ganho esperado**: 4 suites em paralelo (~75% redução de tempo)

#### 4. Timeout apropriado
```yaml
jobs:
  quick-checks:
    timeout-minutes: 5  # ← Falhar rápido se travar
  integration-tests:
    timeout-minutes: 15  # ← Mais tempo para E2E
```

**Ganho esperado**: Detectar travamentos mais cedo

---

## Comandos Úteis

### Local

```bash
# Simular CI completo
docker compose down -v && docker compose up -d postgres
npm ci
npm run migrate
npm run test:contract
npm run validate:cetesb-source && npm run test:source-of-truth
npm run validate:md-links
npm run smoke:job:retry-dlq

# Validar subset
npm run validate:openapi && npm run test:contract

# Debug de falha específica
npm test -- tests/integration/openapi-queue-contract.test.js --verbose

# Limpar estado
docker compose down -v
rm -rf node_modules package-lock.json
npm install
```

### GitHub Actions (via CLI - se disponível)

```bash
# Listar workflows
gh workflow list

# Executar workflow manualmente
gh workflow run ci-contract-queue.yml

# Ver status de run
gh run list --workflow=ci-contract-queue.yml

# Ver logs de run específico
gh run view <run-id> --log

# Re-run workflow falho
gh run rerun <run-id>
```

---

## Handoff para Especialistas

### Template: CI → Backend
```markdown
@ci-cd-github-mtr → @programador-backend-mtr

**Contexto**: CI falhou em contract test
**Workflow**: ci-contract-queue.yml
**Job**: contract-and-queue-checks
**Step**: Contract checks
**Erro**: 
```
AssertionError: expected 200, got 500
POST /v1/manifestos/:id/submit
```

**Diff impactado**:
- src/routes/manifest-routes.js (linha 145)
- src/services/manifest-service.js (enqueueManifestSubmit)

**Ação necessária**: Corrigir route handler ou validator
**Critério de pronto**: npm run test:contract passando
```

### Template: CI → CETESB Validator
```markdown
@ci-cd-github-mtr → @validador-cetesb-mtr

**Contexto**: CI falhou em CETESB source-of-truth validation
**Workflow**: ci-contract-queue.yml
**Job**: contract-and-queue-checks
**Step**: CETESB source-of-truth checks
**Erro**:
```
Mismatch: manDataExpedicao format
Expected (HAR): 2024-01-15T10:30:00-03:00
Actual (impl): 2024-01-15 10:30:00
```

**HAR**: docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har
**Arquivo**: src/gateways/cetesb-gateway.js (linha 234)

**Ação necessária**: Alinhar implementação com evidência HAR
**Critério de pronto**: npm run validate:cetesb-source passando
```

### Template: CI → Postgres Queue
```markdown
@ci-cd-github-mtr → @postgres-queue-mtr

**Contexto**: CI falhou em migration
**Workflow**: ci-contract-queue.yml
**Job**: contract-and-queue-checks
**Step**: Run database migrations
**Erro**:
```
Error applying migration 004_advanced_locking_consistency.sql
constraint "chk_job_attempts_in_range" violated by existing data
```

**Migration**: src/sql/004_advanced_locking_consistency.sql
**Constraint**: chk_job_attempts_in_range (linha 78)

**Ação necessária**: Limpar dados inválidos ou ajustar constraint
**Critério de pronto**: npm run migrate passando em banco limpo
```

---

## Validação de Pronto (Checklist Final)

Antes de marcar como "CI validado":

### Validações obrigatórias
- [ ] Todos workflows com status ✅ (green)
- [ ] 0 erros em logs de CI
- [ ] 0 warnings bloqueantes
- [ ] Cobertura de testes não regrediu
- [ ] Migrations aplicadas sem erros

### Validações contextuais
- [ ] Se mudou OpenAPI: `validate:openapi` + `test:contract` ✅
- [ ] Se mudou CETESB: `validate:cetesb-source` + `test:source-of-truth` ✅
- [ ] Se mudou SQL: migrations aplicadas em banco limpo ✅
- [ ] Se mudou docs: `validate:md-links` ✅
- [ ] Se mudou source: testes impactados ✅

### Documentação
- [ ] Se mudança arquitetural: decision-log atualizado
- [ ] Se novo endpoint: docs/copilot/ atualizado
- [ ] Se mudança em contrato: examples sincronizados

---

## Limitações

- Workflows executam apenas em ambiente GitHub (não local via gh act)
- Cache de node_modules só funciona em runners do GitHub
- Secrets/env vars podem diferir entre local e CI
- Postgres service pode ter diferenças de versão
- Timezone pode causar divergências em testes de data

---

## Referências

- Workflow principal: `.github/workflows/ci-contract-queue.yml`
- Documentação CI: `docs/copilot/14-estrutura-copilot.md` (seção Workflows)
- Comandos úteis: `docs/copilot/12-comandos-uteis.md`
- Testing guide: `docs/TESTING.md`
