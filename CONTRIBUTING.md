---
title: "Contribuindo com a Plataforma DevOps"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Contribuindo com a Plataforma DevOps (`C:\devops`)

> Monorepo da plataforma DevOps local (Windows Server + Kubernetes do Docker Desktop). Idioma:
> texto em **pt-BR**; código/identificadores/YAML em **inglês**.
>
> **Agentes de IA (Claude/Copilot):** comecem por [`CLAUDE.md`](CLAUDE.md) + [`AGENTS.md`](AGENTS.md).

## Mapa rápido
- **Estrutura do repo**: [`docs/contributing/repo-structure.md`](docs/contributing/repo-structure.md).
- **Índice da documentação**: [`docs/README.md`](docs/README.md).
- **Padrões** (FR/NFR/infra/golden-path/libs): [`docs/standards/`](docs/standards/).
- **Runbooks**: [`docs/runbooks/`](docs/runbooks/).
- **Camada de agentes/meta-docs**: [`CLAUDE.md`](CLAUDE.md) + [`AGENTS.md`](AGENTS.md) (raiz) e por
  escopo; como escrevê-los em [`docs/standards/meta-doc-standard.md`](docs/standards/meta-doc-standard.md).
- **Estilo de docs**: [`docs/standards/documentation-style.md`](docs/standards/documentation-style.md).
- **Contrato `devops.yaml`**: [`docs/new-project-contract.md`](docs/new-project-contract.md) + schema
  [`schema/devops-schema.json`](schema/devops-schema.json).

## Adicionar um app novo
Siga o **golden path**: [`docs/standards/golden-path.md`](docs/standards/golden-path.md). Em uma linha:
`devops.yaml → new-app.ps1 → app-template/k8s → build :local/CI → Argo Application`.

## Regras inegociáveis
> Lista consolidada e autoritativa em [`docs/standards/hard-constraints.md`](docs/standards/hard-constraints.md).
- **Nenhum segredo no git.** `*.example` com placeholders + **Sealed Secrets** (cifrado) versionado;
  segredo real fora do git e excluído do `kustomization.yaml`. Ver [`SECURITY.md`](SECURITY.md).
- **Windows/PowerShell 7**, caminhos `C:\...`, scripts **idempotentes**. Nunca assuma Linux.
- **Contrato de labels e roteamento** ([infra-standards](docs/standards/infra-standards.md)) é HARD —
  o Console e o Traefik dependem dele.
- **Requests/limits** em todo container ([NFR](docs/standards/non-functional-requirements.md)).

## Commits
- Mensagens convencionais: `feat(scope): …`, `fix(scope): …`, `docs:`, `refactor:`, `chore:`, `ci:`.
- Pequenos e revisáveis; um assunto por commit.
- Rodapé exigido:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

## Reúso entre projetos
Código compartilhado vive em [`packages/`](packages/) como pacotes versionados `@flavioneto11/*`
(ver [`docs/standards/shared-libraries-and-versioning.md`](docs/standards/shared-libraries-and-versioning.md)).
Adoção é **incremental e reversível** (caminho antigo atrás de flag por 1 ciclo — ver
[deprecation-policy](docs/standards/deprecation-policy.md)).

## Testes & build (por app)
- SICAT (npm): `cd apps/sicat && npm test`. GymOps (pnpm): `cd apps/gymops && pnpm -r test`.
- Build de imagem (lab): `docker build -t <app>-<svc>:local ...` → `kubectl apply` / `scripts/publish-app.ps1`.
- Validar: `http://xpto.localhost/<app>` + `/<app>/api/health`; conferir no Console `/devops`.

## Gestão do desenvolvimento
Bugs/features/evoluções e tasks (começo-meio-fim) por projeto ficam no módulo **Projetos & Tarefas**
do Console (`/devops`) — a partir da Fase 3. A fonte do estado de cada app é
[`docs/standards/fr/`](docs/standards/fr/).
