---
title: "specs/ — Base de requisitos (fonte da verdade orientada por requisitos)"
status: canonical
applies_to: [platform]
updated: 2026-06-14
language: pt-BR
---

# `specs/` — base de requisitos (fonte da verdade)

Estrutura de **cadastro de requisito e negócio** versionada que dirige a evolução da plataforma. A
aplicação evolui **a partir dos requisitos** (funcionais e não-funcionais) + arquitetura/infra — e não
o contrário. Os artefatos aqui são consumidos por **humanos** (workbench, fase 2) e pelo **Claude**
(via baseline gerada). Decisão e contexto: [`docs/decisions/0002-requirements-as-source-of-truth.md`](../docs/decisions/0002-requirements-as-source-of-truth.md).

## Layout

| Caminho | O que é |
|---|---|
| `schema/requirement.schema.json` | Contrato canônico do artefato de requisito (JSON Schema 2020-12). |
| `requirements/<produto>/REQ-*.yaml` | Artefatos versionados — **a fonte da verdade**. Um arquivo por requisito. |
| `baseline/current-baseline.json` | **Gerado.** Todos os requisitos + métricas + `impact_score` + `reprocess_queue`. |
| `baseline/impact-map.json` | **Gerado.** Grafo de rastreabilidade (nós: requisitos+artefatos; arestas: links tipados). |
| `baseline/retrieval-manifest.json` | **Gerado.** Índice `id → arquivo` para recuperação do Claude. |
| `baseline/coverage-report.json` | **Gerado.** Métrica "da cobertura": por escopo e total, requisitos SEM link/alocação/origem/evidência/método. |
| `tools/` | Gerador (`build-baseline.mjs`), `coverage-report.mjs`, seeder (`seed.mjs`), `impl-status`/`make-work-order`/`guard-worktree` e deps. |

> **Enforce de origem (sem fabricação):** cada requisito declara `source.source_paths` (caminhos REAIS,
> relativos à raiz do repo) e o `build-baseline` **falha** se algum não existir. Fecha a pergunta "sem fabricar".

> `baseline/*.json` é **gerado E commitado**, e precisa estar **em dia** com `requirements/**` — o CI
> `specs-governance` falha em drift. Nunca edite a baseline à mão.

## O artefato de requisito (blocos)

Identidade (`id`, `slug`, `title`, `type`, `status`, `owner`) · **Escopo explícito + herança**
(`scope.applies_to`/`product_scope`/`capability` — evita duplicação entre produtos) · Conteúdo
(`statement`, `business_rationale`, `source`) · Prioridade/criticidade · **ASR**
(`architectural_significance`) · Verificação (`acceptance_criteria`, `verification_method`,
`evidence_links`) · **NFR** como *quality attribute scenario* (`quality_scenarios[]`, SEI) ·
**Rastreabilidade** tipada (`links[]`) · **Versionamento** semântico (`version.baseline_version`,
`item_revision`, `semantic_change`) · **Alocação** (`allocation.{architecture,infra,adr,service,slo}_refs`).

## Fluxo de trabalho

```powershell
# 1) ler a baseline antes de decidir (fonte da verdade da intenção)
#    specs/baseline/current-baseline.json

# 2) editar/criar requisitos em specs/requirements/<produto>/REQ-*.yaml
#    (incrementar version.item_revision + classificar semantic_change)

# 3) regenerar a baseline
C:\devops\scripts\specs-baseline-check.ps1 -Fix      # = npm run build (em specs/tools)

# 4) checar drift (o que o CI valida)
C:\devops\scripts\specs-baseline-check.ps1           # node build-baseline.mjs --check

# 5) commitar requisitos + baseline JUNTOS
```

Skills do Claude: **`/sync-spec`** (sincronizar/regerar), **`/impact-review`** (impacto de uma
mudança), **`/baseline-diff`** (diff/classificação entre versões). Regra de consumo do Claude:
[`specs/CLAUDE.md`](./CLAUDE.md).

## Bootstrap

A base cobre **toda a plataforma** — 19 escopos: produtos (sicat, gymops, cms, rmambiental, anarabottini,
portal, portal-recorder, reqhub), componentes (console, argocd, traefik, keycloak, observability, platform)
e transversais (ai, oidc, specs, cicd, portal-contracts). Requisitos **reais** extraídos do código/docs por
mapeamento multi-agente (`tools/seed-input.json` → `tools/seed.mjs`; `seed.mjs` é genérico — entradas
auto-descritivas). Links cross-área (apps→OIDC/Keycloak/Traefik/AI/observability/portal-contracts;
reqhub→specs) em `tools/seed-links.json` conectam o mapa de impacto. A **rastreabilidade inicial** (`links` REQ→REQ de alta
confiança) é curada em `tools/seed-links.json` (alimenta o mapa de impacto). Já as **evidências de
verificação** (`evidence_links`) e os links para **artefatos externos** (ADR/serviço/infra/SLO/teste)
são **autorados na iteração/UI** — não foram fabricados no bootstrap; por isso vários itens aparecem,
de propósito, na `reprocess_queue` (motivos em `reasons`: alto impacto · sem método · sem evidência ·
mudança major). Sugestões automáticas de link entram em `suggested_links` (marcadas `proposed`, sem
contaminar o `links` canônico). **Não re-rode o `seed` sobre conteúdo já autorado** (é bootstrap).
