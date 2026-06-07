# 09 — Docs Final — DMR (cadeia `dmr-fluxo-base`)

> Fase concluída em 2026-04-25 pelo `documentador-mtr`.
> Anterior: [08-qa-validation.md](08-qa-validation.md).
> Geral: [00-orchestration.md](00-orchestration.md).
> Próxima fase (opcional): 10-ci-handoff (`ci-cd-github-mtr`),
> mediante **autorização explícita do usuário** para commit/push.

## 1. Objetivo da fase

Consolidar a documentação da cadeia DMR e publicar o próximo prompt
do orquestrador, sem tocar produto e sem commit/push. Entregas:

1. atualizar [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md)
   marcando DMR como **IMPLEMENTADO (fluxo base, gateway DMR pendente
   HAR — Caminho B)** com referências aos checkpoints 04..08;
2. publicar
   [docs/CHANGELOG-DMR-FLUXO-BASE.md](../../CHANGELOG-DMR-FLUXO-BASE.md);
3. atualizar [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)
   apontando a próxima frente estratégica
   ([backlog CTO §5](../../_inputs/fonte-de-verdade-backlog-cto.md#5-pr%C3%B3ximas-frentes-estrat%C3%A9gicas));
4. registrar **F4** (flake única `test:integration` 1/124) como
   follow-up em seção dedicada do `estado-atual.md`;
5. documentar que a captura de HAR DMR fica como ação humana
   pendente, destravando futura cadeia `dmr-gateway-real`;
6. fechar este checkpoint;
7. atualizar [00-orchestration.md §6](00-orchestration.md#6-status-global).

## 2. Arquivos analisados

- [00-orchestration.md](00-orchestration.md) — sequência de fases e
  status global.
- [08-qa-validation.md](08-qa-validation.md) §10 — handoff explícito
  com prompt pronto para esta fase.
- [07-frontend-ux.md](07-frontend-ux.md) — entregas de frontend
  (rotas, views, store, service).
- [06-domain-rules.md](06-domain-rules.md) — códigos `DMR_*`,
  registry operacional, mapeamento de status.
- [05-persistence-queue.md](05-persistence-queue.md) — migration
  `013_dmr_declarations.sql`, constraints, trigger, índices, handler.
- [04-backend-contracts.md](04-backend-contracts.md) — paths/operations,
  schemas, services, examples.
- [02-source-validation.md](02-source-validation.md) — Caminho B e
  plano de captura HAR DMR.
- [docs/_inputs/fonte-de-verdade-backlog-cto.md](../../_inputs/fonte-de-verdade-backlog-cto.md)
  §5 e §6 — frentes estratégicas restantes e critério de priorização.
- [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md)
  — snapshot operacional anterior (frente DMR em "EM PROGRESSO").
- [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)
  — prompt anterior apontando para `dmr-fluxo-base` (a substituir).
- [openapi/mtr_automacao_openapi_interna.yaml](../../../openapi/mtr_automacao_openapi_interna.yaml)
  — confirmação dos 11 paths/operationIds DMR publicados.

## 3. Decisões

1. **DMR marcado como IMPLEMENTADO (fluxo base)** em
   [estado-atual.md §2.1 e §2.5](../../10-estado-atual/estado-atual.md#2-implementado-com-evid%C3%AAncia),
   com nota explícita de que o **envio remoto à CETESB permanece
   pendente HAR DMR (Caminho B)** — gateway retorna
   `application/problem+json` 503 com `code: DMR_GATEWAY_PENDING_HAR`
   até captura humana de HAR.
2. **Frente DMR removida** da seção §3 "EM PROGRESSO / PARCIAL"; em
   seu lugar, registrada apenas a parte ainda não entregue
   (envio remoto via gateway real).
3. **Próxima frente recomendada: Frente 3 — MTR provisório**.
   Justificativa em
   [PROXIMO_PROMPT.md §2](../../10-estado-atual/PROXIMO_PROMPT.md#2-pr%C3%B3xima-frente-recomendada):
   é o próximo maior gap regulatório (impacta obrigação CETESB) após
   DMR, reaproveita 100% da fronteira já consolidada para manifestos
   comuns, e HARs existentes (`gerar/imprimir/cancelar_mtr`) já
   cobrem boa parte do baseline.
4. **`dmr-gateway-real` NÃO é a próxima cadeia recomendada**: depende
   de captura humana de HAR DMR que ainda não ocorreu. Permanece como
   cadeia futura, destravável a qualquer momento após a captura.
5. **F4 registrada como follow-up de estabilidade** em
   [estado-atual.md §3.1](../../10-estado-atual/estado-atual.md#31-follow-ups-de-estabilidade),
   sem abrir cadeia dedicada (não-bloqueante).
6. **CHANGELOG dedicado** publicado em
   [docs/CHANGELOG-DMR-FLUXO-BASE.md](../../CHANGELOG-DMR-FLUXO-BASE.md)
   com resumo executivo, contrato HTTP, persistência, validador,
   frontend, QA e Caminho B explícito (mesmo padrão do
   `CHANGELOG-CENTRO-OPERACIONAL.md`).
7. **Sem tocar produto** (backend, frontend, OpenAPI, operations,
   gateway, migrations, tests). Todas as alterações desta fase são
   doc-only.
8. **Sem commit/push**: fase 10-ci-handoff opcional, condicionada a
   autorização explícita do usuário (§8 abaixo).

## 4. Arquivos criados / alterados

### Criados

- [docs/CHANGELOG-DMR-FLUXO-BASE.md](../../CHANGELOG-DMR-FLUXO-BASE.md)
  — release notes consolidadas da cadeia DMR (resumo executivo,
  contrato HTTP, persistência, validador, frontend, QA, Caminho B,
  índice de checkpoints).
- [docs/handoffs/dmr-fluxo-base/09-docs-final.md](09-docs-final.md)
  — este checkpoint.

### Alterados

- [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md):
  - cabeçalho — `Última revisão` atualizado para
    `09-docs-final do work dmr-fluxo-base (2026-04-25)`;
  - §2.1 (Backend) — adicionada subseção DMR com 11 endpoints
    `/v1/dmr/*`, migration `013_dmr_declarations.sql`, validador,
    handler, gateway stub Caminho B, e links para checkpoints
    04..08;
  - §2.5 (Frontend Vue 3) — adicionada subseção DMR com 4 rotas,
    store, service e espelho operacional;
  - §2.6 (Documentação canônica) — adicionada referência ao novo
    `CHANGELOG-DMR-FLUXO-BASE.md`;
  - §3 (EM PROGRESSO / PARCIAL) — entrada DMR substituída por
    "DMR — gateway real (envio remoto)" pendente HAR;
  - §3.1 (Follow-ups de estabilidade) — nova seção com F4, HAR DMR
    ausente e ponteiros para F2/F3 herdados.
- [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)
  — substituído por prompt apontando a Frente 3 (MTR provisório)
  como próxima cadeia, com justificativa ancorada em §5 e §6 do
  backlog CTO e prompt pronto para `orquestrador-mtr`.
- [docs/handoffs/dmr-fluxo-base/00-orchestration.md](00-orchestration.md)
  §6 — fase 09 marcada como concluída, fase 10-ci-handoff opcional
  ativada (aguardando autorização explícita).

### Não alterados (por restrição)

- backend (`src/**`), frontend (`frontend/src/**`), gateway
  (`src/gateways/cetesb-gateway.js`), OpenAPI
  (`openapi/mtr_automacao_openapi_interna.yaml`), operations
  (`src/generated/operations.{ts,js}`), migrations (`src/sql/**`),
  testes (`tests/**`, `frontend/tests/**`).

## 5. Validação de links

| comando | resultado |
| --- | --- |
| `npm run validate:md-links` | **VERDE** — `validate:openapi → validate-openapi → validate:md-links`, OpenAPI válido, fonte de verdade CETESB validada, links MD íntegros. |

Saída resumida:

```text
[validate-md-links] 663 arquivos analisados, 0 link quebrado
```

## 6. Status

Fase 09-docs-final: **concluída**. Cadeia `dmr-fluxo-base` pronta
para fase 10-ci-handoff opcional (commit/push), mediante autorização
explícita do usuário.

## 7. Bloqueios

- nenhum.

## 8. Handoff pronto para `ci-cd-github-mtr` (fase 10, opcional)

> **Atenção**: esta fase requer **autorização explícita do usuário**
> antes de qualquer `git add`, `git commit` ou `git push`. Sem
> autorização, a cadeia encerra aqui e os artefatos ficam apenas no
> working tree para revisão humana.

### 8.1. Estado entregue

- Produto não foi tocado nesta fase. Todas as alterações estão sob
  `docs/`.
- Suítes verdes da fase 08 ainda válidas (nenhuma fonte alterada).
- CHANGELOG e PROXIMO_PROMPT publicados.
- `validate:md-links` verde.

### 8.2. Sugestão de commits lógicos

Mantendo histórico legível, sugerimos **2 commits**:

#### Commit 1 — entrega da cadeia DMR (grande)

Mensagem sugerida:

```text
feat(dmr): fluxo declaratório base + Caminho B (cadeia dmr-fluxo-base)

- 11 endpoints /v1/dmr/* + 12 schemas em OpenAPI (lockstep operations.ts)
- 23 examples DMR (request/response)
- migration 013_dmr_declarations.sql (idempotente, DL-022)
- validador declaratório dmr-validator (8 regras, códigos DMR_*)
- worker handler dmr.submit + repo SQL com locking otimista
- gateway DMR stub (Caminho B): problem+json 503 DMR_GATEWAY_PENDING_HAR
- 4 rotas Vue 3 /dmr/*, store Pinia, service HTTP, badge canônico
- spec Playwright dmr-smoke (3/3)
- estado-atual + CHANGELOG-DMR-FLUXO-BASE + checkpoints da cadeia

Refs: docs/handoffs/dmr-fluxo-base/00-orchestration.md
```

Arquivos a incluir (lista não exaustiva — `git status` é a fonte
real):

- `openapi/mtr_automacao_openapi_interna.yaml`
- `src/generated/operations.ts`, `src/generated/operations.js`
- `src/routes/api-routes.ts`, `src/routes/dmr-routes.ts`
- `src/services/dmr-service.ts`
- `src/repositories/dmr-repo.ts`
- `src/lib/validators/dmr-validator.ts`
- `src/lib/operational-status.ts`
- `src/lib/command-response.ts`
- `src/workers/operation-handlers.ts`
- `src/gateways/cetesb-gateway.js`
- `src/sql/013_dmr_declarations.sql`
- `examples/*dmr*.json` (23 arquivos)
- `frontend/src/router.js`, `frontend/src/App.vue`
- `frontend/src/views/dmr/**`
- `frontend/src/services/dmrService.js`, `frontend/src/services/api.js`
- `frontend/src/stores/dmrStore.js`
- `frontend/src/modules/command-center/operationalStatus.js`
- `frontend/tests/ui/dmr-smoke.spec.ts`
- `docs/04-arquitetura/dmr-sicat.md`
- `docs/handoffs/dmr-fluxo-base/00..08-*.md`
- `docs/handoffs/dmr-fluxo-base/09-docs-final.md`

#### Commit 2 — documentação final (isolado, opcional)

Útil se quiser granularidade entre código e docs operacionais. Caso
contrário, agregar ao Commit 1.

Mensagem sugerida:

```text
docs(dmr): CHANGELOG, estado-atual e próximo prompt (Frente 3 — MTR provisório)

- docs/CHANGELOG-DMR-FLUXO-BASE.md (release notes consolidadas)
- docs/10-estado-atual/estado-atual.md (DMR IMPLEMENTADO + §3.1 follow-ups)
- docs/10-estado-atual/PROXIMO_PROMPT.md (próxima cadeia: mtr-provisorio-fluxo-base)
- docs/handoffs/dmr-fluxo-base/09-docs-final.md
```

Arquivos:

- `docs/CHANGELOG-DMR-FLUXO-BASE.md`
- `docs/10-estado-atual/estado-atual.md`
- `docs/10-estado-atual/PROXIMO_PROMPT.md`
- `docs/handoffs/dmr-fluxo-base/09-docs-final.md`

### 8.3. Pré-checagens antes do commit

- `npm run typecheck` → verde;
- `npm run validate:openapi` → verde;
- `npm run validate:md-links` → verde;
- `npm run test:contract` → verde;
- `npm run test:source-of-truth` → verde.

(Todas já validadas na fase 08; rerun é opcional como sanidade.)

### 8.4. Push

- branch alvo: a definir pelo usuário (sugestão: `feat/dmr-fluxo-base`
  ou direto na branch ativa, conforme política do projeto);
- **não** usar `--no-verify`;
- **não** usar `--force` ou `--force-with-lease` sem necessidade
  explícita.

### 8.5. Prompt pronto para `ci-cd-github-mtr`

Cole em uma nova conversa com `ci-cd-github-mtr` **somente após
autorização explícita do usuário**:

````text
Cadeia: dmr-fluxo-base. Fase 10-ci-handoff (opcional).

Autorização: o usuário autorizou explicitamente commit + push desta
cadeia em <data/hora>.

Contexto obrigatório:
- docs/handoffs/dmr-fluxo-base/00-orchestration.md
- docs/handoffs/dmr-fluxo-base/09-docs-final.md (este checkpoint, §8)
- docs/CHANGELOG-DMR-FLUXO-BASE.md
- docs/10-estado-atual/estado-atual.md
- docs/10-estado-atual/PROXIMO_PROMPT.md

Tarefas:
1. confirmar working tree contendo os artefatos listados em
   09-docs-final.md §8.2 (commits 1 e 2);
2. rodar pré-checagens (typecheck, validate:openapi, validate:md-links,
   test:contract, test:source-of-truth);
3. criar 2 commits lógicos conforme §8.2 (ou 1 commit agregado se o
   usuário preferir);
4. push para a branch alvo definida pelo usuário, sem --no-verify e
   sem --force;
5. atualizar 00-orchestration.md §6 marcando fase 10 CONCLUÍDA com
   SHAs dos commits.

Restrições:
- não regenerar OpenAPI/operations;
- não rodar migrations contra Postgres;
- não tocar produto (apenas commit do que já está no working tree);
- não tratar F2/F3/F4 (fora do escopo);
- abortar se a working tree contiver arquivos fora do escopo da
  cadeia DMR.
````

## 9. Reporte final (resumo)

- **Arquivos criados**:
  [docs/CHANGELOG-DMR-FLUXO-BASE.md](../../CHANGELOG-DMR-FLUXO-BASE.md),
  [docs/handoffs/dmr-fluxo-base/09-docs-final.md](09-docs-final.md).
- **Arquivos alterados**:
  [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md),
  [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md),
  [docs/handoffs/dmr-fluxo-base/00-orchestration.md](00-orchestration.md).
- **Frente recomendada como próxima cadeia**: Frente 3 — MTR
  provisório (`mtr-provisorio-fluxo-base`). Justificativa em
  [PROXIMO_PROMPT.md §2](../../10-estado-atual/PROXIMO_PROMPT.md#2-pr%C3%B3xima-frente-recomendada).
- **Saída de `validate:md-links`**: verde
  (663 arquivos, 0 link quebrado).
- **Handoff fase 10**: pronto em §8 acima, condicionado a
  autorização explícita do usuário.
- **Bloqueios**: nenhum.
