# Comandos úteis

## Setup
```bash
cp .env.example .env
npm install
docker compose up -d postgres
npm run migrate
```

## Execução
```bash
npm run dev       # API (TypeScript via tsx)
npm run worker    # Worker
```

## TypeScript (DL-093)
```bash
# Verificar tipagem (zero errors esperados)
npm run typecheck

# Build de produção (gera dist/)
npm run build:ts

# Executar arquivo .ts diretamente (use tsx, não node)
npx tsx src/server.ts
```

## Workspace VS Code (.vscode / DL-083)
Fluxos canônicos no workspace (Tasks/Launch):
- `stack: prepare local` (install + postgres up + migrate + openapi validate)
- `stack: run (real-dev)` / `stack: run (real)`
- `stack: run (real + frontend)` / `stack: restart (real + frontend)`
- `workflow: bootstrap real` (prepare + run + smoke)
- `workflow: pre-commit` (validações rápidas antes de commit)
- `stack: shutdown` (encerramento previsível de processos + postgres)

Referência operacional completa:
- `docs/copilot/handoffs/DL-083/execution/GUIA-OPERACIONAL-VSCODE.md`

## Validação
```bash
npm run validate:openapi
npm run validate:openapi:clean
npm run validate:md-links
npm run gen:operations
npm test -- tests/unit/retry.test.js
npm test -- tests/integration/job-queue-improvements.test.js
```

## CI (contrato + fila retry/DLQ)
```bash
npm run migrate
npm run test:contract
npm run smoke:job:retry-dlq
```

## Fila / DLQ (Postgres)
```bash
psql "$DATABASE_URL" -c "select status, count(*) from jobs group by status order by 1"
psql "$DATABASE_URL" -c "select job_id, operation, reason, moved_at from job_dead_letter_queue order by moved_at desc limit 20"
psql "$DATABASE_URL" -c "\d jobs"
psql "$DATABASE_URL" -c "\d job_dead_letter_queue"
```

## Observabilidade / Health Monitoring (DL-022)
```bash
# Endpoints REST
curl http://localhost:8080/health/system
curl http://localhost:8080/health/workers
curl http://localhost:8080/health/jobs/active
curl http://localhost:8080/health/jobs/dlq
curl http://localhost:8080/health/metrics/performance
curl -X POST http://localhost:8080/health/maintenance/cleanup
curl http://localhost:8080/health/ping

# Queries SQL diretas
psql "$DATABASE_URL" -c "select * from v_system_health"
psql "$DATABASE_URL" -c "select * from v_active_jobs"
psql "$DATABASE_URL" -c "select * from worker_health order by last_heartbeat_at desc"
psql "$DATABASE_URL" -c "select * from system_events order by event_time desc limit 20"
psql "$DATABASE_URL" -c "select * from performance_snapshots order by snapshot_time desc limit 10"
psql "$DATABASE_URL" -c "select * from detect_unhealthy_workers(interval '2 minutes')"
psql "$DATABASE_URL" -c "select * from calculate_job_performance_metrics(interval '1 hour')"

# Cleanup manual de jobs antigos (>7 dias, finalizados)
psql "$DATABASE_URL" -c "select cleanup_old_jobs(interval '7 days')"

# Verificar optimistic locking (campo version)
psql "$DATABASE_URL" -c "select job_id, status, version, attempts from jobs order by created_at desc limit 10"
```

## Validação CI/CD (GitHub Actions)
```bash
# Listar últimas execuções
gh run list --limit 10

# Ver logs de execução específica
gh run view <run-id> --log

# Ver apenas logs falhados
gh run view <run-id> --log-failed

# Monitorar execução em tempo real
gh run watch <run-id>

# Re-executar workflow falhado
gh run rerun <run-id>

# Executar workflow manualmente
gh workflow run ci-contract-queue.yml
```

## Troubleshooting CI/CD (Exemplos Reais)

### Erro: "functions in index predicate must be marked IMMUTABLE"
```bash
# Problema: NOW() em predicado WHERE de índice
# Solução: Remover predicado temporal ou usar IMMUTABLE function
# Arquivo: src/sql/004_advanced_locking_consistency.sql
# Commit: 9a37aa6
```

### Erro: "could not determine data type of parameter $2"
```bash
# Problema: PostgreSQL 16+ não infere tipos em COALESCE/jsonb_build_object
# Solução: Adicionar type casts (::timestamptz, ::integer, ::text)
# Arquivo: src/repositories/health-repo.js
# Commit: 811b2ed
```

### Erro: "constraint chk_job_retry_wait_integrity violated"
```bash
# Problema: Constraint muito restritiva (next_retry_at > queued_at)
# Solução: Simplificar para next_retry_at IS NOT NULL
# Arquivo: src/sql/004_advanced_locking_consistency.sql
# Commit: 811b2ed
```

### Erro: "Broken link in docs/"
```bash
# Problema: Path relativo incorreto
# Solução: Ajustar para caminho correto (../../..)
# Validar: npm run validate:md-links
# Commit: cf0d34a
```

## Observações
- em ambiente real, configure `CETESB_GATEWAY_MODE=real`
- o login real depende de recaptcha externo
- valide sempre API e worker juntos quando a tarefa tocar fluxo assíncrono
- se aparecer `Debugger attached.` localmente, limpe `NODE_OPTIONS` antes de validar (`PowerShell`: `$env:NODE_OPTIONS=''`)
- **TypeScript**: use `tsx` para executar `.ts` em dev; `tsc` para build de produção
- **NOVO**: Antes de push, execute validação local: `npm run typecheck && npm run migrate && npm run test:contract && npm run validate:md-links`
