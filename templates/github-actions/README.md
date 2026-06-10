---
title: "Templates de GitHub Actions"
status: reference
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Templates de GitHub Actions (`templates/github-actions/`)

> Workflows **reutilizáveis** e o pipeline-modelo que um app copia para entrar na esteira. Esta
> pasta é a **referência canônica**; cada app/repo consome via `uses:` ou copiando o
> `app-pipeline-template.yaml`. Fluxo completo em
> [`../../docs/deployment-flow.md`](../../docs/deployment-flow.md) e
> [`../../docs/github-runner-setup.md`](../../docs/github-runner-setup.md).

## Conteúdo

| Arquivo | Papel |
|---|---|
| `app-pipeline-template.yaml` | Pipeline-modelo de um app: `discover` (lê `devops.yaml`) → `build` (matriz por serviço → GHCR) → `deploy` (runner self-hosted). Copie para `<app>/.github/workflows/`. |
| `reusable-build-push.yaml` | Workflow **reutilizável** (`workflow_call`): build multi-stage + push GHCR com cache. `runs-on: ubuntu-latest`. |
| `reusable-deploy-k8s.yaml` | Workflow **reutilizável**: `kubectl apply` + rollout + annotations de publicação. `runs-on: [self-hosted, windows, ...]` (precisa do cluster local). |
| `reusable-publish-package.yaml` | Publica `@flavioneto11/*` no GitHub Packages (tag/path-filter). |

## Relação com `.github/workflows/` da plataforma (importante)

- **`templates/github-actions/`** = a **fonte canônica** dos reutilizáveis, pensada para **apps
  externos** consumirem (`uses: FlavioNeto11/devops/.github/...@main` ou cópia).
- **`.github/workflows/`** (na raiz) = as **instâncias da própria plataforma** (incl. cópias
  funcionais dos reutilizáveis necessárias para `workflow_call` cross-repo, mais os gates próprios:
  `validate-docs`, `ci-apps`, `secret-scan`, `manifest-lint`, `publish-packages`).
- As duas **podem divergir** de propósito (a plataforma adiciona gates e ajustes locais). Por isso
  **não** há um gate que exija identidade byte-a-byte entre elas — a regra é: ao evoluir um
  reutilizável, atualize **ambos** os lugares conscientemente (a cópia em `.github/workflows/` é o
  que roda aqui; o template é o que outros copiam).

## Ao alterar um reutilizável

1. Edite a versão em `templates/github-actions/` (canônica).
2. Reflita a mudança na cópia equivalente em `.github/workflows/` (se a plataforma usa).
3. Teste num PR (o `ci-apps`/`validate-docs` cobrem o repo; o build/deploy reais dependem do runner).
