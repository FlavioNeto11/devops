# Fluxos operacionais

## 1. Session context

Entrada:
- `POST /v1/session-contexts`

Cenários:
- receber `jwtToken` pronto
- receber `authMode=bootstrap` com credenciais + `recaptchaToken`

Saída:
- contexto persistido
- JWT reutilizável até perto do vencimento

## 2. Criar manifesto

Entrada:
- `POST /v1/manifestos`

Efeito:
- grava manifesto interno
- ainda sem efeito externo obrigatório

## 3. Submit de manifesto

Entrada:
- `POST /v1/manifestos/:id/submit`

Fluxo:
1. enfileira job
2. worker busca manifesto
3. worker resolve sessão válida
4. gateway faz `PUT /api/mtr/manifesto`
5. response fornece hash em `mensagem`
6. sistema tenta resolver `manCodigo` e `manNumero` via pesquisa
7. persiste ids externos
8. job conclui

## 4. Print de manifesto

Entrada:
- `POST /v1/manifestos/:id/print`

Fluxo:
1. enfileira job
2. worker resolve hash
3. gateway baixa PDF real
4. persiste documento local
5. job conclui com referência ao artefato

## 9. Health monitoring e observabilidade (DL-022)

Entrada:
- Worker iniciado (`npm run worker`)

Fluxo:
1. worker registra-se na tabela `worker_health` (auto-registration)
2. heartbeat enviado a cada 30s (`sendWorkerHeartbeat`)
3. stats de execução atualizados (claimed, succeeded, failed, dlq, durations)
4. eventos de sistema registrados na tabela `system_events` (worker.start, worker.shutdown, etc.)
5. métricas de performance calculadas via SQL (`calculate_job_performance_metrics`)
6. shutdown gracioso atualiza status para `stopped`

Endpoints REST disponíveis:
- `GET /v1/health/system` - visão geral do sistema
- `GET /v1/health/workers` - workers ativos e health status
- `GET /v1/health/jobs/active` - jobs em execução
- `GET /v1/health/jobs/dlq` - jobs na dead letter queue
- `GET /v1/health/metrics/performance` - métricas agregadas de performance
- `POST /v1/health/maintenance/cleanup` - limpeza de jobs antigos
- `GET /v1/ping` - verificação básica

## 5. Cancel de manifesto

Entrada:
- `POST /v1/manifestos/:id/cancel`

Fluxo:
1. enfileira job
2. worker obtém `manCodigo` e `manNumero`
3. se faltar, executa lookup automático com retry (5 tentativas, backoff 2s→20s)
4. gateway tenta cancelamento com estratégia de headers (`x-access-token`, `Authorization`, `both`)
5. em `401/403`, força `ensureAuthForSession(..., forceRefresh=true)` e repete cancelamento
6. gateway cancela manifesto via `POST /api/mtr/manifesto/cancelaManifesto`
7. persiste resultado operacional do cancelamento em `manifests.payload.jobResults['manifest.cancel']`
8. manifesto local muda de estado
9. job conclui

**Atualização 2026-03-12 (auth refresh real):**
- `ensureAuthForSession` não reaproveita JWT expirado de `manual-token` quando há credenciais de refresh.
- refresh passa a forçar login real CETESB (não apenas ecoar token existente).
- se faltar credenciais mínimas de refresh, retorna erro explícito de contexto (`SESSION_CONTEXT_REFRESH_CREDENTIALS_MISSING`).

**Detalhes do Lookup (DL-020):**
- Endpoint: `GET /api/mtr/pesquisaManifesto/{empresaId}/{estadoId}/{tipoManifesto}/{dataInicio}/{dataFim}/{status}/{tipoOperacao}`
- Parâmetros críticos:
  - `statusFilter=0` (todos os status)
  - `daysBack=7` (máximo 7 dias para evitar 404)
  - `dateTo` = expeditionDate (sem +1 dia)
- Retry: 5 tentativas com delays [2s, 5s, 10s, 15s, 20s]
- Fallback: job falha se lookup não resolver após retries

### 5.1. Cancelamento em Lote

Script: `scripts/cancelar-manifestos-2026-03-09.js`

Fluxo:
1. Busca manifestos via `GET /api/mtr/pesquisaManifesto/...` com filtro de data
2. Para cada manifesto com `manCodigo`/`manNumero`:
   - `POST /api/mtr/manifesto/cancelaManifesto`
   - Tratamento de erros (já cancelado, status inválido, etc)
3. Relatório final: total cancelados vs erros

## 6. Pesquisa de manifestos

Entrada:
- `GET /v1/manifestos`

Fluxo:
1. consulta base local (`manifests`) com filtros
2. quando não há itens locais e `CETESB_GATEWAY_MODE=real`, executa fallback em `GET /api/mtr/pesquisaManifesto/...`
   - para range com mais de 1 dia, segmenta em buscas diárias (`dateFrom=dateTo`) e agrega resultados
   - dias com erro CETESB (`404/5xx`) são tratados como falha parcial de janela, sem descartar dias saudáveis
   - mantém fallback por janela de `kind=all` → `kind=0`
3. usa `integrationAccountId` (e opcionalmente `sessionContextId`) para resolver sessão/token
4. faz upsert local por `external_hash_code` e/ou `manCodigo`/`manNumero`
5. reaplica filtros e retorna paginação no contrato interno (`ManifestSearchResponse`)

## 7. Catalog sync

Entrada:
- `POST /v1/catalog-sync`

Fluxo:
1. enfileira job
2. worker chama endpoints de catálogo
3. faz upsert em Postgres
4. marca sync concluído

## 9. Retry, priorização e DLQ (worker)

Entrada:
- jobs em `queued` ou `retry_wait`

Fluxo:
1. worker faz claim com `FOR UPDATE SKIP LOCKED`
2. ordenação por `priority desc, queued_at asc`
3. em erro, calcula próximo retry via estratégia configurada (`exponential`, `linear`, `fixed`) + jitter
4. persiste `retry_delays`, `last_error_*`, `execution_time_ms` e `tags`
5. ao atingir `max_attempts`, move job para `job_dead_letter_queue`
6. job original fica com status `dlq` e motivo (`dlq_reason`)

## 10. Batch Cleanup de Manifestos Travados (DL-020)

Script: `scripts/fix-stuck-manifests.js`

Entrada:
- Manifestos em `submitting` sem `external_hash_code`
- Data específica (ex: `2026-03-09`)

Fluxo:
1. Identifica manifestos travados via query SQL
2. Categoriza:
   - **Recuperáveis**: erros temporários (timeout, network, 400 genérico)
   - **Irrecuperáveis**: erros de negócio CETESB ("não possui o perfil")
3. Processa irrecuperáveis:
   - `UPDATE manifests SET status='error', external_status='erro_submit'`
4. Processa recuperáveis:
   - `UPDATE jobs SET status='queued', attempts=0, next_retry_at=NOW()...`
   - `UPDATE manifests SET status='draft'`
5. Gera relatório detalhado

**Modos:**
- `--dry-run`: preview sem alterações
- Sem flag: execução real

**Exemplo de uso:**
```bash
node scripts/fix-stuck-manifests.js --dry-run  # Preview
node scripts/fix-stuck-manifests.js            # Executar
```

Arquivos impactados:
- `src/workers/job-runner.js`
- `src/repositories/job-repo.js`
- `src/lib/retry.js`
- `src/sql/002_queue_improvements.sql`

## 8. Cadastro submit

Entrada:
- `POST /v1/cadastros`

Fluxo:
1. enfileira ou executa conforme desenho atual do caso de uso
2. transforma payload interno
3. chama `POST /api/cadastro/salvarAcesso`
4. persiste resposta relevante

## 11. Persistência de resultado em jobs finalizados (2026-03-12)

Regra consolidada:
- retorno de job finalizado deve ser refletido também na entidade de origem (não apenas em `jobs.payload`).

Aplicações:
- `manifest.submit` → `manifests.payload.jobResults['manifest.submit']`
- `manifest.print` → `manifests.payload.jobResults['manifest.print']` (inclui `printUrl`)
- `manifest.cancel` → `manifests.payload.jobResults['manifest.cancel']`
- `cadastro.submit` → `cadastros.external_response.latestGatewayResponse` + `jobResult`
- `catalog.sync` → `catalog_sync_requests.catalogs` com retorno efetivo sincronizado

## 12. Dashboard de observabilidade consolidado (DL-071)

Entrada:
- `GET /v1/dashboard/overview`

Fluxo:
1. rota agrega estado de saúde (`/v1/health/system`, `/v1/health/workers`, `/v1/health/jobs/active`, `/v1/health/jobs/dlq`)
2. consulta métricas de performance em `health-repo` (`calculateJobPerformanceMetrics`)
3. consulta tendência temporal (`getJobMetricsTimeline`) para janela `24h` ou `7d`
4. consulta ranking de latência CETESB (`getCetesbEndpointLatency`)
5. calcula resumo de manifestos para cards operacionais
6. persiste snapshot resumido em `performance_snapshots` (`captureDashboardSnapshots`)
7. responde payload único com `health`, `performance`, `timeline`, `endpoints`, `manifestsSummary`, `latestSnapshot`

Componentes impactados:
- Backend: `src/repositories/health-repo.js`, `src/routes/api-routes.js`
- Frontend: `frontend/src/services/api.js`, `frontend/src/views/DashboardView.vue`
- Contrato: `openapi/mtr_automacao_openapi_interna.yaml` + `examples/get_v1_dashboard_overview_*`
