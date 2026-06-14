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

- **APENAS edite arquivos — NÃO use git.** A esteira (`req-implement.yml`) faz TODO o git: cria a branch
  `req/<REQ-ID>/r<revision>`, captura suas edições, valida com o `guard-worktree`, commita e abre o PR.
  Você só edita arquivos (e roda test/build); não há git no seu allowlist. (Em uso manual, deixe as
  edições no working tree e rode o guard + abra o PR você mesmo.)
- **Blast-radius pelo escopo**: só editar dentro de `allowed_paths` da ordem de trabalho (o produto do
  requisito + testes). **Proibido** tocar `platform/**`, `.github/workflows/**`, `*.secret.*`, `.env*`,
  `.claude/**`, `specs/**` (você implementa CÓDIGO, não reescreve o próprio requisito nem a baseline).
  O `guard-worktree` reprova (sem PR) qualquer arquivo fora de `allowed_paths`/denylist.
- **Escopo RESTRITO** (`restricted: true` — infra/CI/CD: keycloak/traefik/argocd/observability/platform/cicd):
  **não** implementar headless — não edite nada de código (o guard reprova tudo fora de allowed_paths, que é
  vazio). A esteira abre **PR-rascunho** p/ revisão humana.
- **Não mexer em segredos** (herda `.claude/settings.json`: deny `*.secret.yaml`, `.env`).
- O **merge é gate externo** (branch protection + validação no ChatGPT → label `gpt-approved`, aplicado
  só por aprovador confiável). Nem você nem a esteira mesclam sem isso.

## Fluxo

1. **Ler a ordem de trabalho** (`work-order.json` do `make-work-order.mjs`): `req_id`, `revision`,
   `requirement` (statement, acceptance_criteria, verification_method, quality_scenarios), `impact`
   (vizinhança + allocation), `allowed_paths`, `restricted`, `pr_template`.
2. **Consultar a baseline** antes de agir (skill `/sync-spec`): `specs/baseline/current-baseline.json`
   e, para mudança de alto impacto/ASR, `/impact-review` (o conjunto afetado em `impact-map.json`).
3. **Se `restricted`** → não editar nada (a esteira abre PR-rascunho para revisão humana). Encerrar.
4. **Implementar** dentro de `allowed_paths`: escrever/ajustar código + testes que satisfaçam os
   `acceptance_criteria`; para NFR, atender o `quality_scenario` (resposta + medida). Reusar utilitários
   existentes; seguir o estilo do app. Não introduzir dependências sem necessidade.
5. **Validar localmente** o que o app oferecer (`npm test`, `npm run build`, `node --test` etc.).
6. **Encerrar deixando as edições no working tree — SEM git.** A esteira captura (`git add -A`), valida com
   `node specs/tools/guard-worktree.mjs
   --work-order work-order.json --changed-file <diff>` e, **se aprovado**, atualiza `implementation-status`
   (status `pr_open`), faz push + `gh pr create` (trailer `Closes-Req` + labels `requirement,claude-generated`;
   `--draft` se restrito) — **só esse passo da esteira tem credencial git**. Não fazer merge nem deploy.

## Idempotência

Se a branch `req/<REQ-ID>/r<revision>` já existe (remota) ou `implementation-status` já marca
`pr_open|merged|deployed|done` nessa revisão → **não reprocessar** (encerrar com no-op).

## Rastreabilidade

O trailer `Closes-Req: <REQ-ID>` + label `claude-generated` ligam PR↔requisito; o
`implementation-status.json` (status/pr/branch/commit/run_id) aparece na aba **Desenvolvimento** do
reqhub e fecha em `deployed` quando o reconciliador lê as annotations do Deployment.
