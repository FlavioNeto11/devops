---
name: implement-req
description: Implementa um requisito (REQ-ID) de forma autônoma a partir da ordem de trabalho gerada por make-work-order, abrindo um PR rastreável e atualizando o status de desenvolvimento. Use quando a esteira (req-implement) aciona a implementação de um requisito, ou para implementar um REQ manualmente do reqhub. NÃO mescla na main — sempre abre PR.
argument-hint: "<REQ-ID>"
---

# implement-req — implementar um requisito (headless, via PR)

Executa a "ordem de trabalho" de um requisito e abre um **PR rastreável**. É o passo da esteira
**requisito → Claude → PR** (`.github/workflows/req-implement.yml`). A autoria da intenção é no git
(`specs/requirements/**`); aqui a Claude implementa o **código** que satisfaz o requisito. Decisão e
contexto: [`docs/decisions/0002-requirements-as-source-of-truth.md`](../../docs/decisions/0002-requirements-as-source-of-truth.md);
fonte da verdade: [`specs/CLAUDE.md`](../../specs/CLAUDE.md).

## Regras inegociáveis (guardrails)

- **Nunca commitar na `main`.** Sempre trabalhar na branch `req/<REQ-ID>/r<revision>` e abrir PR.
- **Blast-radius pelo escopo**: só editar dentro de `allowed_paths` da ordem de trabalho (o produto do
  requisito + testes). **Proibido** tocar `platform/**`, `.github/workflows/**`, `*.secret.*`, `.env*`
  e os `specs/requirements/**` (a Claude implementa CÓDIGO, não reescreve o próprio requisito).
- **Escopo RESTRITO** (`restricted: true` — infra/CI/CD: keycloak/traefik/argocd/observability/platform/cicd):
  **não** implementar headless. Commitar **apenas** a atualização de `implementation-status.json` (status
  `blocked` + `notes` descrevendo a mudança proposta) — nada de código. A esteira abre **PR-rascunho** p/
  revisão humana. (O `guard-worktree` reprova qualquer outro arquivo num escopo restrito.)
- **Não mexer em segredos** (herda `.claude/settings.json`: deny `*.secret.yaml`, `.env`, force-push).
- **Não dar `git push` nem `gh pr create`.** A skill **commita só no branch local**; quem abre o PR é a
  esteira (`req-implement.yml`) **após** o `guard-worktree.mjs` validar o blast-radius (barreira técnica,
  não regra de prompt). Em uso manual, rode o guard você mesmo antes de abrir o PR.
- O **merge é gate externo** (branch protection + validação no ChatGPT → label `gpt-approved`, aplicado
  só por aprovador confiável). Nem a skill nem a esteira mesclam sem isso.

## Fluxo

1. **Ler a ordem de trabalho** (`work-order.json` do `make-work-order.mjs`): `req_id`, `revision`,
   `requirement` (statement, acceptance_criteria, verification_method, quality_scenarios), `impact`
   (vizinhança + allocation), `allowed_paths`, `restricted`, `pr_template`.
2. **Consultar a baseline** antes de agir (skill `/sync-spec`): `specs/baseline/current-baseline.json`
   e, para mudança de alto impacto/ASR, `/impact-review` (o conjunto afetado em `impact-map.json`).
3. **Se `restricted`** → não implementar código; ir ao passo 6 commitando só o status `blocked` (a esteira
   abre PR-rascunho para revisão humana).
4. **Implementar** dentro de `allowed_paths`: escrever/ajustar código + testes que satisfaçam os
   `acceptance_criteria`; para NFR, atender o `quality_scenario` (resposta + medida). Reusar utilitários
   existentes; seguir o estilo do app. Não introduzir dependências sem necessidade.
5. **Validar localmente** o que o app oferecer (lint/test/build do app afetado) antes de commitar.
6. **Branch + commit + status (sem push/PR)**:
   ```pwsh
   git checkout -b req/<REQ-ID>/r<revision>
   git add <arquivos dentro de allowed_paths>
   git commit -m "feat(<scope>): implementa <REQ-ID> — <título>"   # corpo com Closes-Req: <REQ-ID>
   node specs/tools/impl-status.mjs --set <REQ-ID> status=pr_open branch=<branch> commit=<sha> run_id=<id>  # status=blocked se restricted
   git add specs/baseline/implementation-status.json; git commit -m "chore(specs): status <REQ-ID>"
   # NÃO dar git push nem gh pr create — a esteira valida (guard-worktree) e abre o PR.
   ```
7. **Encerrar**: deixar o branch local pronto. A esteira roda `node specs/tools/guard-worktree.mjs
   --work-order work-order.json --changed-file <diff>` e, se aprovado, faz push + `gh pr create` (trailer
   `Closes-Req` + labels `requirement,claude-generated`; `--draft` se restrito). Não fazer merge nem deploy.

## Idempotência

Se a branch `req/<REQ-ID>/r<revision>` já existe (remota) ou `implementation-status` já marca
`pr_open|merged|deployed|done` nessa revisão → **não reprocessar** (encerrar com no-op).

## Rastreabilidade

O trailer `Closes-Req: <REQ-ID>` + label `claude-generated` ligam PR↔requisito; o
`implementation-status.json` (status/pr/branch/commit/run_id) aparece na aba **Desenvolvimento** do
reqhub e fecha em `deployed` quando o reconciliador lê as annotations do Deployment.
