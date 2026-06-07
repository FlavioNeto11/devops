# Estado atual do SICAT

> Snapshot honesto baseado em código, OpenAPI publicado e checkpoints
> recentes. Nada aqui é marcado como IMPLEMENTADO sem evidência verificável.
> Última revisão: fase `09-docs-final` do work `mtr-provisorio-wizard-frontend`
> (2026-04-25).

## 1. Leitura executiva

O SICAT já consolidou um núcleo operacional estável de:

- autenticação SICAT própria + seleção de conta CETESB ativa;
- criação, listagem, replicação e operação assíncrona de manifestos
  (submit, print, cancel, receive);
- emissão e download de CDF padrão (por manifesto recebido);
- catálogos CETESB sincronizados localmente;
- fila transacional Postgres com locking otimista, retry, DLQ e
  observabilidade (DL-022);
- frontend Vue 3 cobrindo dashboard, manifestos, jobs, contas CETESB,
  administração de acessos e relatório operacional de MTRs.

A próxima evolução estratégica — definida pelo work
`centro-operacional-sicat` — é amadurecer o produto para postura de
**Centro Operacional SICAT**: consolidar operação, observabilidade,
governança, diagnóstico e relatórios em módulos dedicados, preparando a
base estrutural para um futuro chat orquestrador (Command Center).

## 2. IMPLEMENTADO (com evidência)

### 2.1 Backend (TypeScript, Express, Postgres)

Rotas publicadas em `src/routes/api-routes.ts`, conferidas contra o código:

- saúde e fila: `GET /v1/ping`, `GET /v1/health/system`,
  `GET /v1/health/workers`, `GET /v1/health/jobs/active`,
  `POST /v1/health/jobs/active/:jobId/cancel`,
  `DELETE /v1/health/jobs/active/:jobId`,
  `GET /v1/health/jobs/dlq`, `POST /v1/health/jobs/dlq/:jobId/requeue`,
  `DELETE /v1/health/jobs/dlq/:jobId`;
- métricas: `GET /v1/health/metrics/performance`,
  `GET /v1/health/metrics/timeline`,
  `GET /v1/health/metrics/endpoints`;
- dashboard: `GET /v1/dashboard/overview`;
- manutenção: `POST /v1/maintenance/cleanup`;
- auth CETESB: `POST /v1/auth/login`, `GET /v1/auth/partner-info`;
- auth SICAT: `POST /v1/sicat/auth/login`,
  `POST /v1/sicat/auth/register`, `POST /v1/sicat/auth/refresh`;
- contas CETESB: `GET /v1/sicat/cetesb-accounts`,
  `POST /v1/sicat/cetesb-accounts`,
  `POST /v1/sicat/cetesb-accounts/:accountId/activate`,
  `DELETE /v1/sicat/cetesb-accounts/:accountId`,
  `GET /v1/sicat/session`;
- administração de acessos (RBAC interno): users, roles, permissions,
  sessions, grant/revoke, password reset/expire em
  `/v1/admin/access/...`;
- session contexts: `POST /v1/session-contexts`,
  `GET /v1/session-contexts/:id`;
- catálogos: `POST /v1/catalog-sync`, `GET /v1/catalogs/:catalogName`;
- parceiros: `GET /v1/partners/search`;
- cadastros: `POST /v1/cadastros`, `GET /v1/cadastros/:id`;
- manifestos: criação singular e batch, listagem, detalhe, replicate,
  delete, submit, print, cancel, batch-submit, batch-cancel,
  `POST /v1/manifestos/receive`;
- CDF: `POST /v1/cdf/generate`, `POST /v1/cdf/download`,
  `GET /v1/cdf/certificates`, `GET /v1/cdf/documents/:documentId`;
- jobs e auditoria: `GET /v1/jobs/:jobId`,
  `GET /v1/jobs/:jobId/events`, `GET /v1/audit/:correlationId`;
- documentos de manifesto:
  `GET /v1/manifestos/:id/documents/:documentId`;
- **DMR — fluxo declaratório base (cadeia `dmr-fluxo-base`, 2026-04-25)**:
  `GET /v1/dmr`, `POST /v1/dmr`, `GET /v1/dmr/pendentes`,
  `GET /v1/dmr/:dmrId`, `DELETE /v1/dmr/:dmrId`,
  `POST /v1/dmr/:dmrId/consolidate`, `POST /v1/dmr/:dmrId/submit`
  (assíncrono 202 + `Idempotency-Key`),
  `GET /v1/dmr/:dmrId/status`, `GET /v1/dmr/:dmrId/items`,
  `POST /v1/dmr/:dmrId/items`, `DELETE /v1/dmr/:dmrId/items/:itemId`.
  Persistência via migration
  [src/sql/013_dmr_declarations.sql](../../src/sql/013_dmr_declarations.sql)
  (DL-022: locking otimista, trigger `increment_version`, 5 constraints
  de consistência). Validador declaratório em
  [src/lib/validators/dmr-validator.ts](../../src/lib/validators/dmr-validator.ts)
  (códigos `DMR_*` estáveis). Worker handler `dmr.submit` em
  [src/workers/operation-handlers.ts](../../src/workers/operation-handlers.ts).
  Gateway DMR isolado em
  [src/gateways/cetesb-gateway.js](../../src/gateways/cetesb-gateway.js)
  como **stub contratual** (Caminho B —
  [02-source-validation.md §8](../handoffs/dmr-fluxo-base/02-source-validation.md#8-decis%C3%A3o-de-roteamento-%E2%80%94-recomenda%C3%A7%C3%A3o-caminho-b))
  retornando `application/problem+json` 503 com
  `code: DMR_GATEWAY_PENDING_HAR` até captura humana de HAR.
  Checkpoints:
  [04-backend-contracts.md](../handoffs/dmr-fluxo-base/04-backend-contracts.md),
  [05-persistence-queue.md](../handoffs/dmr-fluxo-base/05-persistence-queue.md),
  [06-domain-rules.md](../handoffs/dmr-fluxo-base/06-domain-rules.md),
  [07-frontend-ux.md](../handoffs/dmr-fluxo-base/07-frontend-ux.md),
  [08-qa-validation.md](../handoffs/dmr-fluxo-base/08-qa-validation.md).
  CHANGELOG: [docs/CHANGELOG-DMR-FLUXO-BASE.md](../CHANGELOG-DMR-FLUXO-BASE.md).
- **MTR provisório — fluxo base (cadeia `mtr-provisorio-fluxo-base`,
  2026-04-25)**: Frente 3 do backlog CTO
  ([§4.4 e §5](../_inputs/fonte-de-verdade-backlog-cto.md)). Família HTTP
  `/v1/mtr-provisorio/*` (5 operações: `mtrProvisorioList`,
  `mtrProvisorioCreate`, `mtrProvisorioGet`, `mtrProvisorioCancel`,
  `mtrProvisorioPrint`) publicada em lockstep
  OpenAPI ↔ examples ↔ [src/generated/operations.ts](../../src/generated/operations.ts)
  (88 operações totais). Persistência reaproveita `manifests` com
  discriminador SICAT `kind` via migration aditiva idempotente
  [src/sql/014_mtr_provisorio_kind.sql](../../src/sql/014_mtr_provisorio_kind.sql)
  (colunas `kind`, `provisional_number`, `definitive_manifest_id`;
  índices `ix_manifests_kind` e parcial `ix_manifests_kind_provisorio`;
  preserva DL-022 — sem alterar constraints, locking otimista mantido).
  Validador canônico
  [src/lib/validators/mtr-provisorio-validator.ts](../../src/lib/validators/mtr-provisorio-validator.ts)
  (códigos `MTR_PROVISORIO_PAYLOAD_INVALID`,
  `MTR_PROVISORIO_STATUS_TRANSITION_INVALID`,
  `MTR_PROVISORIO_NOT_CANCELLABLE`, `MTR_PROVISORIO_NOT_PRINTABLE`).
  Bloco `MTR_PROVISORIO_*` em
  [src/lib/operational-status.ts](../../src/lib/operational-status.ts)
  espelhado no frontend
  [frontend/src/modules/command-center/operationalStatus.js](../../frontend/src/modules/command-center/operationalStatus.js).
  Gateway isolado em
  [src/gateways/cetesb-gateway.js](../../src/gateways/cetesb-gateway.js)
  (`submitMtrProvisorio`, `listMtrProvisorio`, `printMtrProvisorio`).
  Worker handler ramifica `manifest.submit` e `manifest.print` por
  `payload.kind` em
  [src/workers/operation-handlers.ts](../../src/workers/operation-handlers.ts).
  Decisão **R3-C** formalizada: `kind` discriminador SICAT é convertido
  para `tipoManifestoOverride` na borda do service (constante
  `PROVISORIO_TIPO_MANIFESTO_OVERRIDE`, default `2`, sobrescrevível por
  env). Decisão **R5** formalizada: `submitted` permanece como status
  físico pós-impressão; a presença do PDF é sinalizada via
  `payload.jobResults['manifest.print']` (chip "Documento disponível"
  no detalhe). Frontend Vue 3: rotas `/mtr-provisorio`,
  `/mtr-provisorio/novo`, `/mtr-provisorio/:id` em
  [frontend/src/router.js](../../frontend/src/router.js) com
  `requiresSicatAuth + requiresActiveCetesbAccount`; service em
  [frontend/src/services/mtrProvisorioService.js](../../frontend/src/services/mtrProvisorioService.js);
  store em
  [frontend/src/stores/mtrProvisorioStore.js](../../frontend/src/stores/mtrProvisorioStore.js);
  helpers em
  [frontend/src/views/mtr-provisorio/mtrProvisorioUiHelpers.js](../../frontend/src/views/mtr-provisorio/mtrProvisorioUiHelpers.js).
  Spec smoke Playwright
  [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
  10/10 (5 baseline + 5 cenários expandidos: filtro `failed_submit`
  + badge `failed_remote_auth`, cancelar `draft`, imprimir após
  `submitted` com `commandId`/`jobId`, chip "Documento disponível",
  400 `MTR_PROVISORIO_PAYLOAD_INVALID`). Checkpoints:
  [00-orchestration.md](../handoffs/mtr-provisorio-fluxo-base/00-orchestration.md),
  [01-baseline-docs.md](../handoffs/mtr-provisorio-fluxo-base/01-baseline-docs.md),
  [02-source-validation.md](../handoffs/mtr-provisorio-fluxo-base/02-source-validation.md),
  [03-external-integration.md](../handoffs/mtr-provisorio-fluxo-base/03-external-integration.md),
  [04-backend-contracts.md](../handoffs/mtr-provisorio-fluxo-base/04-backend-contracts.md),
  [05-persistence-queue.md](../handoffs/mtr-provisorio-fluxo-base/05-persistence-queue.md),
  [06-domain-rules.md](../handoffs/mtr-provisorio-fluxo-base/06-domain-rules.md),
  [07-frontend-ux.md](../handoffs/mtr-provisorio-fluxo-base/07-frontend-ux.md),
  [08-qa-validation.md](../handoffs/mtr-provisorio-fluxo-base/08-qa-validation.md).
  CHANGELOG: [docs/CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md](../CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md).
- **Centro Operacional (cadeia `centro-operacional-sicat`, 2026-04-25)**:
  `GET /v1/operations/overview`, `GET /v1/jobs/search`,
  `POST /v1/jobs/:jobId/retry` (idempotente),
  `GET /v1/audit/search`, `GET /v1/cetesb/accounts/health`,
  `GET /v1/cetesb/sessions/health`, `GET /v1/reports/mtrs`,
  `GET /v1/reports/mtrs/export` (CSV síncrono com cap de 5000 linhas
  e HTTP 413 `REPORT_EXPORT_LIMIT_EXCEEDED`).

### 2.2 Worker e fila (DL-022)

Comprovado em `src/sql/004_advanced_locking_consistency.sql` e
`docs/DL-022-EVOLUCAO-PERSISTENCIA-FILA.md`:

- locking otimista (`version`) em `jobs`, `manifests` e
  `session_contexts`;
- 5 constraints de consistência (submitted, finished, running,
  retry_wait, attempts);
- tabelas `worker_health`, `system_events`, `performance_snapshots`;
- worker heartbeat com auto-registro e shutdown gracioso;
- retry exponencial e DLQ persistido.

### 2.3 Gateway CETESB (real-mode)

Em `src/gateways/cetesb-gateway.js` (única exceção JS — DL-093):

- bootstrap de sessão e reuso/renovação de JWT via
  `src/services/session-context-service.ts`;
- submit, print, cancel, receive, geração e download de CDF, listagem de
  certificados, busca de manifesto, busca de parceiro, catálogos;
- `recaptchaToken` é opcional (aceito vazio).

### 2.4 Validação de payloads

`src/lib/validators/manifest-validator.ts`:

- valida campos obrigatórios e parceiros antes de chamar a CETESB;
- normaliza data de expedição (evita duplicação de timestamp);
- 26 testes unitários (referenciados no README e no DL-020).

### 2.5 Frontend Vue 3

Confirmado em `frontend/src/router.js` e `frontend/src/views/`:

- `Home`, `Login`, `LoginCetesb` (seleção de conta CETESB);
- `Dashboard` operacional;
- `Manifestos`, `ManifestoNovo`, `ManifestoDetalhe`;
- `RelatorioMtrs` (`/relatorios/mtrs`);
- `Jobs` (monitor da fila);
- `SessaoConta`;
- `AdminAcessos` (RBAC interno);
- `ChatOperacional` (`/conversacional/chat`);
- **Centro Operacional** (cadeia `centro-operacional-sicat`,
  `frontend/src/modules/`):
  - `/operacao/dashboard` — `OperationsDashboardView.vue`;
  - `/operacao/jobs` — `JobsConsoleView.vue` (busca + retry);
  - `/operacao/auditoria` e `/operacao/auditoria/:correlationId` —
    `AuditExplorerView.vue`;
  - `/operacao/cetesb-health` — `CetesbAccountsHealthView.vue`;
  - `/operacao/relatorios/mtr` — `MtrReportsView.vue` (export CSV);
  - `/operacao/command-center` — `CommandCenterView.vue` (registry
    declarativo, sem IA acoplada);
  - badge compartilhado `OperationalStatusBadge.vue` consumindo o
    espelho `frontend/src/modules/command-center/operationalStatus.js`.
- **DMR (cadeia `dmr-fluxo-base`, 2026-04-25)**:
  - `/dmr` — `DmrListView`;
  - `/dmr/pendentes` — `DmrPendentesView`;
  - `/dmr/novo` — `DmrCreateView`;
  - `/dmr/:dmrId` — `DmrDetailView` (banner explícito para
    `DMR_GATEWAY_PENDING_HAR`);
  - store Pinia factory `useDmrStore()`, service HTTP
    `frontend/src/services/dmrService.js`, espelho
    `mapDmrStatusToOperational` em
    `frontend/src/modules/command-center/operationalStatus.js`.

### 2.6 Documentação canônica

- `README.md`, `docs/README.md`, `docs/copilot/README.md`;
- decision logs DL-020, DL-021, DL-022, DL-023, DL-093;
- release notes consolidadas em
  `docs/CHANGELOG-CENTRO-OPERACIONAL.md` e
  `docs/CHANGELOG-DMR-FLUXO-BASE.md`;
- handoffs recentes consolidados:
  - `docs/handoffs/frontend-cetesb-flows-hardening/10-documentation-final.md`
    — fluxo autenticado de certificados CDF provado em runtime, com
    audit trail recuperável por `correlationId`;
  - `docs/handoffs/sigor-sicat-gap-map/10-documentation-final.md` — mapa
    de paridade SIGOR x SICAT, fontes para o backlog estratégico.

## 3. EM PROGRESSO / PARCIAL

- **MTR provisório — captura HAR dedicada (recomendada, não
  bloqueante)**: a cadeia `mtr-provisorio-fluxo-base` foi entregue com
  base nos HARs existentes (`gerar_mtr`, `imprimir_mtr`,
  `cancelar_mtr`) — decisão Caminho A+ documentada em
  [02-source-validation.md](../handoffs/mtr-provisorio-fluxo-base/02-source-validation.md#32-lista-m%C3%ADnima-de-capturas-recomendadas-para-mitigar-r1-e-r3).
  HARs específicos `gerar_mtr_provisorio.har`,
  `imprimir_mtr_provisorio.har`, `listar_mtr_provisorio.har` são
  recomendados para reforçar evidência mas **não bloqueiam** o uso da
  base. **Wizard guiado de criação RESOLVIDO** pela cadeia
  `mtr-provisorio-wizard-frontend` (2026-04-25): textarea JSON em
  `/mtr-provisorio/novo` substituído por wizard equivalente ao
  `ManifestCreateForm` via reuso paramétrico (props `submitHandler`,
  `singleOnly`, `primaryActionLabel`, `pageKicker`, `pageTitle`,
  `pageDescription`); wrapper `MtrProvisorioCreateView.vue` injeta
  submit no `useMtrProvisorioStore().createDraft(payload)`; cenário
  smoke wizard end-to-end PAYLOAD_INVALID verde. Sem mudança de
  contrato HTTP, persistência ou gateway. CHANGELOG:
  [docs/CHANGELOG-MTR-PROVISORIO-WIZARD-FRONTEND.md](../CHANGELOG-MTR-PROVISORIO-WIZARD-FRONTEND.md);
  checkpoints:
  [docs/handoffs/mtr-provisorio-wizard-frontend/](../handoffs/mtr-provisorio-wizard-frontend/).
  Pendências residuais (não-bloqueantes): INC-WIZARD-01 e
  INC-WIZARD-02 (cleanup de cenários legados do smoke; ver §3.1).
- **DMR — gateway real (envio remoto à CETESB)**: o fluxo declaratório
  base do SICAT está IMPLEMENTADO (cadeia `dmr-fluxo-base`,
  ver §2.1, §2.5 e
  [CHANGELOG-DMR-FLUXO-BASE.md](../CHANGELOG-DMR-FLUXO-BASE.md));
  o envio remoto (HTTP real à CETESB) permanece **pendente de captura
  HAR DMR** — ação humana descrita em
  [02-source-validation.md §6](../handoffs/dmr-fluxo-base/02-source-validation.md#6-plano-de-captura-har-dmr-n%C3%A3o-executado-nesta-fase).
  Quando o HAR for capturado, a futura cadeia `dmr-gateway-real`
  reabre a fase 03 para substituir o stub
  `DMR_GATEWAY_PENDING_HAR` no
  [src/gateways/cetesb-gateway.js](../../src/gateways/cetesb-gateway.js).
- **Relatório dedicado de MTRs**: rota `/relatorios/mtrs` existe no
  frontend (`ManifestReportView.vue`), mas a UX equivalente ao portal
  SIGOR ainda é parcial. Backend já permite consulta filtrada via
  `GET /v1/manifestos`, sem endpoint dedicado de relatório/exportação.
- **Camada conversacional**: rota `/conversacional/chat` e view
  `ConversationalChatAppView.vue` existem como base; nenhum backend de
  IA generativa está acoplado nesta fase. Tratada como base estrutural
  para o futuro Command Center.
- **Recebimento e CDF reais E2E**: caminho autenticado provado para
  `GET /v1/cdf/certificates`; `manifest.receive` e `cdf.generate` reais
  permanecem sem prova E2E recente por serem operações mutáveis na
  CETESB (ver `frontend-cetesb-flows-hardening/10-documentation-final.md`).
- **Streaming NDJSON ao vivo de jobs novos**: endpoint
  `GET /v1/jobs/:jobId/events` provado com job terminal; falta
  evidência ao vivo de job novo sem disparar operação remota mutável.

## 3.1 Follow-ups de estabilidade

Follow-ups não-bloqueantes que devem ser endereçados em cadeias
futuras (ou em janela de hardening dedicada). Não abrem cadeia por
si só.

- **F4 — flake única em `npm run test:integration`** (cadeia
  `dmr-fluxo-base`, fase 08, 2026-04-25; reproduzida 1/124 também na
  cadeia `mtr-provisorio-fluxo-base`, fase 08): falha não reproduzível
  em reexecução imediata, sem alteração de código entre execuções.
  Não-bloqueante. Owner sugerido: `postgres-queue-mtr` se reaparecer
  com sinal estável (job ownership reconciliation). Ver
  [dmr-fluxo-base/08-qa-validation.md §5](../handoffs/dmr-fluxo-base/08-qa-validation.md#5-matriz-de-valida%C3%A7%C3%B5es)
  e
  [mtr-provisorio-fluxo-base/08-qa-validation.md §4](../handoffs/mtr-provisorio-fluxo-base/08-qa-validation.md#4-status-baseline-f2--f3--f4).
- **AUD-09 — flake `audit.spec.ts:267` sob full-suite paralela**
  (cadeia `mtr-provisorio-fluxo-base`, fase 08, 2026-04-25): cenário
  `09-Vuetify Components Render` falha intermitentemente sob contenção
  de 6 workers paralelos no Playwright; passa **10/10** em isolado
  (`npx playwright test tests/ui/audit.spec.ts`). Não atribuível à
  cadeia MTR provisório (a spec inspeciona `/dashboard`, rota não
  modificada). Owner sugerido: `frontend-vue-ux-mtr` se reaparecer em
  CI consecutivo. Ver
  [mtr-provisorio-fluxo-base/08-qa-validation.md §6](../handoffs/mtr-provisorio-fluxo-base/08-qa-validation.md#6-incidentes-abertos-sem-corre%C3%A7%C3%A3o-nesta-fase).
- **HAR DMR ausente** (herdado de `dmr-fluxo-base/02`): captura
  humana descrita em
  [02-source-validation.md §6](../handoffs/dmr-fluxo-base/02-source-validation.md#6-plano-de-captura-har-dmr-n%C3%A3o-executado-nesta-fase).
  Destrava a futura cadeia `dmr-gateway-real`.
- **INC-WIZARD-01 — selector regression em smoke wizard MTR
  provisório** (cadeia `mtr-provisorio-wizard-frontend`, fase 08,
  2026-04-25): cenário "criação via /mtr-provisorio/novo redireciona
  para /mtr-provisorio/:id" usa `getByRole('option')` mas o
  `FilterableDropdown.vue` reusado pelo wizard renderiza opções como
  `<button class="filterable-dropdown-option">` sem `role="option"`.
  Cobertura funcional equivalente garantida pelo cenário novo wizard
  end-to-end PAYLOAD_INVALID (verde). Fix sugerido: trocar por
  `.filterable-dropdown-option`. Owner sugerido: `tester-qa-mtr`.
  Ver
  [mtr-provisorio-wizard-frontend/08-qa-validation.md §6.1](../handoffs/mtr-provisorio-wizard-frontend/08-qa-validation.md#61-inc-wizard-01-%E2%80%94-selector-regression-em-smoke-wizard).
- **INC-WIZARD-02 — cenário PAYLOAD_INVALID legado não migrado para
  o wizard** (cadeia `mtr-provisorio-wizard-frontend`, fase 08,
  2026-04-25): cenário legado tenta preencher `Responsável *` direto
  e clicar `Criar MTR provisório`, mas no wizard novo o campo está
  na etapa 1 e o botão na etapa 4. Redundante após o cenário novo
  wizard end-to-end. Fix sugerido: substituir cenário legado pelo
  cenário wizard novo. Owner sugerido: `tester-qa-mtr`. Ver
  [mtr-provisorio-wizard-frontend/08-qa-validation.md §6.2](../handoffs/mtr-provisorio-wizard-frontend/08-qa-validation.md#62-inc-wizard-02-%E2%80%94-cen%C3%A1rio-payload_invalid-legado-n%C3%A3o-migrado).
- **F2/F3 — Playwright + chunks Vite** (herdados das cadeias
  `homepage-canvas-continuous-storytelling` e camada conversacional):
  ver §`Pendências conhecidas (QA fase 07 — centro-operacional-sicat
  — 2026-04-25)` ao final deste documento; permanecem sob ownership
  das cadeias originais.

## 4. PLANEJADO

Pilares do Centro Operacional SICAT — todos **IMPLEMENTADOS** na
cadeia `centro-operacional-sicat` (concluída 2026-04-25):

1. ✅ Operations Dashboard (`GET /v1/operations/overview`,
   `OperationsDashboardView.vue`).
2. ✅ Jobs Console (`GET /v1/jobs/search`,
   `POST /v1/jobs/:id/retry`, `JobsConsoleView.vue`).
3. ✅ Audit Explorer (`GET /v1/audit/search`,
   `GET /v1/audit/:correlationId`, `AuditExplorerView.vue`).
4. ✅ CETESB Accounts & Sessions Health
   (`GET /v1/cetesb/accounts/health`,
   `GET /v1/cetesb/sessions/health`,
   `CetesbAccountsHealthView.vue`).
5. ✅ MTR Reports dedicados (`GET /v1/reports/mtrs`,
   `GET /v1/reports/mtrs/export`, `MtrReportsView.vue`).
6. ✅ Taxonomia de status/erros operacionais
   (`docs/05-operacao/taxonomia-status-erros-operacionais.md` +
   `src/lib/operational-status.ts`, 13 estados).
7. ✅ Command Center base (registry + palette,
   `CommandCenterView.vue`, sem backend de IA acoplado).

Backlog estratégico maior (DMR, MTR provisório, manifesto complementar
de armazenamento temporário, variantes especiais de CDF, configurações
CETESB do empreendimento e autoatendimento, chat generativo no Command
Center) está consolidado em
`docs/_inputs/fonte-de-verdade-backlog-cto.md`. A próxima frente
recomendada está em `docs/10-estado-atual/PROXIMO_PROMPT.md`.

## 5. Riscos e limites conhecidos

- operações CETESB mutáveis (`manifest.receive`, `cdf.generate`,
  cancelamentos) não devem ser disparadas para gerar evidência cega;
- ausência de certificados reais na conta consultada limita prova E2E
  de download remoto de CDF;
- nenhum backend de IA está implementado: o Command Center é base
  estrutural até segunda ordem;
- toda mudança de superfície HTTP exige atualização lockstep de
  OpenAPI, exemplos, `operations.ts`, rotas e testes de contrato.

## 6. Como evoluir este documento

Atualizar este snapshot ao final de cada work_id com mudança de
escopo. Não marcar nada como IMPLEMENTADO sem evidência em código,
testes ou docs verificáveis. Cada nova cadeia deve regenerar este
arquivo após a entrega validada pelo QA.

----
## Pendências conhecidas (QA fase 07 — centro-operacional-sicat — 2026-04-25)

- **F1 — Link quebrado em checkpoint** (resolvido na fase 08-docs-final):
  `docs/handoffs/centro-operacional-sicat/06-frontend-ux.md` apontava
  para `frontend/tests/ui/login.spec.ts` (arquivo inexistente).
  Reapontado para `frontend/tests/ui/audit.spec.ts` na fase
  `08-docs-final` (doc-only, sem mudança de produto).
- **F2 — Suíte Playwright (`cd frontend && npx playwright test`)**:
  49 passed, 15 failed, 11 did not run. A nova spec
  `tests/ui/centro-operacional.spec.ts` (6 testes) passou 100%.
  Falhas remanescentes são pré-existentes ao work centro-operacional,
  herdadas das cadeias `homepage-canvas-continuous-storytelling`
  (`responsive-smoke`, `qa-global-home-back-button`,
  `full-navigation-e2e`) e da camada conversacional recém-introduzida
  (`conversational-chat-app.spec.js`, `manifests-resync.spec.js`,
  `cetesb-operational-flows.spec.js`). Já documentadas em
  `docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md`.
  Não bloqueiam o Centro Operacional; tratamento ficará a cargo das
  frentes correspondentes.
- **F3 — Bundle Vite com chunks > 500 kB**: aviso pré-existente
  reportado pelo build (`index-*.js` ~1.27 MB / gzip ~389 kB,
  `index-*.css` ~1015 kB / gzip ~161 kB). Não bloqueia entrega.
  Otimização de code-splitting fica como melhoria técnica fora do
  escopo desta cadeia.
