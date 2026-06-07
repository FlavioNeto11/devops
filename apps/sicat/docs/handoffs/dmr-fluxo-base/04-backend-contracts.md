# 04 — Backend Contracts — DMR (cadeia `dmr-fluxo-base`)

> Fase concluída em 2026-04-25 pelo `programador-backend-mtr`.
> Anterior: [02-source-validation.md](02-source-validation.md). Geral:
> [00-orchestration.md](00-orchestration.md). Arquitetura alvo:
> [docs/04-arquitetura/dmr-sicat.md](../../04-arquitetura/dmr-sicat.md).
> Decisão da fase 02 honrada (Caminho B): gateway DMR como **stub
> tipado** retornando `application/problem+json` (`type =
> https://sicat/problems/dmr-gateway-pending-har`, `status 503`).

## 1. Objetivo da fase

1. Publicar contrato HTTP completo para o ciclo declaratório DMR
   (listar / criar / pendentes / detalhar / consolidar / submeter /
   status / itens / cancelar).
2. Manter lockstep estrito **OpenAPI ↔ examples ↔
   `src/generated/operations.ts` ↔ rotas ↔ testes**.
3. Expor camadas `routes/`, `services/`, `repositories/` e `gateways/`
   sem introduzir SQL real (responsabilidade da fase 05) nem regra de
   negócio profunda (responsabilidade da fase 06).
4. Garantir que comandos assíncronos respondam `202 +
   command-accepted` e idempotência seja honrada via
   `Idempotency-Key`.

## 2. Arquivos analisados

- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
  — superfície CETESB/SICAT publicada.
- [src/routes/api-routes.ts](../../../src/routes/api-routes.ts) — padrão
  de mapeamento HTTP, headers e `getCorrelationId`.
- [src/services/manifest-service.ts](../../../src/services/manifest-service.ts)
  §`enqueueManifestSubmitInternal` — padrão de orquestração +
  idempotência + enqueue.
- [src/lib/command-response.ts](../../../src/lib/command-response.ts)
  — `buildCommandAccepted` (`status:'queued'`, links).
- [src/services/idempotency-service.ts](../../../src/services/idempotency-service.ts)
  — `getIdempotentResponse` / `rememberIdempotentResponse`.
- [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  — taxonomia operacional (13 estados).
- [src/lib/problem.ts](../../../src/lib/problem.ts) — `AppError` /
  `ProblemDetails`.
- [src/lib/retry.ts](../../../src/lib/retry.ts) — `getRetryConfig`,
  `calculateJobPriority`, `extractJobTags`.
- [src/repositories/job-repo.ts](../../../src/repositories/job-repo.ts)
  §`insertJobDeduplicated` — assinatura usada pelo enqueue.
- [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  §`RealCetesbGateway` — local do bloco DMR stub.
- [scripts/sync-operations-ts.mjs](../../../scripts/sync-operations-ts.mjs)
  — pipeline `gen:operations` ➜ `operations.ts`.

## 3. Decisões

1. **Sub-router DMR (`registerDmrRoutes`)**. Em vez de duplicar
   convenções dentro de [src/routes/api-routes.ts](../../../src/routes/api-routes.ts),
   o bloco DMR foi extraído para
   [src/routes/dmr-routes.ts](../../../src/routes/dmr-routes.ts) e
   anexado via função no fim de `createApiRouter`. Padrão reaproveita
   `asyncHandler`, `getCorrelationId` e `toHeaderMap` — sem
   abstrações novas.

2. **Status canônico DMR ↔ taxonomia operacional**. Mapeamento
   determinístico em
   [src/services/dmr-service.ts](../../../src/services/dmr-service.ts)
   `mapDmrStatusToOperational`:
   - `draft / pending_review / enqueued` → `ready`
   - `consolidating / submitting` → `running`
   - `awaiting_remote` → `awaiting_remote_confirmation`
   - `submitted` → `completed_with_document`
   - `failed_validation` → `failed_validation`
   - `failed_remote` → `failed_remote_auth` se `lastErrorCode`
     bater em `AUTH/SESSION/TOKEN`; caso contrário,
     `failed_remote_contract`.
   - `cancelled` → `completed_with_no_items`.

3. **Gateway DMR é stub tipado** (decisão Caminho B confirmada).
   `RealCetesbGateway.submitDmr` registra log de auditoria mínimo
   (`operation:'dmr.submit', mode:'stub-pending-har'`) e levanta
   `AppError(503, ...)` com `type =
   https://sicat/problems/dmr-gateway-pending-har` e `code =
   DMR_GATEWAY_PENDING_HAR`. Quando o HAR DMR chegar (fase 03
   reaberta), basta substituir o corpo do método mantendo a
   assinatura `submitDmr({ dmrId, payload, sessionContextId,
   integrationAccountId, correlationId })`.

4. **`buildCommandAccepted` ganhou o caso `dmr`** para emitir
   `links.entity = /v1/dmr/{id}` em comandos `dmr.submit`. Mudança
   isolada e retro-compatível (`manifest`, `cadastro`, `job`
   inalterados).

5. **Repositório DMR é stub tipado**. Toda função em
   [src/repositories/dmr-repo.ts](../../../src/repositories/dmr-repo.ts)
   levanta `AppError(501, 'Not Implemented', ...)` com `code =
   DMR_REPO_NOT_IMPLEMENTED_<OP>`. Os tipos exportados (`DmrRecord`,
   `DmrItemRecord`, `DmrInsertInput`, etc.) são a interface de
   contrato que a fase 05 (`postgres-queue-mtr`) deve preservar ao
   trocar o stub por SQL.

6. **Idempotência por chave `dmr.submit:<id>` e
   `dmr.consolidate:<id>`**. Mesmo padrão de
   `manifest-service.enqueueManifestSubmitInternal`. `Idempotency-Key`
   ausente desliga o cache (consistente com manifest).

## 4. Arquivos criados / alterados

### Criados

- [src/routes/dmr-routes.ts](../../../src/routes/dmr-routes.ts)
  — sub-router DMR (HTTP mapping puro).
- [src/services/dmr-service.ts](../../../src/services/dmr-service.ts)
  — orquestração + idempotência + enqueue de `dmr.submit`.
- [src/repositories/dmr-repo.ts](../../../src/repositories/dmr-repo.ts)
  — stub tipado (já existente da tentativa anterior; mantido).
- 23 examples DMR em [examples/](../../../examples/) (já existentes
  da tentativa anterior; conferidos contra OpenAPI):
  - `get_v1_dmr_{request,response}.json`
  - `post_v1_dmr_{request,response}.json`
  - `get_v1_dmr_pendentes_{request,response}.json`
  - `get_v1_dmr_dmrId_{request,response}.json`
  - `delete_v1_dmr_dmrId_{request,response}.json`
  - `post_v1_dmr_dmrId_consolidate_{request,response}.json`
  - `post_v1_dmr_dmrId_submit_{request,response}.json`
  - `get_v1_dmr_dmrId_status_{request,response}.json`
  - `get_v1_dmr_dmrId_items_{request,response}.json`
  - `post_v1_dmr_dmrId_items_{request,response}.json`
  - `delete_v1_dmr_dmrId_items_itemId_{request,response}.json`

### Alterados

- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
  — 11 novos paths sob `/v1/dmr*` + 9 schemas (`Dmr`, `DmrItem`,
  `DmrSummaryTotals`, `DmrCreateRequest`, `DmrConsolidateRequest`,
  `DmrSubmitRequest`, `DmrItemCreateRequest`, `DmrListResponse`,
  `DmrItemListResponse`, `DmrDetail`, `DmrStatusResponse`,
  `DmrCancelResponse`).
- [src/generated/operations.js](../../../src/generated/operations.js)
  e [src/generated/operations.ts](../../../src/generated/operations.ts)
  — regenerados via `npm run gen:operations` +
  `node scripts/sync-operations-ts.mjs` (83 operações totais; +11
  DMR). Type exports `Operation` e `OperationKey` foram restaurados
  pelo `sync-operations-ts.mjs` (a tentativa anterior havia perdido
  no edit manual).
- [src/routes/api-routes.ts](../../../src/routes/api-routes.ts)
  — import `registerDmrRoutes` + chamada antes de `return router`.
- [src/lib/command-response.ts](../../../src/lib/command-response.ts)
  — adiciona caso `entityType === 'dmr'` em `links.entity`.
- [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  — bloco DMR isolado em `RealCetesbGateway` com método `submitDmr`
  stub (problem+json 503).

## 5. Validações executadas

| comando | resultado |
| --- | --- |
| `npm run validate:openapi` | **OK** — OpenAPI válido, fonte de verdade CETESB validada, 657 arquivos analisados, links íntegros. |
| `npm run gen:operations` + `node scripts/sync-operations-ts.mjs` | **OK** — 83 operações regeneradas; `Operation` e `OperationKey` exportados. |
| `npm run typecheck` | **OK** — zero erros (`tsc -p tsconfig.json --noEmit`). |
| `npm run test:contract` | **OK** — 4/4 testes (`JobResource.status`, `CommandAccepted`, exemplos `job` e comandos). |
| `npm run test:source-of-truth` | **OK** — 6/6 testes (architecture + HARs + structural validators). |
| `npm run validate:md-links` | **OK** — 657 arquivos analisados, sem links quebrados. |

## 6. Bloqueios identificados

- **HAR DMR ausente** — confirmado pela fase 02. Não bloqueia o
  contrato (stub tipado já registra `503` consistente com
  `application/problem+json`). Bloqueia somente a substituição da
  implementação real do gateway, que é **fase 03 reaberta** após
  captura humana.

## 7. Handoff explícito para `postgres-queue-mtr` (fase 05)

### 7.1. Substituir o stub do repositório por SQL

Arquivo:
[src/repositories/dmr-repo.ts](../../../src/repositories/dmr-repo.ts).
Métodos a implementar (manter assinatura e tipos exportados):

| método | comportamento esperado | observação |
| --- | --- | --- |
| `listDmr(filters)` | `select` paginado em `dmr_declarations` com filtros opcionais (`status`, `role`, `period_start..period_end`, `integration_account_id`). | Retornar `{ items, total }`. |
| `listPendingDmr(integrationAccountId?)` | `select` em `dmr_declarations` onde `status in ('draft','pending_review','failed_validation')`. | Pode ser uma view ou subselect. |
| `findDmrById(id)` | `select * from dmr_declarations where id=$1`. | Retornar `null` quando não existir. |
| `insertDmr(input)` | `insert` em `dmr_declarations` com `version=1`, `attempts=0`, `summary_totals='{...}'::jsonb`. | Idempotente quando chamado com `id` já existente é **não desejado** — preferir conflito explícito. |
| `updateDmrStatus(id, patch, expectedVersion)` | Locking otimista (`where version = $expected`). Atualiza apenas as colunas presentes no patch. Lança `AppError(409)` em conflito. | Espelhar padrão de [src/repositories/manifest-repo.ts](../../../src/repositories/manifest-repo.ts). |
| `deleteDmrDraft(id, expectedVersion)` | Soft-delete via `update ... set status='cancelled', updated_at=now()`. **Não deletar fisicamente** (DL-022 audit). | Manter `version + 1`. |
| `listDmrItems(id)` | `select * from dmr_declaration_items where declaration_id=$1 order by created_at`. | |
| `insertDmrItem(id, item)` | `insert` em `dmr_declaration_items`. Atualizar `version` da declaração. | |
| `deleteDmrItem(id, itemId)` | `delete from dmr_declaration_items where declaration_id=$1 and id=$2`. Atualizar `version` da declaração. | Se DMR já estiver fora de `draft/pending_review`, o service já bloqueia. |

### 7.2. Migration

Criar migration idempotente em [src/sql/](../../../src/sql/) seguindo
o padrão DL-022:

- Tabelas: `dmr_declarations`, `dmr_declaration_items`.
- Colunas exatamente alinhadas com os tipos em
  [src/repositories/dmr-repo.ts](../../../src/repositories/dmr-repo.ts)
  (`DmrRecord`, `DmrItemRecord`).
- `version int not null default 1` (locking otimista).
- `summary_totals jsonb not null default '{}'::jsonb`.
- `payload_snapshot jsonb` (para auditoria do submit).
- Índices: `(integration_account_id, status, created_at desc)` e
  `(period_start, period_end)`.
- Constraints DL-022 análogas (status terminal exige
  `submitted_at`/`finished_at`, etc.) — ver
  [docs/DL-022-EVOLUCAO-PERSISTENCIA-FILA.md](../../DL-022-EVOLUCAO-PERSISTENCIA-FILA.md).
- `create index if not exists` para evitar reentradas.
- **Não** alterar `manifests` nem `jobs`.

### 7.3. Worker handler `dmr.submit`

Adicionar em
[src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts)
(ou arquivo dedicado importado por ele):

1. Carregar DMR (`findDmrById`) e `sessionContext`.
2. Marcar `status = 'submitting'` via `updateDmrStatus` (locking
   otimista).
3. Chamar `gateway.submitDmr({ dmrId, payload, sessionContextId,
   integrationAccountId, correlationId })`. **Hoje retorna 503**;
   o handler deve mapear o `AppError 503` para `failed_remote` com
   `lastErrorCode = 'DMR_GATEWAY_PENDING_HAR'` e **não** subir DLQ
   antes da substituição da fase 03.
4. Em sucesso real (após HAR): `status = 'awaiting_remote'` ou
   `'submitted'` conforme retorno.
5. Persistir `protocolNumber`, `remoteReference`, `submittedAt`.
6. Registrar `audit exchange` no padrão dos outros handlers.

### 7.4. Prompt pronto para `postgres-queue-mtr`

```text
Cadeia: dmr-fluxo-base. Fase 05-persistence-queue.

Contexto obrigatório:
- docs/handoffs/dmr-fluxo-base/00-orchestration.md (status global)
- docs/handoffs/dmr-fluxo-base/04-backend-contracts.md §7 (handoff
  detalhado, métodos a implementar, migration e worker handler)
- docs/04-arquitetura/dmr-sicat.md §3, §4
- docs/DL-022-EVOLUCAO-PERSISTENCIA-FILA.md (padrão de constraints,
  locking, índices)
- src/repositories/dmr-repo.ts (interface tipada — preservar
  assinaturas)
- src/repositories/manifest-repo.ts (padrão a replicar)

Entregas:
1. Migration idempotente em src/sql/ criando dmr_declarations e
   dmr_declaration_items, com índices e constraints DL-022.
2. Substituir o stub em src/repositories/dmr-repo.ts por SQL real,
   mantendo locking otimista (`version`) e tipos exportados.
3. Adicionar handler `dmr.submit` em
   src/workers/operation-handlers.ts (mapear AppError 503 do gateway
   para `failed_remote` com `DMR_GATEWAY_PENDING_HAR`, sem subir
   DLQ ainda).
4. Validar: `npm run migrate`, `npm run typecheck`,
   `npm run test:integration`, `npm run test:worker`,
   `npm run test:contract`.
5. Checkpoint em docs/handoffs/dmr-fluxo-base/05-persistence-queue.md
   e handoff para `manifestos-operacional-mtr` (fase 06).

Restrições:
- Não tocar gateway DMR (fase 03 reaberta espera HAR).
- Não tocar frontend (fase 07).
- Não commit/push.
- Lockstep OpenAPI ↔ examples ↔ operations.ts já está fechado pela
  fase 04; não regenerar.
```

## 8. Estado para o orquestrador

- Fase 04 **CONCLUÍDA** em 2026-04-25.
- Próxima fase ativa: **05-persistence-queue** (`postgres-queue-mtr`).
- Fase 03-external-integration permanece **adiada** (Caminho B): só
  reabre quando HAR DMR for capturado. O contrato e o worker
  esperam isso e degradam de forma controlada (`503 problem+json`).
