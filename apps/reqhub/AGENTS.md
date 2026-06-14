---
title: "Reqhub — fronteiras de operação (AGENTS)"
status: canonical
applies_to: [reqhub]
updated: 2026-06-14
language: pt-BR
---

# Reqhub — fronteiras de operação

> Herda o contrato da plataforma: [`../../AGENTS.md`](../../AGENTS.md) §5 (seguras / com aprovação /
> proibidas). Aqui só as especializações deste app. Contexto: [`CLAUDE.md`](./CLAUDE.md).

## Classificação rápida

| Operação | Classe |
|---|---|
| Editar `frontend/` (HTML/CSS/JS), `lib.js`, testes; rodar `node --test`; `docker build` local | **segura** |
| `kubectl apply -f apps/reqhub/k8s/` / rollout / publicar imagem | **com aprovação** (muda o cluster) |
| Commitar `platform/argocd/apps/reqhub.yaml` (entra no GitOps) | **com aprovação** |
| Escrever na base de requisitos a partir da UI; tocar `specs/**` por aqui | **proibida** (autoria é no git, ver `specs/CLAUDE.md`) |
| Mudar `metadata.name` de recurso vivo sob Argo; segredos; force push | **proibida** |

## Regras específicas (§8)

1. **Somente-frontend e read-only sobre a base.** O Reqhub **lê** `specs/baseline/*.json`; nunca
   escreve requisitos. Autoria = `specs/requirements/**` + `/sync-spec` + PR.
2. **Frontend sem strip, `priority 10`, namespace `apps`.** Não alterar o roteamento (regra de ouro).
3. **Build com contexto = raiz** (`-f apps/reqhub/Dockerfile .`). Não quebrar isso ao mexer no Dockerfile.
4. **Sem inline** (script/style) — preserva a CSP. Novas libs de terceiros: evitar (zero-dep é o padrão).
5. **Dados derivados, não fonte.** Se a baseline mudou, o caminho é regenerar em `specs/` e rebuildar a
   imagem — não editar `data/` na imagem nem “consertar” números na UI.
