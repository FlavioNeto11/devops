---
title: "DevOps Console — Contrato de Agentes"
status: canonical
applies_to: [console]
updated: 2026-06-09
language: pt-BR
---

# DevOps Console — Contrato de Agentes

> **Fonte única, tool-agnóstica.** Qualquer agente (Claude Code, GitHub Copilot, futuros) que
> trabalhe em `console/` lê **este arquivo primeiro**. Detalhe técnico (build, deploy, RBAC, SSE,
> como estender) está no [`README.md`](./README.md) deste componente — não duplicado aqui.
>
> Contrato da plataforma: [`../AGENTS.md`](../AGENTS.md). Padrão desta camada:
> [`../docs/standards/meta-doc-standard.md`](../docs/standards/meta-doc-standard.md). Em conflito,
> a regra do escopo mais específico prevalece se marcada; senão valem as regras da plataforma.

## 1. Visão geral

**DevOps Console** é o painel da plataforma servido sob o subpath `/devops` (host `nvit.localhost`
local / `dev.nvit.com.br` futuro), no namespace `devops-system`. Reúne três serviços:

- **`console-backend`** — API REST + SSE **somente leitura** do cluster (Node 20, Express,
  `@kubernetes/client-node`); ServiceAccount `console` ligada ao ClusterRole `console-readonly`
  (apenas `get`/`list`/`watch`, **sem** acesso a `secrets`). Porta `3001`.
- **`console-frontend`** — SPA React 18 + Vite 5 servida por nginx sob `/devops/` (build com
  `base: '/devops/'`, **sem** StripPrefix). Porta `80`.
- **`pm-api`** (`devops-pm-api`, módulo **Projetos & Tarefas**) — API de **ESCRITA** isolada do
  backend read-only, backed por Postgres (`pg`), exposta em `/devops/api/pm`, atrás de
  autenticação (oauth2-proxy + Keycloak realm `nvit`). Porta `3002`.

Estado: ✅ em uso. Imagens locais (`console-backend:local`, `console-frontend:local`,
`imagePullPolicy: IfNotPresent`, sem registry). Idioma de UI/prosa: pt-BR.

## 2. Ordem oficial de leitura

| # | Doc | Para quê |
|---|---|---|
| 1 | [`AGENTS.md`](./AGENTS.md) | Este arquivo — fronteiras e princípios |
| 2 | [`README.md`](./README.md) | Arquitetura, build/deploy, RBAC read-only, SSE, como estender |
| 3 | [`../AGENTS.md`](../AGENTS.md) | Contrato da plataforma |
| 4 | [`../docs/standards/hard-constraints.md`](../docs/standards/hard-constraints.md) | Roteamento, labels, segredos, GitOps (referência, não copiar) |
| 5 | [`../docs/path-routing-pattern.md`](../docs/path-routing-pattern.md) | strip/priority das rotas `/devops`, `/devops/api`, `/devops/api/pm` |

## 3. Fronteiras de operação

> Ancoradas nos scripts/manifests reais deste componente. Detalhe e pré-requisitos no
> [`README.md`](./README.md).

### ✅ Seguras (autônomas — idempotentes ou read-only)

| Operação | Comando |
|---|---|
| Buildar imagens locais | `docker build -t console-backend:local -f Dockerfile.backend .` · `docker build -t console-frontend:local -f Dockerfile.frontend .` (a partir de `console/`) |
| Rodar backend local (lê `~/.kube/config`) | `npm install && npm start` em `console/backend` (porta 3001) |
| Rodar frontend dev | `npm install && npm run dev` em `console/frontend` (Vite, porta 5173) |
| Build de produção do frontend | `npm run build` em `console/frontend` |
| Render do kustomize (diff, sem aplicar) | `kubectl kustomize console/k8s` · `kubectl apply -f console/k8s/ --dry-run=server` |
| Inspecionar o que está no ar | `kubectl -n devops-system get/describe/logs ...` |

### ⚠️ Com aprovação do operador (efeito colateral / cluster)

| Operação | Comando | Por quê |
|---|---|---|
| Aplicar manifests | `kubectl apply -f console/k8s/` | cria/atualiza recursos em `devops-system` |
| Deploy idempotente | `scripts/install-dashboard.ps1` | garante ns, aplica `k8s/` e espera rollout |
| Reiniciar rollout | `kubectl -n devops-system rollout restart deploy/console-backend\|console-frontend\|pm-api` | reinicia carga viva |
| Provisionar/migrar o banco do pm | `npm run migrate` / `npm run seed` em `console/pm-api` | escreve no Postgres do módulo PM |
| Alterar `console-readonly` (rbac.yaml) | — | mudar verbos do ClusterRole é decisão de segurança |

### ⛔ Proibidas

| Operação | Razão |
|---|---|
| Adicionar verbos de escrita ao `console-readonly` ou dar acesso a `secrets` | quebra o least-privilege do backend read-only (ver README, Nota de segurança) |
| Chamar métodos de mutação do `@kubernetes/client-node` no `console-backend` | o backend é read-only por design (o cluster recusaria, mas não introduzir a chamada) |
| Editar/decifrar os Sealed Secrets em `console/k8s/auth/*` ou commitar segredo real do `pm-db` | segredos nunca em plaintext (ver [`../docs/standards/hard-constraints.md`](../docs/standards/hard-constraints.md) §3) |
| Incluir o Secret real do `pm-db` no `kustomization.yaml` | o Argo (`prune`) apagaria o segredo (ver comentário em `k8s/kustomization.yaml`) |
| Inverter strip/priority das rotas | `/devops/api/pm` (30) > `/devops/api` (20) > `/devops` (10); frontend sem strip, APIs com strip ([`hard-constraints.md`](../docs/standards/hard-constraints.md) §2) |
| `git push --force` em `main` | reescreve história — sempre PR/branch |

## 4. Princípios não-negociáveis

1. **AGENTS.md é a fonte das fronteiras**; o detalhe técnico vive no [`README.md`](./README.md) — não duplicar.
2. **`console-backend` é read-only por design.** Só `get`/`list`/`watch`; nunca verbos de escrita nem `secrets`.
3. **Separação de responsabilidades:** observação do cluster fica no `console-backend`; escrita (Projetos & Tarefas) fica no `pm-api`, com Postgres e auth próprios.
4. **Segredos nunca em plaintext** no git (Sealed Secrets em `k8s/auth`; `pm-db` real fora do git).
5. **Regra de ouro do roteamento** sempre: frontend sem strip (priority menor); `api`/`api/pm` com strip (priority maior, a mais específica vence).
6. **Imagens `:local` + `IfNotPresent`** no lab; sem push para registry.
7. **Documentar é parte da entrega** — estado real, sem prometer o que não existe.
