# 06 — Frontend UX: Centro Operacional SICAT

## Objetivo da fase

Implementar a camada Vue 3 do Centro Operacional SICAT: 6 módulos navegáveis
(operations-dashboard, jobs-console, audit-explorer, cetesb-accounts-health,
mtr-reports, command-center) consumindo os endpoints publicados na fase
03-backend-contracts e respeitando a taxonomia de status operacionais
publicada na fase 04-observability-admin. Sem inventar backend de IA.

## Arquivos analisados

- [docs/handoffs/centro-operacional-sicat/00-orchestration.md](../../handoffs/centro-operacional-sicat/00-orchestration.md)
- [docs/handoffs/centro-operacional-sicat/03-backend-contracts.md](../../handoffs/centro-operacional-sicat/03-backend-contracts.md)
- [docs/handoffs/centro-operacional-sicat/07-observability-admin.md](../../handoffs/centro-operacional-sicat/07-observability-admin.md)
- [src/lib/operational-status.ts](../../../src/lib/operational-status.ts) — base para o espelho frontend.
- [frontend/src/router.js](../../../frontend/src/router.js), [frontend/src/App.vue](../../../frontend/src/App.vue), [frontend/src/services/api.js](../../../frontend/src/services/api.js) — pontos de extensão.
- [frontend/tests/ui/audit.spec.ts](../../../frontend/tests/ui/audit.spec.ts) — referência de mocks Playwright.
- examples/get_v1_operations_overview_response.json, get_v1_jobs_search_response.json,
  get_v1_audit_search_response.json, get_v1_cetesb_accounts_health_response.json,
  get_v1_cetesb_sessions_health_response.json, get_v1_reports_mtrs_response.json.

## Decisões

- **Espelho de taxonomia**: criado [frontend/src/modules/command-center/operationalStatus.js](../../../frontend/src/modules/command-center/operationalStatus.js)
  replicando `OPERATIONAL_STATUS_REGISTRY` + helpers (`describeOperationalStatus`,
  `describeJobOperationalStatus`, `severityToVuetifyColor`, `isRetryable`).
  Frontend NÃO importa de `src/**` — espelho mantém autonomia do bundle.
- **Guard de rota**: todas as rotas `/operacao/*` mantêm
  `requiresSicatAuth: true` e `requiresActiveCetesbAccount: true`, alinhado ao
  padrão atual de `/manifestos`. Se no futuro o produto exigir leitura de
  jobs/audit/relatórios sem conta CETESB ativa (ex: gestor multi-tenant),
  basta remover o segundo guard nas rotas relevantes.
- **Command Center (base)**: implementado como registry declarativo
  ([commandRegistry.js](../../../frontend/src/modules/command-center/commandRegistry.js))
  + view com filtro textual. Sem IA, sem backend novo. Pronto para ganhar
  camada generativa em frente futura.
- **Export CSV de MTR**: download via Blob + anchor (sem janela nova),
  tratamento explícito de HTTP 413 retornando código
  `REPORT_EXPORT_LIMIT_EXCEEDED` para o usuário.
- **Idempotency-Key (retry)**: gerada client-side com `crypto.randomUUID()`
  no formato `retry-{jobId}-{uuid}`, satisfazendo contrato de idempotência.
- **Camada de service**: 5 wrappers finos
  (operationsService, jobsConsoleService, auditService, cetesbHealthService,
  mtrReportsService) re-exportando funções de `api.js`. Mantém futura
  substituição/mock fácil sem tocar nas views.
- **Badge compartilhado**: [OperationalStatusBadge.vue](../../../frontend/src/modules/shared/OperationalStatusBadge.vue)
  consome o registry e expõe `data-testid` para os testes.

## Arquivos criados

- [frontend/src/modules/command-center/operationalStatus.js](../../../frontend/src/modules/command-center/operationalStatus.js)
- [frontend/src/modules/command-center/commandRegistry.js](../../../frontend/src/modules/command-center/commandRegistry.js)
- [frontend/src/modules/command-center/CommandCenterView.vue](../../../frontend/src/modules/command-center/CommandCenterView.vue)
- [frontend/src/modules/operations-dashboard/OperationsDashboardView.vue](../../../frontend/src/modules/operations-dashboard/OperationsDashboardView.vue)
- [frontend/src/views/JobsView.vue](../../../frontend/src/views/JobsView.vue)
- [frontend/src/modules/audit-explorer/AuditExplorerView.vue](../../../frontend/src/modules/audit-explorer/AuditExplorerView.vue)
- [frontend/src/modules/cetesb-accounts-health/CetesbAccountsHealthView.vue](../../../frontend/src/modules/cetesb-accounts-health/CetesbAccountsHealthView.vue)
- [frontend/src/modules/mtr-reports/MtrReportsView.vue](../../../frontend/src/modules/mtr-reports/MtrReportsView.vue)
- [frontend/src/modules/shared/OperationalStatusBadge.vue](../../../frontend/src/modules/shared/OperationalStatusBadge.vue)
- [frontend/src/services/operationsService.js](../../../frontend/src/services/operationsService.js)
- [frontend/src/services/jobsConsoleService.js](../../../frontend/src/services/jobsConsoleService.js)
- [frontend/src/services/auditService.js](../../../frontend/src/services/auditService.js)
- [frontend/src/services/cetesbHealthService.js](../../../frontend/src/services/cetesbHealthService.js)
- [frontend/src/services/mtrReportsService.js](../../../frontend/src/services/mtrReportsService.js)
- [frontend/tests/ui/centro-operacional.spec.ts](../../../frontend/tests/ui/centro-operacional.spec.ts) — Playwright smoke (6 cenários, mocks completos).

## Arquivos alterados

- [frontend/src/services/api.js](../../../frontend/src/services/api.js):
  acrescentadas `getOperationsOverview`, `searchJobs`, `retryJob`,
  `searchAuditEntries`, `getAuditByCorrelationId`, `getCetesbAccountsHealth`,
  `getCetesbSessionsHealth`, `getMtrReports`, `buildMtrReportsExportUrl`,
  `downloadMtrReportsCsv`.
- [frontend/src/router.js](../../../frontend/src/router.js): novas rotas
  `/operacao/dashboard`, `/operacao/jobs`, `/operacao/auditoria`,
  `/operacao/auditoria/:correlationId`, `/operacao/cetesb-health`,
  `/operacao/relatorios/mtr`, `/operacao/command-center`
  (todas com `requiresSicatAuth: true`, `requiresActiveCetesbAccount: true`).
- [frontend/src/App.vue](../../../frontend/src/App.vue): seis novos itens em
  `baseNavigationItems` sob seção "Centro Operacional".

## Validações

- `cd frontend; npm run build` → ✅ verde (build em 11.33s; warning de chunk
  >500 kB já existente, não regressivo).
- `npm run typecheck` (raiz) → ✅ zero erros.
- `cd frontend; npx playwright test tests/ui/centro-operacional.spec.ts` →
  ✅ **6/6 passed** em 28.1s.
  - operations dashboard renderiza KPIs e badge de severity
  - jobs console renderiza tabela com badge operacional
  - audit explorer carrega busca e timeline
  - cetesb health renderiza tabelas
  - mtr reports renderiza tabela e expõe botão export
  - command center lista comandos e filtra por busca

## Pendências / observações para o QA

- Não foi rodada a suíte completa `frontend npm run test:ui` (apenas o spec
  novo). `tester-qa-mtr` deve executar a suíte cheia para confirmar não
  regressão dos especs preexistentes (login, manifest, etc.).
- Smoke spec usa mocks de rede; recomenda-se também validação manual
  navegando a stack real (`workflow: dev (real-dev)`) para confirmar
  consumo dos endpoints reais e responsividade Vuetify.
- Bundle JS está em ~1.27 MB (gzip ~389 kB) — investigar code-splitting
  por rota em frente posterior (não bloqueia entrega).

## Handoff

- **Próximo agente**: `tester-qa-mtr`
- **Próxima fase**: `07-qa`
- **Pular fase 06-localhost**: a entrega não requer setup novo de stack
  (apenas frontend Vue/Vite já existente). Se o usuário pedir validação
  navegável humana antes do QA, basta executar `workflow: dev (real-dev)`
  e abrir `http://localhost:5174/operacao/dashboard`.
