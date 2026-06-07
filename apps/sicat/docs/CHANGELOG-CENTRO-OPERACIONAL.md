# CHANGELOG — Centro Operacional SICAT

> Release notes consolidadas da cadeia `centro-operacional-sicat`,
> concluída em 2026-04-25 com QA verde
> ([09-qa-validation.md](handoffs/centro-operacional-sicat/09-qa-validation.md)).

## [centro-operacional-sicat] — 2026-04-25

### Visão geral

Consolidação da camada operacional do SICAT sobre o núcleo MTR/CDF já
estável: módulos dedicados de operação, observabilidade, governança,
diagnóstico e relatórios, mais a base estrutural (registry + UI palette)
para o futuro chat orquestrador (Command Center). Nenhuma reescrita de
gateway CETESB, nenhuma violação da fronteira
`route → service → repository → job → worker → gateway`.

### Backend — novos endpoints

Publicados em [openapi/mtr_automacao_openapi_interna.yaml](../openapi/mtr_automacao_openapi_interna.yaml)
e [src/generated/operations.ts](../src/generated/operations.ts) (lockstep).

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/v1/operations/overview` | Agregações operacionais: counters de jobs por status, succeeded/failed em 24h, manifestos por status, sumário de contas/sessões, top-10 DLQ, `recentJobs`, `recentErrors`. |
| GET | `/v1/jobs/search` | Pesquisa avançada de jobs com `operationalStatus`, `label`, `severity`, `recommendedAction`, `retryable`, `bucket`. |
| POST | `/v1/jobs/{jobId}/retry` | Retry transacional. DLQ → `requeueFromDLQ`; `failed`/`cancelled` → novo job preservando linhagem em `payload._retryOf`. Idempotente via `Idempotency-Key`. 202 `CommandAccepted`. |
| GET | `/v1/audit/search` | Pesquisa filtrada de trilhas de auditoria. |
| GET | `/v1/cetesb/accounts/health` | Saúde agregada por conta CETESB (derivada de `sicat_cetesb_accounts`, `session_contexts`, `jobs`; zero round-trip externo). |
| GET | `/v1/cetesb/sessions/health` | Saúde individual de sessões. |
| GET | `/v1/reports/mtrs` | Relatório operacional dedicado de MTRs. |
| GET | `/v1/reports/mtrs/export` | Export síncrono CSV (cap de 5000 linhas; HTTP 413 `REPORT_EXPORT_LIMIT_EXCEEDED` acima do cap). |

Endpoints já existentes mantidos sem alteração: `GET /v1/jobs/{jobId}`,
`GET /v1/jobs/{jobId}/events`, `GET /v1/audit/{correlationId}`.

### Persistência — migration `012_operations_indexes.sql`

Idempotente (`create index if not exists`), sem alterar schema, sem
tocar nas 5 constraints DL-022 nem nos triggers de `version` (locking
otimista).

Índices novos:

- `idx_jobs_payload_integration_account` em `jobs ((payload ->> 'integrationAccountId'))`.
- `idx_jobs_payload_session_context` em `jobs ((payload ->> 'sessionContextId'))`.
- `idx_jobs_status_finished_at` em `jobs (status, finished_at desc)`.
- `idx_jobs_operation_status` em `jobs (operation, status)`.
- `idx_jobs_correlation_id` em `jobs (correlation_id)`.
- `idx_audit_logs_entity_occurred` em `audit_logs (entity_type, occurred_at desc)`.
- `idx_audit_logs_component_occurred` em `audit_logs (component, occurred_at desc)`.
- `idx_session_contexts_account_status` em `session_contexts (integration_account_id, status)`.
- `idx_session_contexts_status_updated` em `session_contexts (status, updated_at desc)`.
- `idx_manifests_expedition_date_text` em `manifests ((payload ->> 'expeditionDate'))` (texto puro — cast para `date` não é IMMUTABLE).

### Taxonomia operacional (13 estados)

- Registry canônico em código:
  [src/lib/operational-status.ts](../src/lib/operational-status.ts)
  (`OPERATIONAL_STATUS_REGISTRY` frozen + helpers
  `mapJobToOperationalStatus`, `describeOperationalStatus`,
  `describeJobOperationalStatus`).
- Documentação canônica:
  [docs/05-operacao/taxonomia-status-erros-operacionais.md](05-operacao/taxonomia-status-erros-operacionais.md)
  (label, severity, retryable, bucket, recommendedAction, regras de
  transição, mapeamento job → status).
- Espelho frontend (sem importar de `src/**`):
  [frontend/src/modules/command-center/operationalStatus.js](../frontend/src/modules/command-center/operationalStatus.js).
- Backend: `mapOperationalStatus` em
  [src/services/operations-service.ts](../src/services/operations-service.ts)
  delega ao lib; `JobSearchItem` e `recentDlq`/`recentJobs`/`recentErrors`
  do overview carregam o descritor enriquecido.

### Frontend — módulos Vue 3

Nova seção "Centro Operacional" em
[frontend/src/App.vue](../frontend/src/App.vue) e rotas em
[frontend/src/router.js](../frontend/src/router.js) (todas com
`requiresSicatAuth: true` e `requiresActiveCetesbAccount: true`):

- `/operacao/dashboard` — `OperationsDashboardView.vue`.
- `/operacao/jobs` — `JobsConsoleView.vue` (busca + retry com
  `Idempotency-Key` `retry-{jobId}-{uuid}`).
- `/operacao/auditoria` e `/operacao/auditoria/:correlationId` —
  `AuditExplorerView.vue`.
- `/operacao/cetesb-health` — `CetesbAccountsHealthView.vue`.
- `/operacao/relatorios/mtr` — `MtrReportsView.vue` (export CSV via
  Blob + anchor; trata HTTP 413 `REPORT_EXPORT_LIMIT_EXCEEDED`).
- `/operacao/command-center` — `CommandCenterView.vue` (registry
  declarativo + filtro textual; sem IA, sem backend novo).

Componentes e services de apoio:

- `OperationalStatusBadge.vue` (consome o espelho da taxonomia, expõe
  `data-testid` para Playwright).
- 5 services finos em `frontend/src/services/`: `operationsService.js`,
  `jobsConsoleService.js`, `auditService.js`, `cetesbHealthService.js`,
  `mtrReportsService.js`.
- 10 novas funções em `frontend/src/services/api.js`
  (`getOperationsOverview`, `searchJobs`, `retryJob`,
  `searchAuditEntries`, `getAuditByCorrelationId`,
  `getCetesbAccountsHealth`, `getCetesbSessionsHealth`,
  `getMtrReports`, `buildMtrReportsExportUrl`,
  `downloadMtrReportsCsv`).

### Command Center — base estrutural

- Registry declarativo em
  [frontend/src/modules/command-center/commandRegistry.js](../frontend/src/modules/command-center/commandRegistry.js).
- View com filtro textual (`CommandCenterView.vue`).
- Sem backend de IA, sem endpoint `/v1/ai/*`. Pronto para ganhar
  camada generativa em frente futura (Frente 7 do backlog CTO).
- Detalhamento arquitetural:
  [docs/04-arquitetura/command-center-sicat.md](04-arquitetura/command-center-sicat.md).

### Documentação publicada

- [AGENTS.md](../AGENTS.md) (raiz) — onboarding rápido para qualquer agente.
- [docs/04-arquitetura/centro-operacional-sicat.md](04-arquitetura/centro-operacional-sicat.md).
- [docs/04-arquitetura/command-center-sicat.md](04-arquitetura/command-center-sicat.md).
- [docs/05-operacao/taxonomia-status-erros-operacionais.md](05-operacao/taxonomia-status-erros-operacionais.md).
- [docs/10-estado-atual/estado-atual.md](10-estado-atual/estado-atual.md) — snapshot consolidado pós-cadeia.
- [docs/10-estado-atual/PROXIMO_PROMPT.md](10-estado-atual/PROXIMO_PROMPT.md) — próxima frente recomendada (DMR).
- [docs/_inputs/fonte-de-verdade-backlog-cto.md](_inputs/fonte-de-verdade-backlog-cto.md).
- Checkpoints por fase em [docs/handoffs/centro-operacional-sicat/](handoffs/centro-operacional-sicat/).

### Validação QA — 2026-04-25

Detalhe completo em
[docs/handoffs/centro-operacional-sicat/09-qa-validation.md](handoffs/centro-operacional-sicat/09-qa-validation.md).

| Comando | Status | Nº testes |
|---|---|---:|
| `npm run typecheck` | PASS | n/a |
| `npm run validate:openapi` | FAIL não bloqueante (1 link md, F1) | n/a |
| `npm run validate:cetesb-source` | PASS | 11 checks |
| `npm run validate:har-gateway` | PASS | 11 checks |
| `npm run validate:agents` | PASS | 18 agentes |
| `npm run test:source-of-truth` | PASS | 6/6 |
| `npm run test:api` | PASS | 23/23 |
| `npm run test:integration` | PASS | 124/124 |
| `npm run test:worker` | PASS | 14/14 |
| `npm run test:contract` | PASS (testes) / FAIL md-links (F1) | 4/4 |
| `tsx --test tests/unit/*.test.js tests/contract/*.test.js tests/smoke/*.test.js` | PASS | 120/120 |
| `cd frontend && npm run build` | PASS (aviso de chunk > 500 kB, F3) | n/a |
| `cd frontend && npx playwright test tests/ui/centro-operacional.spec.ts` | PASS | 6/6 |
| `cd frontend && npx playwright test` (suíte completa) | FAIL parcial (15 falhas pré-existentes, F2) | 49 / 15 / 11 |
| `cd frontend && npx playwright test tests/ui/audit.spec.ts tests/ui/validation-e2e.spec.ts` | PASS | 15/15 |
| `npm run smoke:health` | PASS | 7/7 |
| `npm run smoke:openapi` | PASS | 2/2 |

### Pendências conhecidas

- **F1** — link `frontend/tests/ui/login.spec.ts` em
  [docs/handoffs/centro-operacional-sicat/06-frontend-ux.md](handoffs/centro-operacional-sicat/06-frontend-ux.md)
  reapontado para `frontend/tests/ui/audit.spec.ts` na fase
  `08-docs-final` (doc-only).
- **F2** — 15 falhas Playwright pré-existentes herdadas das cadeias
  `homepage-canvas-continuous-storytelling` e da camada conversacional.
  Tratamento pertence às frentes originais.
- **F3** — bundle Vite com chunks > 500 kB (aviso, não bloqueia).
  Otimização de code-splitting fica fora do escopo desta cadeia.

### Compatibilidade

- Endpoints novos não conflitam com os existentes; campos novos em
  `OperationsOverviewResponse` e `JobSearchItem` são aditivos.
- Migration `012` é idempotente.
- Nenhum contrato CETESB foi alterado.
- Frontend continua exigindo `requiresSicatAuth` + `requiresActiveCetesbAccount`
  nas novas rotas.
