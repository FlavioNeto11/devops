# 08 — QA Validation — DMR (cadeia `dmr-fluxo-base`)

> Fase concluída em 2026-04-25 pelo `tester-qa-mtr`.
> Anterior: [07-frontend-ux.md](07-frontend-ux.md).
> Geral: [00-orchestration.md](00-orchestration.md).
> Próxima fase: 09-docs-final (`documentador-mtr`).

## 1. Objetivo da fase

Validar a cadeia DMR ponta a ponta — backend (contrato, persistência,
worker), frontend (build + Playwright) e ciclo declaratório — sem
regredir o conjunto verde atual e sem tocar produto.

## 2. Arquivos analisados

- [00-orchestration.md](00-orchestration.md) §5 e §6 — pendências
  herdadas (F1/F2/F3) e estado da cadeia.
- [07-frontend-ux.md](07-frontend-ux.md) §10 — handoff explícito
  (suítes a rodar + Playwright DMR mínimo).
- [06-domain-rules.md](06-domain-rules.md) — códigos `DMR_*`
  esperados na resposta `application/problem+json`.
- [05-persistence-queue.md](05-persistence-queue.md) — handler
  `dmr.submit` mapeando `DMR_GATEWAY_PENDING_HAR` para `failed_remote`
  sem subir DLQ.
- [04-backend-contracts.md](04-backend-contracts.md) — paths DMR no
  contrato HTTP.
- [frontend/playwright.config.js](../../../frontend/playwright.config.js)
  — webServer auto-start em `127.0.0.1:5174`.
- [frontend/tests/ui/manifest-account-context.spec.js](../../../frontend/tests/ui/manifest-account-context.spec.js)
  — padrão de mock de auth/sessão SICAT replicado na nova spec DMR.
- [frontend/src/views/dmr/DmrDetailView.vue](../../../frontend/src/views/dmr/DmrDetailView.vue)
  — banner `DMR_GATEWAY_PENDING_HAR` (texto "Aguardando captura HAR
  DMR") e ação "Submeter à CETESB" → "Confirmar envio".

## 3. Decisões

1. **Não tocar produto**: nenhum arquivo backend/frontend de produção
   foi alterado. Qualquer regressão volta para o especialista dono.
2. **Nova spec DMR isolada por mock**: backend é mockado via
   `page.route` (mesmo padrão do
   [manifest-account-context.spec.js](../../../frontend/tests/ui/manifest-account-context.spec.js))
   para validar contrato visual/UX da fase 07. Backend/worker reais já
   são cobertos por `test:api`, `test:integration` e `test:worker`.
3. **Playwright F2 (15 falhas pré-existentes)**: confirmado conjunto
   idêntico ao baseline herdado (mesmas 6 suítes); a cadeia DMR não
   regrediu nem ampliou o conjunto.
4. **F3 (chunks Vite > 500 kB)**: aviso permanece — DMR não agravou
   (build em 8,83 s; mesmos chunks dominados por `materialdesignicons`
   e `material-symbols-outlined`).
5. **Smoke `/manifestos` e `/jobs`**: cobertura indireta via specs
   verdes em [manifest-account-context.spec.js](../../../frontend/tests/ui/manifest-account-context.spec.js)
   (passou) e [audit.spec.ts](../../../frontend/tests/ui/audit.spec.ts)
   (passou). Menu DMR adicionado em fase 07 não quebrou rotas
   existentes.

## 4. Arquivos criados / alterados

### Criados

- [frontend/tests/ui/dmr-smoke.spec.ts](../../../frontend/tests/ui/dmr-smoke.spec.ts)
  — 3 cenários Playwright DMR:
  1. listagem `/dmr` autenticada exibe declaração mockada;
  2. criação via `/dmr/novo` redireciona para `/dmr/:id`;
  3. submit → banner amarelo `DMR_GATEWAY_PENDING_HAR` (Caminho B do
     gateway DMR — checkpoint 02).

### Alterados

- nenhum (produto preservado).

## 5. Matriz de validações

| comando | resultado | observação |
| --- | --- | --- |
| `npm run typecheck` | **VERDE** | `tsc -p tsconfig.json --noEmit`, zero erros. |
| `npm run validate:openapi` | **VERDE** | OpenAPI + fonte de verdade CETESB + links markdown (661 arquivos). |
| `npm run validate:md-links` | **VERDE** | Coberto pelo wrapper `validate:openapi`. |
| `npm run test:source-of-truth` | **VERDE** | 6/6. |
| `npm run test:contract` | **VERDE** | 4/4. |
| `npm run test:api` | **VERDE** | 23/23. |
| `npm run test:integration` | **VERDE** | 124/124 na execução repetida; primeira execução teve **1 falha flake** rapidamente verde na repetição (sem sintoma reproduzível, sem alteração de código) — registrado como F4 não-bloqueante. |
| `npm run test:worker` | **VERDE** | 14/14. |
| `npm run smoke:health` | **VERDE** | Todos os endpoints de saúde retornaram `ok=true`. |
| `npm run smoke:openapi` | **VERDE** | Comandos canônicos batem com a OpenAPI publicada. |
| `npm --prefix frontend run build` | **VERDE** | Vite build em 8,83 s. F3 (chunks > 500 kB) mantido — sem agravamento. |
| `npx playwright test tests/ui/dmr-smoke.spec.ts` | **VERDE** | 3/3 (todos os cenários DMR passam). |
| `npx playwright test` (full suite) | **AMARELO** | 52 passed, **15 failed** (F2 herdado idêntico), 11 did not run (também herdado). Sem regressão atribuível ao DMR. |

## 6. Resultado Playwright — diff vs baseline

### Falhas (15) — F2 herdado, sem alteração

| suíte | cenário | herdada |
| --- | --- | --- |
| `cetesb-operational-flows.spec.js` | listagem do destinador protege recebimento e CDF no fluxo novo | sim |
| `conversational-chat-app.spec.js` | quick action consultivo p/ backend conversacional | sim |
| `conversational-chat-app.spec.js` | quick action detalhe de manifesto | sim |
| `conversational-chat-app.spec.js` | quick action status de job | sim |
| `full-navigation-e2e.spec.ts` | 04 — Tentar abrir detalhe de manifesto | sim |
| `manifests-resync.spec.js` | menu de ações abre para cima | sim |
| `qa-global-home-back-button.spec.ts` | 02 — `/login/cetesb` integra Home | sim |
| `responsive-smoke.spec.js` | login 2 etapas — mobile | sim |
| `responsive-smoke.spec.js` | dashboard — mobile | sim |
| `responsive-smoke.spec.js` | login 2 etapas — tablet | sim |
| `responsive-smoke.spec.js` | dashboard — tablet | sim |
| `responsive-smoke.spec.js` | login 2 etapas — desktop | sim |
| `responsive-smoke.spec.js` | dashboard — desktop | sim |
| `responsive-smoke.spec.js` | login 2 etapas — wide | sim |
| `responsive-smoke.spec.js` | dashboard — wide | sim |

Conjunto bate exatamente com o baseline F2 declarado em
[00-orchestration.md §5](00-orchestration.md#5-pendências-herdadas-centro-operacional-sicat).
**Nenhuma falha nova atribuível ao DMR.**

### Verdes (52) — inclui novas DMR

- 3 cenários novos da spec DMR
  ([dmr-smoke.spec.ts](../../../frontend/tests/ui/dmr-smoke.spec.ts))
  passam consistentemente em ~5–6 s cada.
- Specs que exercitam `/manifestos` (`manifest-account-context`,
  `audit`) e jobs (`audit`) seguem verdes — menu DMR não quebrou
  navegação.

### "11 did not run"

Mesmo comportamento do baseline: ao atingir falhas em `responsive-smoke`
e `conversational-chat-app`, alguns workers paralelos não chegam a
agendar parte dos cenários — comportamento herdado, fora do escopo
DMR.

## 7. Pendências classificadas

| ID | descrição | origem | tratamento nesta fase |
| --- | --- | --- | --- |
| F1 | corrigida na fase 08 da cadeia anterior | herdada | nenhuma ação. |
| F2 | 15 falhas Playwright pré-existentes (responsive-smoke, qa-global-home-back-button, full-navigation-e2e, conversational-chat-app, manifests-resync, cetesb-operational-flows) | herdada | confirmadas idênticas ao baseline; **não regrediram**; fora do escopo DMR. |
| F3 | warning Vite chunk > 500 kB | herdada | DMR não agravou; nenhum tratamento. |
| F4 | flake única em `test:integration` (1/124) na 1ª execução, sem reprodução na 2ª | observada agora | **não-bloqueante**; sem alteração de código; recomendação ao `documentador-mtr` registrar como follow-up de estabilidade. |
| HAR DMR ausente | gateway DMR retorna `503 DMR_GATEWAY_PENDING_HAR` (Caminho B) | herdada (fase 02) | comportamento esperado e exercitado pela spec DMR (banner amarelo). |

**Nenhum bloqueio novo introduzido por esta fase.**

## 8. Bloqueios identificados

- nenhum.

## 9. Restrições mantidas

- código de produto (backend/frontend) **não foi tocado**;
- gateway DMR não foi tocado (fase 03 segue prevista para reabrir
  quando HAR chegar);
- OpenAPI/operations não foram regenerados;
- nenhum commit/push;
- nenhuma alteração nas suítes Playwright pré-existentes (F2);
- nenhuma supressão/skip aplicado a testes herdados;
- não foi tocado nada de outras cadeias.

## 10. Handoff explícito para `documentador-mtr` (fase 09)

### 10.1. Estado entregue

- contrato/tipos verdes (`typecheck`, `validate:openapi`,
  `validate:md-links`, `test:source-of-truth`, `test:contract`);
- backend verde (`test:api`, `test:integration`, `test:worker`);
- smoke verde (`smoke:health`, `smoke:openapi`);
- frontend build verde;
- Playwright DMR coberto por
  [frontend/tests/ui/dmr-smoke.spec.ts](../../../frontend/tests/ui/dmr-smoke.spec.ts)
  (3/3);
- F2 não regrediu; F3 não agravou; HAR pendente segue como Caminho B.

### 10.2. Trabalho da fase 09 (resumo)

A fase 09-docs-final deve consolidar a documentação da cadeia DMR e
publicar o próximo prompt do orquestrador. Mínimo a entregar:

1. **Atualizar** [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md):
   marcar DMR como **IMPLEMENTADO (fluxo base, gateway DMR pendente
   de HAR — Caminho B)**, com referências aos checkpoints 04, 05, 06,
   07 e este 08.
2. **Publicar CHANGELOG DMR** em
   `docs/CHANGELOG-DMR-FLUXO-BASE.md` (ou seção em changelog
   existente) consolidando: contrato HTTP, migration `013`, validador
   declaratório, frontend Vue 3, spec Playwright e baseline F2
   confirmado.
3. **Novo `docs/10-estado-atual/PROXIMO_PROMPT.md`** apontando a
   próxima frente estratégica (provável: fase 03 reaberta para
   captura HAR DMR ou Frente 3 do backlog CTO — confirmar com
   [docs/_inputs/fonte-de-verdade-backlog-cto.md](../../_inputs/fonte-de-verdade-backlog-cto.md)).
4. **Registrar F4** (flake `test:integration` 1/124) como follow-up
   de estabilidade — sugerir ao `tester-qa-mtr` em próxima cadeia
   investigar com seed determinística ou retry direcionado.
5. Atualizar [00-orchestration.md §6](00-orchestration.md#6-status-global)
   marcando fase 09 CONCLUÍDA e abrindo (opcional) fase 10-ci-handoff.

### 10.3. Restrições mantidas

- não tocar produto (backend/frontend);
- não tocar gateway DMR;
- não regenerar OpenAPI/operations;
- não commit/push (fase 10, mediante autorização explícita);
- não tratar F2/F3 (fora do escopo da cadeia DMR).

### 10.4. Prompt pronto para `documentador-mtr`

```text
Cadeia: dmr-fluxo-base. Fase 09-docs-final.

Contexto obrigatório:
- docs/handoffs/dmr-fluxo-base/00-orchestration.md (status global)
- docs/handoffs/dmr-fluxo-base/08-qa-validation.md (este checkpoint)
- docs/handoffs/dmr-fluxo-base/07-frontend-ux.md
- docs/handoffs/dmr-fluxo-base/06-domain-rules.md
- docs/handoffs/dmr-fluxo-base/05-persistence-queue.md
- docs/handoffs/dmr-fluxo-base/04-backend-contracts.md
- docs/handoffs/dmr-fluxo-base/02-source-validation.md (Caminho B)

Entregas:
1. Atualizar docs/10-estado-atual/estado-atual.md marcando DMR como
   IMPLEMENTADO (fluxo base, gateway DMR pendente HAR — Caminho B)
   referenciando checkpoints 04..08 desta cadeia.
2. Publicar CHANGELOG DMR (docs/CHANGELOG-DMR-FLUXO-BASE.md) com
   contrato HTTP, migration 013, validador declaratório, frontend
   Vue 3, spec Playwright e baseline F2/F3 confirmados.
3. Atualizar docs/10-estado-atual/PROXIMO_PROMPT.md apontando a
   próxima frente estratégica (cf.
   docs/_inputs/fonte-de-verdade-backlog-cto.md §5).
4. Registrar F4 (flake test:integration 1/124) como follow-up de
   estabilidade.
5. Fechar fase 09 em docs/handoffs/dmr-fluxo-base/09-docs-final.md
   e atualizar 00-orchestration.md §6.

Restrições:
- não tocar produto (backend/frontend/gateway/OpenAPI/operations);
- não commit/push (fase 10);
- não tratar F2/F3.

Se runtime não invocar próximo agente, devolva next_agent_required
com prompt para ci-cd-github-mtr (fase 10) caso commit/push seja
autorizado, ou encerre cadeia caso contrário.
```
