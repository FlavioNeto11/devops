# Fase 07 — Frontend UX (MTR Provisório · wizard guiado)

> Cadeia: `mtr-provisorio-wizard-frontend` · checkpoint da fase
> `07-frontend-ux` · concluída em 2026-04-25 por
> `frontend-vue-ux-mtr`.
>
> Insumos consumidos:
>
> - [00-orchestration.md](00-orchestration.md)
> - Pendência herdada §7.3 da cadeia base —
>   [docs/handoffs/mtr-provisorio-fluxo-base/07-frontend-ux.md](../mtr-provisorio-fluxo-base/07-frontend-ux.md)
> - Arquitetura alvo —
>   [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md)
> - Schema R3-C —
>   [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
>   (`MtrProvisorioCreateRequest` = `allOf [ManifestCreateRequest]`).

## 1. Objetivo

Substituir a tela `/mtr-provisorio/novo` (textarea JSON com campos
básicos) pelo wizard guiado equivalente ao `ManifestCreateForm`
do MTR comum (etapas: Contexto → Participantes → Resíduo →
Revisão), sem alterar contrato HTTP, persistência, gateway,
worker, OpenAPI ou rotas backend.

## 2. Decisão de reuso (R3-C)

R3-C confirma que `MtrProvisorioCreateRequest` é um `allOf` de
`ManifestCreateRequest` na borda HTTP. O service backend
(`createMtrProvisorio` em
[src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts))
encapsula o `kind=provisorio` / `tipoManifestoOverride`. Logo o
wizard existente já produz um payload válido para `POST
/v1/mtr-provisorio` — basta rotear o submit.

A alternativa de criar `MtrProvisorioCreateForm.vue` próprio
duplicaria ~1.300 linhas (catálogos, `FilterableDropdown`,
busca de parceiros com debounce e dual-role, validação por
etapa, painel lateral de resumo, gerador fixo). Optamos pela
extensão paramétrica do `ManifestCreateForm` para preservar a
fonte única de verdade do wizard e evitar drift.

## 3. Estratégia de extensão

`ManifestCreateForm.vue` ganhou três props opcionais sem
quebrar consumidores existentes (`ManifestCreateView.vue`):

| Prop | Tipo | Default | Efeito |
| --- | --- | --- | --- |
| `submitHandler` | `Function` | `null` | Substitui `createSingleFlow`/`createBatchFlow`. Recebe o payload `ManifestCreateRequest` e deve retornar `{ createdId, successMessage? }`. Implica `singleOnly`. |
| `singleOnly` | `Boolean` | `false` | Esconde campo `Quantidade no lote`, valida lote como 1, oculta o botão "Criar e submeter agora" / rascunho separado. Mantém um único CTA primário no passo 4. |
| `primaryActionLabel` | `String` | `''` | Rótulo customizado do CTA primário no passo de revisão. |
| `pageKicker` / `pageTitle` / `pageDescription` | `String` | wizard padrão | Permite reaproveitar o header em outros domínios sem mudar o componente compartilhado. |

Ajustes derivados:

- `validateForm()` e `validateStep1()` ignoram `batchCount` quando
  `isSingleOnly`.
- `handleCreate()` chama `props.submitHandler(payload)` e emite
  `success` com `{ createdId }` para o pai redirecionar; no modo
  legado mantém o fluxo create + submit + batch intacto.
- `data-testid` estáveis para QA: `manifest-wizard-shell`,
  `wizard-prev-step`, `wizard-next-step`, `wizard-submit-primary`,
  `wizard-submit-draft`.

## 4. Arquivos analisados

- [frontend/src/components/ManifestCreateForm.vue](../../../frontend/src/components/ManifestCreateForm.vue)
  — wizard de 4 etapas, `FilterableDropdown`, catálogos via
  `getCatalog`, partner search dual-role, painel lateral.
- [frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue](../../../frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue)
  — view antiga (textarea JSON + campos básicos).
- [frontend/src/stores/mtrProvisorioStore.js](../../../frontend/src/stores/mtrProvisorioStore.js)
  — `createDraft(payload)` injeta `Idempotency-Key` via
  `buildMtrProvisorioIdempotencyKey('mtr-provisorio-create')`.
- [frontend/src/services/mtrProvisorioService.js](../../../frontend/src/services/mtrProvisorioService.js)
  — wrapper de `POST /v1/mtr-provisorio` (contrato HTTP imutável).
- [frontend/src/services/api.js](../../../frontend/src/services/api.js)
  — `createMtrProvisorio` injeta `Idempotency-Key` no header.
- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
  — schemas `ManifestCreateRequest` + `MtrProvisorioCreateRequest`.

## 5. Arquivos alterados

- [frontend/src/components/ManifestCreateForm.vue](../../../frontend/src/components/ManifestCreateForm.vue)
  — props opcionais (`submitHandler`, `singleOnly`,
  `primaryActionLabel`, `pageKicker`, `pageTitle`,
  `pageDescription`); `validateForm`/`validateStep1` cientes do
  modo single-only; `handleCreate` delega para `submitHandler`
  quando informado; template parametrizado e marcadores
  `data-testid` estáveis para QA.
- [frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue](../../../frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue)
  — reescrita como wrapper fino que injeta
  `submitHandler` chamando
  `useMtrProvisorioStore().createDraft(payload)`. Preserva
  redirecionamento `/mtr-provisorio/:id`, banner de erro
  `describeMtrProvisorioError` e botão "Voltar".
- [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
  — cenário 2 (criação) atualizado para navegar o wizard
  (mocks de `/v1/catalogs/**` e `/v1/partners/search**`,
  preenchimento step-by-step, click em
  `data-testid=wizard-submit-primary`). Suite mantida em 10/10
  baseline; QA estende com novos cenários na fase 08.

## 6. Sem novos componentes/composables

Nenhum subcomponente novo foi criado. Reuso integral de
`ManifestCreateForm`, `FilterableDropdown`, `useAuthStore`,
`useMtrProvisorioStore` e `mtrProvisorioService.js`. A única
adição foi superficial: props opcionais com defaults
retrocompatíveis.

## 7. Validações executadas

- `npm run typecheck` — verde (zero erros).
- `npm --prefix frontend run build` — verde (Vite production build,
  7,5s, warning pré-existente de chunk > 500 kB).
- `npm run validate:md-links` — verde (679 arquivos analisados,
  zero links/âncoras quebrados).
- `frontend/tests/ui/mtr-provisorio-smoke.spec.ts` — não foi
  reexecutado nesta fase (Playwright depende de servidor +
  Chromium baixado). QA reexecuta na fase 08 com a mesma
  cobertura mínima de 10 cenários, agora atravessando o
  wizard.

Sem regressão de contrato: `POST /v1/mtr-provisorio` continua
recebendo um `MtrProvisorioCreateRequest` (allOf
`ManifestCreateRequest`) e o `Idempotency-Key` continua sendo
injetado pelo store.

## 8. `data-testid` estáveis para QA

| testid | Origem | Uso |
| --- | --- | --- |
| `mtrp-create-wizard` | `MtrProvisorioCreateView` (root) | localizar a página do wizard MTR provisório. |
| `mtrp-create-back` | toolbar superior | botão Voltar. |
| `mtrp-create-error` | alerta local | erro `describeMtrProvisorioError`. |
| `manifest-wizard-shell` | `ManifestCreateForm` (root) | localizar o wizard genérico. |
| `wizard-prev-step` | footer do wizard | botão Voltar entre etapas. |
| `wizard-next-step` | footer do wizard | botão Próximo passo. |
| `wizard-submit-primary` | passo 4 | CTA primário (MTR provisório: "Criar MTR provisório"). |
| `wizard-submit-draft` | passo 4 (modo legado batch) | botão "Criar rascunho" (oculto em `singleOnly`). |

## 9. Handoff explícito → `tester-qa-mtr`

Próxima fase: `08-qa-validation`.

Tarefas mínimas:

1. Reexecutar `frontend/tests/ui/mtr-provisorio-smoke.spec.ts`
   e confirmar 10/10 verde com o wizard (cenário 2 reescrito).
2. Estender o spec com pelo menos um cenário wizard end-to-end
   adicional cobrindo erro problem+json
   (`MTR_PROVISORIO_PAYLOAD_INVALID`) durante o `POST` final.
3. Confirmar regressão verde:
   - `npm run typecheck`
   - `npm --prefix frontend run build`
   - `npm run validate:md-links`
   - `npm run validate:openapi`
   - `npm run test:contract`
4. Verificar ausência de regressão atribuível ao baseline F2
   herdado (flake `audit.spec.ts:267` em full-suite continua
   sendo "observar, não-bloqueante").

Se o runtime não conseguir invocar `tester-qa-mtr`, devolver
`next_agent_required` com prompt pronto para ele.
