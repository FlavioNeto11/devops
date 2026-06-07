# 06 — Domain Rules — MTR provisório (cadeia `mtr-provisorio-fluxo-base`)

## Objetivo da fase

Consolidar as regras operacionais do ramo `kind = 'provisorio'`
(R3-C): validador de payload, máquina de estados, regras de
cancelamento/impressão e mapeamento canônico de status para os 13
estados de [src/lib/operational-status.ts](../../../src/lib/operational-status.ts).
Reconciliar o **R5** (status pós-impressão) deixado em aberto pela
fase 05.

Esta fase **não toca** gateway, OpenAPI/examples, persistência (além
das regras já cobertas por validador) nem frontend; também não realiza
commit/push.

## Arquivos analisados

- [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md)
- [docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md](00-orchestration.md)
- [docs/handoffs/mtr-provisorio-fluxo-base/04-backend-contracts.md](04-backend-contracts.md)
- [docs/handoffs/mtr-provisorio-fluxo-base/05-persistence-queue.md](05-persistence-queue.md)
  (R5 e prompt sugerido)
- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
  (`MtrProvisorioCreateRequest` = `ManifestCreateRequest` +
  `kind: 'provisorio'`)
- [src/lib/validators/manifest-validator.ts](../../../src/lib/validators/manifest-validator.ts)
  (template — campos obrigatórios CETESB)
- [src/lib/validators/dmr-validator.ts](../../../src/lib/validators/dmr-validator.ts)
  (template editorial — códigos canônicos, máquina de estados)
- [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  (taxonomia canônica + padrão `mapDmrStatusToOperational`)
- [src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts)
  (`MtrProvisorioStatus`)
- [src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts)
  (criação/print/cancel)
- [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts)
  (`handleMtrProvisorioSubmit`, `handleMtrProvisorioPrint`)

## Decisões

### D1 — Validador dedicado em `mtr-provisorio-validator.ts`

Criado [src/lib/validators/mtr-provisorio-validator.ts](../../../src/lib/validators/mtr-provisorio-validator.ts)
seguindo o padrão editorial da fase 06 da cadeia DMR
([src/lib/validators/dmr-validator.ts](../../../src/lib/validators/dmr-validator.ts)):

- reusa `validateManifestPayload` (R3-C: o schema de criação do
  provisório é o mesmo `ManifestCreateRequest` na borda HTTP) e
  reembrulha o erro como código canônico
  `MTR_PROVISORIO_PAYLOAD_INVALID`;
- formaliza a máquina de estados (`STATUS_TRANSITIONS`) cobrindo as
  transições humanas (service: create/cancel/print) e automáticas
  (worker: submit/print);
- expõe `validateStatusTransition`, `validateCancellable`,
  `validatePrintable`;
- **errors são `AppError` com `code` estável**, serializados em
  `application/problem+json` por
  [src/middlewares/error-handler.ts](../../../src/middlewares/error-handler.ts).

#### Códigos canônicos do validador

| Código | Status HTTP | Quando dispara |
| --- | --- | --- |
| `MTR_PROVISORIO_PAYLOAD_INVALID` | 400 | Payload de criação faltando campos obrigatórios CETESB (gerador, transportador, destinador, expedição, resíduos, estado etc.) ou body inválido. |
| `MTR_PROVISORIO_STATUS_TRANSITION_INVALID` | 400 | Tentativa de transição fora da máquina de estados. |
| `MTR_PROVISORIO_NOT_CANCELLABLE` | 400 | Cancelamento solicitado em status terminal/em-voo (`submitting`, `awaiting_remote`, `submitted`, `queued_print`, `cancelled`). |
| `MTR_PROVISORIO_NOT_PRINTABLE` | 400 | Impressão solicitada sem `status='submitted'` ou sem `externalHashCode`. |

#### Máquina de estados

```
draft           → queued_submit | cancelled
queued_submit   → submitting | failed_submit | cancelled
submitting      → awaiting_remote | submitted | failed_submit | draft (validateOnly)
awaiting_remote → submitted | failed_submit
submitted       → queued_print | submitted (no-op idempotente)
failed_submit   → queued_submit | cancelled
queued_print    → submitted | failed_submit
cancelled       → (terminal)
```

`from === to` é considerado no-op idempotente e aceito sem erro.

### D2 — Decisão R5: status pós-impressão **permanece `submitted`**

A fase 05 deixou aberto o R5 (`R5 (baixo, novo): o status final
pós-impressão adotado é submitted (não há printed na taxonomia atual
de MtrProvisorioStatus). A fase 06 deve reconciliar isto contra os
13 estados canônicos do domínio.`).

**Decisão**: **manter `submitted` como status físico pós-impressão**,
sem introduzir um estado `printed` separado. Justificativa:

- a presença do PDF é sinalizada via
  `payload.jobResults['manifest.print']` (`printUrl`, `documentId`,
  `fileName`) — sinal já produzido pelo handler
  `handleMtrProvisorioPrint` em
  [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts);
- a impressão CETESB é **idempotente e re-executável** sobre o mesmo
  `externalHashCode`; um estado terminal `printed` impediria
  reimpressões legítimas (por exemplo, quando o operador perde o PDF
  local);
- a máquina de estados fica enxuta — alinhada à taxonomia de DMR
  (ciclo declaratório com 1 estado terminal `submitted`), reduzindo
  divergências entre as duas frentes;
- o frontend distingue "submetido sem PDF" vs "submetido com PDF"
  pelo conteúdo de `payload.jobResults['manifest.print']` (a fase 07
  receberá esse sinal já presente no contrato HTTP).

Consequência canônica: `submitted → completed_with_document` —
coerente para ambos os pontos do ciclo, dado que o PDF é re-gerável
on-demand e o estado físico é "remoto reconhecido pela CETESB".

Nenhum ajuste foi necessário em
[src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts),
[src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts)
ou [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts)
para tratar R5 — o handler `handleMtrProvisorioPrint` já registra
`status: 'submitted'` pós-print.

### D3 — Mapeamento canônico em `operational-status.ts`

Adicionado bloco `MTR_PROVISORIO_*` em
[src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
espelhando o padrão `DMR_*`:

| Status físico (MtrProvisorioStatus) | Status canônico |
| --- | --- |
| `draft` | `ready` |
| `queued_submit` | `ready` |
| `submitting` | `running` |
| `awaiting_remote` | `awaiting_remote_confirmation` |
| `submitted` | `completed_with_document` |
| `failed_submit` | resolvido em runtime por `lastErrorCode` (AUTH → `failed_remote_auth`; VALIDATION/CONTRACT/SCHEMA → `failed_validation`; REMOTE/CETESB/TIMEOUT/GATEWAY/UPSTREAM → `failed_remote_contract`; default → `failed_internal_processing`) |
| `queued_print` | `running` |
| `cancelled` | `failed_internal_processing` |

Exports:

- `type MtrProvisorioLifecycleStatus`
- `MTR_PROVISORIO_OPERATIONAL_STATUS_REGISTRY`
- `mapMtrProvisorioStatusToOperational(status, lastErrorCode?)`
- `describeMtrProvisorioOperationalStatus(status, lastErrorCode?)`

### D4 — Wiring no service (3 pontos)

Em [src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts):

- `createMtrProvisorioService` → chama
  `validateMtrProvisorioCreatePayload(body)` antes de qualquer efeito
  colateral (idempotência, persistência, fila);
- `enqueueMtrProvisorioPrintService` → chama
  `validatePrintable(record)` após carregar o registro, antes de
  enfileirar `manifest.print`;
- `cancelMtrProvisorioService` → substitui o guard ad-hoc anterior
  (`MTR_PROVISORIO_CANCEL_INVALID_STATUS`) por
  `validateCancellable(record)` (`MTR_PROVISORIO_NOT_CANCELLABLE`).

O ajuste é **mínimo** (não muda contrato HTTP nem schema): apenas
centraliza regras no validador e padroniza códigos com o restante da
família.

### D5 — Não introduzido validador de transição no service/worker

A máquina de estados é enforced de fato pelas guards específicas
(`validatePrintable`, `validateCancellable`) e pelo locking otimista
do repo (`updateMtrProvisorioStatus` exige `expectedVersion`).
`validateStatusTransition` é exportado para uso futuro (worker handler
de re-submissão pós-falha, transições do dashboard operacional), mas
**não foi cabeado nos handlers existentes** — eles seguem fluxos
fixos coerentes com a tabela `STATUS_TRANSITIONS` (`submitting →
awaiting_remote/submitted/failed_submit`; `submitted → queued_print →
submitted`). Adicionar guard explícito nos handlers do worker
introduziria custo de manutenção sem ganho operacional concreto nesta
fase. A tabela permanece como contrato documental e ferramenta para
fases futuras.

### D6 — Sem testes de unidade novos nesta fase

A fase 06 da cadeia DMR (`dmr-fluxo-base`) também não introduziu
testes unitários dedicados ao validador — a cobertura é exercida via
`test:contract` (4/4) + `test:integration` (124/124) + `test:worker`
(14/14), todos verdes nesta fase. Replicamos esse padrão para manter
consistência editorial.

## Arquivos criados

- [src/lib/validators/mtr-provisorio-validator.ts](../../../src/lib/validators/mtr-provisorio-validator.ts)
  — validador + máquina de estados + códigos canônicos (~190 linhas).

## Arquivos alterados

- [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  — adicionado bloco `MTR_PROVISORIO_*` (mapeamento canônico,
  registry, mapper e describer).
- [src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts)
  — import do validador + 3 chamadas (`create`, `print`, `cancel`);
  removido guard ad-hoc `MTR_PROVISORIO_CANCEL_INVALID_STATUS`
  substituído por `validateCancellable`.

Nenhum outro arquivo alterado. Gateway, OpenAPI, examples,
operations geradas, rotas, repo, worker, frontend e migrações
permanecem intocados.

## Validações executadas

| Validação | Comando | Resultado |
| --- | --- | --- |
| TypeScript estrito | `npm run typecheck` | **0 erros** |
| OpenAPI + política CETESB + md-links | `npm run validate:openapi` | **ok** — 672 arquivos |
| HAR ↔ Gateway estrutural | `npm run validate:har-gateway` | **ok** — 5 ops HAR, 6 seções gateway, 11 checks |
| Markdown links | `npm run validate:md-links` | **ok** — 672 arquivos, 0 problemas |
| Source-of-truth | `npm run test:source-of-truth` | **9/9 passando** |
| Contract | `npm run test:contract` | **4/4 passando** |
| Worker | `npm run test:worker` | **14/14 passando** |
| Integration | `npm run test:integration` | **124/124 passando** |

Flake F4 não reapareceu — `test:integration` 124/124.

## Bloqueios

Nenhum. Validador publicado, mapeamento taxonômico cabeado, R5
formalmente fechado, validações verdes.

## Riscos residuais

- **R1 (médio, herdado)**: `tipoManifesto = 2` segue suposição
  documentada (override por env). Não tratado nesta fase — pertence à
  validação humana via captura HAR opcional referida em
  [02-source-validation.md §3.2](02-source-validation.md#32-lista-m%C3%ADnima-de-capturas-recomendadas-para-mitigar-r1-e-r3).

## Handoff explícito para `frontend-vue-ux-mtr` (fase 07)

**Próximo agente**: `frontend-vue-ux-mtr`.
**Próxima fase**: `07-frontend-ux`.
**Próximo checkpoint**:
`docs/handoffs/mtr-provisorio-fluxo-base/07-frontend-ux.md`
(a ser criado pela fase 07).

### Entradas

- baseline arquitetural:
  [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md);
- contratos HTTP fechados (família `/v1/mtr-provisorio/*`):
  [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml);
- service:
  [src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts);
- repo:
  [src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts);
- worker handlers:
  [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts);
- validador (fase 06):
  [src/lib/validators/mtr-provisorio-validator.ts](../../../src/lib/validators/mtr-provisorio-validator.ts);
- mapeamento canônico (fase 06):
  [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
  (`mapMtrProvisorioStatusToOperational`,
  `describeMtrProvisorioOperationalStatus`,
  `MTR_PROVISORIO_OPERATIONAL_STATUS_REGISTRY`);
- arquitetura de componentes Vue:
  [docs/FRONTEND-COMPONENTS-ARCHITECTURE.md](../../FRONTEND-COMPONENTS-ARCHITECTURE.md);
- referência editorial: rotas/views da família manifesto comum
  (`frontend/src/views/Manifests*.vue`,
  `frontend/src/components/Manifest*.vue`,
  `frontend/src/composables/useCetesbOperationalFlows.*`).

### Entregas obrigatórias da fase 07

1. **Rotas Vue dedicadas** (mínimo):
   - `MtrProvisorioListView` — listagem paginada com filtros
     `status`, `dateFrom`, `dateTo`, `integrationAccountId`;
   - `MtrProvisorioDetailView` — detalhe + ações (cancelar, imprimir);
   - `MtrProvisorioCreateView` — formulário de criação (reuso do
     formulário do MTR comum quando aplicável; respeitar
     `MtrProvisorioCreateRequest = ManifestCreateRequest +
     kind:'provisorio'`).
2. **Reuso de componentes** existentes do MTR comum
   (`ManifestForm`, `ManifestSummary`, `PartnerPicker`,
   `ResidueLineEditor` etc.) com discriminador
   `kind = 'provisorio'` em props.
3. **Banner/badge de estado** baseado em
   `mapMtrProvisorioStatusToOperational` — usar
   `describeMtrProvisorioOperationalStatus` para `label`,
   `severity`, `recommendedAction`.
4. **Helpers**:
   - cliente HTTP em `frontend/src/services/mtrProvisorioApi.{ts,js}`
     espelhando `manifestApi`;
   - composable
     `frontend/src/composables/useMtrProvisorio.{ts,js}` para listagem
     e ações;
   - sinal de PDF (`payload.jobResults['manifest.print']`) deve render
     botão "Baixar PDF" quando presente; o status físico permanece
     `submitted` em ambos os casos (decisão R5 — D2 desta fase).
5. **Guards de rota** SICAT auth + active CETESB account preservados
   (mesmo padrão do MTR comum).
6. **Não tratar bundling/Playwright/F2/F3** — fora de escopo da fase
   07; QA é fase 08.
7. **Validações que devem permanecer verdes**:
   - `npm run typecheck`;
   - `npm run validate:openapi`;
   - `npm run validate:har-gateway`;
   - `npm run validate:md-links`;
   - `npm run test:source-of-truth`;
   - `npm run test:contract`;
   - `npm run test:worker`;
   - `npm run test:integration`;
   - build/dev do frontend sem regressões funcionais nas views
     existentes.

### Restrições

- **Não tocar gateway** (fase 03 fechada).
- **Não tocar contratos HTTP** (fase 04 fechada).
- **Não tocar persistência/migrations** (fase 05 fechada).
- **Não tocar regras de domínio** (fase 06 — esta — fechada).
- **Não fazer commit/push**.
- Erros HTTP devem ser exibidos respeitando `application/problem+json`
  já produzido pelo backend (códigos
  `MTR_PROVISORIO_PAYLOAD_INVALID`,
  `MTR_PROVISORIO_NOT_CANCELLABLE`,
  `MTR_PROVISORIO_NOT_PRINTABLE`).

### Prompt sugerido para o próximo agente

```text
work_id: mtr-provisorio-fluxo-base
fase: 07-frontend-ux
agente: frontend-vue-ux-mtr

Entradas:
- docs/04-arquitetura/mtr-provisorio-sicat.md
- docs/FRONTEND-COMPONENTS-ARCHITECTURE.md
- docs/handoffs/mtr-provisorio-fluxo-base/06-domain-rules.md
- openapi/mtr_automacao_openapi_interna.yaml (família /v1/mtr-provisorio/*)
- src/lib/validators/mtr-provisorio-validator.ts (códigos canônicos)
- src/lib/operational-status.ts (mapMtrProvisorioStatusToOperational,
  describeMtrProvisorioOperationalStatus)
- frontend/src/{views,components,composables,services}/Manifest*
  (referência editorial)

Entregas:
1. Views Vue: MtrProvisorioListView, MtrProvisorioDetailView,
   MtrProvisorioCreateView com guards SICAT auth + active CETESB
   account.
2. Reuso de ManifestForm/PartnerPicker/ResidueLineEditor com prop
   `kind='provisorio'`.
3. Banner/badge canônico via describeMtrProvisorioOperationalStatus
   (decisão R5: status físico permanece 'submitted' pós-impressão; o
   sinal de PDF vem de payload.jobResults['manifest.print']).
4. Helpers: services/mtrProvisorioApi, composables/useMtrProvisorio.
5. Tratamento de problem+json com codes
   MTR_PROVISORIO_PAYLOAD_INVALID/NOT_CANCELLABLE/NOT_PRINTABLE.
6. Não tocar gateway, OpenAPI, persistência, regras de domínio,
   commit/push.

Validações verdes obrigatórias:
- npm run typecheck
- npm run validate:openapi
- npm run validate:har-gateway
- npm run validate:md-links
- npm run test:source-of-truth
- npm run test:contract
- npm run test:worker
- npm run test:integration
- frontend build/dev sem regressões funcionais.

Checkpoint:
docs/handoffs/mtr-provisorio-fluxo-base/07-frontend-ux.md com
objetivo, arquivos analisados, decisões, alterações, validações e
handoff para tester-qa-mtr (fase 08).

Atualizar docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md §6:
fase 07 CONCLUÍDA, fase 08 ATIVA.
```

## Próximo agente

`frontend-vue-ux-mtr` — fase `07-frontend-ux`. Se o runtime não
conseguir invocá-lo, devolver `next_agent_required` com o prompt
acima.
