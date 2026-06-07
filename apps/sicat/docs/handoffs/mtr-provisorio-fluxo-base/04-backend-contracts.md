# 04 — Backend Contracts — MTR provisório (cadeia `mtr-provisorio-fluxo-base`)

## Objetivo da fase

Implementar a família HTTP `/v1/mtr-provisorio/*` (criação, listagem,
detalhe, cancelamento e impressão) em lockstep OpenAPI ↔ examples ↔
`src/generated/operations.{js,ts}` ↔ rotas ↔ services, sem tocar gateway
(fase 03 fechada), persistência real (fase 05), worker handler real
(fase 05), domain rules (fase 06), frontend (fase 07) ou commit/push.

Decidir formalmente o conflito **R3** (sobrecarga `tipoManifesto`) entre
o eixo de domínio SICAT (`kind`) e o eixo de transporte CETESB
(`tipoManifesto` numérico) registrado em
[02-source-validation.md §2.5](02-source-validation.md#25-discriminador-tipomanifesto-conflito-a-resolver-na-fase-04).

## Arquivos analisados

- [docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md](00-orchestration.md)
- [docs/handoffs/mtr-provisorio-fluxo-base/01-baseline-docs.md](01-baseline-docs.md)
- [docs/handoffs/mtr-provisorio-fluxo-base/02-source-validation.md](02-source-validation.md)
- [docs/handoffs/mtr-provisorio-fluxo-base/03-external-integration.md](03-external-integration.md)
- [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md)
- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
- [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  (bloco `MTR provisório — bloco isolado`)
- [src/services/manifest-service.ts](../../../src/services/manifest-service.ts)
  (template de `enqueueManifestPrint`)
- [src/services/dmr-service.ts](../../../src/services/dmr-service.ts)
  (template de orquestração + idempotência)
- [src/repositories/dmr-repo.ts](../../../src/repositories/dmr-repo.ts)
  (referência de tipos, locking otimista)
- [src/routes/dmr-routes.ts](../../../src/routes/dmr-routes.ts)
  (template HTTP mapping)
- [src/lib/command-response.ts](../../../src/lib/command-response.ts)
- [src/lib/problem.ts](../../../src/lib/problem.ts)
- [scripts/generate-operations.js](../../../scripts/generate-operations.js)
  + [scripts/sync-operations-ts.mjs](../../../scripts/sync-operations-ts.mjs)
- [tests/integration/openapi-queue-contract.test.js](../../../tests/integration/openapi-queue-contract.test.js)

## Decisões

### D1 — R3 formalmente fechado: opção R3-C

**Decisão**: adotar **R3-C — `kind` (SICAT) como discriminador de
domínio, convertido para `tipoManifestoOverride` numérico apenas na
borda do service ao invocar o gateway**.

Justificativa:

- **R3-A (`tipoManifesto` puramente como variante)** exigiria remover
  ou redefinir o atual mapeamento I/E/M → 1/2/3 já presente em
  [src/gateways/cetesb-gateway.js#L1262](../../../src/gateways/cetesb-gateway.js)
  e poderia afetar fixtures/testes do MTR comum, alargando o blast
  radius desta cadeia base bem além do necessário. Permanece viável em
  cadeia futura de cleanup, mas descartada **agora**.
- **R3-B (segundo campo `subtipoManifesto`)** introduziria um segundo
  discriminador no payload CETESB sem evidência HAR explícita,
  violando a política
  [.github/instructions/cetesb-source-of-truth.instructions.md](../../../.github/instructions/cetesb-source-of-truth.instructions.md).
  **Desaconselhada e descartada**.
- **R3-C** mantém o gateway como única borda que conhece valores
  numéricos do CETESB, separa o eixo de domínio (`kind`) do eixo de
  transporte (`tipoManifesto`), permite documentar/sobrescrever o
  valor numérico via env (`MTR_PROVISORIO_TIPO_MANIFESTO_OVERRIDE`)
  sem mexer em código, e respeita o `tipoManifestoOverride` já
  exposto no bloco isolado do gateway (fase 03).

**Materialização da decisão**:

- `kind ∈ { 'provisorio' }` aparece no schema `MtrProvisorio` /
  `MtrProvisorioListItem` da OpenAPI (literal único nesta família, já
  que a outra variante é a família `/v1/manifestos/*` legada);
- o service [src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts)
  exporta `PROVISORIO_TIPO_MANIFESTO_OVERRIDE` (numeric, default `2`,
  override por env) e injeta este valor no `payload.tipoManifestoOverride`
  do job `manifest.submit`;
- o worker handler (fase 05) ramifica por `payload.kind` e passa
  `tipoManifestoOverride` explicitamente ao chamar
  `submitMtrProvisorio` no gateway. **Nenhum valor numérico aparece
  fora do service / variável de ambiente.**

### D2 — Família HTTP dedicada `/v1/mtr-provisorio/*`

Confirmada a recomendação inicial da baseline
([docs/04-arquitetura/mtr-provisorio-sicat.md §4.4](../../04-arquitetura/mtr-provisorio-sicat.md)):
**Opção A — família dedicada**, com persistência única em `manifests`
(coluna `kind` a ser adicionada na fase 05).

Materialização: novos paths `/v1/mtr-provisorio` (POST/GET),
`/v1/mtr-provisorio/{id}` (GET/DELETE) e
`/v1/mtr-provisorio/{id}/print` (POST). Tag OpenAPI dedicada
**MTR Provisorio**.

### D3 — `entityType = 'mtr_provisorio'` em jobs e command-accepted

Para que `links.entity` em respostas `202 command-accepted` aponte para
`/v1/mtr-provisorio/{id}` (ao invés de `/v1/manifestos/{id}`),
adicionado branch `mtr_provisorio` em
[src/lib/command-response.ts](../../../src/lib/command-response.ts).
Os jobs persistidos carregam `entity_type = 'mtr_provisorio'`,
`entity_id = manifest.id`, `payload.kind = 'provisorio'` — o worker
handler de fase 05 usa este discriminador para ramificar a chamada do
gateway sem duplicar o handler.

### D4 — Repo stub `not_implemented` tipado

Seguindo o padrão herdado da cadeia DMR (que também começou com repo
stub na fase 04 antes do SQL real chegar na fase 05), criamos
[src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts)
com tipos completos (`MtrProvisorioRecord`, `MtrProvisorioListItem`,
`MtrProvisorioListFilters`, `MtrProvisorioInsertInput`,
`MtrProvisorioStatus`) e funções que lançam
`AppError(501, 'Not Implemented', ..., { code: 'MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED' })`.

Isto deixa contratos HTTP publicáveis e os handlers de rota validáveis
sem forjar persistência. A fase 05 substitui as implementações sem
alterar a interface.

### D5 — Idempotência preservada em comandos

Tanto `createMtrProvisorioService` quanto `enqueueMtrProvisorioPrintService`
usam `getIdempotentResponse`/`rememberIdempotentResponse` com escopos
`mtr-provisorio.create:{integrationAccountId}` e
`mtr-provisorio.print:{id}`, espelhando o padrão de
`manifest-service.ts` e `dmr-service.ts`.

### D6 — `correlationId`, `commandId`, `sessionContextId`,
`integrationAccountId` preservados

Todas as travessias `route → service → job` propagam estes campos.
`X-Correlation-Id` é lido por `request-context.ts` e injetado no
service; ausente, gera-se novo via `createPrefixedId('corr')`.

## Arquivos criados

- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
  (paths e schemas adicionados — ver §"Paths OpenAPI adicionados").
- [src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts)
  (stub tipado, ~140 linhas).
- [src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts)
  (~280 linhas, R3-C materializado).
- [src/routes/mtr-provisorio-routes.ts](../../../src/routes/mtr-provisorio-routes.ts)
  (HTTP mapping only, ~80 linhas).
- [examples/post_v1_mtr_provisorio_request.json](../../../examples/post_v1_mtr_provisorio_request.json)
- [examples/post_v1_mtr_provisorio_response.json](../../../examples/post_v1_mtr_provisorio_response.json)
- [examples/get_v1_mtr_provisorio_request.json](../../../examples/get_v1_mtr_provisorio_request.json)
- [examples/get_v1_mtr_provisorio_response.json](../../../examples/get_v1_mtr_provisorio_response.json)
- [examples/get_v1_mtr_provisorio_id_request.json](../../../examples/get_v1_mtr_provisorio_id_request.json)
- [examples/get_v1_mtr_provisorio_id_response.json](../../../examples/get_v1_mtr_provisorio_id_response.json)
- [examples/delete_v1_mtr_provisorio_id_request.json](../../../examples/delete_v1_mtr_provisorio_id_request.json)
- [examples/delete_v1_mtr_provisorio_id_response.json](../../../examples/delete_v1_mtr_provisorio_id_response.json)
- [examples/post_v1_mtr_provisorio_id_print_request.json](../../../examples/post_v1_mtr_provisorio_id_print_request.json)
- [examples/post_v1_mtr_provisorio_id_print_response.json](../../../examples/post_v1_mtr_provisorio_id_print_response.json)

## Arquivos alterados

- [src/lib/command-response.ts](../../../src/lib/command-response.ts):
  branch `mtr_provisorio` adicionado em `links.entity`.
- [src/routes/api-routes.ts](../../../src/routes/api-routes.ts):
  `import { registerMtrProvisorioRoutes }` + chamada antes de
  `return router`.
- [src/generated/operations.js](../../../src/generated/operations.js)
  e [src/generated/operations.ts](../../../src/generated/operations.ts):
  88 operações (regeneradas via `npm run gen:operations` +
  `node scripts/sync-operations-ts.mjs`).

Nenhum outro arquivo de produção foi alterado. Gateway, persistência,
worker handlers, domain rules, frontend e testes finais permanecem
intocados (escopo de fases 03 fechada / 05–08 futuras).

## Paths OpenAPI adicionados

| Método | Path | OperationId | Resposta principal | Idempotency-Key |
| --- | --- | --- | --- | --- |
| GET | `/v1/mtr-provisorio` | `mtrProvisorioList` | `200` `MtrProvisorioListResponse` | — |
| POST | `/v1/mtr-provisorio` | `mtrProvisorioCreate` | `202` `CommandAccepted` | sim |
| GET | `/v1/mtr-provisorio/{id}` | `mtrProvisorioGet` | `200` `MtrProvisorio` | — |
| DELETE | `/v1/mtr-provisorio/{id}` | `mtrProvisorioCancel` | `200` `MtrProvisorioCancelResponse` | — |
| POST | `/v1/mtr-provisorio/{id}/print` | `mtrProvisorioPrint` | `202` `CommandAccepted` | sim |

Schemas novos: `MtrProvisorioCreateRequest` (`allOf` ManifestCreateRequest),
`MtrProvisorio` (`allOf` ManifestResource + `kind`/`provisionalNumber`/
`definitiveManifestId`), `MtrProvisorioListItem`,
`MtrProvisorioListResponse`, `MtrProvisorioPrintRequest`,
`MtrProvisorioCancelResponse`. Erros via
`#/components/responses/Problem` (problem+json).

## Validações executadas

| Validação | Comando | Resultado |
| --- | --- | --- |
| OpenAPI + política CETESB + md-links | `npm run validate:openapi` | **ok** — 670 arquivos, 0 problemas |
| Operations regeneradas | `npm run gen:operations` + `node scripts/sync-operations-ts.mjs` | **ok** — 88 operações |
| TypeScript | `npm run typecheck` | **0 erros** |
| Contract | `npm run test:contract` | **4/4 passando** |
| Source-of-truth | `npm run test:source-of-truth` | **9/9 passando** |
| HAR ↔ Gateway estrutural | `npm run validate:har-gateway` | **ok** — 5 ops HAR, 6 seções gateway, 11 checks |
| Markdown links | `npm run validate:md-links` | **ok** — 670 arquivos, 0 problemas |

## Riscos residuais (não-bloqueantes para a fase 04)

- **R1 (médio)**: o valor numérico `tipoManifesto = 2` para variante
  provisória ainda é suposição (arquitetura §4.1). Mitigado pela
  variável `MTR_PROVISORIO_TIPO_MANIFESTO_OVERRIDE` em
  [src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts)
  + audit-exchange-logging do gateway. Mitigação total exige a
  captura HAR humana opcional referida em
  [02-source-validation.md §3.2](02-source-validation.md#32-lista-m%C3%ADnima-de-capturas-recomendadas-para-mitigar-r1-e-r3).
- **R2 (baixo)**: enquanto o repo stub estiver ativo (até o fim da
  fase 05), todas as rotas `/v1/mtr-provisorio/*` respondem
  `501 Not Implemented` com problem+json
  (`code: MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED`). Isto é
  comportamento **intencional** desta fase — a próxima fase substitui
  o stub por SQL real.

## Bloqueios

Nenhum bloqueio. Tudo verde, contratos publicáveis, R3 formalmente
fechado.

## Handoff explícito para a fase 05 (`postgres-queue-mtr`)

**Próximo agente**: `postgres-queue-mtr`.
**Próxima fase**: `05-persistence-queue`.
**Próximo checkpoint**:
`docs/handoffs/mtr-provisorio-fluxo-base/05-persistence-queue.md`.

### Entradas para o próximo agente

- baseline:
  [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md)
  (§5 esquema, §4.3 worker handler);
- veredicto de evidência:
  [02-source-validation.md](02-source-validation.md);
- bloco gateway pronto:
  [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  (procurar `MTR provisório — bloco isolado` — funções
  `submitMtrProvisorio`, `listMtrProvisorio`, `printMtrProvisorio`);
- contrato HTTP fechado:
  [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
  (paths `/v1/mtr-provisorio/*`);
- repo stub a ser substituído:
  [src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts);
- service que consome o repo:
  [src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts).

### Entregas obrigatórias da fase 05

1. **Migration idempotente** (numerada após `013_dmr_declarations.sql`),
   adicionando à tabela `manifests` (sem alterar constraints DL-022 e
   preservando locking otimista — coluna `version`):
   - `kind text not null default 'definitivo'`
     (constraint check `kind in ('definitivo','provisorio')`);
   - `provisional_number text` (nullable);
   - `definitive_manifest_id text` (nullable, FK opcional para
     `manifests(id)` — futuro vínculo provisório → definitivo);
   - índice idempotente
     `create index if not exists ix_manifests_kind on manifests(kind)`;
   - índice parcial sugerido
     `create index if not exists ix_manifests_kind_provisorio
        on manifests(integration_account_id, expedition_date desc)
        where kind = 'provisorio'` (para listagem dedicada).
2. **Repo SQL real**: substituir os métodos stub em
   [src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts)
   por SQL apoiado em `manifests` filtrado por `kind = 'provisorio'`,
   preservando a interface tipada já definida na fase 04. Métodos
   exatos a implementar:
   - `insertMtrProvisorio(input)` — `insert into manifests(... kind='provisorio') returning *`;
   - `findMtrProvisorioById(id)` — `select * where id = $1 and kind = 'provisorio'`;
   - `listMtrProvisorio(filters)` — paginado por
     `(integration_account_id?, status?, expedition_date range)`,
     retornando `MtrProvisorioListItem[]` + `totalItems`;
   - `deleteMtrProvisorioDraft(id, expectedVersion)` — soft-delete
     (`status = 'cancelled'`, `cancelled_at = now()`), com guard
     otimista `where version = $expectedVersion`;
   - `updateMtrProvisorioStatus(id, patch, expectedVersion)` —
     trigger `increment_version` cuida do bump.
3. **Worker handler — ramificação `kind='provisorio'`** em
   [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts):
   - **`manifest.submit`**: ler `payload.kind`. Se `'provisorio'`,
     invocar `gateway.submitMtrProvisorio({ manifest, payload,
     tipoManifestoOverride: payload.tipoManifestoOverride })`
     (valor já vem do service via `PROVISORIO_TIPO_MANIFESTO_OVERRIDE`).
     Após sucesso, persistir `provisional_number` no campo dedicado
     (em vez de `mtr_number`). Falha → marcar `failed_submit` +
     `last_error_*`. Audit-exchange e retry/DLQ permanecem
     inalterados.
   - **`manifest.print`**: ler `payload.kind`. Se `'provisorio'`,
     invocar `gateway.printMtrProvisorio(manHashCode)` usando
     `manifest.external_hash_code` (mesmo campo do MTR comum — o
     bloco gateway reusa o endpoint comum de impressão por
     `manHashCode`, conforme decisão de fase 03 D2).
4. **Locking otimista preservado** em todos os updates do worker
   handler — `where version = $expectedVersion` + `AppError(409)` em
   conflito.
5. **Constraints DL-022** validadas via `validate-db-constraints.js`
   pós-migration (5 checks: submitted, finished, running, retry_wait,
   attempts).
6. **Validações que devem permanecer verdes**:
   - `npm run migrate` (idempotente);
   - `npm run validate:openapi`;
   - `npm run validate:har-gateway`;
   - `npm run test:source-of-truth`;
   - `npm run typecheck`;
   - `npm run validate:md-links`;
   - `npm run test:contract`;
   - `npm run test:integration`;
   - `npm run test:worker`.

### Prompt sugerido para o próximo agente

```text
work_id: mtr-provisorio-fluxo-base
fase: 05-persistence-queue
agente: postgres-queue-mtr

Implemente persistência real e ramificação de worker handler para
MTR provisório:

1. Migration idempotente que adicione `kind` ('definitivo'|'provisorio',
   default 'definitivo'), `provisional_number` e `definitive_manifest_id`
   em `manifests`, sem mexer nas 5 constraints DL-022 nem no locking
   otimista. Índices: `ix_manifests_kind` e parcial
   `ix_manifests_kind_provisorio`. Use `create ... if not exists`.

2. Substitua o stub em src/repositories/mtr-provisorio-repo.ts por SQL
   real apoiado em `manifests` filtrado por kind='provisorio',
   preservando a interface tipada já definida (MtrProvisorioRecord,
   MtrProvisorioListItem, etc).

3. Atualize src/workers/operation-handlers.ts para ramificar:
   - manifest.submit: se payload.kind === 'provisorio', chamar
     gateway.submitMtrProvisorio({ manifest, payload,
     tipoManifestoOverride: payload.tipoManifestoOverride }).
   - manifest.print: se payload.kind === 'provisorio', chamar
     gateway.printMtrProvisorio(manifest.external_hash_code).

   Audit, retry, DLQ e locking otimista permanecem inalterados.

4. Não alterar gateway (fase 03 fechada), domain rules (fase 06),
   frontend (fase 07) ou testes finais (fase 08). Não fazer commit/push.

5. Validações que devem ficar verdes:
   - npm run migrate
   - npm run validate:openapi
   - npm run validate:har-gateway
   - npm run test:source-of-truth
   - npm run typecheck
   - npm run validate:md-links
   - npm run test:contract
   - npm run test:integration
   - npm run test:worker

6. Checkpoint:
   docs/handoffs/mtr-provisorio-fluxo-base/05-persistence-queue.md
   com objetivo, arquivos analisados, decisões, arquivos alterados,
   validações e handoff explícito para manifestos-operacional-mtr (fase 06).

7. Atualizar docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md §6:
   fase 05 CONCLUÍDA, fase 06 ATIVA.
```

## Próximo agente

`postgres-queue-mtr` — fase `05-persistence-queue`. Se o runtime não
conseguir invocá-lo, devolver `next_agent_required` com o prompt acima.
