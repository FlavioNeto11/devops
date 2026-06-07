# Próximo prompt — orquestrador SICAT

> Gerado pela fase `09-docs-final` da cadeia
> `mtr-provisorio-wizard-frontend` (2026-04-25). Este arquivo é o
> ponto de entrada para a próxima cadeia. Atualize-o sempre que
> uma cadeia for concluída e a próxima for definida.

## 1. Resumo do que ficou pronto na cadeia anterior

A cadeia `mtr-provisorio-wizard-frontend` substituiu o textarea
JSON em `/mtr-provisorio/novo` por um wizard guiado equivalente
ao `ManifestCreateForm` do MTR comum, sem alterar contrato HTTP,
persistência, gateway, worker, OpenAPI ou rotas backend.

Detalhe consolidado em
[docs/CHANGELOG-MTR-PROVISORIO-WIZARD-FRONTEND.md](../CHANGELOG-MTR-PROVISORIO-WIZARD-FRONTEND.md)
e checkpoints em
[docs/handoffs/mtr-provisorio-wizard-frontend/](../handoffs/mtr-provisorio-wizard-frontend/):

- reuso paramétrico de
  [frontend/src/components/ManifestCreateForm.vue](../../frontend/src/components/ManifestCreateForm.vue)
  via props opcionais retrocompatíveis (`submitHandler`,
  `singleOnly`, `primaryActionLabel`, `pageKicker`, `pageTitle`,
  `pageDescription`); `ManifestCreateView.vue` continua sem
  regressão;
- wrapper fino
  [frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue](../../frontend/src/views/mtr-provisorio/MtrProvisorioCreateView.vue)
  injeta `submitHandler` chamando
  `useMtrProvisorioStore().createDraft(payload)` (Idempotency-Key
  preservado);
- banner amigável `data-testid="mtrp-create-error"` com helper
  `describeMtrProvisorioError`;
- novo cenário smoke wizard end-to-end PAYLOAD_INVALID (problem+json
  no POST final) verde em
  [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts);
- regressão verde: `npm run typecheck`,
  `npm --prefix frontend run build`, `npm run validate:md-links`,
  `npm run validate:openapi`, `npm run test:contract`.

Pendências documentadas (não-bloqueantes) registradas em
[docs/10-estado-atual/estado-atual.md §3.1](estado-atual.md#31-follow-ups-de-estabilidade):

- **INC-WIZARD-01** — selector regression no cenário smoke
  "criação via /mtr-provisorio/novo" (usa `getByRole('option')`
  mas `FilterableDropdown` renderiza
  `<button class="filterable-dropdown-option">`).
- **INC-WIZARD-02** — cenário PAYLOAD_INVALID legado não migrado
  para o fluxo wizard (campo `Responsável *` agora na etapa 1, CTA
  na etapa 4). Redundante após o cenário novo verde.
- **HAR DMR** (herdado de `dmr-fluxo-base`): destrava a futura
  cadeia `dmr-gateway-real` — ação humana.
- **F4** e **AUD-09**: flakes pré-existentes, não atribuíveis a
  esta cadeia.

## 2. Próxima frente recomendada

Duas opções viáveis. A escolha entre elas depende do critério
operacional do time.

### Opção A — `mtr-provisorio-wizard-smoke-cleanup` (curta, pronta)

**Escopo**: corrigir os 2 cenários legados do smoke MTR provisório
(INC-WIZARD-01 e INC-WIZARD-02) para alinhar com o fluxo wizard
real (`FilterableDropdown` + navegação 4 etapas), restaurando o
11/11 verde no spec dedicado.

**Justificativa**:

- nenhuma alteração de código de produto necessária;
- escopo isolado em
  [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts);
- fix sugerido já documentado em
  [08-qa-validation.md §6](../handoffs/mtr-provisorio-wizard-frontend/08-qa-validation.md#6-incidentes-devolvidos-%C3%A0-cadeia)
  e
  [CHANGELOG-MTR-PROVISORIO-WIZARD-FRONTEND.md §5](../CHANGELOG-MTR-PROVISORIO-WIZARD-FRONTEND.md#5-incidentes-herdados-n%C3%A3o-corrigidos-por-restri%C3%A7%C3%A3o);
- não depende de ação humana externa.

**Cadeia preferencial**: `tester-qa-mtr` como primeiro e único
agente (cadeia `simple` de uma única fase).

### Opção B — `dmr-gateway-real` (bloqueada por HAR humano)

**Escopo**: substituir o stub `DMR_GATEWAY_PENDING_HAR` em
[src/gateways/cetesb-gateway.js](../../src/gateways/cetesb-gateway.js)
pelo HTTP real, sem reabrir contrato/persistência/frontend DMR.

**Bloqueio**: depende de **captura humana de HAR DMR** (4–5
capturas mínimas, hostname `mtr.cetesb.sp.gov.br`). Plano em
[dmr-fluxo-base/02-source-validation.md §6](../handoffs/dmr-fluxo-base/02-source-validation.md#6-plano-de-captura-har-dmr-n%C3%A3o-executado-nesta-fase).

**Quando autorizada**: primeiro agente sugerido é
`validador-cetesb-mtr` para aceitar o HAR e classificar cobertura,
seguido por `integrador-cetesb-mtr` para substituir o stub.

### Opção C — captura HAR específica MTR provisório (opcional)

Reforçaria evidência do valor numérico `tipoManifesto = 2`
(R3-C). Não destrava nova cadeia por si só; mitigaria risco
documentado mas não-bloqueante.

## 3. Prompt pronto para o orquestrador (Opção A)

Cole o bloco abaixo em uma nova conversa com `orquestrador-mtr`:

````text
work_id sugerido: mtr-provisorio-wizard-smoke-cleanup
intent: fix
complexidade: simple

CONTEXTO
A cadeia mtr-provisorio-wizard-frontend foi concluída em
2026-04-25 com QA 9/11 verde + 2 incidentes herdados documentados
(INC-WIZARD-01, INC-WIZARD-02 — ver
docs/handoffs/mtr-provisorio-wizard-frontend/08-qa-validation.md
§6 e docs/CHANGELOG-MTR-PROVISORIO-WIZARD-FRONTEND.md §5). A
cobertura funcional do caminho feliz e do erro PAYLOAD_INVALID já
é garantida pelo cenário novo wizard end-to-end (verde).

OBJETIVO
Corrigir os 2 cenários legados do smoke MTR provisório em
frontend/tests/ui/mtr-provisorio-smoke.spec.ts para alinhar com o
wizard real e restaurar 11/11 verde.

ESCOPO MÍNIMO
- INC-WIZARD-01: trocar `getByRole('option')` por
  `.filterable-dropdown-option` na seleção de transportador e
  destinador (mesma técnica do cenário novo wizard end-to-end).
- INC-WIZARD-02: substituir o cenário legado pelo cenário wizard
  end-to-end já implementado, OU navegar manualmente as 4 etapas
  e clicar `data-testid="wizard-submit-primary"` na etapa 4.
- NÃO alterar código de produto (componentes, views, store,
  service, helpers).

CRITÉRIOS DE PRONTO
- spec mtr-provisorio-smoke.spec.ts 11/11 verde;
- typecheck, validate:openapi, validate:md-links, test:contract,
  build Vite verdes;
- baselines F2/F3/F4/AUD-09 sem regressão atribuível.

PRIMEIRO AGENTE SUGERIDO
tester-qa-mtr — fix isolado em spec.
````

## 4. Pendências herdadas a observar

- **HAR DMR ausente** — destrava `dmr-gateway-real`. Plano em
  [02-source-validation.md §6](../handoffs/dmr-fluxo-base/02-source-validation.md#6-plano-de-captura-har-dmr-n%C3%A3o-executado-nesta-fase).
- **INC-WIZARD-01 / INC-WIZARD-02** — cenários legados do smoke
  MTR provisório (Opção A acima).
- **F4** — flake `test:integration` 1/124. Não-bloqueante.
- **AUD-09** — flake `audit.spec.ts:267` sob full-suite paralela
  (passa 10/10 em isolado). Não-bloqueante.
- **F2/F3** — pré-existentes (Playwright + chunks Vite); ownership
  das cadeias originais.
- **HAR específico MTR provisório** — recomendado, não bloqueante.

## 5. Próximo passo operacional

Encaminhar este prompt ao `orquestrador-mtr` para abrir a cadeia
`mtr-provisorio-wizard-smoke-cleanup` (Opção A) **ou** aguardar
captura humana de HAR DMR para abrir `dmr-gateway-real` (Opção B).

A fase opcional `10-ci-handoff` (`ci-cd-github-mtr`) da cadeia
`mtr-provisorio-wizard-frontend` permanece disponível mediante
**autorização explícita do usuário** para commit/push (prompt
pronto em
[09-docs-final.md §7](../handoffs/mtr-provisorio-wizard-frontend/09-docs-final.md#7-handoff)).
