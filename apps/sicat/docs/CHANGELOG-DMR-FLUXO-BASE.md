# CHANGELOG — Cadeia `dmr-fluxo-base`

> Release notes consolidadas da cadeia `dmr-fluxo-base` (2026-04-25).
> Frente 2 do backlog CTO
> ([docs/_inputs/fonte-de-verdade-backlog-cto.md §5](_inputs/fonte-de-verdade-backlog-cto.md#5-pr%C3%B3ximas-frentes-estrat%C3%A9gicas)).
> Checkpoints da cadeia em
> [docs/handoffs/dmr-fluxo-base/](handoffs/dmr-fluxo-base/).

## 1. Resumo executivo

### Entregue (fluxo declaratório base)

- Contrato HTTP DMR completo (11 paths, 11 operationIds, 12 schemas)
  publicado em lockstep `OpenAPI ↔ examples ↔ src/generated/operations.ts`.
- Persistência transacional (`dmr_declarations`, `dmr_declaration_items`)
  via migration idempotente `013_dmr_declarations.sql`, preservando
  padrão DL-022 (locking otimista, trigger `increment_version`,
  5 constraints de consistência).
- Validador declaratório com 8 validadores e códigos `DMR_*` estáveis.
- Worker handler `dmr.submit` plugado em
  [src/workers/operation-handlers.ts](../src/workers/operation-handlers.ts).
- Frontend Vue 3 com 4 rotas `/dmr/*`, store Pinia factory, service HTTP
  e badge canônico via espelho frontend de `mapDmrStatusToOperational`.
- Spec Playwright DMR (3 cenários) sob mock de auth/sessão.
- QA verde: typecheck, contract, source-of-truth, api, integration,
  worker, smoke, frontend build.

### Pendente (fora do escopo desta cadeia)

- **HAR DMR**: a captura é ação humana e destrava a futura cadeia
  `dmr-gateway-real` (fase 03 adiada). O bloco DMR no
  [src/gateways/cetesb-gateway.js](../src/gateways/cetesb-gateway.js)
  permanece como **stub contratual** retornando
  `application/problem+json` 503 com `code: DMR_GATEWAY_PENDING_HAR`.
  Plano de captura em
  [02-source-validation.md §6](handoffs/dmr-fluxo-base/02-source-validation.md#6-plano-de-captura-har-dmr-n%C3%A3o-executado-nesta-fase).

## 2. Contrato HTTP DMR (`/v1/dmr/*`)

11 paths + 11 operationIds publicados em
[openapi/mtr_automacao_openapi_interna.yaml](../openapi/mtr_automacao_openapi_interna.yaml)
e regenerados em
[src/generated/operations.ts](../src/generated/operations.ts) (83 operações
totais, +11 DMR). Examples em [examples/](../examples/) (23 arquivos,
request + response por operação).

| método | path | operationId |
| --- | --- | --- |
| GET | `/v1/dmr` | `dmrList` |
| POST | `/v1/dmr` | `dmrCreate` |
| GET | `/v1/dmr/pendentes` | `dmrListPending` |
| GET | `/v1/dmr/{dmrId}` | `dmrGet` |
| DELETE | `/v1/dmr/{dmrId}` | `dmrCancel` |
| POST | `/v1/dmr/{dmrId}/consolidate` | `dmrConsolidate` |
| POST | `/v1/dmr/{dmrId}/submit` | `dmrSubmit` |
| GET | `/v1/dmr/{dmrId}/status` | `dmrStatus` |
| GET | `/v1/dmr/{dmrId}/items` | `dmrListItems` |
| POST | `/v1/dmr/{dmrId}/items` | `dmrAddItem` |
| DELETE | `/v1/dmr/{dmrId}/items/{itemId}` | `dmrRemoveItem` |

Schemas adicionados: `Dmr`, `DmrDetail`, `DmrItem`, `DmrSummaryTotals`,
`DmrCreateRequest`, `DmrConsolidateRequest`, `DmrSubmitRequest`,
`DmrItemCreateRequest`, `DmrListResponse`, `DmrItemListResponse`,
`DmrStatusResponse`, `DmrCancelResponse`. `Idempotency-Key` honrado em
`dmrSubmit` (replay via `idempotency-service`). Comando assíncrono
retorna `202 command-accepted` com `links.entity = /v1/dmr/{id}`
(extensão do helper em
[src/lib/command-response.ts](../src/lib/command-response.ts)).

Detalhe em
[04-backend-contracts.md](handoffs/dmr-fluxo-base/04-backend-contracts.md).

## 3. Persistência (DL-022)

Migration idempotente
[src/sql/013_dmr_declarations.sql](../src/sql/013_dmr_declarations.sql).

### Tabelas

- `dmr_declarations` — uma linha por declaração; colunas-chave:
  `id text pk`, `integration_account_id`, `period_start`, `period_end`,
  `role`, `status`, `summary_totals jsonb`, `payload_snapshot jsonb`,
  `version int default 1`, `attempts int default 0`, `created_at`,
  `updated_at`.
- `dmr_declaration_items` — linhas-manifesto consolidadas
  (FK `manifest_id` → `manifests.id`; metadados de resíduo, papel,
  parceiros, quantidades).

### Constraints DL-022

5 constraints replicando o padrão das demais entidades persistidas
(idempotência via `drop constraint if exists` + `add constraint`):
`chk_dmr_period_order`, `chk_dmr_status_finished`,
`chk_dmr_status_running`, `chk_dmr_status_retry_wait`,
`chk_dmr_attempts_non_negative`. 3 constraints adicionais nos items
para integridade declaratória.

### Trigger e índices

- Trigger `trg_dmr_declarations_version` reaproveita a função SQL
  `increment_version` já existente para `manifests`, `jobs` e
  `session_contexts`.
- Índices idempotentes (`create index if not exists`) para listagem
  paginada, pendentes (`status in ('draft','pending_review',
  'failed_validation')`) e overlap de período por conta + role.

Detalhe em
[05-persistence-queue.md](handoffs/dmr-fluxo-base/05-persistence-queue.md).

## 4. Validador declaratório

[src/lib/validators/dmr-validator.ts](../src/lib/validators/dmr-validator.ts):
8 validadores com códigos de erro estáveis em
`application/problem+json`.

| regra | função | code | http |
| --- | --- | --- | --- |
| Formato + janela + ordem do período | `validateDmrPeriod` | `DMR_PERIOD_INVALID` | 400 |
| Role no enum DmrRole | `validateDmrRole` | `DMR_ROLE_INVALID` | 400 |
| Sem sobreposição (mesma conta + role) | `validatePeriodNotOverlapping` | `DMR_PERIOD_OVERLAP` | 409 |
| Transição de status válida | `validateStatusTransition` | `DMR_STATUS_TRANSITION_INVALID` | 400 |
| Mutação de item válida | `validateItemMutation` | `DMR_ITEM_INVALID` | 400 |
| Consolidação possível | `validateConsolidate` | `DMR_NOT_CONSOLIDATABLE` | 400 |
| Submissão possível | `validateSubmit` | `DMR_NOT_SUBMITTABLE` | 400 |
| Cancelamento possível | `validateDelete` | `DMR_NOT_DELETABLE` | 400 |

Mapeamento canônico `dmr.status → operationalStatus` registrado em
[src/lib/operational-status.ts](../src/lib/operational-status.ts) via
`DMR_OPERATIONAL_STATUS_REGISTRY` e função
`mapDmrStatusToOperational`. Erro `DMR_GATEWAY_PENDING_HAR` (stub do
gateway) é tratado de forma explícita pelo handler `dmr.submit`,
mapeando para `failed_remote` **sem subir DLQ** (ver
[06-domain-rules.md](handoffs/dmr-fluxo-base/06-domain-rules.md)).

## 5. Frontend Vue 3

Detalhe em
[07-frontend-ux.md](handoffs/dmr-fluxo-base/07-frontend-ux.md).

### Rotas e views

- `/dmr` → `DmrListView`
- `/dmr/pendentes` → `DmrPendentesView`
- `/dmr/novo` → `DmrCreateView`
- `/dmr/:dmrId` → `DmrDetailView`

Guards SICAT auth + active CETESB account preservados (router
existente em [frontend/src/router.js](../frontend/src/router.js)).
Entrada "DMR" adicionada ao menu lateral em
[frontend/src/App.vue](../frontend/src/App.vue).

### Componentes e infraestrutura

- Service HTTP em
  [frontend/src/services/dmrService.js](../frontend/src/services/dmrService.js)
  + 11 funções em [frontend/src/services/api.js](../frontend/src/services/api.js).
- Store Pinia factory `useDmrStore()` em
  [frontend/src/stores/dmrStore.js](../frontend/src/stores/dmrStore.js).
- Helpers de UI em
  [frontend/src/views/dmr/dmrUiHelpers.js](../frontend/src/views/dmr/dmrUiHelpers.js).
- Espelho frontend de `mapDmrStatusToOperational` em
  [frontend/src/modules/command-center/operationalStatus.js](../frontend/src/modules/command-center/operationalStatus.js)
  para badges canônicos.
- Banner explícito no `DmrDetailView` para
  `DMR_GATEWAY_PENDING_HAR` ("Aguardando captura HAR DMR").

## 6. QA

Detalhe em
[08-qa-validation.md](handoffs/dmr-fluxo-base/08-qa-validation.md).

### Matriz de validações (verde)

`typecheck`, `validate:openapi`, `validate:md-links`,
`test:source-of-truth` (6/6), `test:contract` (4/4), `test:api`
(23/23), `test:integration` (124/124 na 2ª execução),
`test:worker` (14/14), `smoke:health`, `smoke:openapi`, frontend
build.

### Spec Playwright DMR

[frontend/tests/ui/dmr-smoke.spec.ts](../frontend/tests/ui/dmr-smoke.spec.ts)
— 3/3 cenários:

1. listagem `/dmr` autenticada exibe declaração mockada;
2. criação via `/dmr/novo` redireciona para `/dmr/:id`;
3. submit → banner amarelo `DMR_GATEWAY_PENDING_HAR`.

### Playwright full

52 passed, 15 failed (F2 herdado idêntico ao baseline,
sem regressão atribuível ao DMR), 11 did not run (também herdado).

### F4 — flake `test:integration` (1/124, não reproduzível)

Falha única na 1ª execução de `npm run test:integration`, verde na 2ª
sem alteração de código. Registrada como follow-up de estabilidade
não-bloqueante em
[docs/10-estado-atual/estado-atual.md](10-estado-atual/estado-atual.md#31-follow-ups-de-estabilidade).

## 7. Caminho B — gateway DMR como stub

Decisão registrada em
[02-source-validation.md §8](handoffs/dmr-fluxo-base/02-source-validation.md#8-decis%C3%A3o-de-roteamento-%E2%80%94-recomenda%C3%A7%C3%A3o-caminho-b).
Resumo:

- nenhum HAR DMR existe em [docs/cetesb/](cetesb/) (varredura
  documentada em §3 do checkpoint 02);
- consolidação 100% local é viável a partir do payload já
  persistido em `manifests` (mapeamento payload→items em §5 do
  checkpoint 02);
- bloco DMR isolado em
  [src/gateways/cetesb-gateway.js](../src/gateways/cetesb-gateway.js)
  expõe `submitDmr(...)` retornando `problem+json` 503 com
  `code: DMR_GATEWAY_PENDING_HAR` — preserva DL-093 e a fronteira
  `route → service → repository → job → worker → gateway`;
- worker `dmr.submit` mapeia o stub para `failed_remote` sem subir
  DLQ;
- ao plugar HAR depois, fase 03 só substitui o corpo do stub por
  HTTP real, sem reabrir contrato/persistência/frontend.

Plano de captura HAR (4–5 capturas mínimas, hostname
`mtr.cetesb.sp.gov.br`) está pronto em
[02-source-validation.md §6](handoffs/dmr-fluxo-base/02-source-validation.md#6-plano-de-captura-har-dmr-n%C3%A3o-executado-nesta-fase).

## 8. Checkpoints da cadeia

- [00-orchestration.md](handoffs/dmr-fluxo-base/00-orchestration.md)
- [01-baseline-docs.md](handoffs/dmr-fluxo-base/01-baseline-docs.md)
- [02-source-validation.md](handoffs/dmr-fluxo-base/02-source-validation.md)
- [04-backend-contracts.md](handoffs/dmr-fluxo-base/04-backend-contracts.md)
- [05-persistence-queue.md](handoffs/dmr-fluxo-base/05-persistence-queue.md)
- [06-domain-rules.md](handoffs/dmr-fluxo-base/06-domain-rules.md)
- [07-frontend-ux.md](handoffs/dmr-fluxo-base/07-frontend-ux.md)
- [08-qa-validation.md](handoffs/dmr-fluxo-base/08-qa-validation.md)
- [09-docs-final.md](handoffs/dmr-fluxo-base/09-docs-final.md)

Arquitetura alvo:
[docs/04-arquitetura/dmr-sicat.md](04-arquitetura/dmr-sicat.md).
