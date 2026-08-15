---
name: baseline-diff
description: Mostra o que mudou na base de requisitos entre dois pontos do git (ou vs. a baseline commitada) e classifica as mudanças em patch/minor/major. Use para revisar um PR que toca specs/, gerar um change-report, ou entender a evolução dos requisitos.
argument-hint: "[ref-base] [ref-alvo]"
---

# baseline-diff — diff e classificação de mudanças de requisitos

Compara o estado da base de requisitos entre versões e classifica a natureza das mudanças, para que
o risco seja visível antes do merge. Complementa o gate de CI `specs-diff` (que posta o relatório no PR).

## Conceito

- A baseline é **determinística** (sem timestamp, ordenada, com `baseline_hash`): dois estados do git
  produzem baselines comparáveis campo a campo.
- Classificação por `version.semantic_change` de cada requisito alterado:
  **patch** (editorial), **minor** (compatível), **major** (incompatível). Requisitos **novos**/
  **removidos**/**deprecados** e mudança de **ASR** merecem destaque.

## Fluxo

1. **Definir o intervalo**: `ref-base` (ex.: `origin/main` ou `HEAD~1`) e `ref-alvo` (default `HEAD`/
   working tree).
2. **Obter as duas baselines**: regenere/`git show` `specs/baseline/current-baseline.json` em cada ref
   (ou regenere com `node specs/tools/build-baseline.mjs` no working tree).
3. **Diferenciar por `id`**: adicionados, removidos, alterados (comparar campos: `statement`,
   `acceptance_criteria`, `quality_scenarios`, `links`, `status`, `version.*`).
4. **Classificar e priorizar**: agrupar por `semantic_change`; destacar **major**, **ASR** e itens que
   entram/saem da `reprocess_queue`; somar deltas de `impact_score`.
5. **Reportar (change-report)**: tabela {id, título, tipo de mudança, semantic_change, artefatos
   afetados}. Em mudança major/ASR, encadear a skill **impact-review**.

## Atalhos

- Drift local (baseline vs. requisitos no working tree): `scripts/specs-baseline-check.ps1`.
- Diff cru de um requisito: `git diff <ref-base> -- specs/requirements/<produto>/REQ-XXXX.yaml`.
