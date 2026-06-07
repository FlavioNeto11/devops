# Orquestração — `dmr-fluxo-base`

> Aberta em 2026-04-25 pelo `orquestrador-mtr` em continuidade direta à
> cadeia `centro-operacional-sicat` (encerrada PUSHED em
> `cfb0e57`/`025d35e`/`bfb1d0d`).
>
> Fonte: [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)
> §3 (prompt pronto para orquestrador) e
> [docs/_inputs/fonte-de-verdade-backlog-cto.md](../../_inputs/fonte-de-verdade-backlog-cto.md#5-pr%C3%B3ximas-frentes-estrat%C3%A9gicas)
> §5 (DMR como Frente 2 — maior gap de paridade SIGOR x SICAT).

## 1. Classificação

```yaml
orchestration:
  work_id: dmr-fluxo-base
  intent: implement
  complexity: complex
  domains:
    - source-validation       # HAR DMR CETESB/SIGOR
    - external-integration    # gateway DMR isolado
    - backend-contract        # OpenAPI + operations + rotas + services
    - persistence-worker      # tabela DMR, migrations, worker handler
    - domain-rules            # regras declaratórias DMR
    - frontend-ux             # rotas /dmr/*
    - qa
    - docs
    - ci
  first_agent: documentador-mtr
```

## 2. Objetivo

Implementar o fluxo declaratório base de **DMR (Declaração de
Movimentação de Resíduos)** no SICAT respeitando a fronteira
`route → service → repository → job → worker → gateway`, sem tocar no
gateway CETESB para fluxos não-DMR e mantendo lockstep
OpenAPI ↔ examples ↔ `src/generated/operations.ts` ↔ rotas ↔ testes.

## 3. Sequência de fases

| Fase                          | Agente                         | Owner / saída                                                                 |
|-------------------------------|--------------------------------|-------------------------------------------------------------------------------|
| 01-baseline-docs              | `documentador-mtr`             | `docs/04-arquitetura/dmr-sicat.md`, mapeamento de HAR DMR, checkpoints abertos |
| 02-source-validation          | `validador-cetesb-mtr`         | Evidência DMR validada em `docs/cetesb/`                                       |
| 03-external-integration       | `integrador-cetesb-mtr`        | Bloco DMR isolado em `src/gateways/cetesb-gateway.js` validado contra HAR     |
| 04-backend-contracts          | `programador-backend-mtr`      | OpenAPI + examples + `operations.ts` + rotas + services DMR                    |
| 05-persistence-queue          | `postgres-queue-mtr`           | Migration idempotente, índices, worker handler `dmr.submit`                    |
| 06-domain-rules               | `manifestos-operacional-mtr`   | Validações declaratórias DMR + integração à taxonomia operacional              |
| 07-frontend-ux                | `frontend-vue-ux-mtr`          | Rotas `/dmr/*` (listagem, criação, pendentes, detalhe)                         |
| 08-qa-validation              | `tester-qa-mtr`                | Suítes verdes + Playwright DMR                                                 |
| 09-docs-final                 | `documentador-mtr`             | Atualização de `estado-atual.md`, novo `PROXIMO_PROMPT.md`, CHANGELOG DMR      |
| 10-ci-handoff (opcional)      | `ci-cd-github-mtr`             | Commit + push mediante autorização explícita                                   |

## 4. Critérios de pronto (cadeia)

- evidência HAR DMR validada e referenciada;
- OpenAPI publicada com novos endpoints DMR e operations geradas em lockstep;
- migrations idempotentes (`create index if not exists`; sem alterar
  constraints DL-022; preservando locking otimista);
- nenhum acesso CETESB fora de `src/gateways/cetesb-gateway.js`;
- testes verdes: `test:api`, `test:integration`, `test:worker`,
  `test:contract`, `test:source-of-truth`, `smoke:health`,
  `smoke:openapi`;
- pelo menos uma spec Playwright cobrindo o fluxo DMR principal;
- `docs/10-estado-atual/estado-atual.md` atualizado com DMR como
  IMPLEMENTADO e novo `PROXIMO_PROMPT.md` apontando a frente seguinte.

## 5. Pendências herdadas (centro-operacional-sicat)

- **F1**: já corrigida na fase 08 da cadeia anterior — sem ação.
- **F2**: 15 falhas Playwright pré-existentes (`responsive-smoke`,
  `qa-global-home-back-button`, `full-navigation-e2e`,
  `conversational-chat-app`, `manifests-resync`,
  `cetesb-operational-flows`) pertencem às cadeias originais.
  Esta cadeia DMR **não deve** tratá-las; apenas garantir que a nova
  suíte DMR não regrida o conjunto verde atual.
- **F3**: aviso de chunks Vite > 500 kB; tratar somente se DMR
  adicionar peso significativo ao bundle.

## 6. Status global

- **Status global**: **ENCERRADA (PUSHED)** em 2026-04-25.
- **Fase atual**: 10-ci-handoff **CONCLUÍDA** — commit/push
  executados após autorização explícita do usuário. Checkpoint em
  [10-ci-handoff.md](10-ci-handoff.md). Range publicado:
  `90b9e74..659030f` em `origin/main`. SHAs:
  - `3685b2b` — `feat(dmr): fluxo declaratorio base com gateway stub Caminho B`
  - `659030f` — `docs(dmr): changelog + estado atual + proxima frente (mtr provisorio)`
- **Encerradas**:
  - 10-ci-handoff (2026-04-25) — checkpoint em
    [10-ci-handoff.md](10-ci-handoff.md). Pré-checagens verdes
    (`typecheck`, `validate:openapi`, `validate:md-links`,
    `test:contract`, `test:source-of-truth`); secret-scan limpo
    (35 arquivos DMR varridos); 2 commits lógicos publicados em
    `origin/main` sem `--force` e sem `--no-verify`.
  - 09-docs-final (2026-04-25) — checkpoint em
    [09-docs-final.md](09-docs-final.md). Entregas: CHANGELOG
    [docs/CHANGELOG-DMR-FLUXO-BASE.md](../../CHANGELOG-DMR-FLUXO-BASE.md);
    atualização de
    [estado-atual.md](../../10-estado-atual/estado-atual.md) marcando
    DMR IMPLEMENTADO (fluxo base) + §3.1 com follow-ups (F4 e HAR DMR
    pendente);
    [PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)
    apontando Frente 3 (MTR provisório) como próxima cadeia
    recomendada. `validate:md-links` verde (663 arquivos).
  - 08-qa-validation (2026-04-25) — checkpoint em
    [08-qa-validation.md](08-qa-validation.md). Suítes verdes:
    `typecheck`, `validate:openapi`, `validate:md-links`,
    `test:source-of-truth` (6/6), `test:contract` (4/4),
    `test:api` (23/23), `test:integration` (124/124 na 2ª execução —
    1 flake na 1ª registrado como F4 não-bloqueante),
    `test:worker` (14/14), `smoke:health`, `smoke:openapi`,
    `frontend build`. Spec Playwright DMR criada em
    [frontend/tests/ui/dmr-smoke.spec.ts](../../../frontend/tests/ui/dmr-smoke.spec.ts)
    (3/3). Playwright full: 52 passed, 15 failed (F2 herdado idêntico
    ao baseline), 11 did not run (também herdado). Sem regressão
    atribuível ao DMR.
  - 01-baseline-docs (2026-04-25) — checkpoint em
    [01-baseline-docs.md](01-baseline-docs.md), arquitetura alvo em
    [docs/04-arquitetura/dmr-sicat.md](../../04-arquitetura/dmr-sicat.md).
  - 02-source-validation (2026-04-25) — checkpoint em
    [02-source-validation.md](02-source-validation.md). Decisão
    documentada: **Caminho B** (avançar com stub contratual no gateway
    até HAR chegar). Fallback de consolidação local validado como
    viável (§5 do checkpoint 02).
  - 04-backend-contracts (2026-04-25) — checkpoint em
    [04-backend-contracts.md](04-backend-contracts.md). OpenAPI + 23
    examples + `operations.ts` + rotas + service + repo stub +
    bloco DMR stub no gateway publicados. Validações
    `validate:openapi`, `typecheck`, `test:contract`,
    `test:source-of-truth`, `validate:md-links` verdes.
  - 05-persistence-queue (2026-04-25) — checkpoint em
    [05-persistence-queue.md](05-persistence-queue.md). Migration
    `013_dmr_declarations.sql` aplicada (idempotente, 5 constraints
    DL-022, trigger de version, índices). Repo DMR substituído por
    SQL real preservando interface tipada da fase 04 (locking
    otimista). Handler `dmr.submit` adicionado em
    `src/workers/operation-handlers.ts` mapeando o stub
    `DMR_GATEWAY_PENDING_HAR` para `failed_remote` sem subir DLQ.
    Validações `migrate`, `typecheck`, `test:integration` (124),
    `test:worker` (14) e `test:contract` (4) verdes.
  - 06-domain-rules (2026-04-25) — checkpoint em
    [06-domain-rules.md](06-domain-rules.md). Validador declaratório
    DMR criado em
    [src/lib/validators/dmr-validator.ts](../../../src/lib/validators/dmr-validator.ts)
    (8 validadores, códigos `DMR_*` estáveis), plugado em
    `src/services/dmr-service.ts` nos pontos do ciclo (create,
    consolidate, submit, delete, item mutation). Mapeamento canônico
    `dmr.status → operationalStatus` registrado em
    [src/lib/operational-status.ts](../../../src/lib/operational-status.ts).
    Adicionada `findOverlappingDmr` em `src/repositories/dmr-repo.ts`.
    Validações `typecheck`, `test:integration` (124),
    `test:worker` (14), `test:contract` (4 + pipeline) e
    `test:source-of-truth` (6) verdes.
  - 07-frontend-ux (2026-04-25) — checkpoint em
    [07-frontend-ux.md](07-frontend-ux.md). Rotas DMR Vue 3
    publicadas (`/dmr`, `/dmr/pendentes`, `/dmr/novo`,
    `/dmr/:dmrId`) consumindo o contrato da fase 04 com
    guards SICAT auth + active CETESB account. Service HTTP
    (`frontend/src/services/dmrService.js` + 11 funções em
    `frontend/src/services/api.js`), store factory
    `useDmrStore()` em `frontend/src/stores/dmrStore.js`, badges
    canônicos via espelho frontend de `mapDmrStatusToOperational`
    em
    [frontend/src/modules/command-center/operationalStatus.js](../../../frontend/src/modules/command-center/operationalStatus.js)
    e banner explícito para
    `DMR_GATEWAY_PENDING_HAR`. Entrada "DMR" adicionada ao menu
    lateral em [frontend/src/App.vue](../../../frontend/src/App.vue).
    Validações `typecheck` (raiz) e `npm --prefix frontend run build`
    verdes.
- **Adiada**: 03-external-integration. Permanece prevista; reabre
  quando HAR DMR for capturado. Fase 04 expôs a interface tipada
  (`submitDmr`) para que a fase 03 só preencha a implementação.
- **Bloqueios reais**: nenhum. HAR DMR ausente vira pendência nominal
  (não bloqueia). Fase 08 já tem handoff detalhado (suítes a rodar +
  Playwright DMR) em
  [07-frontend-ux.md §10](07-frontend-ux.md#10-handoff-explícito-para-tester-qa-mtr-fase-08).
