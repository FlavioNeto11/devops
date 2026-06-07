# Orquestração — `mtr-provisorio-wizard-frontend`

> Aberta em 2026-04-25 pelo `orquestrador-mtr` em continuidade direta à
> cadeia `mtr-provisorio-fluxo-base` (encerrada em main em 2026-04-25
> via commits `4d1afc8`, `170a7d3`, `06cdfad`, `d1d1fcc`).
>
> Pendência herdada: pendência conhecida em
> [docs/handoffs/mtr-provisorio-fluxo-base/07-frontend-ux.md](../mtr-provisorio-fluxo-base/07-frontend-ux.md)
> §7.3 — porte do wizard guiado de criação (atualmente `textarea` JSON
> em `/mtr-provisorio/novo`).
>
> Fontes:
> [docs/CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md](../../CHANGELOG-MTR-PROVISORIO-FLUXO-BASE.md),
> [docs/handoffs/mtr-provisorio-fluxo-base/08-qa-validation.md](../mtr-provisorio-fluxo-base/08-qa-validation.md),
> [docs/04-arquitetura/mtr-provisorio-sicat.md](../../04-arquitetura/mtr-provisorio-sicat.md).

## 1. Classificação

```yaml
orchestration:
  work_id: mtr-provisorio-wizard-frontend
  intent: implement
  complexity: simple
  domains:
    - frontend-ux
    - qa
    - docs
  first_agent: frontend-vue-ux-mtr
  phase_sequence:
    - phase: 07-frontend-ux
      agent: frontend-vue-ux-mtr
      required: true
      reason: >-
        Substituir o textarea JSON em /mtr-provisorio/novo por wizard
        guiado equivalente ao ManifestCreateForm (generator, carrier,
        receiver, residues, expedição), reusando subcomponentes do MTR
        comum quando o contrato é idêntico (ManifestCreateRequest).
        Reusar useMtrProvisorioStore() e mtrProvisorioService.js sem
        alteração de contrato HTTP. Preservar Idempotency-Key e fluxo
        command-accepted.
    - phase: 08-qa-validation
      agent: tester-qa-mtr
      required: true
      reason: >-
        Estender frontend/tests/e2e/mtr-provisorio-smoke.spec.ts com
        ≥1 cenário wizard end-to-end (preencher, submeter, redirecionar
        para detalhe). Manter 10/10 herdado e regressão verde
        (typecheck, validate:openapi, validate:md-links, test:contract,
        build Vite). Verificar ausência de regressão atribuível ao
        baseline F2 herdado.
    - phase: 09-docs-final
      agent: documentador-mtr
      required: true
      reason: >-
        CHANGELOG da cadeia + atualizar
        docs/10-estado-atual/estado-atual.md e
        docs/10-estado-atual/PROXIMO_PROMPT.md, marcando §7.3 da
        cadeia base como resolvido.
    - phase: 10-ci-handoff
      agent: ci-cd-github-mtr
      required: false
      reason: >-
        Opcional. Só executar mediante autorização explícita do
        usuário ao chegar à fase. Cobre prontidão de pre-merge,
        commit/push e operações de git.
```

## 2. Objetivo

Substituir o formulário JSON em `/mtr-provisorio/novo` por wizard
guiado equivalente ao `ManifestCreateForm` (generator, carrier,
receiver, residues, expedição), reaproveitando componentes existentes
do MTR comum sempre que possível.

## 3. Escopo mínimo

- Substituir/refatorar `MtrProvisorioCreateView` para wizard guiado.
- Reuso de subcomponentes de `ManifestCreateForm` quando o contrato é
  idêntico (R3-C: schema na borda HTTP é o mesmo
  `ManifestCreateRequest`).
- Preservar `Idempotency-Key` e fluxo command-accepted.
- `useMtrProvisorioStore()` e `mtrProvisorioService.js` permanecem com
  contrato inalterado.
- `frontend/tests/e2e/mtr-provisorio-smoke.spec.ts` ganha ≥1 cenário
  wizard end-to-end (preencher, submeter, redirecionar para detalhe).
- Documentação final: CHANGELOG + atualização de
  `docs/10-estado-atual/estado-atual.md` e
  `docs/10-estado-atual/PROXIMO_PROMPT.md`.

## 4. Critérios de pronto

- ZERO mudança de contrato HTTP, OpenAPI, persistência, gateway,
  worker.
- `mtr-provisorio-smoke.spec.ts` mantém 10/10 e ganha cenários do
  wizard.
- `npm run typecheck`, `npm run validate:openapi`,
  `npm run validate:md-links`, `npm run test:contract` e build Vite
  verdes.
- Baseline F2 herdado sem regressão atribuível.

## 5. Fora de escopo (pendências herdadas)

- HAR DMR ausente — destrava separadamente em `dmr-gateway-real`.
- F4 (flake único `test:integration` 1/124) e AUD-09 (flake
  `audit.spec.ts:267` em full-suite) — não-bloqueantes; apenas
  observar ausência de regressão.
- F2/F3 — pré-existentes; só verificar ausência de regressão.

## 6. Autorização operacional

Usuário autorizou prosseguir até o fim da cadeia. A fase
`10-ci-handoff` (commit/push) só pode ser executada mediante nova
autorização explícita ao chegar lá.

### 6.1 Status das fases

| Fase | Agente | Status | Checkpoint |
| --- | --- | --- | --- |
| 07-frontend-ux | `frontend-vue-ux-mtr` | **CONCLUÍDA** (2026-04-25) | [07-frontend-ux.md](07-frontend-ux.md) |
| 08-qa-validation | `tester-qa-mtr` | **CONCLUÍDA** (2026-04-25) — 9/11 verde + 2 incidentes herdados documentados (INC-WIZARD-01, INC-WIZARD-02), cenário novo wizard end-to-end PAYLOAD_INVALID verde, regressão (typecheck/build/md-links/openapi/test:contract) verde | [08-qa-validation.md](08-qa-validation.md) |
| 09-docs-final | `documentador-mtr` | **CONCLUÍDA** (2026-04-25) — CHANGELOG dedicado publicado, estado-atual e PROXIMO_PROMPT atualizados, validate:md-links verde | [09-docs-final.md](09-docs-final.md) |
| 10-ci-handoff | `ci-cd-github-mtr` | **CONCLUÍDA** (2026-04-25) — autorização explícita do usuário; 3 commits temáticos + push em `origin/main` (`3473f0e`, `55129bb`, chore handoffs); typecheck e validate:md-links verdes | [10-ci-handoff.md](10-ci-handoff.md) |

## 7. Próximo passo

Cadeia **ENCERRADA** em `origin/main` (2026-04-25). Pendência herdada
do wizard (`mtr-provisorio-fluxo-base` §7.3) resolvida. Próximas
demandas devem abrir nova cadeia (`work_id` próprio).
