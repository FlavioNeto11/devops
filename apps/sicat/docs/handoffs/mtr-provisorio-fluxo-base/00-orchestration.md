# Orquestração — `mtr-provisorio-fluxo-base`

> Aberta em 2026-04-25 pelo `orquestrador-mtr` em continuidade direta à
> cadeia `dmr-fluxo-base` (encerrada PUSHED em
> `3685b2b`/`659030f`/`27aaa8e`).
>
> Fonte: [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)
> §2–§3 (Frente 3 eleita: MTR provisório) e
> [docs/_inputs/fonte-de-verdade-backlog-cto.md](../../_inputs/fonte-de-verdade-backlog-cto.md)
> §4.4 e §5 (gap regulatório de paridade SIGOR x SICAT).

## 1. Classificação

```yaml
orchestration:
  work_id: mtr-provisorio-fluxo-base
  intent: implement
  complexity: complex
  domains:
    - source-validation       # HARs CETESB existentes (gerar/imprimir/cancelar/recebimento_mtr)
    - external-integration    # gateway MTR provisório (reuso quando possível, bloco isolado quando necessário)
    - backend-contract        # OpenAPI + operations + rotas + services
    - persistence-worker      # tabela/colunas MTR provisório, migrations idempotentes, worker handler de impressão
    - domain-rules            # regras operacionais MTR provisório + integração à taxonomia operacional
    - frontend-ux             # rotas dedicadas + reuso de componentes de manifesto
    - qa
    - docs
    - ci
  first_agent: documentador-mtr
  phase_sequence:
    - phase: 01-baseline-docs
      agent: documentador-mtr
      required: true
      reason: >-
        publicar docs/04-arquitetura/mtr-provisorio-sicat.md (arquitetura
        alvo, esquema, fluxos críticos, mapeamento contra HARs existentes
        em docs/cetesb/) e abrir checkpoints da cadeia.
    - phase: 02-source-validation
      agent: validador-cetesb-mtr
      required: true
      reason: >-
        validar evidência CETESB para MTR provisório a partir dos HARs já
        capturados (gerar_mtr, imprimir_mtr, cancelar_mtr, recebimento_mtr)
        e decidir se há gap exigindo nova captura humana.
    - phase: 03-external-integration
      agent: integrador-cetesb-mtr
      required: true
      reason: >-
        reuso/extensão controlada de src/gateways/cetesb-gateway.js para
        MTR provisório, sem hardcode fora do gateway, preservando session
        bootstrap e audit exchange.
    - phase: 04-backend-contracts
      agent: programador-backend-mtr
      required: true
      reason: >-
        contrato HTTP (criação, listagem, detalhe, impressão) em lockstep
        OpenAPI ↔ examples ↔ operations.ts ↔ rotas ↔ services. Decidir se
        é família nova /v1/mtr-provisorio/* ou variante de /v1/manifestos
        com flag tipada — justificar contra backlog e estado-atual.
    - phase: 05-persistence-queue
      agent: postgres-queue-mtr
      required: true
      reason: >-
        migration idempotente sem alterar constraints DL-022, preservando
        locking otimista e índices existentes; worker handler do comando
        assíncrono de impressão.
    - phase: 06-domain-rules
      agent: manifestos-operacional-mtr
      required: true
      reason: >-
        regras operacionais MTR provisório (validador) e integração à
        taxonomia canônica (src/lib/operational-status.ts).
    - phase: 07-frontend-ux
      agent: frontend-vue-ux-mtr
      required: true
      reason: >-
        rotas Vue 3 dedicadas com reuso de componentes de manifesto,
        guards SICAT auth + active CETESB account, badges canônicos.
    - phase: 08-qa-validation
      agent: tester-qa-mtr
      required: true
      reason: >-
        QA backend (api/integration/worker/contract/source-of-truth/smoke)
        + ao menos uma spec Playwright cobrindo o fluxo MTR provisório.
    - phase: 09-docs-final
      agent: documentador-mtr
      required: true
      reason: >-
        atualizar docs/10-estado-atual/estado-atual.md, publicar
        CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md e novo PROXIMO_PROMPT.md
        apontando a frente seguinte.
    - phase: 10-ci-handoff
      agent: ci-cd-github-mtr
      required: false
      reason: >-
        commit + push apenas mediante autorização explícita do usuário
        ao final da cadeia.
```

## 2. Objetivo

Implementar o fluxo base de **MTR provisório** no SICAT (cadastro,
listagem, detalhe e impressão) respeitando a fronteira
`route → service → repository → job → worker → gateway`, mantendo
lockstep OpenAPI ↔ examples ↔ `src/generated/operations.ts` ↔ rotas ↔
testes, e reaproveitando o gateway CETESB existente para MTR comum
sempre que o HAR já cobrir o caso.

## 3. Critérios de pronto (cadeia)

- evidência CETESB referenciada (HARs existentes em
  [docs/cetesb/](../../cetesb/) ou plano explícito de captura caso
  identifique-se gap não coberto);
- OpenAPI publicada com novos endpoints MTR provisório e operations
  geradas em lockstep;
- migrations idempotentes (`create index if not exists`; sem alterar
  constraints DL-022; preservando locking otimista);
- nenhum acesso CETESB fora de `src/gateways/cetesb-gateway.js`;
- testes verdes: `test:api`, `test:integration`, `test:worker`,
  `test:contract`, `test:source-of-truth`, `smoke:health`,
  `smoke:openapi`;
- pelo menos uma spec Playwright cobrindo o fluxo MTR provisório
  principal;
- `docs/10-estado-atual/estado-atual.md` atualizado com MTR provisório
  como IMPLEMENTADO e novo `PROXIMO_PROMPT.md` apontando a frente
  seguinte.

## 4. Pendências herdadas (não tratar nesta cadeia)

- **HAR DMR ausente** — destrava futura cadeia `dmr-gateway-real`,
  fora do escopo desta cadeia. Plano em
  [docs/handoffs/dmr-fluxo-base/02-source-validation.md §6](../dmr-fluxo-base/02-source-validation.md#6-plano-de-captura-har-dmr-n%C3%A3o-executado-nesta-fase).
- **F4** — flake única `test:integration` 1/124 não reproduzível,
  registrada em [docs/10-estado-atual/estado-atual.md §3.1](../../10-estado-atual/estado-atual.md#31-follow-ups-de-estabilidade).
  Não-bloqueante; investigar oportunisticamente se reaparecer.
- **F2** — 15 falhas Playwright pré-existentes (`responsive-smoke`,
  `qa-global-home-back-button`, `full-navigation-e2e`,
  `conversational-chat-app`, `manifests-resync`,
  `cetesb-operational-flows`) pertencem às cadeias originais. Esta
  cadeia **não deve** tratá-las; apenas garantir que a nova suíte MTR
  provisório não regrida o conjunto verde atual.
- **F3** — chunks Vite > 500 kB; tratar somente se MTR provisório
  adicionar peso significativo ao bundle.

## 5. Justificativa de roteamento (primeiro agente)

`documentador-mtr` (fase `01-baseline-docs`) replica o padrão validado
pela cadeia `dmr-fluxo-base`:

- consolida arquitetura alvo e fluxos críticos antes de qualquer
  contrato/persistência;
- mapeia evidência CETESB existente em
  [docs/cetesb/](../../cetesb/) — `gerar_mtr`, `imprimir_mtr`,
  `cancelar_mtr`, `recebimento_mtr` — destacando o que já cobre MTR
  provisório e o que exige captura/validação na fase
  `02-source-validation`;
- abre os checkpoints subsequentes da cadeia, evitando que o
  `validador-cetesb-mtr` precise inferir a arquitetura alvo a partir
  do HAR (decisão padrão do Caminho B reaproveitada de DMR).

A alternativa de iniciar direto em `validador-cetesb-mtr` foi
descartada porque a baseline documental ainda não existe para MTR
provisório (diferente de DMR, onde o backlog CTO já fornecia §5/§4.4
mas não havia `docs/04-arquitetura/dmr-sicat.md`). A decisão entre
"família nova `/v1/mtr-provisorio/*`" vs "variante de `/v1/manifestos`
com flag tipada" precisa de um documento alvo antes de validar
evidência.

## 6. Status global

- **Status global**: **ENCERRADA — PUSHED** (todas as 10 fases
  CONCLUÍDAS; código + docs publicados em `origin/main`; ver
  [10-ci-handoff.md](10-ci-handoff.md) para SHAs).
- **Fase 10-ci-handoff**: **CONCLUÍDA** em 2026-04-25 por
  `ci-cd-github-mtr` (commits `4d1afc8` feature, `170a7d3` docs e
  commit de handoffs publicados em `origin/main`; validações finais
  `typecheck`, `validate:openapi`, `validate:md-links` verdes; ver
  [10-ci-handoff.md](10-ci-handoff.md)).
- **Fase atual**: nenhuma ATIVA. Próxima cadeia recomendada
  registrada em
  [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md).
- **Fase 09-docs-final** (CONCLUÍDA em 2026-04-25 por
  `documentador-mtr`; CHANGELOG publicado em
  [docs/CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md](../../CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md);
  estado-atual atualizado em §2.1 e §3.1; PROXIMO_PROMPT.md aponta
  `mtr-provisorio-wizard-frontend` (Opção A — preferida) ou
  `dmr-gateway-real` (Opção B — bloqueada por captura humana de HAR
  DMR); checkpoint em [09-docs-final.md](09-docs-final.md);
  `validate:md-links` verde).
- **Fase 10-ci-handoff**: **OPCIONAL — AGUARDA AUTORIZAÇÃO
  EXPLÍCITA DO USUÁRIO** para `ci-cd-github-mtr` executar commit
  + push da entrega. Prompt pronto em
  [09-docs-final.md §10.2](09-docs-final.md#102-para-ci-cd-github-mtr-fase-10-opcional).
- **QA encerrou a fase 08 com toda a stack verde**
  — ver [08-qa-validation.md](08-qa-validation.md): backend
  `test:api` 23/23, `test:integration` 124/124 após reexecução,
  `test:worker` 14/14, `test:contract` 4/4, `test:source-of-truth`
  9/9, smokes/validações verdes; spec
  [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
  expandida para **10/10** (5 baseline + 5 cenários §7.2),
  `dmr-smoke.spec.ts` 3/3, F2 baseline herdado mantido com 15
  itens idênticos + 1 flake `audit.spec.ts:267` documentado em
  §6 do checkpoint 08).
- **Encerradas**:
  - `01-baseline-docs` (CONCLUÍDA em 2026-04-25 por
    `documentador-mtr`; baseline em
    [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md);
    checkpoint em [01-baseline-docs.md](01-baseline-docs.md)).
  - `02-source-validation` (CONCLUÍDA em 2026-04-25 por
    `validador-cetesb-mtr`; veredicto formal por operação e
    decisão Caminho A+ em
    [02-source-validation.md](02-source-validation.md);
    `test:source-of-truth` 9/9, `validate:har-gateway` e
    `validate:openapi` verdes).
  - `03-external-integration` (CONCLUÍDA em 2026-04-25 por
    `integrador-cetesb-mtr`; bloco isolado MTR provisório em
    [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
    com `submitMtrProvisorio`, `listMtrProvisorio`,
    `printMtrProvisorio`; recomendação R3-C registrada para fase 04;
    `validate:har-gateway`, `validate:openapi`,
    `test:source-of-truth` 9/9, `typecheck` e `validate:md-links`
    verdes).
  - `04-backend-contracts` (CONCLUÍDA em 2026-04-25 por
    `programador-backend-mtr`; família HTTP `/v1/mtr-provisorio/*`
    publicada em lockstep — paths/schemas em
    [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml),
    examples em [examples/](../../../examples/), 88 operações em
    [src/generated/operations.ts](../../../src/generated/operations.ts),
    rotas em
    [src/routes/mtr-provisorio-routes.ts](../../../src/routes/mtr-provisorio-routes.ts),
    service em
    [src/services/mtr-provisorio-service.ts](../../../src/services/mtr-provisorio-service.ts),
    repo stub `not_implemented` em
    [src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts);
    R3 formalmente fechado como **R3-C** —
    `kind` discriminador SICAT convertido para
    `tipoManifestoOverride` na borda do service via constante
    `PROVISORIO_TIPO_MANIFESTO_OVERRIDE` (default `2`,
    sobrescrevível por env); checkpoint em
    [04-backend-contracts.md](04-backend-contracts.md);
    `validate:openapi`, `gen:operations`, `typecheck`,
    `test:contract` 4/4, `test:source-of-truth` 9/9,
    `validate:har-gateway`, `validate:md-links` verdes).
  - `05-persistence-queue` (CONCLUÍDA em 2026-04-25 por
    `postgres-queue-mtr`; migration aditiva idempotente
    [src/sql/014_mtr_provisorio_kind.sql](../../../src/sql/014_mtr_provisorio_kind.sql)
    adiciona `kind`, `provisional_number`, `definitive_manifest_id`
    + índices `ix_manifests_kind` e parcial
    `ix_manifests_kind_provisorio`; repo
    [src/repositories/mtr-provisorio-repo.ts](../../../src/repositories/mtr-provisorio-repo.ts)
    reescrito em SQL real apoiado em `manifests` filtrado por
    `kind='provisorio'` com locking otimista preservado;
    [src/workers/operation-handlers.ts](../../../src/workers/operation-handlers.ts)
    ramifica `manifest.submit` e `manifest.print` por `payload.kind`
    invocando `gateway.submitMtrProvisorio` /
    `gateway.printMtrProvisorio` na borda; `applyManifestSubmitTerminalFailureSideEffect`
    estendido para `entityType='mtr_provisorio'`; checkpoint em
    [05-persistence-queue.md](05-persistence-queue.md);
    `migrate` idempotente, `typecheck`, `validate:openapi`,
    `validate:har-gateway`, `validate:md-links`, `test:contract`
    4/4, `test:worker` 14/14, `test:integration` 124/124,
    `test:source-of-truth` 9/9 verdes).
  - `06-domain-rules` (CONCLUÍDA em 2026-04-25 por
    `manifestos-operacional-mtr`; validador
    [src/lib/validators/mtr-provisorio-validator.ts](../../../src/lib/validators/mtr-provisorio-validator.ts)
    publicado com códigos canônicos
    `MTR_PROVISORIO_PAYLOAD_INVALID`,
    `MTR_PROVISORIO_STATUS_TRANSITION_INVALID`,
    `MTR_PROVISORIO_NOT_CANCELLABLE`,
    `MTR_PROVISORIO_NOT_PRINTABLE`; máquina de estados completa;
    bloco `MTR_PROVISORIO_*` em
    [src/lib/operational-status.ts](../../../src/lib/operational-status.ts)
    (`mapMtrProvisorioStatusToOperational`,
    `describeMtrProvisorioOperationalStatus`,
    `MTR_PROVISORIO_OPERATIONAL_STATUS_REGISTRY`); R5 formalmente
    fechado — `submitted` permanece como status físico pós-impressão
    e a presença do PDF é sinalizada via
    `payload.jobResults['manifest.print']`; service cabeado em 3
    pontos (`create`/`print`/`cancel`); checkpoint em
    [06-domain-rules.md](06-domain-rules.md);
    `typecheck`, `validate:openapi`, `validate:har-gateway`,
    `validate:md-links`, `test:source-of-truth` 9/9, `test:contract`
    4/4, `test:worker` 14/14, `test:integration` 124/124 verdes).
  - `07-frontend-ux` (CONCLUÍDA em 2026-04-25 por
    `frontend-vue-ux-mtr`; camada Vue 3 publicada — service
    [frontend/src/services/mtrProvisorioService.js](../../../frontend/src/services/mtrProvisorioService.js)
    consumindo as 5 operações HTTP via
    [frontend/src/services/api.js](../../../frontend/src/services/api.js);
    store [frontend/src/stores/mtrProvisorioStore.js](../../../frontend/src/stores/mtrProvisorioStore.js);
    helpers
    [frontend/src/views/mtr-provisorio/mtrProvisorioUiHelpers.js](../../../frontend/src/views/mtr-provisorio/mtrProvisorioUiHelpers.js);
    rotas `/mtr-provisorio`, `/mtr-provisorio/novo`,
    `/mtr-provisorio/:id` registradas em
    [frontend/src/router.js](../../../frontend/src/router.js) com
    `requiresSicatAuth + requiresActiveCetesbAccount`; nav em
    [frontend/src/App.vue](../../../frontend/src/App.vue);
    bloco `MTR_PROVISORIO_*` espelhado em
    [frontend/src/modules/command-center/operationalStatus.js](../../../frontend/src/modules/command-center/operationalStatus.js)
    em lockstep com a taxonomia backend; smoke Playwright
    dedicada em
    [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
    5/5 verde; checkpoint em [07-frontend-ux.md](07-frontend-ux.md);
    `typecheck`, `validate:openapi` (combinado),
    `validate:md-links` 673 arquivos, build Vite OK,
    `dmr-smoke.spec.ts` 3/3 sem regressão).
  - `08-qa-validation` (CONCLUÍDA em 2026-04-25 por
    `tester-qa-mtr`; suíte backend completa verde — `test:api`
    23/23, `test:integration` 124/124 (após reexecução; F4 flake
    única em job ownership reconciliation, não reproduzível),
    `test:worker` 14/14, `test:contract` 4/4,
    `test:source-of-truth` 9/9, `smoke:health` 7/7,
    `smoke:openapi` 2/2, `validate:openapi`,
    `validate:har-gateway`, `validate:md-links`, `typecheck`
    verdes; spec
    [frontend/tests/ui/mtr-provisorio-smoke.spec.ts](../../../frontend/tests/ui/mtr-provisorio-smoke.spec.ts)
    expandida para **10/10** com os 5 cenários do §7.2 (filtro
    `failed_submit` + badge `failed_remote_auth`, cancelar
    `draft`, imprimir após `submitted` com `commandId`/`jobId`,
    chip "Documento disponível", 400
    `MTR_PROVISORIO_PAYLOAD_INVALID`); `dmr-smoke.spec.ts` 3/3
    preservado; F2 baseline herdado mantido com 15 itens
    idênticos + 1 flake `audit.spec.ts:267` documentado e não
    atribuível à cadeia (passa 10/10 em isolado); checkpoint em
    [08-qa-validation.md](08-qa-validation.md)).
- **Bloqueios reais**: nenhum. Capturas adicionais
  (`gerar_mtr_provisorio.har`, `imprimir_mtr_provisorio.har`,
  `listar_mtr_provisorio.har`) são **recomendadas mas não
  bloqueantes** — ver
  [02-source-validation.md §3.2](02-source-validation.md#32-lista-m%C3%ADnima-de-capturas-recomendadas-para-mitigar-r1-e-r3).
- **Riscos abertos a tratar pela fase 05**: enquanto o repo stub
  estiver ativo, todas as rotas `/v1/mtr-provisorio/*` respondem
  `501 Not Implemented` (problem+json com
  `code: MTR_PROVISORIO_PERSISTENCE_NOT_IMPLEMENTED`) — comportamento
  intencional desta cadeia. O valor numérico
  `tipoManifesto = 2` para variante provisória permanece suposição
  (mitigado por env override + audit-exchange).

## 7. Handoff explícito para `documentador-mtr` (fase 01)

Entradas:

- [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)
  §2–§3.
- [docs/_inputs/fonte-de-verdade-backlog-cto.md](../../_inputs/fonte-de-verdade-backlog-cto.md)
  §4.4 e §5.
- [docs/handoffs/dmr-fluxo-base/01-baseline-docs.md](../dmr-fluxo-base/01-baseline-docs.md)
  como template de baseline-docs.
- [docs/04-arquitetura/dmr-sicat.md](../../04-arquitetura/dmr-sicat.md)
  como referência editorial e estrutural.
- HARs em [docs/cetesb/](../../cetesb/): `gerar_mtr`, `imprimir_mtr`,
  `cancelar_mtr`, `recebimento_mtr`.

Saídas esperadas:

- `docs/04-arquitetura/mtr-provisorio-sicat.md` (arquitetura alvo,
  esquema preliminar, fluxos críticos, mapeamento contra HARs);
- `docs/handoffs/mtr-provisorio-fluxo-base/01-baseline-docs.md`
  (checkpoint da fase, com handoff explícito para
  `validador-cetesb-mtr`);
- atualização de `docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md`
  §6 marcando `01-baseline-docs` como CONCLUÍDA.
