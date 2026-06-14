---
title: "Reqhub — workbench da base de requisitos"
status: reference
applies_to: [reqhub]
updated: 2026-06-14
language: pt-BR
---

# Reqhub

Workbench **read-only** da base de requisitos da plataforma (fonte da verdade em `specs/`). Lê a
baseline gerada (`specs/baseline/*.json`) e renderiza 6 telas: Explorador, Workspace do requisito,
Versões & mudanças, Mapa de impacto (grafo REQ→REQ), Cobertura (matriz requisito × evidência/alocação)
e Fila de reprocessamento. Estático (nginx), sob `/reqs`. Contexto e decisão:
[`../../docs/decisions/0002-requirements-as-source-of-truth.md`](../../docs/decisions/0002-requirements-as-source-of-truth.md).
Manual do Claude: [`CLAUDE.md`](./CLAUDE.md) · fronteiras: [`AGENTS.md`](./AGENTS.md).

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
# Validar: http://xpto.localhost/reqs  e  /reqs/data/current-baseline.json
```

GitOps: `platform/argocd/apps/reqhub.yaml` (auto-sync). CI: `.github/workflows/ci-reqhub.yml`
(test + smoke build + kubeconform + push GHCR); rebuilda quando `specs/baseline/**` muda.

## Limites

Read-only sobre a base — **autoria** de requisitos é no git (`specs/requirements/**` + skills
`/sync-spec`, `/impact-review`, `/baseline-diff` + PR). Busca semântica (embeddings), edição assistida
e registry de artefatos externos (serviço/infra/SLO/teste) são evoluções previstas.
