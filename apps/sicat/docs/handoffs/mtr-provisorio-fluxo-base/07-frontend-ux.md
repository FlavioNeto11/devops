# Fase 07 — Frontend UX (MTR Provisório)

> Cadeia: `mtr-provisorio-fluxo-base` · checkpoint da fase
> `07-frontend-ux` · concluída em 2026-04-25 por `frontend-vue-ux-mtr`.
>
> Insumos consumidos:
>
> - [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md)
> - [00-orchestration.md](00-orchestration.md)
> - [04-backend-contracts.md](04-backend-contracts.md) — paths e
>   `operationIds` (`mtrProvisorioList`, `mtrProvisorioCreate`,
>   `mtrProvisorioGet`, `mtrProvisorioCancel`, `mtrProvisorioPrint`).
> - [05-persistence-queue.md](05-persistence-queue.md) — coluna `kind`
>   e `provisional_number` em `manifests`.
> - [06-domain-rules.md](06-domain-rules.md) — códigos canônicos de
>   problem+json (`MTR_PROVISORIO_PAYLOAD_INVALID`,
>   `MTR_PROVISORIO_STATUS_TRANSITION_INVALID`,
>   `MTR_PROVISORIO_NOT_CANCELLABLE`,
>   `MTR_PROVISORIO_NOT_PRINTABLE`) + helpers de taxonomia
>   (`mapMtrProvisorioStatusToOperational`,
>   `describeMtrProvisorioOperationalStatus`).
> - [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
>   — paths `/v1/mtr-provisorio/*` e schemas
>   `MtrProvisorioCreateRequest`, `MtrProvisorio`,
>   `MtrProvisorioListItem`, `MtrProvisorioListResponse`,
>   `MtrProvisorioPrintRequest`, `MtrProvisorioCancelResponse`.

## 1. Objetivo

Entregar a camada Vue 3 mínima da família MTR Provisório
(listagem, criação, detalhe + impressão) reutilizando as
convenções estabelecidas pela cadeia `dmr-fluxo-base` (rotas
`requiresSicatAuth + requiresActiveCetesbAccount`, store Pinia
local, service que delega ao [api.js](../../../frontend/src/services/api.js),
banner de erro problem+json, smoke Playwright dedicada).

Esta fase NÃO toca backend, OpenAPI, gateway, persistência ou
validador — apenas consome o contrato publicado nas fases 04–06.

## 2. Arquivos criados

- [frontend/src/services/mtrProvisorioService.js](../../../frontend/src/services/mtrProvisorioService.js)
  — wrapper das 5 operações HTTP (`listMtrProvisorio`,
  `createMtrProvisorio`, `getMtrProvisorioById`,
  `cancelMtrProvisorio`, `printMtrProvisorio`) reusando o transport
  central de [frontend/src/services/api.js](../../../frontend/src/services/api.js).
  Helper `buildMtrProvisorioIdempotencyKey` para
  `Idempotency-Key`.
- [frontend/src/stores/mtrProvisorioStore.js](../../../frontend/src/stores/mtrProvisorioStore.js)
  — store Pinia (composition `useMtrProvisorioStore`) com filtros
  persistidos em `localStorage`, lista paginada (page/pageSize),
  detalhe ativo, comando assíncrono em curso, último erro/erro-code
  separados (necessário para detectar
  `MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED`).
- [frontend/src/views/mtr-provisorio/mtrProvisorioUiHelpers.js](../../../frontend/src/views/mtr-provisorio/mtrProvisorioUiHelpers.js)
  — helpers de UI (status options, labels, cancellable/printable,
  códigos problem+json conhecidos, `describeMtrProvisorioError`,
  `hasPrintedDocument` paridade com decisão R5 — flag em
  `payload.jobResults['manifest.print']`).
- [frontend/src/views/mtr-provisorio/MtrProvisorioListView.vue](../../../frontend/src/views/mtr-provisorio/MtrProvisorioListView.vue)
  — listagem paginada com filtros mínimos (status, dateFrom,
  dateTo, pageSize), badge canônico via
  `OperationalStatusBadge`.
- [frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue](../../../frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue)
  — formulário de criação (campos básicos +
  payload JSON avançado para `generator`, `carrier`, `receiver`,
  `residues`). Backend faz validação completa em
  [src/lib/validators/mtr-provisorio-validator.ts](../../../src/lib/validators/mtr-provisorio-validator.ts).
- [frontend/src/views/mtr-provisorio/MtrProvisorioDetailView.vue](../../../frontend/src/views/mtr-provisorio/MtrProvisorioDetailView.vue)
  — detalhe com badge canônico, ações imprimir/cancelar (gated
  por `isPrintableStatus`/`isCancellableStatus`), exibição do
  `commandId`/`jobId` retornados pelo `202 command-accepted`,
  banner para `MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED` (501),
  visualização do payload bruto.
- [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
  — smoke Playwright (5 cenários): listagem autenticada, criação
  → redirect para detalhe, detalhe `submitted` com botão
  imprimir habilitado, banner 501 quando persistência ainda não
  ativa, redirecionamento `/login` quando não autenticado.

## 3. Arquivos alterados

- [frontend/src/services/api.js](../../../frontend/src/services/api.js)
  — adicionada seção `MTR Provisório` com as 5 operações HTTP
  (mantido padrão `request()` + `Idempotency-Key` + correlation).
- [frontend/src/modules/command-center/operationalStatus.js](../../../frontend/src/modules/command-center/operationalStatus.js)
  — espelho frontend de
  [src/lib/operational-status.ts](../../../src/lib/operational-status.ts):
  `mapMtrProvisorioStatusToOperational` e
  `describeMtrProvisorioOperationalStatus` com a mesma resolução
  de `failed_submit` por hint
  AUTH/SESSION/TOKEN | VALIDATION/CONTRACT/SCHEMA |
  REMOTE/CETESB/TIMEOUT/GATEWAY/UPSTREAM, fechando R5 (status
  físico `submitted` → `completed_with_document`; PDF sinalizado
  via `payload.jobResults['manifest.print']`).
- [frontend/src/router.js](../../../frontend/src/router.js)
  — 3 rotas registradas:
  - `/mtr-provisorio` → `MtrProvisorioList`
  - `/mtr-provisorio/novo` → `MtrProvisorioNovo`
  - `/mtr-provisorio/:id` → `MtrProvisorioDetalhe`

  Todas com `requiresSicatAuth: true` +
  `requiresActiveCetesbAccount: true`. Decidiu-se NÃO criar
  `/mtr-provisorio/pendentes` nesta cadeia base — não há
  paridade funcional com DMR (DMR usa pendentes para fechamento
  mensal; MTR provisório usa ciclo de vida individual). Pode
  ser adicionada em cadeia futura caso o produto exija.
- [frontend/src/App.vue](../../../frontend/src/App.vue)
  — entrada de navegação `MTR Provisório` (ícone
  `mdi-file-clock-outline`) entre `Manifestos` e `DMR`; predicado
  `isActive('/mtr-provisorio')` aderente ao padrão DMR/Manifestos.

## 4. Decisões e justificativas

### 4.1. Sem rota `/pendentes`

A cadeia DMR introduziu `/dmr/pendentes` porque a CETESB exige
declarações periódicas com fechamento mensal — pendentes são
declarações ainda não fechadas no período. Para MTR provisório
não existe esse conceito periódico; o ciclo é individual e
passa por `draft → queued_submit → submitting → awaiting_remote →
submitted` (com ramificações `failed_submit`, `cancelled`,
`queued_print`). A listagem padrão filtrável por status já
cobre o caso de uso "ver provisórios em curso".

### 4.2. Formulário de criação minimalista + JSON avançado

O contrato `MtrProvisorioCreateRequest` reaproveita
`ManifestCreateRequest` (allOf), que exige `generator`,
`carrier`, `receiver` (todos `PartnerRef`) e `residues`
(array de `ResidueLine`). Replicar todo o wizard de
[frontend/src/components/ManifestCreateForm.vue](../../../frontend/src/components/ManifestCreateForm.vue)
nesta cadeia base inflaria o escopo (a forma original tem
~900 linhas com integração a catálogos CETESB e busca de
parceiros), e o componente está acoplado ao endpoint
`/v1/manifestos`. A entrega adotada:

- campos básicos (`responsibleName`, `expeditionDate`,
  `manifestType`, `state`, flags, `notes`, `requestedBy`)
  via `v-text-field`/`v-checkbox`;
- `generator`/`carrier`/`receiver`/`residues` via textarea JSON
  com skeleton pré-preenchido — equivalente ao padrão usado em
  ferramentas internas antes do wizard ser portado;
- backend faz validação completa via
  [src/lib/validators/manifest-validator.ts](../../../src/lib/validators/manifest-validator.ts)
  e [src/lib/validators/mtr-provisorio-validator.ts](../../../src/lib/validators/mtr-provisorio-validator.ts);
- `describeMtrProvisorioError` traduz os 5 códigos canônicos
  para mensagens amigáveis.

Cadeia futura pode portar `ManifestCreateForm` para também
emitir provisório via prop `mode: 'manifest' | 'provisorio'`.

### 4.3. Banner persistência pendente

Backend ainda responde `501 problem+json` com
`code: MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED` em ambientes
onde a fase 05 não foi migrada (cenário de transição
documentado em [00-orchestration.md §6](00-orchestration.md#6-status-global)).
Em vez de exibir um erro genérico, o detail view mostra um
banner explicativo com `type=warning`, replicando o padrão DMR
para `DMR_GATEWAY_PENDING_HAR`. Implementação preserva o erro
real em `commandError` — o banner é uma camada extra, não
substitui a mensagem do backend.

### 4.4. Lockstep da taxonomia operacional

`mapMtrProvisorioStatusToOperational` no frontend é cópia
intencional do backend (proibido importar `src/**`). Resolução
de `failed_submit` usa as mesmas listas de hints
(AUTH/SESSION/TOKEN, VALIDATION/CONTRACT/SCHEMA,
REMOTE/CETESB/TIMEOUT/GATEWAY/UPSTREAM), garantindo que badges
exibam o mesmo bucket que a API e os relatórios operacionais.

## 5. Validações executadas

- `npm run typecheck` — verde (zero erros TS).
- `npm run validate:openapi` (script combinado: openapi +
  source-of-truth + md-links) — todos verdes; OpenAPI inalterada,
  source-of-truth verde, 673 arquivos analisados, nenhum link
  quebrado.
- `npm --prefix frontend run build` — build Vite OK em 7,3s
  (chunk único `index-*.js` 1,35 MB / 405 kB gzip permanece
  acima de 500 kB; F3 mantido como pendência herdada conforme
  [00-orchestration.md §4](00-orchestration.md#4-pendências-herdadas-não-tratar-nesta-cadeia),
  e esta cadeia não impactou significativamente — adicionamos
  apenas 3 views + store + helpers, ~14 kB gzip estimado).
- `npx playwright test tests/ui/mtr-provisorio-smoke.spec.ts` —
  **5/5 verdes** (listagem autenticada, criação→detalhe,
  detalhe submitted com imprimir, banner 501, redirect /login).
- `npx playwright test tests/ui/dmr-smoke.spec.ts` — **3/3
  verdes** (regressão DMR não impactada).

## 6. Bloqueios

Nenhum. As pendências herdadas (F2, F3, F4 e captura HAR DMR)
permanecem fora do escopo desta cadeia, conforme
[00-orchestration.md §4](00-orchestration.md#4-pendências-herdadas-não-tratar-nesta-cadeia).

## 7. Handoff para `tester-qa-mtr` (fase 08)

### 7.1. Entradas

- contrato OpenAPI ↔ examples ↔ operations.ts já em lockstep
  (fase 04);
- migration `014_mtr_provisorio_kind.sql` aplicada em
  `npm run migrate` (fase 05);
- validador + taxonomia operacional cabeados (fase 06);
- camada Vue 3 publicada (esta fase).

### 7.2. Saídas esperadas da fase 08

- `npm run test:api` — endpoints `/v1/mtr-provisorio/*` exercem
  contratos: 202 command-accepted em create/print, 200 em get,
  200 em delete, 400/404/501 problem+json conforme aplicável.
- `npm run test:integration` — fluxo end-to-end create →
  worker `manifest.submit` (kind=provisorio) → status
  `submitted` → print → `payload.jobResults['manifest.print']`
  populado.
- `npm run test:worker` — paridade com handlers
  `manifest.submit` e `manifest.print` ramificados por
  `payload.kind` (cabeados em fase 05); regressão de
  `applyManifestSubmitTerminalFailureSideEffect` para
  `entityType='mtr_provisorio'`.
- `npm run test:contract` — schemas `MtrProvisorioCreateRequest`,
  `MtrProvisorio*` aderentes à OpenAPI (fase 04 já passa 4/4).
- `npm run test:source-of-truth` — 9/9 (gateway HAR-aderente,
  fase 03).
- `npm run smoke:health` + `npm run smoke:openapi` — verdes.
- Playwright:
  - rodar `tests/ui/mtr-provisorio-smoke.spec.ts` (5/5 já
    verdes nesta fase) em pipeline limpo;
  - **expandir** com cenários adicionais propostos:
    - lista com filtro `status=failed_submit` exibe badge
      canônico `failed_remote_*` resolvido por hint;
    - cancelar rascunho (`draft`) via dialog atualiza para
      `cancelled`;
    - imprimir após `submitted` exibe `commandId`/`jobId` no
      feedback de sucesso;
    - quando `payload.jobResults['manifest.print']` retorna
      `documentUrl` o chip "Documento disponível" aparece;
    - 400 problem+json (`MTR_PROVISORIO_PAYLOAD_INVALID`) na
      criação exibe a mensagem amigável do helper.
- regressão F2 baseline: garantir que as 15 falhas
  pré-existentes
  ([00-orchestration.md §4](00-orchestration.md#4-pendências-herdadas-não-tratar-nesta-cadeia))
  não se ampliaram com a nova suíte
  (`mtr-provisorio-smoke` + adições da fase 08).

### 7.3. Pendências conhecidas para registrar

- formulário de criação ainda usa textarea JSON para
  `generator`/`carrier`/`receiver`/`residues` — porte do wizard
  guiado de `ManifestCreateForm` é trabalho de cadeia futura,
  não bloqueia QA;
- rota `/mtr-provisorio/pendentes` deliberadamente ausente
  (justificativa em §4.1) — QA deve confirmar com o produto se
  alguma frente operacional pediria essa visão.

## 8. Próximo agente

`tester-qa-mtr` — fase `08-qa-validation`.
