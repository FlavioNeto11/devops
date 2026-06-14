---
title: "Reqhub — Manual para Claude Code"
status: canonical
applies_to: [reqhub]
updated: 2026-06-14
language: pt-BR
---

# Reqhub — Manual para Claude Code

> **Comece por aqui.** Fronteiras de operação: [`AGENTS.md`](./AGENTS.md) (leia antes de agir).
> Plataforma: [`../../CLAUDE.md`](../../CLAUDE.md). Máquina: [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md).
> **Base de requisitos** (a fonte que este app visualiza): [`../../specs/README.md`](../../specs/README.md) +
> [`../../specs/CLAUDE.md`](../../specs/CLAUDE.md). **Não duplique** esses conteúdos — aponte.

## O que é o Reqhub

**Workbench** (Fase 2 da plataforma de requisitos, ver
[`../../docs/decisions/0002-requirements-as-source-of-truth.md`](../../docs/decisions/0002-requirements-as-source-of-truth.md))
da base de requisitos. **Somente-frontend estático** (nginx) que **LÊ** a baseline gerada
(`specs/baseline/*.json`, assada na imagem) e renderiza 6 telas: **Explorador**, **Workspace do
requisito**, **Versões & mudanças**, **Mapa de impacto** (grafo REQ→REQ), **Cobertura** (matriz
requisito × evidência/alocação) e **Fila de reprocessamento**. Servido sob `/reqs`
(`stripPrefix: false`, `priority: 10`), namespace `apps`.

> **Read-only por design.** A fonte da verdade e a **autoria** dos requisitos continuam no git
> (`specs/requirements/**`, via skills `/sync-spec` `/impact-review` e PRs). O Reqhub **não escreve** —
> visualiza e analisa. Editar requisito = editar o YAML + regenerar a baseline (não pela UI, por ora).

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
- **Validar:** `http://xpto.localhost/reqs` e `/reqs/data/current-baseline.json`.

## Regras inegociáveis

Ver [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md) (labels,
roteamento, imagens, recursos) + [`AGENTS.md`](./AGENTS.md). Específicas: somente-frontend; read-only
sobre a base; frontend sem strip; `priority 10`; sem inline (CSP).
