---
title: "Reqhub — workbench da base de requisitos"
status: reference
applies_to: [reqhub]
updated: 2026-06-14
language: pt-BR
---

# Reqhub

**Workbench + Product Studio (Forja)** da base de requisitos da plataforma (fonte da verdade em
`specs/`). Lê a baseline gerada (`specs/baseline/*.json`) e renderiza: **Forja** (hub de produtos,
view default), Explorador, Workspace do requisito, Editor (autoria assistida por IA), Mapa de impacto
(grafo REQ→REQ), Cobertura (matriz requisito × evidência/alocação) e Mudanças (versões/diff + fila de
reprocessamento). Estático (nginx), sob `/reqs`. Contexto e decisão:
[`../../docs/decisions/0002-requirements-as-source-of-truth.md`](../../docs/decisions/0002-requirements-as-source-of-truth.md).
Manual do Claude: [`CLAUDE.md`](./CLAUDE.md) · fronteiras: [`AGENTS.md`](./AGENTS.md).

> **Sobre o "read-only".** O workbench **não escreve** requisitos direto — a autoria continua no git
> (`specs/requirements/**` + `/sync-spec` + PR). Mas a **Forja/Studio** tem ações com **efeito
> colateral** via o backend de autoria (`api`): **launch** (`POST /v1/forge/launch`) cria os
> requisitos no git e, no modo "Liberar tudo", **auto-mescla** o PR de requisitos e dispara a
> construção; **delete** (`POST /v1/forge/delete`) remove código + requisitos + baseline + Application
> do Argo + recursos do cluster. Salvaguardas: **gate de preview** (launch travado até aprovar as
> telas), **denylist** de produtos protegidos (não apagáveis pela UI) e **confirmação com
> blast-radius** (o diálogo declara o alcance e exige confirmação explícita antes de mesclar/apagar).

## Estrutura

```
apps/reqhub/
  devops.yaml            contrato da esteira (frontend /reqs, build contexto=raiz)
  Dockerfile             nginx; COPIA frontend/ + specs/baseline/ -> /data (contexto=RAIZ)
  nginx.conf             subpath /reqs/ (prefix+alias), CSP estrita, gzip, cache
  frontend/
    index.html           shell + 6 telas em abas (acessível)
    assets/styles.css    design system monocromático, dark, WCAG 2.2, responsivo
    assets/lib.js        funções PURAS (filtro, grupos, vizinhança, cobertura, layout do grafo)
    assets/app.js        DOM/fetch/render das 6 telas, abas, busca, tema (sem innerHTML)
    test/lib.test.mjs    node:test (zero dependência)
  k8s/                   Deployment + Service + IngressRoute (priority 10)
```

## Rodar / build / deploy

```powershell
# Testes (funções puras)
cd apps/reqhub/frontend; node --test

# Build da imagem (CONTEXTO = RAIZ do repo — precisa de specs/baseline/)
docker build -t reqhub-frontend:local -f apps/reqhub/Dockerfile .

# Deploy local (com aprovação)
kubectl apply -f apps/reqhub/k8s/
# Validar: http://nvit.localhost/reqs  e  /reqs/data/current-baseline.json
```

GitOps: `platform/argocd/apps/reqhub.yaml` (auto-sync). CI: `.github/workflows/ci-reqhub.yml`
(test + smoke build + kubeconform + push GHCR); rebuilda quando `specs/baseline/**` muda.

## Limites

Read-only sobre a base — **autoria** de requisitos é no git (`specs/requirements/**` + skills
`/sync-spec`, `/impact-review`, `/baseline-diff` + PR). Busca semântica (embeddings), edição assistida
e registry de artefatos externos (serviço/infra/SLO/teste) são evoluções previstas.
