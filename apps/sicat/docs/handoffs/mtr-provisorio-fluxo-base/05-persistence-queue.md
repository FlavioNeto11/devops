# 05 — Persistence Queue — MTR provisório (cadeia `mtr-provisorio-fluxo-base`)

## Objetivo da fase

Substituir o stub de persistência da fase 04 por SQL real apoiado na
tabela `manifests` (decisão R3-C — `kind` discriminador SICAT) e
ramificar `manifest.submit` / `manifest.print` no worker para o caminho
provisório, sem tocar gateway (fase 03 fechada), contratos HTTP
(fase 04 fechada), regras de domínio (fase 06), frontend (fase 07) ou
realizar commit/push.

## Arquivos analisados

- [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md)
- [docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md](00-orchestration.md)
- [docs/handoffs/mtr-provisorio-fluxo-base/03-external-integration.md](03-external-integration.md)
- [docs/handoffs/mtr-provisorio-fluxo-base/04-backend-contracts.md](04-backend-contracts.md)
- [src/sql/001_init.sql](../../../src/sql/001_init.sql) (definição
  base de `manifests`)
- [src/sql/004_advanced_locking_consistency.sql](../../../src/sql/004_advanced_locking_consistency.sql)
  (5 constraints DL-022 + locking otimista `version`)
- [src/sql/012_operations_indexes.sql](../../../src/sql/012_operations_indexes.sql)
  (índice `idx_manifests_expedition_date_text` reaproveitado)
- [src/sql/013_dmr_declarations.sql](../../../src/sql/013_dmr_declarations.sql)
  (template de migration aditiva idempotente)
- [src/repositories/manifest-repo.ts](../../../src/repositories/manifest-repo.ts)
  (padrão de repo SQL: mapRow, ownership session, locking)
- [src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts)
  (stub a substituir)
- [src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts)
  (consumer do repo — interface tipada preservada)
- [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts)
  (handlers `handleManifestSubmit`, `handleManifestPrint`,
  `applyManifestSubmitTerminalFailureSideEffect`)
- [src/workers/job-runner.ts](../../../src/workers/job-runner.ts)
  (dispatch via `processJob` + injeção do gateway)
- [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  (bloco `MTR provisório — bloco isolado` — `submitMtrProvisorio`,
  `printMtrProvisorio`)

## Decisões

### D1 — Migration aditiva sobre `manifests` (sem nova tabela)

**Decisão**: implementar uma migration aditiva
[src/sql/014_mtr_provisorio_kind.sql](../../../src/sql/014_mtr_provisorio_kind.sql)
que estende `manifests` com `kind`, `provisional_number` e
`definitive_manifest_id`, mais dois índices. Não foi criada tabela
separada porque:

- a coluna `kind` ainda **não existia** em `manifests` (verificado:
  apenas `004_advanced_locking_consistency.sql` adiciona `version`;
  nenhuma migração anterior toca `kind`);
- a baseline arquitetural
  ([docs/04-arquitetura/mtr-provisorio-sicat.md §5](../../04-arquitetura/mtr-provisorio-sicat.md))
  e o checkpoint
  [04-backend-contracts.md](04-backend-contracts.md) (D2)
  formalizam reuso de `manifests` discriminado por `kind`;
- as 5 constraints DL-022 vigentes (`chk_manifest_submitted_integrity`,
  `chk_job_finished_integrity`, `chk_job_running_integrity`,
  `chk_job_retry_wait_integrity`, `chk_job_attempts_integrity`)
  continuam aplicáveis ao ramo `kind='provisorio'` sem ajuste — o
  ramo provisório respeita os mesmos invariantes (ex.: status
  `submitted` exige `external_hash_code` não-nulo);
- o trigger `trg_manifests_version` cobre updates inclusive sobre as
  três novas colunas — locking otimista preservado sem intervenção
  adicional.

A migration usa `add column if not exists` + `drop constraint if
exists`/`add constraint` e `create index if not exists`, garantindo
idempotência (verificado: `npm run migrate` aplica, segunda execução
é no-op).

### D2 — Repo SQL real reusando `manifests` filtrado por `kind`

Substituí o stub `not_implemented` de
[src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts)
por SQL real:

- `insertMtrProvisorio` — `INSERT` com `kind='provisorio'` literal +
  `requireMtrProvisorioSessionOwnership` (espelha
  `requireManifestSessionOwnership` do manifest-repo);
- `findMtrProvisorioById` — `SELECT * WHERE id=$1 AND
  kind='provisorio'` (descarta linhas definitivas com mesmo id, embora
  IDs sejam globalmente únicos);
- `listMtrProvisorio` — paginação, filtros `integrationAccountId`,
  `status`, `dateFrom`/`dateTo` sobre `expeditionDate` (com fallback
  para `created_at`);
- `deleteMtrProvisorioDraft` — soft-delete (`status='cancelled'`,
  `external_status` preservado se ausente) com guard otimista
  `where version = $expectedVersion`. Conflitos retornam
  `AppError(409)` com `code: MTR_PROVISORIO_VERSION_CONFLICT`;
- `updateMtrProvisorioStatus` — patch ampliado (campos `status`,
  `externalStatus`, `externalReference`, `externalHashCode`,
  `provisionalNumber`, `definitiveManifestId`, `payload`,
  `sessionContextId`, `lastSubmittedAt`, `lastSyncAt`) com guard
  otimista. A interface tipada (`MtrProvisorioUpdatePatch`) é
  aditiva — service da fase 04 não precisa mudar (continua chamando
  apenas `deleteMtrProvisorioDraft`/`insertMtrProvisorio` etc.; o
  patch ampliado é consumido pelo worker handler).

`mapRow`/`mapListItem` derivam campos derivados a partir do `payload`
(generator/carrier/receiver/batch) e do `external_reference`
(`manCodigo`/`manNumero`), preservando o contrato `MtrProvisorioRecord`
e `MtrProvisorioListItem` definidos na fase 04.

### D3 — Worker handlers ramificados por `payload.kind`

Em [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts):

- `processJob` recebe gateway com **dois métodos opcionais
  adicionais** (`submitMtrProvisorio`, `printMtrProvisorio`) — o
  gateway já os expõe (bloco isolado da fase 03);
- `handleManifestSubmit` testa `job.payload?.kind === 'provisorio'`
  (ou `entityType === 'mtr_provisorio'`) e delega a
  `handleMtrProvisorioSubmit` — caminho original do MTR comum
  permanece intocado;
- `handleMtrProvisorioSubmit` lê via `findMtrProvisorioById`, atualiza
  para `submitting` com locking otimista, invoca
  `gateway.submitMtrProvisorio({ manifest, payload,
  tipoManifestoOverride })` (R3-C: o `tipoManifestoOverride` chega via
  `payload.tipoManifestoOverride` injetado pelo service na fase 04 a
  partir da constante `PROVISORIO_TIPO_MANIFESTO_OVERRIDE`), persiste
  `provisional_number = manNumero`, `external_reference`,
  `external_hash_code`, `last_submitted_at`, `last_sync_at`,
  `payload` com `jobResults` mesclado;
- `handleMtrProvisorioPrint` lê via `findMtrProvisorioById`, exige
  `externalHashCode`, atualiza para `queued_print`, invoca
  `gateway.printMtrProvisorio(externalHashCode, { sessionContextId,
  integrationAccountId, correlationId })`, persiste o PDF via
  `storeManifestPdf` (reuso) e atualiza status final para
  `submitted` (estado canônico de "impresso e CETESB válido" no
  ramo provisório — mapeamento canônico final será refinado pela
  fase 06);
- `applyManifestSubmitTerminalFailureSideEffect` estendido para
  aceitar `entityType ∈ { 'manifest', 'mtr_provisorio' }`. No ramo
  provisório, usa `findMtrProvisorioById`/`updateMtrProvisorioStatus`
  para marcar `failed_submit` com `last_error_*` e `payload`
  enriquecido — taxonomia operacional preservada (`status: 'failed'`,
  `outcome: 'manifest_submit_failed'`, `retriable` calculado pela
  ação terminal). Audit-exchange-logging permanece via `logExchange`
  inalterado.

### D4 — Audit, retry, DLQ e idempotência preservados

- `logExchange` é invocado nos novos handlers (entrada e saída
  CETESB), com `entityType=mtr_provisorio` propagado para
  `audit_logs`;
- retry/DLQ permanecem governados por `getRetryConfig('manifest.submit'
  )` / `manifest.print` em
  [src/lib/retry.js](../../../src/lib/retry.ts), sem ramificação por
  `kind` — comportamento alinhado ao MTR comum;
- locking otimista é honrado em **todos** os updates do worker
  handler (3 chamadas no submit, 2 no print), retornando
  `AppError(409)` em conflito;
- idempotência do comando segue intacta no service (escopos
  `mtr-provisorio.create`/`mtr-provisorio.print`).

### D5 — Mapeamento de status (preliminar — domínio é fase 06)

Estados intermediários adotados nos handlers seguem a taxonomia já
declarada em
[src/repositories/mtr-provisorio-repo.ts `MtrProvisorioStatus`](../../../src/repositories/mtr-provisorio-repo.ts):
`draft` → `queued_submit` → `submitting` → `awaiting_remote` /
`submitted` (sucesso) | `failed_submit` (terminal). Para impressão:
`submitted` → `queued_print` → `submitted` (status final, com
`payload.jobResults['manifest.print']` carregando `printUrl`).

A consolidação contra os **13 estados canônicos** (mapeamento
domínio/UX) é responsabilidade da fase 06 — esta fase não introduz
estados novos além dos já tipados na interface.

## Arquivos criados

- [src/sql/014_mtr_provisorio_kind.sql](../../../src/sql/014_mtr_provisorio_kind.sql)
  — migration aditiva idempotente (~70 linhas).

## Arquivos alterados

- [src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts)
  — stub substituído por SQL real (~410 linhas).
- [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts)
  — import do repo provisório, ramificação no `handleManifestSubmit`
  / `handleManifestPrint`, dois novos handlers
  (`handleMtrProvisorioSubmit`, `handleMtrProvisorioPrint`),
  `applyManifestSubmitTerminalFailureSideEffect` estendido. Tipo do
  gateway em `processJob` ampliado com
  `submitMtrProvisorio?`/`printMtrProvisorio?`.

Nenhum outro arquivo de produção foi alterado. Gateway, OpenAPI,
examples, operations geradas, rotas, services, frontend e regras de
domínio permanecem intocados (escopo das fases 03 fechada / 04 fechada
/ 06 e 07 futuras).

## Validações executadas

| Validação | Comando | Resultado |
| --- | --- | --- |
| Migration idempotente (1ª aplicação) | `npm run migrate` | **ok** — `aplicado 014_mtr_provisorio_kind.sql` |
| Migration idempotente (2ª aplicação) | `npm run migrate` | **ok** — no-op |
| TypeScript estrito | `npm run typecheck` | **0 erros** |
| Contract | `npm run test:contract` | **4/4 passando** |
| Worker | `npm run test:worker` | **14/14 passando** |
| Integration | `npm run test:integration` | **124/124 passando** |
| Source-of-truth | `npm run test:source-of-truth` | **9/9 passando** |
| HAR ↔ Gateway estrutural | `npm run validate:har-gateway` | **ok** — 5 ops HAR, 6 seções gateway, 11 checks |
| OpenAPI + política CETESB + md-links | `npm run validate:openapi` | **ok** — 671 arquivos |
| Markdown links | `npm run validate:md-links` | **ok** — 671 arquivos, 0 problemas |

Flake F4 (`test:integration` 1/124 não reproduzível, registrada no
[estado-atual §3.1](../../10-estado-atual/estado-atual.md#31-follow-ups-de-estabilidade))
**não reapareceu** nesta execução — 124/124 verdes.

## Bloqueios

Nenhum bloqueio. Persistência real publicada, worker ramificado,
auditoria/locking/retry preservados.

## Riscos residuais

- **R1 (médio, herdado da fase 03/04)**: o valor numérico
  `tipoManifesto = 2` no payload CETESB para variante provisória
  segue suposição. Mitigado pela env override
  `MTR_PROVISORIO_TIPO_MANIFESTO_OVERRIDE` + audit-exchange-logging.
  Validação humana definitiva exige captura HAR opcional referida em
  [02-source-validation.md §3.2](02-source-validation.md#32-lista-m%C3%ADnima-de-capturas-recomendadas-para-mitigar-r1-e-r3).
- **R5 (baixo, novo)**: o status final pós-impressão adotado é
  `submitted` (não há `printed` na taxonomia atual de
  `MtrProvisorioStatus`). A fase 06 deve reconciliar isto contra os
  13 estados canônicos do domínio.

## Handoff explícito para `manifestos-operacional-mtr` (fase 06)

**Próximo agente**: `manifestos-operacional-mtr`.
**Próxima fase**: `06-domain-rules`.
**Próximo checkpoint**:
`docs/handoffs/mtr-provisorio-fluxo-base/06-domain-rules.md`.

### Entradas

- baseline:
  [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md)
  (§4 fluxos críticos; §5 esquema; §6 regras operacionais a
  consolidar);
- contratos HTTP fechados:
  [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
  (paths `/v1/mtr-provisorio/*`);
- service:
  [src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts);
- repo SQL real:
  [src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts);
- worker handlers ramificados:
  [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts)
  (procurar `handleMtrProvisorioSubmit` e
  `handleMtrProvisorioPrint`);
- taxonomia operacional canônica:
  [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  (13 estados canônicos a mapear).

### Entregas obrigatórias da fase 06

1. **Validador de payload** — criar/estender
   `src/lib/validators/mtr-provisorio-validator.ts` (ou reusar
   `manifest-validator.ts` com discriminador `kind`) cobrindo:
   - campos obrigatórios CETESB para MTR provisório (gerador,
     transportador, destinador, motorista, placa, expedição,
     resíduos);
   - regras específicas do ramo provisório destacadas em
     [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md);
   - integração com `application/problem+json` em todos os caminhos
     de erro.
2. **Mapeamento aos 13 estados canônicos** — declarar em
   [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
   o tradutor de `MtrProvisorioStatus` →
   `OperationalStatusCanonical`. Reconciliar o item R5 do checkpoint
   05 (status pós-impressão).
3. **Transições de status válidas** — formalizar a máquina de
   estados (`draft → queued_submit → submitting → submitted | failed_submit
   → queued_print → submitted (impresso) | cancelled`) e validar no
   service/worker que transições inválidas geram problem+json.
4. **Wiring no service** — onde aplicável, propagar a validação
   (`createMtrProvisorioService`, `enqueueMtrProvisorioPrintService`,
   `cancelMtrProvisorioService`).
5. **Testes** — pelo menos uma suite `tests/api/` cobrindo o
   validator (campos obrigatórios, mapeamento de status, transições
   inválidas). Não exigido nesta fase regredir/manter Playwright (é
   da fase 08).
6. **Validações que devem permanecer verdes**:
   - `npm run typecheck`;
   - `npm run validate:openapi`;
   - `npm run validate:har-gateway`;
   - `npm run validate:md-links`;
   - `npm run test:source-of-truth`;
   - `npm run test:contract`;
   - `npm run test:worker`;
   - `npm run test:integration`;
   - `npm run test:api`.

### Restrições

- **Não tocar gateway** (fase 03 fechada).
- **Não tocar contratos HTTP** (fase 04 fechada) salvo se uma assinatura
  precisar ajuste mínimo — documentar.
- **Não implementar persistência adicional** (fase 05 entregue);
  qualquer ajuste de migration deve ser justificado e idempotente.
- **Não tocar frontend** (fase 07).
- **Não fazer commit/push**.

### Prompt sugerido para o próximo agente

```text
work_id: mtr-provisorio-fluxo-base
fase: 06-domain-rules
agente: manifestos-operacional-mtr

Entradas:
- docs/04-arquitetura/mtr-provisorio-sicat.md (regras operacionais §4-§6)
- docs/handoffs/mtr-provisorio-fluxo-base/05-persistence-queue.md (R5)
- src/services/mtr-provisorio-service.ts
- src/repositories/mtr-provisorio-repo.ts (interface MtrProvisorioStatus)
- src/workers/operation-handlers.ts (handlers handleMtrProvisorioSubmit/Print)
- src/lib/operational-status.ts (taxonomia canônica)
- src/lib/validators/manifest-validator.ts (template)

Entregas:
1. Validador de payload MTR provisório (campos obrigatórios CETESB +
   regras específicas), com problem+json.
2. Mapeamento MtrProvisorioStatus → 13 estados canônicos
   (operational-status.ts), reconciliando o status pós-impressão.
3. Máquina de estados com transições válidas e bloqueio de inválidas
   no service/worker (problem+json em violações).
4. Wiring nos comandos do service (create/print/cancel).
5. Testes em tests/api/ cobrindo validador e transições.
6. Não tocar gateway, OpenAPI/examples, frontend ou commit/push.

Validações verdes obrigatórias:
- npm run typecheck
- npm run validate:openapi
- npm run validate:har-gateway
- npm run validate:md-links
- npm run test:source-of-truth
- npm run test:contract
- npm run test:worker
- npm run test:integration
- npm run test:api

Checkpoint:
docs/handoffs/mtr-provisorio-fluxo-base/06-domain-rules.md com objetivo,
arquivos analisados, decisões, alterações, validações e handoff
explícito para frontend-vue-ux-mtr (fase 07).

Atualizar docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md §6:
fase 06 CONCLUÍDA, fase 07 ATIVA.
```

## Próximo agente

`manifestos-operacional-mtr` — fase `06-domain-rules`. Se o runtime
não conseguir invocá-lo, devolver `next_agent_required` com o prompt
acima.
