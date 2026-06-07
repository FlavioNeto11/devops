# CHANGELOG — Cadeia `mtr-provisorio-fluxo-base`

> Release notes consolidadas da cadeia `mtr-provisorio-fluxo-base`
> (2026-04-25). Frente 3 do backlog CTO
> ([docs/_inputs/fonte-de-verdade-backlog-cto.md §5](_inputs/fonte-de-verdade-backlog-cto.md#5-pr%C3%B3ximas-frentes-estrat%C3%A9gicas)).
> Checkpoints da cadeia em
> [docs/handoffs/mtr-provisorio-fluxo-base/](handoffs/mtr-provisorio-fluxo-base/).

## 1. Resumo executivo

### Entregue (camada base)

- Família HTTP `/v1/mtr-provisorio/*` (5 operações) publicada em
  lockstep `OpenAPI ↔ examples ↔ src/generated/operations.ts`
  (88 operações totais, +5 MTR provisório).
- Persistência aditiva idempotente reaproveitando `manifests` com
  discriminador SICAT `kind` via migration
  [src/sql/014_mtr_provisorio_kind.sql](../src/sql/014_mtr_provisorio_kind.sql)
  (sem alterar constraints DL-022; locking otimista preservado).
- Validador canônico
  [src/lib/validators/mtr-provisorio-validator.ts](../src/lib/validators/mtr-provisorio-validator.ts)
  com códigos `MTR_PROVISORIO_*` estáveis e máquina de estados.
- Bloco `MTR_PROVISORIO_*` na taxonomia operacional
  ([src/lib/operational-status.ts](../src/lib/operational-status.ts))
  espelhado no frontend.
- Gateway CETESB isolado em
  [src/gateways/cetesb-gateway.js](../src/gateways/cetesb-gateway.js)
  (`submitMtrProvisorio`, `listMtrProvisorio`, `printMtrProvisorio`).
- Worker handler ramificado em `src/workers/operation-handlers.ts`
  por `payload.kind` para `manifest.submit` e `manifest.print`.
- Camada Vue 3 com 3 rotas (`/mtr-provisorio`, `/mtr-provisorio/novo`,
  `/mtr-provisorio/:id`), service HTTP, store Pinia, helpers de UI,
  badge canônico via espelho frontend de `operationalStatus.js`.
- Spec Playwright dedicada
  [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
  com 10 cenários verdes (5 baseline + 5 expansão na fase 08).
- QA verde: typecheck, validate:openapi, validate:har-gateway,
  validate:md-links, test:source-of-truth (9/9), test:contract (4/4),
  test:api (23/23), test:integration (124/124 após reexecução),
  test:worker (14/14), smoke:health (7/7), smoke:openapi (2/2);
  `dmr-smoke.spec.ts` 3/3 sem regressão.

### Decisões formalizadas

- **R3-C** (fase 04): o discriminador SICAT `kind` é convertido para
  `tipoManifestoOverride` na borda do service via constante
  `PROVISORIO_TIPO_MANIFESTO_OVERRIDE` (default `2`, sobrescrevível
  por env). Preserva fronteira `service → gateway` sem hardcode de
  payload CETESB fora do gateway.
- **R5** (fase 06): `submitted` permanece como status físico
  pós-impressão; a presença do PDF é sinalizada via
  `payload.jobResults['manifest.print']` (chip "Documento disponível"
  no detalhe). Evita estado intermediário redundante na máquina
  operacional.

### Pendente / não-bloqueante (fora do escopo desta cadeia)

- Captura HAR dedicada (`gerar_mtr_provisorio.har`,
  `imprimir_mtr_provisorio.har`, `listar_mtr_provisorio.har`) é
  **recomendada mas não bloqueante** — Caminho A+ documentado em
  [02-source-validation.md §3.2](handoffs/mtr-provisorio-fluxo-base/02-source-validation.md#32-lista-m%C3%ADnima-de-capturas-recomendadas-para-mitigar-r1-e-r3).
  O valor numérico `tipoManifesto = 2` para variante provisória
  permanece suposição (mitigada por env override + audit-exchange).
- Wizard guiado de criação (porte de `ManifestCreateForm` com
  `generator`/`carrier`/`receiver`/`residues`) é trabalho de cadeia
  futura — registrado em
  [07-frontend-ux.md §7.3](handoffs/mtr-provisorio-fluxo-base/07-frontend-ux.md#73-pend%C3%AAncias-conhecidas-para-registrar).
- **AUD-09** (fase 08): flake intermitente em `audit.spec.ts:267`
  sob full-suite paralela; passa 10/10 em isolado. Não atribuível à
  cadeia. Registrado em
  [estado-atual.md §3.1](10-estado-atual/estado-atual.md#31-follow-ups-de-estabilidade).
- **F4** (herdado de `dmr-fluxo-base`): flake única
  `test:integration` 1/124 reproduzida uma vez nesta cadeia,
  resolvida em reexecução imediata. Comportamento idêntico ao
  baseline DMR.

## 2. Sumário de fases

| fase | agente | resultado |
| --- | --- | --- |
| `01-baseline-docs` | `documentador-mtr` | Baseline arquitetural [docs/04-arquitetura/mtr-provisorio-sicat.md](04-arquitetura/mtr-provisorio-sicat.md) com decisão preliminar de família dedicada `/v1/mtr-provisorio/*`. |
| `02-source-validation` | `validador-cetesb-mtr` | Veredicto Caminho A+: HARs existentes (`gerar_mtr`, `imprimir_mtr`, `cancelar_mtr`) cobrem o caso base; capturas dedicadas recomendadas mas não bloqueantes. |
| `03-external-integration` | `integrador-cetesb-mtr` | Bloco isolado MTR provisório no [src/gateways/cetesb-gateway.js](../src/gateways/cetesb-gateway.js) com `submitMtrProvisorio`, `listMtrProvisorio`, `printMtrProvisorio`. R3-C registrado para a fase 04. |
| `04-backend-contracts` | `programador-backend-mtr` | Família HTTP `/v1/mtr-provisorio/*` em lockstep (paths, schemas, examples, operations, rotas, service, repo stub). R3-C formalizado. |
| `05-persistence-queue` | `postgres-queue-mtr` | Migration aditiva [014_mtr_provisorio_kind.sql](../src/sql/014_mtr_provisorio_kind.sql) (kind, provisional_number, definitive_manifest_id; índices); repo reescrito em SQL real; worker ramificado por `payload.kind`. |
| `06-domain-rules` | `manifestos-operacional-mtr` | Validador `mtr-provisorio-validator.ts`, máquina de estados, bloco `MTR_PROVISORIO_*` em `operational-status.ts`. R5 formalizado. |
| `07-frontend-ux` | `frontend-vue-ux-mtr` | 3 rotas Vue 3, service HTTP, store, helpers, espelho de status, smoke 5/5 (baseline). |
| `08-qa-validation` | `tester-qa-mtr` | Stack backend + Playwright verde; spec MTR provisório expandida para 10/10; F2 baseline mantido com mesmas 15 entradas + 1 flake AUD-09 documentada. |
| `09-docs-final` | `documentador-mtr` | Estado atual atualizado, este CHANGELOG publicado, novo `PROXIMO_PROMPT.md`. |
| `10-ci-handoff` | `ci-cd-github-mtr` | **OPCIONAL** — aguarda autorização explícita do usuário para commit/push. |

## 3. Arquivos por camada

### Backend (TypeScript)

- contrato/HTTP:
  [openapi/mtr_automacao_openapi_interna.yaml](../openapi/mtr_automacao_openapi_interna.yaml),
  [examples/](../examples/) (10 arquivos novos),
  [src/generated/operations.ts](../src/generated/operations.ts),
  [src/routes/mtr-provisorio-routes.ts](../src/routes/mtr-provisorio-routes.ts);
- service: [src/services/mtr-provisorio-service.ts](../src/services/mtr-provisorio-service.ts)
  (constante `PROVISORIO_TIPO_MANIFESTO_OVERRIDE`, R3-C);
- repositório: [src/repositories/mtr-provisorio-repo.ts](../src/repositories/mtr-provisorio-repo.ts)
  (filtra `manifests` por `kind='provisorio'`, locking otimista
  preservado);
- validador: [src/lib/validators/mtr-provisorio-validator.ts](../src/lib/validators/mtr-provisorio-validator.ts);
- taxonomia: [src/lib/operational-status.ts](../src/lib/operational-status.ts)
  (bloco `MTR_PROVISORIO_*`, R5);
- worker: [src/workers/operation-handlers.ts](../src/workers/operation-handlers.ts)
  (ramificação por `payload.kind`);
- gateway: [src/gateways/cetesb-gateway.js](../src/gateways/cetesb-gateway.js)
  (bloco isolado MTR provisório).

### Persistência

- [src/sql/014_mtr_provisorio_kind.sql](../src/sql/014_mtr_provisorio_kind.sql)
  — migration aditiva idempotente: colunas `kind`,
  `provisional_number`, `definitive_manifest_id`; índices
  `ix_manifests_kind` e parcial `ix_manifests_kind_provisorio`.
  Não altera constraints DL-022.

### Frontend (Vue 3)

- service: [frontend/src/services/mtrProvisorioService.js](../frontend/src/services/mtrProvisorioService.js);
- store: [frontend/src/stores/mtrProvisorioStore.js](../frontend/src/stores/mtrProvisorioStore.js);
- helpers: [frontend/src/views/mtr-provisorio/mtrProvisorioUiHelpers.js](../frontend/src/views/mtr-provisorio/mtrProvisorioUiHelpers.js);
- views/rotas: registradas em
  [frontend/src/router.js](../frontend/src/router.js)
  (`/mtr-provisorio`, `/mtr-provisorio/novo`, `/mtr-provisorio/:id`)
  com `requiresSicatAuth + requiresActiveCetesbAccount`;
- nav: [frontend/src/App.vue](../frontend/src/App.vue);
- espelho de status:
  [frontend/src/modules/command-center/operationalStatus.js](../frontend/src/modules/command-center/operationalStatus.js)
  (bloco `MTR_PROVISORIO_*`).

### Testes

- spec dedicada: [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
  (10 cenários);
- nenhum novo teste backend/integration adicionado — cobertura
  reaproveita as suítes existentes (api/integration/worker/contract/
  source-of-truth/smoke), todas verdes.

### Documentação

- baseline arquitetural: [docs/04-arquitetura/mtr-provisorio-sicat.md](04-arquitetura/mtr-provisorio-sicat.md);
- checkpoints da cadeia: [docs/handoffs/mtr-provisorio-fluxo-base/](handoffs/mtr-provisorio-fluxo-base/);
- estado atual: [docs/10-estado-atual/estado-atual.md](10-estado-atual/estado-atual.md)
  (MTR provisório IMPLEMENTADO; AUD-09 e F4 em §3.1);
- próximo prompt: [docs/10-estado-atual/PROXIMO_PROMPT.md](10-estado-atual/PROXIMO_PROMPT.md).

## 4. Validações finais (fase 08)

| comando | resultado |
| --- | --- |
| `npm run typecheck` | VERDE |
| `npm run validate:openapi` | VERDE |
| `npm run validate:har-gateway` | VERDE (5 operações HAR / 6 seções gateway / 11 checks) |
| `npm run validate:md-links` | VERDE (674 arquivos) |
| `npm run smoke:health` | VERDE (7/7) |
| `npm run smoke:openapi` | VERDE (2/2) |
| `npm run test:source-of-truth` | VERDE (9/9) |
| `npm run test:contract` | VERDE (4/4) |
| `npm run test:api` | VERDE (23/23) |
| `npm run test:integration` | AMARELO/VERDE (124/124 após reexecução; F4) |
| `npm run test:worker` | VERDE (14/14) |
| `mtr-provisorio-smoke.spec.ts` | VERDE (10/10) |
| `dmr-smoke.spec.ts` | VERDE (3/3) |
| Playwright full UI | AMARELO (61 passed / 16 failed / 11 did not run; baseline F2 + flake AUD-09) |

## 5. Riscos residuais

- **Suposição `tipoManifesto = 2`** (R3-C): mitigada por env override
  e audit-exchange; remediar com captura HAR dedicada quando viável.
- **AUD-09** (Playwright flake): pode obscurecer regressões reais em
  CI; investigar se reaparecer.
- **F4** (test:integration flake): comportamento histórico; ainda
  sem reprodução estável.
- **Gateway CETESB ainda em JavaScript** (DL-093): exceção
  intencional; nenhuma ação nesta cadeia.

## 6. Próximos passos

Ver [docs/10-estado-atual/PROXIMO_PROMPT.md](10-estado-atual/PROXIMO_PROMPT.md).
A próxima frente recomendada é **`dmr-gateway-real`** quando o HAR
DMR for capturado (ação humana pendente herdada de
`dmr-fluxo-base`). Alternativa secundária: cadeia frontend dedicada
ao **wizard guiado MTR provisório** (porte de `ManifestCreateForm`
conforme §7.3 da fase 07).

A fase opcional `10-ci-handoff` (`ci-cd-github-mtr`) permanece
disponível **mediante autorização explícita do usuário** para
commit/push.
