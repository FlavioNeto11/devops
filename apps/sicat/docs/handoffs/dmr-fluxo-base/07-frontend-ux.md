# 07 — Frontend UX — DMR (cadeia `dmr-fluxo-base`)

> Fase concluída em 2026-04-25 pelo `frontend-vue-ux-mtr`. Anterior:
> [06-domain-rules.md](06-domain-rules.md). Geral:
> [00-orchestration.md](00-orchestration.md). Próxima fase: 08-qa-validation
> (`tester-qa-mtr`).

## 1. Objetivo da fase

Implementar as rotas DMR no frontend Vue 3 consumindo o contrato HTTP
publicado em [04-backend-contracts.md](04-backend-contracts.md), respeitando
guards de autenticação SICAT + seleção de conta CETESB, badges via taxonomia
operacional canônica e tratamento explícito do stub
`DMR_GATEWAY_PENDING_HAR` (Caminho B do gateway DMR).

## 2. Arquivos analisados

- [docs/handoffs/dmr-fluxo-base/00-orchestration.md](00-orchestration.md)
  §6 — handoff explícito recebido.
- [docs/handoffs/dmr-fluxo-base/06-domain-rules.md](06-domain-rules.md) §9
  — escopo detalhado e códigos `DMR_*`.
- [docs/handoffs/dmr-fluxo-base/04-backend-contracts.md](04-backend-contracts.md)
  — 11 paths DMR.
- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
  §`/v1/dmr/*` — schemas `Dmr`, `DmrDetail`, `DmrItem`, `DmrCreateRequest`,
  `DmrSubmitRequest`, `DmrItemCreateRequest`, `DmrStatusResponse`,
  `DmrCancelResponse`, `DmrListResponse`, `DmrItemListResponse`,
  `DmrConsolidateRequest`.
- [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  — fonte de verdade do mapeamento DMR → operacional.
- [frontend/src/views/ManifestsView.vue](../../../frontend/src/views/ManifestsView.vue),
  [frontend/src/views/ManifestCreateView.vue](../../../frontend/src/views/ManifestCreateView.vue)
  — padrão de view a replicar.
- [frontend/src/stores/manifests.js](../../../frontend/src/stores/manifests.js)
  — padrão de store factory + persistência de filtros.
- [frontend/src/services/api.js](../../../frontend/src/services/api.js)
  — convenção de comandos com `Idempotency-Key` e propagação de
  `X-Correlation-Id` pelo transport.
- [frontend/src/modules/command-center/operationalStatus.js](../../../frontend/src/modules/command-center/operationalStatus.js)
  e
  [frontend/src/modules/shared/OperationalStatusBadge.vue](../../../frontend/src/modules/shared/OperationalStatusBadge.vue)
  — badges canônicos reutilizados.
- [frontend/src/router.js](../../../frontend/src/router.js) e
  [frontend/src/App.vue](../../../frontend/src/App.vue)
  — guards e menu lateral.

## 3. Decisões

1. **Fronteira preservada**: nenhuma view importa de `src/**`. O mapeamento
   DMR → operacional foi replicado em
   [frontend/src/modules/command-center/operationalStatus.js](../../../frontend/src/modules/command-center/operationalStatus.js)
   (`mapDmrStatusToOperational`, `describeDmrOperationalStatus`),
   espelhando o backend (`src/lib/operational-status.ts`) — lockstep da
   taxonomia mantido.

2. **Service HTTP**: 11 funções DMR adicionadas ao
   [frontend/src/services/api.js](../../../frontend/src/services/api.js)
   reusando o transport `request()` (auth, refresh, retry, problem+json).
   Wrapper público em
   [frontend/src/services/dmrService.js](../../../frontend/src/services/dmrService.js)
   re-exporta as 11 operações + `buildDmrIdempotencyKey`. Convenção idêntica
   aos demais services (`mtrReportsService.js`, `jobsConsoleService.js`).

3. **Idempotency-Key** em todos os comandos (`createDmr`, `consolidateDmr`,
   `submitDmr`, `addDmrItem`) via header `Idempotency-Key` gerado por
   `buildDmrIdempotencyKey` (UUID v4). DELETE opera sem idempotência (espelha
   convenção do backend).

4. **Store factory** em
   [frontend/src/stores/dmrStore.js](../../../frontend/src/stores/dmrStore.js)
   no padrão `useDmrStore()` (igual `useManifestsStore`). Estado:
   `filters`, `items`, `total`, `pendingItems`, `selectedDmr`,
   `selectedItems`, `selectedStatus`, `commandError`, `commandFeedback`,
   `commandLoading`. Persiste filtros em localStorage
   (`sicat_dmr_list_filters`).

5. **Badges via taxonomia operacional canônica**: usado
   `OperationalStatusBadge` com `describeDmrOperationalStatus(dmr)` para
   listas (mapeia `dmr.status` físico → operacional) e
   `describeOperationalStatus(status.operationalStatus)` quando temos o
   payload enriquecido de `GET /v1/dmr/:id/status`.

6. **Tratamento de problem+json**: `commandError` no store extrai
   `detail || title || message` — sem vazar stack. Helper dedicado
   `isDmrGatewayPending(error)` em
   [frontend/src/views/dmr/dmrUiHelpers.js](../../../frontend/src/views/dmr/dmrUiHelpers.js)
   detecta o stub `DMR_GATEWAY_PENDING_HAR` (HTTP 503 ou code no payload)
   e ativa banner amarelo informativo na view de detalhe — sem
   tratar como erro fatal.

7. **Roteamento**: 4 rotas adicionadas com guards
   `requiresSicatAuth: true` + `requiresActiveCetesbAccount: true`
   (mesmo padrão das rotas de manifestos):
   - `/dmr` → `DmrListView`
   - `/dmr/pendentes` → `DmrPendentesView`
   - `/dmr/novo` → `DmrCreateView`
   - `/dmr/:dmrId` → `DmrDetailView`

8. **Navegação**: entrada "DMR" adicionada ao menu lateral em
   [frontend/src/App.vue](../../../frontend/src/App.vue) (ícone
   `mdi-file-tree-outline`). Helper `isActive('/dmr')` ajustado para
   destacar o item em todas as sub-rotas DMR.

9. **Validação client-side mínima**: a UI delega 100% das regras de domínio
   ao validador backend (`DMR_*` em
   [src/lib/validators/dmr-validator.ts](../../../src/lib/validators/dmr-validator.ts)).
   Apenas pré-checks de campos obrigatórios (período, papel,
   `sessionContextId` ativo) antes da chamada — alinhado ao princípio
   de não duplicar regras.

10. **Diálogos modais Vuetify** para confirmar ações destrutivas
    (cancelar DMR) e críticas (submeter à CETESB), permitindo `validateOnly`
    no submit conforme `DmrSubmitRequest`.

## 4. Arquivos criados / alterados

### Criados

- [frontend/src/services/dmrService.js](../../../frontend/src/services/dmrService.js)
  — wrapper das 11 operações DMR + `buildDmrIdempotencyKey`.
- [frontend/src/stores/dmrStore.js](../../../frontend/src/stores/dmrStore.js)
  — store factory `useDmrStore()` com lista, pendentes, detalhe, comandos.
- [frontend/src/views/dmr/dmrUiHelpers.js](../../../frontend/src/views/dmr/dmrUiHelpers.js)
  — constantes (roles, statuses, units), `isDmrGatewayPending`,
  `describeDmrError`, `formatDmrPeriodLabel`, `roleLabel`, `statusLabel`.
- [frontend/src/views/dmr/DmrListView.vue](../../../frontend/src/views/dmr/DmrListView.vue)
  — listagem paginada com filtros (status, role, periodStart, periodEnd).
- [frontend/src/views/dmr/DmrPendentesView.vue](../../../frontend/src/views/dmr/DmrPendentesView.vue)
  — DMRs em aberto (`draft`, `pending_review`, `failed_validation`).
- [frontend/src/views/dmr/DmrCreateView.vue](../../../frontend/src/views/dmr/DmrCreateView.vue)
  — formulário de criação de rascunho.
- [frontend/src/views/dmr/DmrDetailView.vue](../../../frontend/src/views/dmr/DmrDetailView.vue)
  — detalhe + itens + ações (consolidar, consolidar-force, submeter,
  cancelar, adicionar item, remover item) + banner de pendência HAR.

### Alterados

- [frontend/src/services/api.js](../../../frontend/src/services/api.js)
  — adicionadas 11 funções DMR (`listDmr`, `listPendingDmr`, `createDmr`,
  `getDmrById`, `deleteDmr`, `consolidateDmr`, `submitDmr`, `getDmrStatus`,
  `listDmrItems`, `addDmrItem`, `removeDmrItem`) + helper interno
  `buildDmrCommandHeaders` para Idempotency-Key.
- [frontend/src/modules/command-center/operationalStatus.js](../../../frontend/src/modules/command-center/operationalStatus.js)
  — adicionados `mapDmrStatusToOperational` e
  `describeDmrOperationalStatus` (espelho frontend de
  `src/lib/operational-status.ts`).
- [frontend/src/router.js](../../../frontend/src/router.js)
  — 4 rotas DMR com guards SICAT auth + active CETESB account.
- [frontend/src/App.vue](../../../frontend/src/App.vue)
  — entrada "DMR" no menu lateral + `isActive('/dmr')`.

## 5. Rotas adicionadas

| Path | Componente | Meta |
| --- | --- | --- |
| `/dmr` | `DmrListView` | requires SICAT + active CETESB; breadcrumb `DMR / Declarações` |
| `/dmr/pendentes` | `DmrPendentesView` | requires SICAT + active CETESB; breadcrumb `DMR / Pendentes` |
| `/dmr/novo` | `DmrCreateView` | requires SICAT + active CETESB; breadcrumb `DMR / Nova declaração` |
| `/dmr/:dmrId` | `DmrDetailView` | requires SICAT + active CETESB; breadcrumb `DMR / Detalhe` |

## 6. Ações cobertas por cada view

### `DmrListView.vue`

- listar (`GET /v1/dmr`) com filtros: `status`, `role`, `periodStart`,
  `periodEnd`, `limit`, `offset`, `integrationAccountId` (auto da conta
  ativa);
- paginação via offset/limit;
- badge canônico (taxonomia operacional);
- atalho para `/dmr/novo` e `/dmr/pendentes`;
- abrir detalhe (`/dmr/:id`).

### `DmrPendentesView.vue`

- listar (`GET /v1/dmr/pendentes`) DMRs `draft|pending_review|failed_validation`;
- atualizar manualmente;
- abrir detalhe.

### `DmrCreateView.vue`

- criar rascunho (`POST /v1/dmr` com `Idempotency-Key`);
- payload: `integrationAccountId` (da conta ativa), `role`, `periodStart`,
  `periodEnd`, `periodLabel` (auto se vazio), `requestedBy` (opcional);
- erro de validação (`DMR_PERIOD_INVALID`, `DMR_ROLE_INVALID`,
  `DMR_PERIOD_OVERLAP`) renderizado via problem+json detail.

### `DmrDetailView.vue`

- carregar detalhe (`GET /v1/dmr/:dmrId`) + status enriquecido
  (`GET /v1/dmr/:dmrId/status`);
- consolidar (`POST .../consolidate`) — modos normal e `force=true`;
- submeter (`POST .../submit`) com diálogo + `validateOnly`;
- cancelar rascunho (`DELETE /v1/dmr/:dmrId`) com diálogo de confirmação;
- adicionar item manual (`POST .../items`) com formulário modal;
- remover item (`DELETE .../items/:itemId`);
- banner amarelo "Aguardando captura HAR DMR" quando
  `lastErrorCode = DMR_GATEWAY_PENDING_HAR` ou submit recente devolveu o
  stub do gateway.

## 7. Validações executadas

| comando | resultado |
| --- | --- |
| `npm run typecheck` (raiz) | **OK** — zero erros (`tsc -p tsconfig.json --noEmit`). |
| `npm --prefix frontend run build` | **OK** — Vite build em 7,68 s. Aviso pré-existente (F3 do checkpoint 00) de chunks > 500 kB sem regressão atribuível ao DMR (badges reusam módulo já carregado; views são simples). |

> Observações:
> - Não há script `lint` ou `test:unit` no [frontend/package.json](../../../frontend/package.json) (apenas `dev`, `build`, `preview`, `test:ui`, `test:ui:headed`).
> - Playwright (`test:ui`) intencionalmente **não foi executado** — fica para a fase 08 conforme handoff.

## 8. Bloqueios identificados

- **HAR DMR ausente** (herdado da fase 02 — Caminho B). UI já trata
  explicitamente via banner informativo; não bloqueia esta fase.
- **F3 (chunks Vite > 500 kB)** continua presente; DMR não agravou —
  reutilizou `OperationalStatusBadge` e o registry já bundlado.
  Tratamento (code-split) fica para iniciativa transversal.

## 9. Restrições mantidas

- backend, gateway, OpenAPI, `operations.ts`, repositórios, services,
  workers e migrations DMR **não foram tocados**;
- nenhuma chamada CETESB direta — toda integração passa por
  `frontend → /v1/dmr/* → backend → gateway DMR (stub)`;
- `Idempotency-Key` propagado em todos os comandos;
- correlationId gerado pelo transport (`buildCorrelationId`) e
  retornado pelo backend em `x-correlation-id`;
- erros tratados como `application/problem+json` — sem vazar stack;
- `recaptchaToken` não aplicável (DMR não tem fluxo CETESB direto na UI);
- nenhum commit/push;
- não foi tocado nada de outras cadeias
  (`centro-operacional-sicat`, `homepage-canvas-continuous-storytelling`).

## 10. Handoff explícito para `tester-qa-mtr` (fase 08)

### 10.1. Estado entregue

- 4 rotas DMR funcionais consumindo o contrato da fase 04;
- store factory + service HTTP cobrindo as 11 operações;
- badges canônicos via taxonomia operacional (paridade backend);
- banner explícito para `DMR_GATEWAY_PENDING_HAR`;
- typecheck verde, build verde.

### 10.2. Trabalho da fase 08 (resumo)

A fase 08-qa-validation deve **rodar a suíte completa de testes** e adicionar
cobertura Playwright DMR mínima sem regredir o conjunto verde atual.

Mínimo a entregar:

1. Suítes verdes: `npm test`, `test:api`, `test:integration`, `test:worker`,
   `test:contract`, `test:source-of-truth`, `smoke:health`,
   `smoke:openapi`.
2. Pelo menos uma spec Playwright cobrindo o fluxo DMR principal
   (criar rascunho → consolidar → tentar submit → ver banner pendência).
3. Não regredir as 15 falhas Playwright pré-existentes (F2 — fora do escopo
   desta cadeia).
4. Reportar cobertura/regressões e fechar handoff para
   `documentador-mtr` (fase 09).

### 10.3. Restrições mantidas

- não tocar gateway DMR (fase 03 reaberta espera HAR);
- não regenerar OpenAPI/operations;
- não mexer em backend/services/repositórios DMR;
- não commit/push (fase 10).

### 10.4. Prompt pronto para `tester-qa-mtr`

```text
Cadeia: dmr-fluxo-base. Fase 08-qa-validation.

Contexto obrigatório:
- docs/handoffs/dmr-fluxo-base/00-orchestration.md (status global)
- docs/handoffs/dmr-fluxo-base/07-frontend-ux.md (este checkpoint)
- docs/handoffs/dmr-fluxo-base/06-domain-rules.md (códigos DMR_*)
- docs/handoffs/dmr-fluxo-base/05-persistence-queue.md (worker dmr.submit)
- docs/handoffs/dmr-fluxo-base/04-backend-contracts.md (contrato HTTP)

Entregas:
1. Rodar e reportar todas as suítes:
   - npm test
   - npm run test:api
   - npm run test:integration
   - npm run test:worker
   - npm run test:contract
   - npm run test:source-of-truth
   - npm run smoke:health
   - npm run smoke:openapi
2. Adicionar e rodar pelo menos uma spec Playwright cobrindo o fluxo
   DMR principal (frontend/tests/dmr/*.spec.ts):
   - criar DMR rascunho
   - consolidar
   - tentar submit -> verificar banner DMR_GATEWAY_PENDING_HAR
   - cancelar
3. Não regredir as 15 falhas Playwright pré-existentes (F2).
4. Checkpoint em docs/handoffs/dmr-fluxo-base/08-qa-validation.md
   com handoff para documentador-mtr (fase 09).

Restrições:
- Não tocar backend, gateway, OpenAPI, operations.ts.
- Não tocar frontend (rotas DMR já entregues).
- Não commit/push.
```

## 11. Estado para o orquestrador

- Fase 07 **CONCLUÍDA** em 2026-04-25.
- Próxima fase ativa: **08-qa-validation** (`tester-qa-mtr`).
- Fase 03-external-integration permanece **adiada** (Caminho B).
