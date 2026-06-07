# CHANGELOG — Cadeia `mtr-provisorio-wizard-frontend`

> Release notes consolidadas da cadeia
> `mtr-provisorio-wizard-frontend` (2026-04-25). Continuidade direta
> de [`mtr-provisorio-fluxo-base`](CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md)
> §7.3 (pendência de wizard guiado de criação).
> Checkpoints da cadeia em
> [docs/handoffs/mtr-provisorio-wizard-frontend/](handoffs/mtr-provisorio-wizard-frontend/).

## 1. Resumo executivo

### Entregue

- Substituição do textarea JSON em `/mtr-provisorio/novo` por
  wizard guiado equivalente ao `ManifestCreateForm` do MTR comum
  (Contexto → Participantes → Resíduo → Revisão), preservando
  contrato HTTP, persistência, gateway, worker, OpenAPI e rotas
  backend.
- Reuso paramétrico de
  [frontend/src/components/ManifestCreateForm.vue](../frontend/src/components/ManifestCreateForm.vue)
  via props opcionais retrocompatíveis (`submitHandler`,
  `singleOnly`, `primaryActionLabel`, `pageKicker`, `pageTitle`,
  `pageDescription`). `ManifestCreateView.vue` continua
  funcionando sem alteração de comportamento.
- Wrapper fino
  [frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue](../frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue)
  injeta `submitHandler` chamando
  `useMtrProvisorioStore().createDraft(payload)`, exibe banner
  amigável `data-testid="mtrp-create-error"` com helper
  `describeMtrProvisorioError` e redireciona para
  `/mtr-provisorio/:id` no sucesso.
- Marcadores `data-testid` estáveis para QA:
  `manifest-wizard-shell`, `wizard-prev-step`, `wizard-next-step`,
  `wizard-submit-primary`, `wizard-submit-draft`.
- Novo cenário smoke wizard end-to-end em
  [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../frontend/tests/ui/mtr-provisorio-smoke.spec.ts):
  navega as 4 etapas, mocka `POST /v1/mtr-provisorio` com
  problem+json `MTR_PROVISORIO_PAYLOAD_INVALID` e valida banner
  `mtrp-create-error` + permanência em `/mtr-provisorio/novo`.

### Decisões formalizadas

- **R3-C reuso**: `MtrProvisorioCreateRequest = allOf
  [ManifestCreateRequest]`. O wizard existente já produz payload
  válido para `POST /v1/mtr-provisorio`. Optou-se por extensão
  paramétrica do `ManifestCreateForm` em vez de duplicar ~1.300
  linhas em um `MtrProvisorioCreateForm` dedicado, preservando
  fonte única de verdade e evitando drift.

### Pendente / não-bloqueante

- **INC-WIZARD-01** (selector regression em smoke wizard) e
  **INC-WIZARD-02** (cenário PAYLOAD_INVALID legado não migrado)
  — ver §5. Não-bloqueantes (cobertura funcional garantida pelo
  cenário novo wizard end-to-end §1).

## 2. Sumário de fases

| fase | agente | resultado |
| --- | --- | --- |
| `07-frontend-ux` | `frontend-vue-ux-mtr` | Wizard guiado portado via reuso paramétrico de `ManifestCreateForm`. Wrapper fino `MtrProvisorioCreateView.vue` com banner `mtrp-create-error`. Spec smoke atualizada. |
| `08-qa-validation` | `tester-qa-mtr` | Stack verde (typecheck, build Vite, validate:md-links, validate:openapi, test:contract). Cenário novo wizard end-to-end PAYLOAD_INVALID verde. 2 incidentes herdados documentados (INC-WIZARD-01, INC-WIZARD-02). Sem regressão atribuível em F2/AUD-09. |
| `09-docs-final` | `documentador-mtr` | Estado atual atualizado (§7.3 base RESOLVIDO), este CHANGELOG publicado, `PROXIMO_PROMPT.md` atualizado para próxima frente. |
| `10-ci-handoff` | `ci-cd-github-mtr` | **OPCIONAL** — aguarda autorização explícita do usuário para commit/push. |

## 3. Arquivos por camada

### Frontend (Vue 3)

- componente compartilhado:
  [frontend/src/components/ManifestCreateForm.vue](../frontend/src/components/ManifestCreateForm.vue)
  — props opcionais (`submitHandler`, `singleOnly`,
  `primaryActionLabel`, `pageKicker`, `pageTitle`,
  `pageDescription`); `validateForm`/`validateStep1` cientes do
  modo single-only; `handleCreate` delega para `submitHandler`
  quando informado; template parametrizado;
- view substituta:
  [frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue](../frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue)
  — wrapper fino sobre `ManifestCreateForm`, injeta
  `submitHandler`, banner `mtrp-create-error`, helper
  `describeMtrProvisorioError`;
- store/service: inalterados —
  [frontend/src/stores/mtrProvisorioStore.js](../frontend/src/stores/mtrProvisorioStore.js)
  e
  [frontend/src/services/mtrProvisorioService.js](../frontend/src/services/mtrProvisorioService.js)
  (contrato HTTP imutável; `Idempotency-Key` preservado).

### Testes

- spec smoke atualizada:
  [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
  — cenário 2 (criação via wizard) reescrito; novo cenário
  wizard end-to-end PAYLOAD_INVALID adicionado ao final do
  `describe`.

### Backend / contrato

- **NENHUMA alteração**: rotas, OpenAPI, examples,
  `src/generated/operations.ts`, services, repositories, validador,
  worker e gateway permanecem idênticos à entrega de
  `mtr-provisorio-fluxo-base`.

### Documentação

- checkpoints da cadeia:
  [docs/handoffs/mtr-provisorio-wizard-frontend/](handoffs/mtr-provisorio-wizard-frontend/);
- estado atual:
  [docs/10-estado-atual/estado-atual.md](10-estado-atual/estado-atual.md)
  (§7.3 base marcado como RESOLVIDO);
- próximo prompt:
  [docs/10-estado-atual/PROXIMO_PROMPT.md](10-estado-atual/PROXIMO_PROMPT.md).

## 4. Validações finais (fase 08)

| comando | resultado |
| --- | --- |
| `npm run typecheck` | VERDE (zero erros) |
| `npm --prefix frontend run build` | VERDE (Vite ~7,9s; warning pré-existente de chunk > 500 kB inalterado) |
| `npm run validate:md-links` | VERDE (680 arquivos, zero quebrados) |
| `npm run validate:openapi` | VERDE (contrato + fonte de verdade CETESB) |
| `npm run test:contract` | VERDE (4/4 — duration_ms 741) |
| `mtr-provisorio-smoke.spec.ts` | 9/11 — 2 incidentes herdados documentados (§5); cenário novo wizard end-to-end PAYLOAD_INVALID verde |

Detalhes em
[08-qa-validation.md §4](handoffs/mtr-provisorio-wizard-frontend/08-qa-validation.md#4-valida%C3%A7%C3%B5es-executadas).

## 5. Incidentes herdados (não corrigidos por restrição)

### 5.1 INC-WIZARD-01 — selector regression em smoke wizard

- Spec:
  [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
  — cenário "criação via /mtr-provisorio/novo redireciona para
  /mtr-provisorio/:id".
- Causa raiz: cenário usa
  `await page.getByRole('option').first().click()` mas o
  `FilterableDropdown.vue` reusado pelo wizard renderiza opções
  como `<button class="filterable-dropdown-option">` sem
  `role="option"`.
- Fix sugerido: substituir por
  `await carrierField.locator('.filterable-dropdown-option').first().click()`
  (mesma técnica do cenário novo wizard end-to-end §3 da fase 08).
- Severidade: bloqueante para o 10/10 herdado, **não-bloqueante**
  para a entrega — cobertura funcional equivalente garantida pelo
  cenário novo verde.

### 5.2 INC-WIZARD-02 — cenário PAYLOAD_INVALID legado não migrado

- Spec:
  [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
  — cenário "400 MTR_PROVISORIO_PAYLOAD_INVALID exibe mensagem
  amigável do helper".
- Causa raiz: cenário foi escrito na cadeia base assumindo
  textarea JSON com submit direto. No wizard novo o campo
  `Responsável *` aparece dentro da etapa 1 e o botão
  `Criar MTR provisório` só está visível na etapa 4.
- Fix sugerido: substituir o cenário legado pelo cenário wizard
  end-to-end já implementado (§3 da fase 08), ou navegar
  manualmente as 4 etapas no spec legado.
- Severidade: redundante após o cenário novo —
  `MTR_PROVISORIO_PAYLOAD_INVALID` agora tem cobertura wizard
  funcional verde.

Ambos os incidentes são candidatos naturais a uma frente futura
de cleanup do smoke MTR provisório (consolidação dos cenários
legados no padrão wizard com seletor `.filterable-dropdown-option`).

## 6. Riscos residuais

- **INC-WIZARD-01 / INC-WIZARD-02** (§5): mantêm 2 cenários
  vermelhos no smoke MTR provisório até cleanup dedicado.
- **Suposição `tipoManifesto = 2`** (R3-C herdado): inalterado
  por esta cadeia; mitigação via env override + audit-exchange
  permanece válida.
- **AUD-09** e **F4**: não atribuíveis a esta cadeia (não houve
  alteração em rotas/back-end/worker; cenário smoke é Playwright
  sandboxed com `page.route`).

## 7. Próximos passos

Ver [docs/10-estado-atual/PROXIMO_PROMPT.md](10-estado-atual/PROXIMO_PROMPT.md).
Frentes recomendadas:

- **cleanup INC-WIZARD-01/INC-WIZARD-02** — fix dos 2 cenários
  legados do smoke MTR provisório (frente curta de hardening de
  testes);
- **`dmr-gateway-real`** — quando o HAR DMR humano for capturado
  (ação humana pendente herdada de `dmr-fluxo-base`).

A fase opcional `10-ci-handoff` (`ci-cd-github-mtr`) permanece
disponível **mediante autorização explícita do usuário** para
commit/push desta cadeia.
