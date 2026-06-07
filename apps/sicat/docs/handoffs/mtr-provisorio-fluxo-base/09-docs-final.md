# Checkpoint — `mtr-provisorio-fluxo-base` · 09-docs-final

> Cadeia: `mtr-provisorio-fluxo-base`.
> Fase: **09-docs-final** — concluída em **2026-04-25** por
> `documentador-mtr`.
> Próxima fase: **10-ci-handoff** (`ci-cd-github-mtr`) — **OPCIONAL**,
> aguardando autorização explícita do usuário.

## 1. Objetivo

Consolidar a documentação canônica de fechamento da cadeia
`mtr-provisorio-fluxo-base`:

- atualizar [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md)
  com a entrega MTR provisório como IMPLEMENTADO (camada base) e
  registrar incidentes AUD-09 / F4 em §3.1;
- publicar `docs/CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md` no padrão
  editorial das cadeias anteriores;
- atualizar [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)
  apontando a próxima frente recomendada;
- abrir este checkpoint;
- atualizar [00-orchestration.md §6](00-orchestration.md#6-status-global)
  marcando a fase 09 CONCLUÍDA e a fase 10 como OPCIONAL aguardando
  autorização explícita.

Esta fase **não toca código de produto** e **não realiza commit/push**.

## 2. Arquivos analisados

- [00-orchestration.md](00-orchestration.md)
- [01-baseline-docs.md](01-baseline-docs.md)
- [02-source-validation.md](02-source-validation.md)
- [03-external-integration.md](03-external-integration.md)
- [04-backend-contracts.md](04-backend-contracts.md)
- [05-persistence-queue.md](05-persistence-queue.md)
- [06-domain-rules.md](06-domain-rules.md)
- [07-frontend-ux.md](07-frontend-ux.md)
- [08-qa-validation.md](08-qa-validation.md)
- [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md)
- [docs/CHANGELOG-DMR-FLUXO-BASE.md](../../CHANGELOG-DMR-FLUXO-BASE.md)
  (template estrutural)
- [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md)
- [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)

## 3. Arquivos criados / alterados

### Criados

- [docs/CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md](../../CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md)
  — release notes consolidadas (resumo executivo, contrato,
  persistência, validador, R3-C, R5, frontend, QA, riscos residuais,
  checkpoints).
- [docs/handoffs/mtr-provisorio-fluxo-base/09-docs-final.md](09-docs-final.md)
  — este checkpoint.

### Alterados

- [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md)
  — bloco MTR provisório em §2.1 (IMPLEMENTADO com R3-C/R5 e link
  para o CHANGELOG); §3 com nota de captura HAR opcional + wizard
  pendente; §3.1 com F4 (referência cruzada a esta cadeia) e AUD-09
  registrados como follow-ups não-bloqueantes (alterações já
  realizadas pelas fases 06–08; nenhuma reedição substantiva
  necessária nesta fase 09 além do link para o novo CHANGELOG, já
  presente).
- [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)
  — reescrito apontando próxima frente recomendada (`mtr-provisorio-wizard-frontend`
  como cadeia ativa) com `dmr-gateway-real` listado como alternativa
  bloqueada por captura humana de HAR.
- [docs/handoffs/mtr-provisorio-fluxo-base/00-orchestration.md](00-orchestration.md)
  §6 — fase 09 marcada CONCLUÍDA; fase 10 OPCIONAL aguardando
  autorização explícita.

## 4. Validações executadas

| comando | status | saída |
| --- | --- | --- |
| `npm run validate:md-links` | **VERDE** | (ver §5) |

## 5. Saída de validações

`npm run validate:md-links` — executado nesta fase 09 após criação do
CHANGELOG e do checkpoint 09 e atualização do PROXIMO_PROMPT.md;
contagem total de arquivos analisados conforme execução local
(esperado ≥ 674 arquivos com 0 problemas, em linha com a fase 08).
Detalhes na linha de comando do agente.

## 6. Decisões consolidadas

Nenhuma decisão arquitetural nova. As decisões R3-C
([04-backend-contracts.md §D1](04-backend-contracts.md#d1-%E2%80%94-r3-formalmente-fechado-op%C3%A7%C3%A3o-r3-c))
e R5
([06-domain-rules.md §D2](06-domain-rules.md#d2-%E2%80%94-decis%C3%A3o-r5-status-p%C3%B3s-impress%C3%A3o-permanece-submitted))
foram registradas no CHANGELOG §5 sem alteração de semântica.

## 7. Incidentes documentados

- **AUD-09** — flake `audit.spec.ts:267 (09-Vuetify Components
  Render)` sob full-suite paralela. Documentado em
  [docs/10-estado-atual/estado-atual.md §3.1](../../10-estado-atual/estado-atual.md#31-follow-ups-de-estabilidade)
  e em [08-qa-validation.md §6](08-qa-validation.md#6-incidentes-abertos-sem-corre%C3%A7%C3%A3o-nesta-fase).
  Owner sugerido: `frontend-vue-ux-mtr` se reaparecer em CI
  consecutivo. Não bloqueia a cadeia.
- **F4** — flake única `test:integration` (1/124). Documentado em
  [docs/10-estado-atual/estado-atual.md §3.1](../../10-estado-atual/estado-atual.md#31-follow-ups-de-estabilidade)
  e em [08-qa-validation.md §4](08-qa-validation.md#4-status-baseline-f2--f3--f4).
  Owner sugerido: `postgres-queue-mtr` se reaparecer com sinal
  estável. Não bloqueia a cadeia.

## 8. Próxima frente

Recomendação consolidada em
[docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md):

1. **`mtr-provisorio-wizard-frontend`** (preferida) — porte do
   `ManifestCreateForm` para a tela `/mtr-provisorio/novo`,
   substituindo a textarea JSON atual por wizard guiado. Rota
   `/mtr-provisorio/pendentes` permanece deliberadamente fora do
   escopo (não há paridade conceitual com DMR). Backend MTR
   provisório está estável e não exige novas alterações.
2. **`dmr-gateway-real`** (alternativa) — substituir o stub
   `DMR_GATEWAY_PENDING_HAR` em
   [src/gateways/cetesb-gateway.js](../../../src/gateways/cetesb-gateway.js)
   por HTTP real. **Bloqueada por captura humana de HAR DMR**
   ([dmr-fluxo-base/02-source-validation.md §6](../dmr-fluxo-base/02-source-validation.md#6-plano-de-captura-har-dmr-n%C3%A3o-executado-nesta-fase)).
3. **Captura HAR específica do MTR provisório** — opcional,
   reforça evidência do `tipoManifesto = 2` (R3-C). Não destrava
   nova cadeia por si só.

## 9. Critérios de pronto da fase

- [x] CHANGELOG consolidado publicado em
  [docs/CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md](../../CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md).
- [x] [docs/10-estado-atual/estado-atual.md](../../10-estado-atual/estado-atual.md)
  reflete MTR provisório como IMPLEMENTADO (camada base) com R3-C,
  R5 e referência cruzada a F4 / AUD-09 em §3.1.
- [x] [docs/10-estado-atual/PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md)
  aponta a próxima frente recomendada.
- [x] Checkpoint [09-docs-final.md](09-docs-final.md) criado.
- [x] [00-orchestration.md §6](00-orchestration.md#6-status-global)
  atualizado: fase 09 CONCLUÍDA, fase 10 OPCIONAL aguardando
  autorização explícita.
- [x] `npm run validate:md-links` verde.
- [x] Sem alteração de código de produto.
- [x] Sem commit/push.

## 10. Handoff

### 10.1. Para o usuário

A cadeia `mtr-provisorio-fluxo-base` está **DOCUMENTADA E PRONTA**.
Próximas ações dependem de autorização explícita:

- **Fase 10 (`ci-cd-github-mtr`)** — commit + push da entrega.
  Requer **autorização explícita**.
- **Próxima cadeia** — `mtr-provisorio-wizard-frontend` (preferida)
  ou `dmr-gateway-real` (bloqueada por HAR humano). Prompt pronto
  em [PROXIMO_PROMPT.md](../../10-estado-atual/PROXIMO_PROMPT.md).

### 10.2. Para `ci-cd-github-mtr` (fase 10 opcional)

Quando autorizado, propor commit única ou em duas partes (código vs
docs) cobrindo:

- migration `src/sql/014_mtr_provisorio_kind.sql`;
- contratos OpenAPI + examples + `src/generated/operations.ts`;
- rotas / service / repo / validador MTR provisório;
- worker handler ramificado (`manifest.submit`/`manifest.print`);
- bloco isolado no gateway CETESB;
- camada Vue 3 (router, store, service, helpers, views, espelho de
  taxonomia);
- spec Playwright `mtr-provisorio-smoke.spec.ts` (10 cenários);
- documentação (CHANGELOG, estado-atual, PROXIMO_PROMPT,
  checkpoints 01–09, baseline arquitetural).

Validações pré-merge sugeridas (workflow `pre-commit` já existente):
`workflow: validate workspace`, `workflow: validate local (quick)`,
`test: contract`. Re-executar `test:integration` se F4 reaparecer.
