# 00 — Orquestração: Centro Operacional SICAT

## Demanda original (resumo)

Evoluir o SICAT do estágio "núcleo operacional CETESB/MTR/CDF estável" para um
**Centro Operacional SICAT**: camada de operação, observabilidade, governança,
diagnóstico e relatórios dedicados, preparando base estrutural para um futuro
chat orquestrador (Command Center). Objetivo é amadurecer a solução para
postura de produto SaaS enterprise, sem reescrever o núcleo já consolidado.

A demanda combina múltiplos verbos operacionais (validar, documentar,
implementar, testar, sugerir commit) e múltiplos owners (docs, backend,
postgres/queue, observability, frontend, qa, ci). Por política de delegação,
o orquestrador NÃO executa as fases — apenas classifica, abre checkpoints e
encaminha ao primeiro especialista.

## Classificação

```yaml
orchestration:
  work_id: "centro-operacional-sicat"
  intent: "implement"
  complexity: "complex"
  domains:
    - "docs"
    - "backend-contract"
    - "persistence-worker"
    - "observability-admin"
    - "frontend-ux"
    - "qa"
  first_agent: "documentador-mtr"
  phase_sequence:
    - phase: "01-baseline-docs"
      agent: documentador-mtr
      required: true
      reason: >
        Antes de qualquer implementação é preciso garantir baseline documental:
        AGENTS.md, docs/10-estado-atual/estado-atual.md,
        docs/_inputs/fonte-de-verdade-backlog-cto.md, docs/04-arquitetura/centro-operacional-sicat.md.
    - phase: "02-backend-contracts"
      agent: programador-backend-mtr
      required: true
      reason: >
        Implementar/consolidar endpoints /v1/operations/overview, /v1/jobs/*,
        /v1/audit/*, /v1/cetesb/*/health, /v1/reports/mtrs e atualizar OpenAPI +
        operations geradas + exemplos.
    - phase: "03-persistence-queue"
      agent: postgres-queue-mtr
      required: true
      reason: >
        Suporte a jobs/search, retry manual, eventos por job, agregações de
        DLQ/retry e queries de auditoria por correlationId.
    - phase: "04-observability-admin"
      agent: dashboard-observability-mtr
      required: true
      reason: >
        Consolidar overview operacional, KPIs, taxonomia de status/erros
        operacionais (docs/05-operacao/taxonomia-status-erros-operacionais.md)
        e mapping label/severity/recommendedAction/retryable.
    - phase: "05-frontend"
      agent: frontend-vue-ux-mtr
      required: true
      reason: >
        Páginas Vue 3: operations-dashboard, jobs-console, audit-explorer,
        cetesb-accounts-health, mtr-reports, command-center (base com registry).
    - phase: "06-localhost"
      agent: estrutura-vscode-mtr
      required: false
      reason: >
        Disponibilizar stack local para validação humana das novas páginas
        antes do QA. Acionar somente se o usuário pedir validação navegável.
    - phase: "07-qa"
      agent: tester-qa-mtr
      required: true
      reason: >
        typecheck, npm test, validate:openapi, validate:cetesb-source,
        validate:har-gateway, frontend build + test:ui (Playwright) cobrindo
        os novos módulos.
    - phase: "08-docs-final"
      agent: documentador-mtr
      required: true
      reason: >
        Atualizar README.md, docs/README.md, docs/10-estado-atual/estado-atual.md
        e gerar docs/10-estado-atual/PROXIMO_PROMPT.md apontando próxima frente
        (DMR, MTR provisório, CDF especializado, armazenamento temporário ou
        chat generativo).
    - phase: "09-ci-handoff"
      agent: ci-cd-github-mtr
      required: false
      reason: >
        Apenas se o usuário autorizar commit/push. Ownership de operações git
        permanece com este especialista; orquestrador não comita nem faz push.
```

## Critérios de pronto (transversais)

- AGENTS.md, docs/10-estado-atual/estado-atual.md,
  docs/_inputs/fonte-de-verdade-backlog-cto.md existem e refletem o estado real.
- docs/04-arquitetura/centro-operacional-sicat.md e
  docs/04-arquitetura/command-center-sicat.md publicados.
- docs/05-operacao/taxonomia-status-erros-operacionais.md publicado e referenciado
  pelo backend e frontend.
- Endpoints operacionais publicados em OpenAPI e implementados em
  src/routes + src/services + src/repositories sem violar a fronteira do
  gateway (CETESB continua isolada em src/gateways/cetesb-gateway.js).
- Frontend com módulos operations-dashboard, jobs-console, audit-explorer,
  cetesb-accounts-health, mtr-reports e base de command-center com registry.
- Testes backend e Playwright cobrindo os novos fluxos.
- README.md, docs/README.md e estado-atual.md coerentes.
- docs/10-estado-atual/PROXIMO_PROMPT.md gerado.
- Nenhum item marcado IMPLEMENTADO sem evidência em código/testes/docs.

## Checkpoints esperados

- docs/handoffs/centro-operacional-sicat/01-baseline-docs.md
- docs/handoffs/centro-operacional-sicat/03-backend-contracts.md
- docs/handoffs/centro-operacional-sicat/04-persistence-worker.md
- docs/handoffs/centro-operacional-sicat/07-observability-admin.md
- docs/handoffs/centro-operacional-sicat/06-frontend-ux.md
- docs/handoffs/centro-operacional-sicat/09-qa-validation.md
- docs/handoffs/centro-operacional-sicat/10-documentation-final.md

## Restrições e invariantes

- Preservar fronteira route → service → repository → job → worker → gateway.
- Toda comunicação CETESB permanece em src/gateways/cetesb-gateway.js.
- Preservar correlationId, jobId, commandId, sessionContextId,
  integrationAccountId entre camadas.
- Erros como application/problem+json.
- Async commands continuam retornando 202 com command-accepted.
- Idempotency-Key continua válido para endpoints de comando (ex: retry).
- Não inventar backend de IA: command-center é apenas registry + UI base.
- Não marcar nada como IMPLEMENTADO sem evidência.

## Próximo passo

Encaminhar para `documentador-mtr` iniciar a fase 01-baseline-docs.
Se o runtime não conseguir invocar subagent, retornar
`next_agent_required: documentador-mtr` com prompt pronto.

## Status das fases

- [x] 01-baseline-docs — `documentador-mtr` (concluída) — checkpoint:
  `docs/handoffs/centro-operacional-sicat/01-baseline-docs.md`
- [x] 02-backend-contracts — `programador-backend-mtr` (concluída) — checkpoint:
  `docs/handoffs/centro-operacional-sicat/03-backend-contracts.md`
- [x] 03-persistence-queue — `postgres-queue-mtr` (concluída) — checkpoint:
  `docs/handoffs/centro-operacional-sicat/04-persistence-worker.md`
- [x] 04-observability-admin — `dashboard-observability-mtr` (concluída) — checkpoint:
  `docs/handoffs/centro-operacional-sicat/07-observability-admin.md`
- [x] 05-frontend — `frontend-vue-ux-mtr` (concluída) — checkpoint:
  `docs/handoffs/centro-operacional-sicat/06-frontend-ux.md`
- [ ] 06-localhost — `estrutura-vscode-mtr` (opcional, pulada — sem setup novo)
- [x] 07-qa — `tester-qa-mtr` (concluída — 2026-04-25) — checkpoint:
  `docs/handoffs/centro-operacional-sicat/09-qa-validation.md`.
  Resumo: typecheck, validate:openapi (1 link quebrado pré-existente
  registrado), validate:cetesb-source, validate:har-gateway,
  test:api (23/23), test:integration (124/124), test:worker (14/14),
  test:contract (4/4), test:source-of-truth (6/6), unit+contract+smoke
  agregados (120/120), frontend build OK, nova spec
  `tests/ui/centro-operacional.spec.ts` (6/6), regressão audit +
  validation-e2e (15/15), smoke:health (7/7), smoke:openapi (2/2).
  Suíte Playwright completa: 49 passed / 15 failed pré-existentes /
  11 did not run — falhas herdadas das cadeias
  `homepage-canvas-continuous-storytelling` e da camada conversacional.
- [x] 08-docs-final — `documentador-mtr` (concluída — 2026-04-25) —
  checkpoint: `docs/handoffs/centro-operacional-sicat/10-documentation-final.md`.
  Resumo: README.md, docs/README.md, docs/10-estado-atual/estado-atual.md
  e 06-frontend-ux.md (F1 corrigido) atualizados; criados
  `docs/CHANGELOG-CENTRO-OPERACIONAL.md` e
  `docs/10-estado-atual/PROXIMO_PROMPT.md` (próxima frente: DMR —
  Frente 2 do backlog CTO). Texto de commit sugerido registrado no
  checkpoint final (não comitado).
- [x] 09-ci-handoff — `ci-cd-github-mtr` (concluída — 2026-04-25) —
  checkpoint: `docs/handoffs/centro-operacional-sicat/11-ci-handoff.md`.
  Commit `bfb1d0d` (55 arquivos) + commit `025d35e` (handoff CI)
  publicados em `origin/main` via `git push origin main`
  (range `7d0974d..025d35e`). Após `gh auth login` realizado pelo
  usuário (escopo `repo`), `git ls-remote origin` validou acesso e o
  push foi executado sem `--force`, sem `--no-verify` e sem alteração
  de URL do `origin`. URLs públicas:
  <https://github.com/FlavioNeto11/sicat/commit/bfb1d0d1c876bcff9f13a73550228b8c0df3bd01>
  e <https://github.com/FlavioNeto11/sicat/commit/025d35e>.

**Status global da cadeia: ✅ ENCERRADA — COMMIT + PUSH PUBLICADOS EM `origin/main` (2026-04-25).**

`next_agent`: **(nenhum — cadeia encerrada)**
`next_phase`: **n/a**
