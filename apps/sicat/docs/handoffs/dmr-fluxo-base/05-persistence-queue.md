# 05 — Persistence Queue — DMR (cadeia `dmr-fluxo-base`)

> Fase concluída em 2026-04-25 pelo `postgres-queue-mtr`.
> Anterior: [04-backend-contracts.md](04-backend-contracts.md). Geral:
> [00-orchestration.md](00-orchestration.md). Arquitetura alvo:
> [docs/04-arquitetura/dmr-sicat.md](../../04-arquitetura/dmr-sicat.md) §3.

## 1. Objetivo da fase

1. Materializar o esquema de dados DMR em Postgres (migration idempotente
   alinhada ao padrão DL-022).
2. Substituir o stub do repositório DMR por SQL real, preservando a
   interface tipada exposta pela fase 04.
3. Adicionar o handler de worker `dmr.submit`, mapeando o `AppError 503
   DMR_GATEWAY_PENDING_HAR` (gateway stub) para `failed_remote` **sem
   subir DLQ**.

## 2. Arquivos analisados

- [docs/handoffs/dmr-fluxo-base/04-backend-contracts.md](04-backend-contracts.md)
  §7 — handoff detalhado da fase 04.
- [docs/04-arquitetura/dmr-sicat.md](../../04-arquitetura/dmr-sicat.md)
  §3 (esquema de dados) e §4 (ciclo declaratório).
- [docs/DL-022-EVOLUCAO-PERSISTENCIA-FILA.md](../../DL-022-EVOLUCAO-PERSISTENCIA-FILA.md)
  — padrão de constraints, locking otimista (`version`), índices e
  triggers `increment_version`.
- [src/sql/001_init.sql](../../../src/sql/001_init.sql),
  [src/sql/004_advanced_locking_consistency.sql](../../../src/sql/004_advanced_locking_consistency.sql)
  — referência de convenções (text PKs, FKs, trigger `increment_version`).
- [src/repositories/manifest-repo.ts](../../../src/repositories/manifest-repo.ts)
  — padrão de mapeamento `row → record`, locking otimista, jsonb.
- [src/repositories/dmr-repo.ts](../../../src/repositories/dmr-repo.ts)
  — interface tipada herdada da fase 04 (preservada).
- [src/services/dmr-service.ts](../../../src/services/dmr-service.ts)
  — chamadas atuais ao repo (`insertDmr`, `updateDmrStatus`,
  `deleteDmrDraft`, `listDmr*`, `findDmrById`, items).
- [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts)
  §`processJob`, `handleCadastroSubmit` — padrão de handler simples.
- [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  §`submitDmr` — stub `AppError 503` `DMR_GATEWAY_PENDING_HAR`.
- [src/db/migrate.ts](../../../src/db/migrate.ts) — runner idempotente
  de migrations (sequência alfabética em `src/sql/`).

## 3. Decisões

1. **PK `text` em vez de `uuid`**. O doc arquitetural §3.1 menciona
   `uuid` de forma indicativa, mas todas as PKs do projeto
   (`manifests.id`, `cadastros.id`, `integration_accounts.id`,
   `session_contexts.id`, `jobs.job_id`) são `text` e o serviço já
   gera ids prefixados via `createPrefixedId('dmr')`. Adotar `text`
   mantém consistência com `DmrRecord.id: string` e evita conversões
   espúrias.

2. **Trigger `increment_version` reaproveitada**. A função SQL
   `increment_version()` já existe (migration 004). A migration 013
   apenas adiciona o trigger `trg_dmr_declarations_version` em
   `dmr_declarations`, replicando o padrão de `manifests`/`jobs`/
   `session_contexts`. O repo confia no trigger para bump de
   `version` e `updated_at` — nenhum SQL do repo seta esses campos
   manualmente em update.

3. **5 constraints DL-022 do baseline**:
   - `chk_dmr_period_order` (`period_end >= period_start`).
   - `chk_dmr_role_allowed` (4 papéis válidos).
   - `chk_dmr_status_allowed` (10 status do ciclo declaratório).
   - `chk_dmr_submitted_consistency` (`status='submitted'` →
     `submitted_at` e `protocol_number` obrigatórios).
   - `chk_dmr_attempts_nonneg` (`attempts >= 0`).
   - Idempotência: `drop constraint if exists` + `add constraint`.

4. **Constraints adicionais em `dmr_declaration_items`**. Não
   exigidas pelo handoff, mas necessárias para integridade da
   coleção (e custo zero):
   - `chk_dmr_item_quantity_unit` (`kg|t|m3|L`).
   - `chk_dmr_item_partner_role` (`transportador|destinador|armazenador`).
   - `chk_dmr_item_quantity_positive` (`quantity_value > 0`).

5. **Soft-delete em `deleteDmrDraft`**. Conforme handoff §7.1, o
   método não deleta fisicamente: faz `update` para `status =
   'cancelled'` via `updateDmrStatus`, com locking otimista e
   trigger bumpando `version`/`updated_at`.

6. **Locking otimista uniforme**. `updateDmrStatus(id, patch,
   expectedVersion)` constrói `UPDATE ... WHERE id=$1 AND
   version=$2 RETURNING *`. Quando `rowCount=0`, distingue 404
   (não existe) de 409 (`DMR_VERSION_CONFLICT`), espelhando o
   padrão do `manifest-repo`. Sets dinâmicos cobrem somente as
   colunas presentes no patch — `coalesce` não é usado para
   permitir setar `null` explicitamente (importante para
   `lastErrorCode`/`lastErrorDetail`/`protocolNumber`).

7. **Bump de `version` por mutação em itens**. `insertDmrItem` e
   `deleteDmrItem` executam `update dmr_declarations set
   updated_at = now() where id = $1` após a mutação, fazendo o
   trigger incrementar `version`. Mantém a coleção consistente
   com o agregador raiz para a fase 06 (validações declaratórias).

8. **Handler `dmr.submit` trata gateway-stub como pendência
   funcional, não falha técnica**. Conforme handoff §7.3:
   - bloqueia o caminho de retry/DLQ ao **não relançar** o
     `AppError 503 DMR_GATEWAY_PENDING_HAR`;
   - persiste `dmr_declarations.status = 'failed_remote'` com
     `last_error_code = 'DMR_GATEWAY_PENDING_HAR'` e
     `last_error_detail` estruturado;
   - finaliza o job com `outcome = 'dmr_submit_pending_har'`
     (job `succeeded`);
   - registra exchange completa em `audit_logs` (outbound
     request snapshot + inbound 503).
   - **Caminho feliz preservado**: o `try` ramo carrega
     `protocolNumber`/`remoteReference` do retorno, atualiza
     para `submitted` (com `submitted_at`) ou `awaiting_remote`,
     e finaliza com `outcome = 'dmr_submitted' /
     'dmr_awaiting_remote'`. Esse código fica inalcançável até
     que a fase 03-external-integration substitua o stub.
   - Erros não-503 são re-lançados (preservam política normal
     de retry/DLQ do `job-runner`).

9. **Tipagem `gateway.submitDmr` em `processJob`**. Como o
   gateway é JS (DL-093), a tipagem inferida pela inferência de
   defaults (`= null`) seria `null | undefined`-only e quebraria
   o typecheck no `job-runner.ts`. Foram aplicadas duas
   mitigações isoladas:
   - JSDoc `@param` em `submitDmr` no
     [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
     declarando o shape do parâmetro.
   - Assinatura espelhada (opcional) na cláusula `gateway` de
     `processJob` em
     [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts).
   Nenhuma alteração de comportamento — só tipagem.

## 4. Arquivos criados / alterados

### Criados

- [src/sql/013_dmr_declarations.sql](../../../src/sql/013_dmr_declarations.sql)
  — migration idempotente:
  - `dmr_declarations` (24 colunas + `version`, FKs em
    `integration_accounts`, `session_contexts`).
  - 5 constraints DL-022 (`chk_dmr_period_order`,
    `chk_dmr_role_allowed`, `chk_dmr_status_allowed`,
    `chk_dmr_submitted_consistency`, `chk_dmr_attempts_nonneg`).
  - Trigger `trg_dmr_declarations_version` (reaproveita
    `increment_version`).
  - Índices: `idx_dmr_account_status`, `idx_dmr_period`,
    `idx_dmr_correlation`, `idx_dmr_protocol` (parcial).
  - `dmr_declaration_items` (FK `on delete cascade`, FK opcional
    para `manifests`).
  - 3 constraints de integridade nos items.
  - Índices `idx_dmr_items_decl`, `idx_dmr_items_manifest`
    (parcial).

### Alterados

- [src/repositories/dmr-repo.ts](../../../src/repositories/dmr-repo.ts)
  — substituído o stub `AppError 501` por SQL real. Tipos
  exportados (`DmrRecord`, `DmrItemRecord`, `DmrInsertInput`,
  `DmrItemInsertInput`, `DmrListFilters`, `DmrRole`, `DmrStatus`,
  `DmrSummaryTotals`) preservados na íntegra. Métodos
  implementados: `listDmr`, `listPendingDmr`, `findDmrById`,
  `insertDmr`, `updateDmrStatus` (locking otimista + 409),
  `deleteDmrDraft` (soft-delete via `updateDmrStatus`),
  `listDmrItems`, `insertDmrItem`, `deleteDmrItem`. Helpers
  `mapRow` / `mapItemRow` normalizam Date/string/jsonb.

- [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts)
  — adicionado `case 'dmr.submit'` no `processJob` e novo
  `handleDmrSubmit` (aprox. 130 linhas) com try/catch
  específico para `DMR_GATEWAY_PENDING_HAR`. Auditoria registrada
  via `insertAuditEntry` (outbound + inbound). Imports adicionados:
  `findDmrById`, `updateDmrStatus`, `DmrStatus`, `AppError`.

- [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
  — adicionada JSDoc `@param` em `submitDmr` (sem alterar
  comportamento; necessário para typecheck após o handler ler o
  método).

## 5. Diff resumido

### `src/repositories/dmr-repo.ts`

- Antes: 9 funções, todas levantando `AppError 501
  DMR_REPO_NOT_IMPLEMENTED_*`.
- Depois: 9 funções com SQL real (insert/select/update/delete) +
  4 helpers de mapeamento + 1 helper privado de
  `throwConflictOrNotFound`. Locking otimista em todos os updates.

### `src/workers/operation-handlers.ts`

- `processJob.gateway` ganhou `submitDmr?` opcional.
- `switch (job.operation)` ganhou `case 'dmr.submit'`.
- Nova função `handleDmrSubmit` no fim do arquivo.

### `src/sql/013_dmr_declarations.sql`

- Novo arquivo, 100% idempotente.

## 6. Validações executadas

| comando | resultado |
| --- | --- |
| `npm run migrate` | **OK** — `[migrate] aplicado 013_dmr_declarations.sql`. |
| `npm run typecheck` | **OK** — zero erros (`tsc -p tsconfig.json --noEmit`). |
| `npm run test:integration` | **OK** — 124 testes / 13 suítes passam. |
| `npm run test:worker` | **OK** — 14 testes / 3 suítes passam. |
| `npm run test:contract` | **OK** — 4/4 testes (JobResource, CommandAccepted, exemplos). Pipeline também roda `validate:openapi`, `validate:source-of-truth` e `validate:md-links`, todos verdes. |

## 7. Bloqueios identificados

- **HAR DMR ausente** — herdado da fase 02 (Caminho B). Mantém o
  caminho de submit em `failed_remote` com
  `DMR_GATEWAY_PENDING_HAR`. Não bloqueia a fase 06.
- **Suítes Playwright pré-existentes (F2 da
  [00-orchestration.md](00-orchestration.md#5-pendências-herdadas-centro-operacional-sicat))**
  — fora do escopo desta fase.

## 8. Handoff explícito para `manifestos-operacional-mtr` (fase 06)

### 8.1. Estado entregue

- Persistência DMR pronta e exercitada via integration tests
  existentes.
- Worker `dmr.submit` registra estado correto mesmo com gateway
  stub (`failed_remote` + `DMR_GATEWAY_PENDING_HAR`, sem DLQ).
- Locking otimista comprovado (testes existentes não regrediram).

### 8.2. Trabalho pendente da fase 06 (resumo)

A fase 06-domain-rules deve introduzir as **regras declaratórias**
do DMR sem alterar o contrato HTTP nem a persistência:

1. **Consolidação real** em `consolidateDmrService`
   ([src/services/dmr-service.ts](../../../src/services/dmr-service.ts)
   §`consolidateDmrService`). Hoje só transita
   `draft → pending_review` mantendo `summaryTotals` antigos.
   - Buscar manifestos elegíveis no período declaratório
     (consulta a `manifests` filtrando por
     `integration_account_id`, papel e janela `period_start..period_end`).
   - Calcular `summaryTotals` reais (`totalManifestos`,
     `manifestosPorStatus`, `totalMassaPorClasse`,
     `totalMassaPorResiduo`, `parceirosDistintos`).
   - Persistir items em `dmr_declaration_items` via
     `insertDmrItem` (idempotente para reconsolidação).
   - Tratar `force=true` reabrindo `awaiting_remote → pending_review`.

2. **Validações declaratórias antes de `enqueueDmrSubmit`**.
   Hoje o service só valida `sessionContextId` e estados.
   Adicionar:
   - DMR deve ter pelo menos 1 item (`failed_validation` em caso
     contrário).
   - Período fechado (não ultrapassa “hoje”).
   - Conta CETESB ativa.
   - Papel coerente com `partnerRole` dos items (gerador vs.
     destinador, etc.).

3. **Mapeamento `dmr.status → JobOperationalStatus`** revisitado em
   [src/lib/operational-status.ts](../../../src/lib/operational-status.ts).
   Hoje vive só em `dmr-service.mapDmrStatusToOperational`.
   A fase 06 deve registrar oficialmente no registry da taxonomia
   operacional (sem inventar bucket — usar os 13 estados
   existentes).

4. **Taxonomia de erros**: alinhar `lastErrorCode` aos códigos
   canonizados em
   [docs/05-operacao/taxonomia-status-erros-operacionais.md](../../05-operacao/taxonomia-status-erros-operacionais.md).
   `DMR_GATEWAY_PENDING_HAR` é caso especial — manter como
   `failed_remote_contract` no mapeamento operacional.

### 8.3. Restrições mantidas

- NÃO tocar gateway DMR (fase 03 reaberta espera HAR).
- NÃO tocar contratos OpenAPI (lockstep da fase 04 já fechado).
- NÃO mexer no frontend (fase 07).
- NÃO commit/push (fase 10).
- Continuar honrando locking otimista (`expectedVersion`).
- Respeitar idempotência por `dmr.consolidate:<id>` e
  `dmr.submit:<id>`.

### 8.4. Prompt pronto para `manifestos-operacional-mtr`

```text
Cadeia: dmr-fluxo-base. Fase 06-domain-rules.

Contexto obrigatório:
- docs/handoffs/dmr-fluxo-base/00-orchestration.md (status global)
- docs/handoffs/dmr-fluxo-base/05-persistence-queue.md §8 (handoff
  detalhado)
- docs/04-arquitetura/dmr-sicat.md §4 (ciclo declaratório) e §5
  (regras funcionais)
- docs/05-operacao/taxonomia-status-erros-operacionais.md
- src/services/dmr-service.ts (orquestração e mapeamento atual)
- src/repositories/dmr-repo.ts (SQL real + locking otimista)
- src/lib/operational-status.ts (registry oficial)

Entregas:
1. Consolidação real em consolidateDmrService (calcular
   summaryTotals e persistir items via insertDmrItem).
2. Validações declaratórias antes de enqueueDmrSubmit
   (>=1 item, período fechado, conta ativa, papel coerente).
3. Registrar `dmr.status` no registry de operational-status.
4. Alinhar lastErrorCode à taxonomia operacional canônica.
5. Validar: typecheck, test:integration, test:worker,
   test:contract, test:source-of-truth.
6. Checkpoint em
   docs/handoffs/dmr-fluxo-base/06-domain-rules.md e handoff
   para frontend-vue-ux-mtr (fase 07).

Restrições:
- Não tocar gateway DMR (fase 03 adiada).
- Não regenerar OpenAPI/operations.ts.
- Não tocar frontend.
- Não commit/push.
- Preservar locking otimista (expectedVersion) e idempotência.
```

## 9. Estado para o orquestrador

- Fase 05 **CONCLUÍDA** em 2026-04-25.
- Próxima fase ativa: **06-domain-rules**
  (`manifestos-operacional-mtr`).
- Fase 03-external-integration permanece **adiada** (Caminho B).
