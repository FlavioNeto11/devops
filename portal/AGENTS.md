---
title: "Portal NovaIT — Contrato de Agentes"
status: canonical
applies_to: [portal]
updated: 2026-06-09
language: pt-BR
---

# Portal NovaIT — Contrato de Agentes

> **Fonte única, tool-agnóstica.** Qualquer agente (Claude Code, GitHub Copilot, futuros) que
> trabalhe em `portal/` lê **este arquivo primeiro**. Detalhe técnico (como funciona, deploy,
> personalização) está no [`README.md`](./README.md) deste componente — não duplicado aqui.
>
> Contrato da plataforma: [`../AGENTS.md`](../AGENTS.md). Padrão desta camada:
> [`../docs/standards/meta-doc-standard.md`](../docs/standards/meta-doc-standard.md). Em conflito,
> a regra do escopo mais específico prevalece se marcada; senão valem as regras da plataforma.

## 1. Visão geral

**Portal NovaIT** é a landing page pública servida na **raiz** `/` (host `xpto.localhost` local /
`dev.nvit.com.br` futuro), no namespace `devops-system`. É um **frontend estático** (nginx,
`frontend/index.html` + `nginx.conf` + `assets/` — **sem build de bundle/SPA framework**) com a
marca NovaIT. O HTML é completo e útil **sem JS**; o JS (`assets/portal.js`) apenas **enriquece**
(_progressive enhancement_): consome a API somente-leitura do DevOps Console
(`/devops/api/ingressroutes`), filtra o namespace `apps`, marca os cards curados como "no ar" e
renderiza cards extras das apps descobertas — com estados de _loading/vazio/erro_ tratados
(atualiza a cada 60s). Há **tooling de qualidade** em `frontend/package.json` (Prettier, ESLint,
testes `node:test`) que **não entra na imagem** (`.dockerignore`).

Roteamento: `IngressRoute` em `devops-system` com `PathPrefix("/")` e **`priority: 1`** (a menor) —
qualquer path específico (`/devops`, `/grafana`, `/argocd`, `/<app>`...) vence; só a raiz cai no
portal. Por estar em `devops-system` (e não em `apps`), o portal **não** aparece na própria lista.
Imagem local `portal-frontend:local` (`imagePullPolicy: IfNotPresent`, sem registry). Estado: ✅ em
uso. Idioma de UI/prosa: pt-BR.

## 2. Ordem oficial de leitura

| # | Doc | Para quê |
|---|---|---|
| 1 | [`AGENTS.md`](./AGENTS.md) | Este arquivo — fronteiras e princípios |
| 2 | [`README.md`](./README.md) | Como funciona, deploy, personalização |
| 3 | [`../AGENTS.md`](../AGENTS.md) | Contrato da plataforma |
| 4 | [`../docs/standards/hard-constraints.md`](../docs/standards/hard-constraints.md) | Roteamento, labels, GitOps (referência, não copiar) |
| 5 | [`../console/README.md`](../console/README.md) | A API read-only (`/devops/api/ingressroutes`) que o portal consome |

## 3. Fronteiras de operação

> Ancoradas nos comandos reais do [`README.md`](./README.md) deste componente.

### ✅ Seguras (autônomas — idempotentes ou read-only)

| Operação | Comando |
|---|---|
| Buildar a imagem local | `docker build -t portal-frontend:local C:\devops\portal\frontend` |
| Editar a página (marca, cores, textos, cards) | editar `frontend/index.html`, `frontend/assets/*` |
| Rodar o gate de qualidade | `cd frontend; npm run validate` (Prettier + ESLint + `node:test`) |
| Pré-visualizar no navegador | `npx --yes serve -l 5055 frontend` |
| Render do manifest (sem aplicar) | `kubectl apply -f portal/k8s/portal.yaml --dry-run=server` |
| Inspecionar o que está no ar | `kubectl -n devops-system get/describe/logs deploy/portal` |

### ⚠️ Com aprovação do operador (efeito colateral / cluster)

| Operação | Comando | Por quê |
|---|---|---|
| **Publicar (recomendado)** | `scripts\publish-portal.ps1` | GitOps: build `:<sha>` + **bump do `image:` no manifest** + commit + apply + rollout + smoke (**throw** em falha) |
| Aplicar o manifest | `kubectl apply -f portal/k8s/portal.yaml` | aplica o declarativo (mesma fonte que o Argo reconcilia) |
| Rollback | `git revert <commit do bump>` | o Argo (ou `kubectl apply`) volta o `<sha>` anterior |

### ⛔ Proibidas

| Operação | Razão |
|---|---|
| Subir a `priority` da IngressRoute do portal acima de `1` | a raiz `/` engoliria os paths específicos (`/devops`, `/grafana`, `/argocd`, `/<app>`) — ver README, Roteamento |
| Mover o portal para o namespace `apps` | ele passaria a aparecer na própria lista (que mostra só `apps`) |
| Apontar o JS para uma API de escrita ou de outra origem | o portal só consome a API read-only do Console (`/devops/api/ingressroutes`) |
| Commitar segredo real / dar ao portal acesso a dados sensíveis | é estático e público; segredos nunca em plaintext ([`hard-constraints.md`](../docs/standards/hard-constraints.md) §3) |
| `git push --force` em `main` | reescreve história — sempre PR/branch |

## 4. Princípios não-negociáveis

1. **AGENTS.md é a fonte das fronteiras**; o detalhe técnico vive no [`README.md`](./README.md) — não duplicar.
2. **Estático e público:** nginx + `index.html` + `assets/` (CSS/JS); sem backend próprio, sem segredo, sem acesso a dados sensíveis. O `package.json`/`test/` são só de qualidade e não vão para a imagem.
3. **`priority: 1` é intencional** — a raiz só pega o que nenhum path específico atende; nunca elevar.
4. **Lista dinâmica via API read-only do Console** — o portal não mantém estado; um app novo aparece sozinho ao ganhar uma `IngressRoute` no namespace `apps`.
5. **Imagem `:local` + `IfNotPresent`** no lab; sem push para registry.
6. **Documentar é parte da entrega** — estado real, sem prometer o que não existe.
