# 06 — Domain Rules — DMR (cadeia `dmr-fluxo-base`)

> Fase concluída em 2026-04-25 pelo `manifestos-operacional-mtr`.
> Anterior: [05-persistence-queue.md](05-persistence-queue.md). Geral:
> [00-orchestration.md](00-orchestration.md). Arquitetura alvo:
> [docs/04-arquitetura/dmr-sicat.md](../../04-arquitetura/dmr-sicat.md)
> §3.2, §4.

## 1. Objetivo da fase

1. Centralizar as regras declaratórias DMR em um validador dedicado
   ([src/lib/validators/dmr-validator.ts](../../../src/lib/validators/dmr-validator.ts)),
   espelhando o padrão do
   [manifest-validator.ts](../../../src/lib/validators/manifest-validator.ts).
2. Plugar as validações no service
   ([src/services/dmr-service.ts](../../../src/services/dmr-service.ts))
   nos pontos exatos do ciclo (create, item mutation, consolidate,
   submit, delete).
3. Registrar oficialmente o mapeamento `dmr.status → JobOperationalStatus`
   na taxonomia operacional canônica
   ([src/lib/operational-status.ts](../../../src/lib/operational-status.ts)),
   sem inventar buckets nem quebrar mapeamentos existentes
   (manifest, cdf, cadastro, catalog).

## 2. Arquivos analisados

- [docs/handoffs/dmr-fluxo-base/05-persistence-queue.md](05-persistence-queue.md)
  §8 — handoff explícito recebido.
- [docs/handoffs/dmr-fluxo-base/04-backend-contracts.md](04-backend-contracts.md)
  — contrato HTTP DMR.
- [docs/04-arquitetura/dmr-sicat.md](../../04-arquitetura/dmr-sicat.md)
  §3.2 (ciclo declaratório), §3.3 (itens), §4 (fluxos críticos).
- [docs/05-operacao/taxonomia-status-erros-operacionais.md](../../05-operacao/taxonomia-status-erros-operacionais.md)
  — registry canônico dos 13 estados operacionais.
- [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  — espelho TS da taxonomia, ponto de extensão.
- [src/lib/validators/manifest-validator.ts](../../../src/lib/validators/manifest-validator.ts)
  — padrão a replicar (AppError + códigos estáveis).
- [src/lib/problem.ts](../../../src/lib/problem.ts) — `AppError` (`code`,
  `context`, status/title).
- [src/services/dmr-service.ts](../../../src/services/dmr-service.ts)
  — pontos de plug.
- [src/repositories/dmr-repo.ts](../../../src/repositories/dmr-repo.ts)
  — interface SQL (precisei de uma função nova: `findOverlappingDmr`).
- [src/repositories/integration-account-repo.ts](../../../src/repositories/integration-account-repo.ts)
  — não há coluna `is_active`; “conta ativa” reduz-se a “conta existe”.
- [src/repositories/manifest-repo.ts](../../../src/repositories/manifest-repo.ts)
  — `findManifestById` (verificação de pertencimento à mesma conta).

## 3. Decisões

1. **Validator dedicado** em
   [src/lib/validators/dmr-validator.ts](../../../src/lib/validators/dmr-validator.ts)
   no mesmo padrão do `manifest-validator.ts`. Cada validação levanta
   `AppError` com `code` estável (DMR_*) — nunca `Error` cru — para
   permitir tratamento granular no frontend e taxonomia operacional.

2. **Boundary preservada**. O validador não fala SQL diretamente.
   Quando precisa cruzar dados (overlap de período, manifesto
   pertencente à mesma conta), consome funções de repositório:
   - nova `findOverlappingDmr` em
     [src/repositories/dmr-repo.ts](../../../src/repositories/dmr-repo.ts);
   - existente `findManifestById` em
     [src/repositories/manifest-repo.ts](../../../src/repositories/manifest-repo.ts).

3. **Tabela de transições** (`STATUS_TRANSITIONS`) materializada como
   `Record<DmrStatus, ReadonlySet<DmrStatus>>` — 10 origens × destinos
   permitidos. Transições terminais (`submitted`, `cancelled`) com
   conjunto vazio. Idempotência: `from === to` é no-op válido.

4. **Conjuntos por ação** (`CONSOLIDATABLE_FROM`, `SUBMITTABLE_FROM`,
   `DELETABLE_FROM`, `ITEM_MUTABLE_FROM`) explícitos para reuso e
   inspeção em testes futuros (exposto via `DMR_VALIDATOR_INTERNALS`).

5. **Janela de período aceitável**: ano ≥ 2015 e
   `period_end ≤ hoje + 31 dias`. Ano mínimo evita inputs claramente
   errados (`1970`, etc.). Tolerância futura permite cadastrar DMR cujo
   período fecha em poucos dias sem regredir o gate de submit
   (`period_end ≤ hoje`).

6. **Submit exige período fechado**, ≥1 item, conta CETESB existente,
   sessionContext válido e papel coerente com pelo menos um
   `partnerRole` da coleção. Mapeamento canônico de coerência alinhado
   a [dmr-sicat.md §3.3](../../04-arquitetura/dmr-sicat.md#33-dmr_declaration_items-linhasmanifestos-consolidados):
   - `gerador` → `transportador|destinador|armazenador`;
   - `transportador` → `destinador|armazenador`;
   - `destinador` → `transportador`;
   - `armazenador_temporario` → `transportador|destinador`.

7. **Mapeamento canônico DMR → operacional** consolidado em
   [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
   (export `mapDmrStatusToOperational`,
   `describeDmrOperationalStatus`,
   `DMR_OPERATIONAL_STATUS_REGISTRY`,
   `DmrLifecycleStatus`). Alinhado a
   [dmr-sicat.md §3.2](../../04-arquitetura/dmr-sicat.md#32-ciclo-declarat%C3%B3rio-dmr_declarationsstatus):
   - `draft`/`enqueued` → `ready`;
   - `consolidating`/`submitting` → `running`;
   - `pending_review` → `blocked_external_data` (decisão humana —
     antes mapeado erroneamente para `ready`);
   - `awaiting_remote` → `awaiting_remote_confirmation`;
   - `submitted` → `completed_with_document`;
   - `failed_validation` → `failed_validation`;
   - `failed_remote` → `failed_remote_auth` quando
     `lastErrorCode` casa com `AUTH|SESSION|TOKEN`; senão
     `failed_remote_contract` (cobre o caso especial
     `DMR_GATEWAY_PENDING_HAR` da fase 03 adiada);
   - `cancelled` → `failed_internal_processing` (terminal humano —
     antes mapeado erroneamente para `completed_with_no_items`).

8. **Refator do `mapDmrStatusToOperational` local em
   `dmr-service.ts`** para apenas delegar à função canônica —
   evita drift entre fontes de verdade. Os mapeamentos existentes
   (manifest, cdf, cadastro, catalog) ficam intactos.

9. **`CANCELLABLE_STATUSES` mantido em `dmr-service.ts`** por
   simetria com a granularidade do contrato (rota delete e remove
   item compartilham o mesmo gate). Espelha
   `ITEM_MUTABLE_FROM` do validador.

10. **Idempotency-Key preservado**. As validações foram inseridas
    **dentro** dos serviços, sempre antes do `enqueueOperation` /
    `updateDmrStatus`. O cache idempotente continua a curto-circuitar
    requisições repetidas antes mesmo das validações pesadas.

## 4. Arquivos criados / alterados

### Criados

- [src/lib/validators/dmr-validator.ts](../../../src/lib/validators/dmr-validator.ts)
  — 8 validadores públicos + helpers internos:
  - `validateDmrPeriod`, `validateDmrRole`,
    `validatePeriodNotOverlapping`,
    `validateNewDmr`, `validateStatusTransition`,
    `validateItemMutation`, `validateConsolidate`,
    `validateSubmit`, `validateDelete`;
  - `DMR_VALIDATOR_INTERNALS` (read-only) com sets/constantes
    para inspeção em testes futuros.

### Alterados

- [src/services/dmr-service.ts](../../../src/services/dmr-service.ts)
  — plugada a chamada do validador em:
  - `createDmrService` → `validateNewDmr` (período + role + overlap);
  - `consolidateDmrService` → `validateConsolidate` (status, force,
    coleção mínima);
  - `enqueueDmrSubmit` → `validateSubmit` (status, ≥1 item, período
    fechado, conta+sessão, coerência de papel);
  - `cancelDmrService` → `validateDelete` (status cancelável);
  - `addDmrItemService` → `validateItemMutation` (status, payload,
    manifesto da mesma conta);
  - `removeDmrItemService` → reusa `CANCELLABLE_STATUSES` com
    `code: 'DMR_ITEM_INVALID'`.
  - Removidos símbolos mortos (`requireRole`, `ROLES`,
    `TERMINAL_DMR_STATUSES`, `SUBMITTABLE_STATUSES`, type-import
    `DmrRole`).
  - Refator do `mapDmrStatusToOperational` interno para delegar à
    função canônica em `operational-status.ts`.

- [src/repositories/dmr-repo.ts](../../../src/repositories/dmr-repo.ts)
  — adicionada `findOverlappingDmr({ integrationAccountId, role,
  periodStart, periodEnd, excludeId? })`. Filtra
  `status <> 'cancelled'` e usa o predicado de sobreposição
  `period_start <= periodEnd and period_end >= periodStart`. Reusa
  `mapRow` existente.

- [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  — adicionado tipo `DmrLifecycleStatus`, registry
  `DMR_OPERATIONAL_STATUS_REGISTRY`, função
  `mapDmrStatusToOperational(status, lastErrorCode?)` e helper
  `describeDmrOperationalStatus(...)`. Reusa `AUTH_HINTS` e
  `matchesAny` existentes — zero duplicação.

## 5. Regras implementadas (códigos de erro)

| Regra | Validador | Código | Status HTTP |
| --- | --- | --- | --- |
| Formato + janela + ordem do período | `validateDmrPeriod` | `DMR_PERIOD_INVALID` | 400 |
| Role no enum DmrRole | `validateDmrRole` | `DMR_ROLE_INVALID` | 400 |
| Sem sobreposição com DMR não-cancelada (mesma conta + role) | `validatePeriodNotOverlapping` | `DMR_PERIOD_OVERLAP` | 409 |
| Transição de status válida | `validateStatusTransition` | `DMR_STATUS_TRANSITION_INVALID` | 400 |
| Status mutável + payload de item válido + manifesto da mesma conta | `validateItemMutation` | `DMR_ITEM_INVALID` | 400 |
| Status consolidável + force em awaiting_remote + coleção mínima | `validateConsolidate` | `DMR_NOT_CONSOLIDATABLE` | 400 |
| Status submetível + ≥1 item + período fechado + conta + sessão + coerência de papel | `validateSubmit` | `DMR_NOT_SUBMITTABLE` | 400 |
| Status cancelável | `validateDelete` | `DMR_NOT_DELETABLE` | 400 |

> Todos serializados como `application/problem+json` por
> [src/middlewares/error-handler.ts](../../../src/middlewares/error-handler.ts)
> com `code` preservado em `problem.code`.

## 6. Mapeamento status físico → canônico

Espelha [docs/04-arquitetura/dmr-sicat.md §3.2](../../04-arquitetura/dmr-sicat.md#32-ciclo-declarat%C3%B3rio-dmr_declarationsstatus)
e foi consolidado em
[src/lib/operational-status.ts](../../../src/lib/operational-status.ts):

| dmr.status (físico) | operationalStatus (canônico) | bucket | severity |
| --- | --- | --- | --- |
| `draft` | `ready` | `lifecycle` | `info` |
| `consolidating` | `running` | `in_flight` | `info` |
| `pending_review` | `blocked_external_data` | `blocked` | `warning` |
| `enqueued` | `ready` | `lifecycle` | `info` |
| `submitting` | `running` | `in_flight` | `info` |
| `awaiting_remote` | `awaiting_remote_confirmation` | `in_flight` | `info` |
| `submitted` | `completed_with_document` | `terminal_success` | `success` |
| `failed_validation` | `failed_validation` | `terminal_failure` | `danger` |
| `failed_remote` (default) | `failed_remote_contract` | `terminal_failure` | `danger` |
| `failed_remote` + lastErrorCode contém `AUTH/SESSION/TOKEN` | `failed_remote_auth` | `terminal_failure` | `danger` |
| `cancelled` | `failed_internal_processing` | `terminal_failure` | `danger` |

`DMR_GATEWAY_PENDING_HAR` (stub do gateway, fase 03 adiada) cai em
`failed_remote_contract` — falha de contrato remoto pendente de
evidência, não de auth.

## 7. Validações executadas

| comando | resultado |
| --- | --- |
| `npm run typecheck` | **OK** — zero erros (`tsc -p tsconfig.json --noEmit`). |
| `npm run test:integration` | **OK** — 124 testes / 13 suítes / 0 falhas (16,7s). |
| `npm run test:worker` | **OK** — 14 testes / 3 suítes / 0 falhas (1,2s). |
| `npm run test:contract` | **OK** — 4 testes (JobResource, CommandAccepted, exemplos). Pipeline também roda `validate:openapi`, `validate:source-of-truth` e `validate:md-links`, todos verdes. |
| `npm run test:source-of-truth` | **OK** — 6 testes / 0 falhas (0,4s). |

## 8. Bloqueios identificados

- **HAR DMR ausente** — herdado da fase 02 (Caminho B). Continua
  sem bloquear esta fase: o validador opera 100% sobre dados locais
  e o mapeamento canônico já trata `DMR_GATEWAY_PENDING_HAR` como
  `failed_remote_contract`.
- **Suítes Playwright pré-existentes (F2)** — fora do escopo.
  Esta fase não tocou frontend.

## 9. Handoff explícito para `frontend-vue-ux-mtr` (fase 07)

### 9.1. Estado entregue

- Regras declaratórias DMR centralizadas em
  [src/lib/validators/dmr-validator.ts](../../../src/lib/validators/dmr-validator.ts)
  com 8 validadores e códigos `DMR_*` estáveis.
- Service layer
  ([src/services/dmr-service.ts](../../../src/services/dmr-service.ts))
  invoca validadores nos pontos certos do ciclo (create, item mutation,
  consolidate, submit, delete).
- Mapeamento canônico `dmr.status → operationalStatus` registrado em
  [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  (`mapDmrStatusToOperational`, `describeDmrOperationalStatus`,
  `DMR_OPERATIONAL_STATUS_REGISTRY`).
- Suítes verdes: typecheck, integration (124), worker (14),
  contract (4 + pipeline), source-of-truth (6).

### 9.2. Trabalho da fase 07 (resumo)

A fase 07-frontend-ux deve **construir as rotas Vue 3 do DMR**
consumindo o contrato HTTP da fase 04 e a taxonomia operacional
publicada nesta fase. Sem tocar gateway/HAR.

Mínimo a entregar:

1. Rotas em `frontend/src/router.js`:
   - `/dmr` — listagem com filtros (status, role, período, conta).
   - `/dmr/pendentes` — lista derivada de
     `GET /v1/dmr/pendentes`.
   - `/dmr/:id` — detalhe + itens.
   - `/dmr/nova` — wizard de criação (period, role, label).
2. Componentes/views Vue 3 sob
   `frontend/src/views/dmr/` (criar diretório), seguindo o padrão de
   [docs/FRONTEND-COMPONENTS-ARCHITECTURE.md](../../FRONTEND-COMPONENTS-ARCHITECTURE.md).
3. Service HTTP em
   `frontend/src/services/dmr-service.js` (ou `.ts` se já houver
   precedente Vue 3 + TS no front).
4. Badges de status devem usar a taxonomia operacional canônica —
   **não** duplicar tabela no Vue. Importar / fetch via
   `describeOperationalStatus` (helper já consumido pelo Centro
   Operacional) ou via campo enriquecido vindo de
   `GET /v1/dmr/:id/status`.
5. Tratar `application/problem+json` com os códigos `DMR_*` desta
   fase (mensagens de erro humanas para `DMR_PERIOD_OVERLAP`,
   `DMR_NOT_SUBMITTABLE`, `DMR_ITEM_INVALID`, etc.).

### 9.3. Restrições mantidas

- NÃO tocar gateway DMR (fase 03 reaberta espera HAR).
- NÃO regenerar OpenAPI/operations.ts (lockstep da fase 04 fechado).
- NÃO mexer em backend/services/repositories DMR.
- NÃO commit/push (fase 10).
- Continuar respeitando `Idempotency-Key` em comandos.

### 9.4. Prompt pronto para `frontend-vue-ux-mtr`

```text
Cadeia: dmr-fluxo-base. Fase 07-frontend-ux.

Contexto obrigatório:
- docs/handoffs/dmr-fluxo-base/00-orchestration.md (status global)
- docs/handoffs/dmr-fluxo-base/06-domain-rules.md §9 (handoff
  detalhado desta fase)
- docs/04-arquitetura/dmr-sicat.md §4.2 (endpoints HTTP)
- docs/05-operacao/taxonomia-status-erros-operacionais.md (badges)
- docs/FRONTEND-COMPONENTS-ARCHITECTURE.md (padrão Vue)
- src/lib/validators/dmr-validator.ts (códigos DMR_* a tratar no UI)
- src/lib/operational-status.ts (mapDmrStatusToOperational)
- src/services/dmr-service.ts (contratos consumidos pelo front)

Entregas:
1. Rotas Vue 3: /dmr, /dmr/pendentes, /dmr/:id, /dmr/nova.
2. Components/views em frontend/src/views/dmr/.
3. Service HTTP em frontend/src/services/dmr-service.* consumindo
   o contrato DMR publicado pela fase 04.
4. Badges/severity via taxonomia operacional canônica (sem duplicar).
5. Tratar problem+json com DMR_* (mensagens humanas + recovery).
6. Validar: typecheck (front), build, lint, eventual Playwright DMR.
7. Checkpoint em
   docs/handoffs/dmr-fluxo-base/07-frontend-ux.md e handoff para
   tester-qa-mtr (fase 08).

Restrições:
- Não tocar backend, gateway, OpenAPI, operations.ts.
- Não commit/push.
- Respeitar Idempotency-Key e correlationId.
```

## 10. Estado para o orquestrador

- Fase 06 **CONCLUÍDA** em 2026-04-25.
- Próxima fase ativa: **07-frontend-ux** (`frontend-vue-ux-mtr`).
- Fase 03-external-integration permanece **adiada** (Caminho B).
