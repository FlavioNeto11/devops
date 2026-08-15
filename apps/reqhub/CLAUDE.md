---
title: "Reqhub — Manual para Claude Code"
status: canonical
applies_to: [reqhub]
updated: 2026-07-02
language: pt-BR
---

# Reqhub — Manual para Claude Code

> **Comece por aqui.** Fronteiras de operação: [`AGENTS.md`](./AGENTS.md) (leia antes de agir).
> Plataforma: [`../../CLAUDE.md`](../../CLAUDE.md). Máquina: [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md).
> **Base de requisitos** (a fonte que este app visualiza): [`../../specs/README.md`](../../specs/README.md) +
> [`../../specs/CLAUDE.md`](../../specs/CLAUDE.md). **Não duplique** esses conteúdos — aponte.

## O que é o Reqhub

**Workbench + Product Studio** da base de requisitos (ver
[`../../docs/decisions/0002-requirements-as-source-of-truth.md`](../../docs/decisions/0002-requirements-as-source-of-truth.md)).
Frontend estático (nginx) que **LÊ** a baseline gerada (`specs/baseline/*.json`, assada na imagem).
Desde a A1a da **Forja 4.0**, a porta de entrada (view default) é a **Forja** — hub de todos os
produtos com KPIs, briefing e progresso vivo — cercada por: **Explorador**, **Workspace**,
**Editor** (autoria assistida), **Mapa de impacto**, **Cobertura** e **Mudanças** (fusão de
Versões & diffs + Fila de reprocessamento, sub-abas na mesma tela). As ex-abas **Visão
geral/Desenvolvimento/Usabilidade morreram**: KPIs e briefing migraram para o hub; Pipeline e
Usabilidade migram para o detalhe do produto no Studio (A1b). Deep-links antigos (`#/overview`,
`#/dev`) redirecionam via `LEGACY_HASH` em `assets/app.js`; `#/usability` voltou a ser roteável —
a tela de Usabilidade vive como sub-aba de **Cobertura** (`coverageTabs`). Servido sob `/reqs`
(`stripPrefix: false`, `priority: 10`), namespace `apps`.

> **Read-only por design.** A fonte da verdade e a **autoria** dos requisitos continuam no git
> (`specs/requirements/**`, via skills `/sync-spec` `/impact-review` e PRs). O Reqhub **não escreve** —
> visualiza e analisa. Editar requisito = editar o YAML + regenerar a baseline (não pela UI, por ora).

> **IA de autoria (opcional, `apps/reqhub/api`).** Backend **R1** (Express + `@flavioneto11/ai-core`,
> gpt-5) sob `/reqs/api` (strip, priority 30) que **gera/analisa** rascunhos no Editor: `draft`
> (esboço→campos), `analyze` (lacunas) e `suggest-links` (classifica o tipo de link sobre candidatos dos
> embeddings locais). **Não escreve no git** — "salvar" continua sendo abrir o PR. **Fail-closed**: sem
> `OPENAI_API_KEY`/token (Secret `reqhub-api-config`, ver `k8s/secret.example.yaml`) responde 503 e o
> workbench segue read-only; o painel no Editor degrada com mensagem clara se a IA estiver fora.

## Stack & decisões

| Aspecto | Decisão | Por quê |
|---|---|---|
| Frontend | HTML/CSS/JS estático (sem bundler) + ESM | leve, sem build, testável, CSP estrita (`script-src 'self'`) |
| Dados | baseline assada na imagem (`/data` ← `specs/baseline/`) | sem backend; rebuild quando a baseline muda (ci-reqhub dispara em `specs/baseline/**`) |
| Build | **contexto = RAIZ do repo** + `apps/reqhub/Dockerfile` | precisa de `specs/baseline/` + `apps/reqhub/frontend/` |
| Testes | `node:test` (funções puras em `assets/lib.js`) | zero dependência |
| Runtime | nginx:alpine, subpath `/reqs/` via prefix+alias | MIME-safe, sem regex-alias |

## Armadilhas conhecidas

1. **Build precisa do contexto = raiz** → `docker build -t reqhub-frontend:local -f apps/reqhub/Dockerfile .`
   (NÃO `apps/reqhub`). A `/.dockerignore` da raiz evita enviar `node_modules`/`.git`.
2. **Subpath `/reqs/`** → nginx usa **prefix + alias** (nunca `alias` com regex). HTML tem
   `<base href="/reqs/">`; fetch de `data/*.json` resolve para `/reqs/data/...`.
3. **Sem inline** (script/style) → mantém a CSP estrita. Não introduza `<script>`/`style=` inline.
4. **Dados podem ficar stale** → a imagem só atualiza a baseline no rebuild; o `ci-reqhub` rebuilda
   quando `specs/baseline/**` muda. Em lab, rebuild local após `/sync-spec`.

## Como trabalhar aqui

- **Local:** servir estático com a baseline copiada — `docker build` + `kubectl apply`, ou um
  servidor estático apontando para `apps/reqhub/frontend` com `specs/baseline` em `frontend/data/`.
- **Testes:** `cd apps/reqhub/frontend && node --test`.
- **Build/deploy (lab):** `docker build -t reqhub-frontend:local -f apps/reqhub/Dockerfile .` +
  `kubectl apply -f apps/reqhub/k8s/`. GitOps: Application em `platform/argocd/apps/reqhub.yaml`.
- **Validar:** `http://nvit.localhost/reqs` e `/reqs/data/current-baseline.json`.

## Regras inegociáveis

Ver [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md) (labels,
roteamento, imagens, recursos) + [`AGENTS.md`](./AGENTS.md). Específicas: somente-frontend; read-only
sobre a base; frontend sem strip; `priority 10`; sem inline (CSP).
