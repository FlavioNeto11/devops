---
title: "ADR 0002 — Requisitos versionados como fonte da verdade (app-over-repo)"
status: canonical
applies_to: [platform]
updated: 2026-06-14
language: pt-BR
---

# ADR 0002 — Requisitos versionados como fonte da verdade (_app-over-repo_)

**Estado:** Aceito · **Data:** 2026-06-14 · **Escopo:** `specs/`, `.claude/`, governança de CI

## Contexto

A plataforma hospeda múltiplos produtos (SICAT, GymOps, CMS/portal-builder) que evoluíam **a partir do
código e de conversas**, sem uma fonte única e versionada da **intenção** (requisitos funcionais e
não-funcionais, critérios de aceite, dependências, impactos). Faltavam três coisas: (1) um lugar
canônico onde requisito é cidadão de primeira classe — não um card de task; (2) **versão e governança**
de mudança (o que mudou, é compatível ou não, o que é afetado); (3) uma forma de o **Claude** consumir
essa intenção sem depender de memória de sessão (efêmera e por máquina).

Uma pesquisa aprofundada (engenharia de requisitos: SEI quality-attribute scenarios; ISO/IEC/IEEE
42010 views/viewpoints; ADRs; _spec-driven development_ para times com IA) recomendou um desenho
**app-over-repo**: uma aplicação de autoria/análise por cima de **artefatos versionados** no git, com
o Claude consumindo uma **visão gerada e validada** dessa base.

## Decisão

Adotar **requisitos versionados como fonte da verdade**, em camadas:

1. **Artefato canônico** (`specs/requirements/<produto>/REQ-*.yaml`, schema em
   `specs/schema/requirement.schema.json`): identidade, **escopo explícito + herança** (evita
   duplicação entre produtos), conteúdo, verificação, **NFR como _quality attribute scenario_**,
   **rastreabilidade tipada** (`links[]`), **versionamento semântico** (`semantic_change`
   patch/minor/major) e **alocação** (arquitetura/infra/ADR/serviço/SLO como artefatos _derivados_).
2. **Baseline gerada e commitada** (`specs/baseline/{current-baseline,impact-map,retrieval-manifest}.json`)
   por `specs/tools/build-baseline.mjs` — **determinística** (sem timestamp, ordenada, com
   `baseline_hash`), com `impact_score` (5 fatores) e `reprocess_queue`.
3. **Ponte para o Claude**: `specs/CLAUDE.md` define a regra "não decidir sem consultar a baseline";
   skills `/sync-spec`, `/impact-review`, `/baseline-diff` operam o fluxo. O `CLAUDE.md` aponta para os
   artefatos — não os duplica.
4. **Governança no CI**: `specs-governance.yml` (sempre executado) valida schema + integridade e
   **falha em drift** (baseline desatualizada); `specs-diff.yml` publica o **relatório de impacto** no
   PR. `CODEOWNERS` exige revisão do dono em `specs/`.

## Alternativas consideradas

- **Board de tarefas (Trello/Jira/Projects)**: rejeitado — modela _tarefa_, não _requisito como um
  todo_; não dá rastreabilidade/impacto nem fonte de verdade versionada para o agente.
- **Só documento (docs/ em prosa)**: rejeitado — não é estruturado/validável; sem schema, impacto e
  versão semântica viram texto solto.
- **Banco de dados como fonte primária**: rejeitado para a _fonte da verdade_ — perde diff/revisão/
  histórico do git e a governança por PR. (O **workbench** da fase 2 lerá a base e usará banco só para
  busca/índice; o git continua canônico.)
- **Hook global bloqueante já nesta fase**: adiado — um `PreToolUse` que roda em toda edição do repo
  adiciona latência e risco; o gate real de bloqueio é o **CI** (specs-governance). O hook fica
  documentado como _opt-in_ (`scripts/specs-baseline-check.ps1`).

## Consequências

**Positivas:** intenção explícita, versionada e revisável; impacto e cobertura calculáveis (grafo);
Claude consome contexto confiável e schema-validado, com atenção obrigatória em ruptura; arquitetura/
infra passam a responder aos requisitos. Base inicial semeada de requisitos **reais** dos 3 produtos
(69 itens) — não fictícios.

**Negativas / trade-offs:** `specs/baseline/*.json` é gerado **e** commitado → exige regenerar +
commitar junto (mitigado pelo drift-check do CI e pela skill `/sync-spec`); `specs/tools` traz uma dep
(`ajv`/`yaml`) e `npm ci` no CI; a rastreabilidade inicial é **REQ→REQ** (curada em
`tools/seed-links.json`) — evidências de verificação e links a **artefatos externos** (ADR/serviço/
infra/SLO/teste) ficam para a iteração/UI (por isso vários itens nascem na `reprocess_queue` — é
honesto, não dívida oculta). Validação de artefatos externos hoje cobre **ADR** (por path em
`docs/decisions/`); um **registry** de serviço/infra/SLO/teste é trabalho da Fase 2.

**Governança de versão:** o gate `specs-diff` roda `diff-baseline.mjs --enforce` no PR — se um requisito
muda em campo semântico (statement, scope, links, quality_scenarios, status, prioridade, ASR…) sem
**versionar** (`item_revision` incrementado + `semantic_change` ≠ `none` + `change_reason`), o PR
**falha**. Esse é o mecanismo que torna toda alteração uma "questão de versão". O metamodelo é
versionado (`metamodel_version` na baseline; `schema_version` opcional no artefato).

**Próxima fase:** **workbench** (app no _golden path_) com as 6 telas (Explorador, Workspace, Diff,
Mapa de impacto, Cobertura arquitetural, Fila de reprocessamento), busca estruturada + semântica e
acessibilidade WCAG 2.2 — lendo esta mesma base.
