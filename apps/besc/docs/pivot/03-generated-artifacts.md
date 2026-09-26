---
title: "Pivot ADR-010 — política de artefatos gerados"
status: canonical
applies_to: [besc]
updated: 2026-09-26
language: pt-BR
---

# Artefatos gerados no PR do pivot

Cerca de 13,5 mil das ~22 mil linhas adicionadas pela branch são artefatos gerados. Nenhum foi
removido: todos são evidência de antes/depois ou entrada de runtime. Para reduzir o ruído do PR sem
perder auditabilidade, `apps/besc/.gitattributes` marca-os como `linguist-generated=true` (o GitHub
os recolhe na revisão; `git diff` local continua mostrando o conteúdo).

| Arquivo | Classe | Por que fica versionado | Como regenerar |
|---|---|---|---|
| `api/seed/content-classification.json` | SOURCE | Decisão editorial escrita à mão (natureza e publicação de cada item da biblioteca). | Editar à mão. |
| `api/seed/jurisprudence-reassessment.json` | CANONICAL_GENERATED | Entrada de runtime da API; a fonte (tabela das 99 decisões) está em OUTRO repositório (`besc`, `docs/reconciliation/_notas/jurisprudencia-devops-reavaliacao.md`), então o CI não conseguiria gerá-lo. | `node apps/besc/tools/gen-jurisprudence-assessment.mjs <caminho da tabela>` |
| `docs/pivot/product-freeze-audit.before.summary.json` | CANONICAL_GENERATED | Retrato do Passo 1 (regras iniciais) que fundamentou o congelamento. | Ferramenta do commit `0fda8860` sobre `61b8cd6c`. |
| `docs/pivot/product-freeze-audit.before-v2.summary.json` | CANONICAL_GENERATED | "Antes" com as regras finais, base da comparação justa. | `tools/product-freeze-audit.mjs --label before-v2` sobre um worktree de `61b8cd6c`. |
| `docs/pivot/product-freeze-audit.after.summary.json` | CANONICAL_GENERATED | "Depois" desta branch: DANGEROUS 0, MISLEADING 0. | `node apps/besc/tools/product-freeze-audit.mjs --label after` |
| `docs/pivot/product-freeze-audit.before.csv` | REPRODUCIBLE_GENERATED (mantido) | Evidência linha a linha do Passo 1. | Como o summary correspondente. |
| `docs/pivot/product-freeze-audit.before-v2.csv` | REPRODUCIBLE_GENERATED (mantido) | Evidência linha a linha do "antes" comparável. | Como o summary correspondente. |
| `docs/pivot/product-freeze-audit.after.csv` | REPRODUCIBLE_GENERATED (mantido) | Evidência linha a linha do "depois". | Como o summary correspondente. |
| `frontend/dist/`, `api/data/`, relatórios do dry run, imagens `:parity` | TEMPORARY | Não versionados (`.gitignore` ou fora do repositório). | Build, teste ou `tools/test-in-production-runtime.sh`. |

Regra para o futuro: um artefato só entra no git se for entrada de runtime, decisão editorial ou
evidência citada por um documento canônico. Qualquer outro gerado fica fora do repositório.
