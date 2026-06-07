# Checkpoint — `mtr-provisorio-fluxo-base` · 08-qa-validation

> Cadeia: `mtr-provisorio-fluxo-base`.
> Fase: **08-qa-validation** — concluída em **2026-04-25** por
> `tester-qa-mtr`.
> Próxima fase: **09-docs-final** (`documentador-mtr`).

## 1. Objetivo

Garantir, sem corrigir bugs, que a cadeia
`mtr-provisorio-fluxo-base` atende os critérios de pronto definidos
em [00-orchestration.md §3](00-orchestration.md#3-critérios-de-pronto-cadeia)
e que a expansão do smoke Playwright proposto em
[07-frontend-ux.md §7.2](07-frontend-ux.md#72-saídas-esperadas-da-fase-08)
fica verde sem regredir o conjunto baseline (DMR 3/3, MTR provisório
5/5 prévios, F2 herdado).

## 2. Tabela de validações

| comando | status | saída relevante |
| --- | --- | --- |
| `npm run typecheck` | **VERDE** | `tsc -p tsconfig.json --noEmit` sem erros. |
| `npm run validate:openapi` | **VERDE** | OpenAPI + fonte de verdade CETESB + 674 arquivos analisados, sem links/âncoras quebrados. |
| `npm run validate:har-gateway` | **VERDE** | 5 operações HAR / 6 seções gateway / 11 checks. |
| `npm run validate:md-links` | **VERDE** | 674 arquivos analisados, sem problema. |
| `npm run smoke:health` | **VERDE** | 7/7 endpoints (`/v1/ping`, `/v1/health/system`, `/v1/health/workers`, `/v1/health/jobs/active`, `/v1/health/jobs/dlq`, `/v1/health/metrics/performance`, `POST /v1/maintenance/cleanup`). |
| `npm run smoke:openapi` | **VERDE** | `/openapi.yaml` 200 (263.127 bytes), `/openapi.json` 200 com `jobStatusEnum` esperado e `commandEndpointsChecked: 5`. |
| `npm run test:source-of-truth` | **VERDE** | 9/9 (CETESB source-of-truth + HAR structural + agent architecture). |
| `npm run test:contract` | **VERDE** | 4/4 (`tests/integration/openapi-queue-contract.test.js`) + `validate:openapi` em sequência. |
| `npm run test:api` | **VERDE** | 23/23 (2 suítes: dual auth/CETESB accounts 14, demais 9). |
| `npm run test:integration` | **AMARELO/VERDE** | Primeira execução: 124 pass / 1 fail (F4 — flake única histórica em job ownership reconciliation, não reproduzível). Reexecução imediata: **124/124 pass**. F4 comportamento inalterado vs cadeia DMR. |
| `npm run test:worker` | **VERDE** | 14/14. |
| `npx playwright test tests/ui/mtr-provisorio-smoke.spec.ts` | **VERDE** | **10/10** após expansão (5 baseline + 5 novos cenários). |
| `npx playwright test tests/ui/dmr-smoke.spec.ts` | **VERDE** | 3/3 (regressão DMR preservada). |
| `npx playwright test` (full UI) | **AMARELO** | 61 passed, **16 failed**, 11 did not run, ~2.9 min. Ver §5 para diff vs baseline DMR. |

Saídas brutas: `storage/temp/qa-playwright-full.log` e
`storage/temp/qa-test-integration.log` (sessão local; gitignored).

## 3. Cenários adicionados ao smoke MTR provisório

Arquivo:
[frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts).
Cobertura adicional (todos passando — ver §2):

1. **Filtro `failed_submit` exibe badge canônico
   `failed_remote_auth`** — mocka `GET /v1/mtr-provisorio?status=...`
   retornando item com `status='failed_submit'` +
   `lastErrorCode='CETESB_AUTH_INVALID'`; aplica filtro via
   `combobox` Vuetify; verifica que pelo menos uma chamada de
   listagem propaga `status=failed_submit` e que o badge
   `[data-status="failed_remote_auth"]` é renderizado com label
   "Falha no envio" — aderente ao mapeamento de
   [frontend/src/modules/command-center/operationalStatus.js](../../../frontend/src/modules/command-center/operationalStatus.js).
2. **Cancelar `draft` via dialog atualiza para `cancelled`** —
   detalhe em status `draft`; clica `Cancelar rascunho`, confirma
   diálogo; mocka `DELETE /v1/mtr-provisorio/:id` (200); verifica
   feedback "MTR provisório cancelado." e exatamente 1 chamada
   DELETE (alinhado a `cancelSelected` em
   [frontend/src/stores/mtrProvisorioStore.js](../../../frontend/src/stores/mtrProvisorioStore.js)).
3. **Imprimir após `submitted` exibe `commandId`/`jobId` no
   feedback** — clica `Imprimir`, confirma diálogo; mocka
   `POST /v1/mtr-provisorio/:id/print` retornando `commandId` +
   `jobId`; verifica feedback "Impressão do MTR provisório
   enfileirada." e que ambos identificadores aparecem na UI
   (asserção literal em `commandId: ...` e `jobId: ...`).
4. **Chip "Documento disponível" quando
   `payload.jobResults['manifest.print']` retorna `documentUrl`** —
   detalhe em `submitted` com `payload.jobResults['manifest.print']
   = { documentUrl, success: true }`; verifica chip via `getByText`
   (lockstep com helper `hasPrintedDocument` em
   [mtrProvisorioUiHelpers.js](../../../frontend/src/views/mtr-provisorio/mtrProvisorioUiHelpers.js)
   e decisão R5 da fase 06).
5. **400 `MTR_PROVISORIO_PAYLOAD_INVALID` exibe mensagem amigável
   do helper** — `POST /v1/mtr-provisorio` mocka 400 problem+json
   com `code: MTR_PROVISORIO_PAYLOAD_INVALID` e `detail` específico;
   verifica que o `localError` exibe o `detail` recebido — exercita
   `describeMtrProvisorioError` (lockstep com validador backend
   em [src/lib/validators/mtr-provisorio-validator.ts](../../../src/lib/validators/mtr-provisorio-validator.ts)).

Total da spec após expansão: **10 cenários verdes**.

## 4. Status baseline F2 / F3 / F4

### F2 — 15 falhas Playwright pré-existentes (DMR baseline)

Conjunto herdado conforme
[00-orchestration.md §4](00-orchestration.md#4-pendências-herdadas-não-tratar-nesta-cadeia)
e [docs/handoffs/dmr-fluxo-base/08-qa-validation.md §6](../dmr-fluxo-base/08-qa-validation.md#6-resultado-playwright-—-diff-vs-baseline)
**permanece com as mesmas 15 entradas**:

| suíte | cenário | reproduziu nesta cadeia? |
| --- | --- | --- |
| `cetesb-operational-flows.spec.js` | listagem do destinador protege recebimento e CDF | sim |
| `conversational-chat-app.spec.js` | quick action consultivo p/ backend conversacional | sim |
| `conversational-chat-app.spec.js` | quick action detalhe de manifesto | sim |
| `conversational-chat-app.spec.js` | quick action status de job | sim |
| `full-navigation-e2e.spec.ts` | 04 — Tentar abrir detalhe de manifesto | sim |
| `manifests-resync.spec.js` | menu de ações abre para cima | sim |
| `qa-global-home-back-button.spec.ts` | 02 — `/login/cetesb` integra Home | sim |
| `responsive-smoke.spec.js` | login 2 etapas — mobile / tablet / desktop / wide | sim (4) |
| `responsive-smoke.spec.js` | dashboard — mobile / tablet / desktop / wide | sim (4) |

### Falha adicional observada (16ª) — flake, não regressão

| suíte | cenário | reproduzível em isolado? |
| --- | --- | --- |
| `audit.spec.ts:267` | `09-Vuetify Components Render` | **não** — passa 10/10 ao rodar `npx playwright test tests/ui/audit.spec.ts`. |

Classificada como **flake** sob contenção de workers paralelos (full
suite roda 6 workers e estressa o dev server Vite). Não atribuível a
qualquer arquivo introduzido pela cadeia
`mtr-provisorio-fluxo-base` — o spec apenas inspeciona componentes
Vuetify renderizados na rota `/dashboard`, que esta cadeia não
modificou. Recomendação para a fase 09 / cadeias futuras:
investigar `audit.spec.ts` se voltar a falhar em CI consecutivo.

### F3 — chunks Vite > 500 kB

Não medido nesta fase (build Vite não foi reexecutado por não haver
mudança de código frontend além da spec de teste, que **não** entra
no bundle de produção). A camada Vue 3 publicada na fase 07 já havia
medido `Build Vite OK` sem agravamento — ver
[07-frontend-ux.md](07-frontend-ux.md). F3 segue inalterado.

### F4 — flake `test:integration` (1/124)

Reproduzido **uma vez** na primeira execução desta fase
(reconciliation de ownership perdido em job
`job_e79527a7c32e5e3ca11ca7e6b2`); reexecução imediata retornou
**124/124**. Comportamento idêntico ao registrado em
[docs/10-estado-atual/estado-atual.md §3.1](../../10-estado-atual/estado-atual.md#31-follow-ups-de-estabilidade).
Não bloqueante; sem ação nesta fase.

## 5. Regressões encontradas

**Nenhuma regressão atribuível à cadeia
`mtr-provisorio-fluxo-base`.**

- Suítes verdes herdadas (manifestos, jobs, audit em isolado, dmr,
  mtr-provisorio) seguem verdes.
- `dmr-smoke.spec.ts` 3/3 confirmado.
- `mtr-provisorio-smoke.spec.ts` 10/10 (5 baseline + 5 expansão).
- Backend completo (api / integration / worker / contract /
  source-of-truth / smoke / typecheck / openapi / har-gateway /
  md-links) verde.
- F2 baseline: 15 falhas idênticas; +1 falha em `audit.spec.ts`
  classificada como flake (passa em isolado, sem relação com
  arquivos da cadeia).

## 6. Incidentes abertos (sem correção nesta fase)

Nenhum incidente novo. Para registro:

- **AUD-09** — `audit.spec.ts > 09-Vuetify Components Render` falha
  intermitentemente sob full-suite paralela. **Owner sugerido**:
  `frontend-vue-ux-mtr` em cadeia futura caso reapareça em CI. **Não
  bloqueia** a cadeia atual — flake, sem reprodução em isolado.
- **F4** — flake `test:integration` (reconciliation worker). **Owner
  sugerido**: `postgres-queue-mtr` se reaparecer com sinal estável.
  Já registrado.

Nenhum dos itens acima impede o handoff para `documentador-mtr`.

## 7. Critérios de pronto da fase

- [x] `test:api`, `test:integration` (após reexecução), `test:worker`,
  `test:contract`, `test:source-of-truth` verdes.
- [x] `smoke:health`, `smoke:openapi`, `validate:openapi`,
  `validate:har-gateway`, `validate:md-links`, `typecheck` verdes.
- [x] `mtr-provisorio-smoke.spec.ts` mantém 5/5 do baseline e expande
  com os 5 cenários do §7.2 — total 10/10.
- [x] `dmr-smoke.spec.ts` 3/3 sem regressão.
- [x] F2 baseline mantido (mesmo conjunto herdado de 15 itens).
- [x] Nenhuma correção de bug realizada — incidentes documentados em
  §6.

## 8. Handoff para `documentador-mtr` (fase 09)

### 8.1. Entradas

- camada Vue 3 publicada (fase 07);
- backend MTR provisório fechado em lockstep (fases 01-06);
- spec smoke expandida nesta fase com cenários §7.2;
- baseline F2 e F4 documentados acima.

### 8.2. Saídas esperadas da fase 09

- atualizar [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md)
  marcando MTR provisório como **IMPLEMENTADO** (camada base) com
  notas sobre R3-C, R5 e o stub `MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED`;
- publicar `docs/CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md` no padrão
  das demais cadeias;
- atualizar `docs/10-estado-atual/PROXIMO_PROMPT.md` apontando a
  próxima frente (sugestão: `dmr-gateway-real` quando HAR DMR
  estiver disponível, ou cadeia frontend MTR provisório com wizard
  guiado conforme §7.3 do checkpoint 07);
- registrar incidentes abertos (AUD-09, F4) em
  [docs/10-estado-atual/estado-atual.md §3.1](../../10-estado-atual/estado-atual.md#31-follow-ups-de-estabilidade)
  caso já não estejam.

### 8.3. Pendências conhecidas

- formulário de criação MTR provisório ainda usa textarea JSON
  (porte do wizard guiado de `ManifestCreateForm` é cadeia futura);
- rota `/mtr-provisorio/pendentes` deliberadamente ausente —
  reavaliar com produto;
- `tipoManifesto = 2` para variante provisória permanece suposição
  mitigada por env override (R3-C); HARs adicionais opcionais
  listados em [02-source-validation.md §3.2](02-source-validation.md#32-lista-mínima-de-capturas-recomendadas-para-mitigar-r1-e-r3).

## 9. Próximo agente

`documentador-mtr` — fase **09-docs-final**.
