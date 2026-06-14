---
title: "RM Ambiental — Contrato de Agentes"
status: canonical
applies_to: [rmambiental]
updated: 2026-06-09
language: pt-BR
---

# RM Ambiental — Contrato de Agentes

> **Fonte única, tool-agnóstica.** Qualquer agente (Claude Code, Copilot, futuros) lê este arquivo
> primeiro ao trabalhar em `rmambiental`. O [`CLAUDE.md`](./CLAUDE.md) é a camada específica do Claude
> e aponta para cá. Padrão: [`../../docs/standards/meta-doc-standard.md`](../../docs/standards/meta-doc-standard.md).
>
> Contrato da plataforma: [`../../AGENTS.md`](../../AGENTS.md). Em conflito, regra do escopo mais
> específico prevalece se marcada.

## 1. Visão geral

**RM Ambiental Brasil** é o **portal institucional** (site corporativo somente-frontend) da empresa,
servido na esteira DevOps local sob `https://dev.nvit.com.br/rmambiental` (e `nvit.localhost` no dev).
Stack em uma linha: **Vite + React 18 + TypeScript + Tailwind + Framer Motion**, build estático
empacotado em **nginx** sob o subpath `/rmambiental/`. **Sem backend, sem banco, sem auth.** Idioma de
produto: pt-BR. Estado: deployado no lab (`:local`) — ver [`docs/status.md`](./docs/status.md).

## 2. Como começar uma tarefa (sempre)

1. Ler este `AGENTS.md` e o [`CLAUDE.md`](./CLAUDE.md).
2. Ler o estado atual em [`docs/status.md`](./docs/status.md).
3. Consultar a matriz de decisão (§4) e as regras HARD da plataforma
   ([`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md)).
4. Planejar → executar → validar (§6) → atualizar docs → relatório final.

## 3. Ordem oficial de leitura

| # | Doc | Para quê |
|---|---|---|
| 1 | [`AGENTS.md`](./AGENTS.md) | Este arquivo — fronteiras + matriz de decisão |
| 2 | [`CLAUDE.md`](./CLAUDE.md) | Stack, armadilhas, env vars, dev/debug |
| 3 | [`README.md`](./README.md) | Setup técnico, estrutura `src/`, placeholders |
| 4 | [`docs/status.md`](./docs/status.md) | Estado deployado, gaps e próximos passos |
| 5 | [`devops.yaml`](./devops.yaml) | Contrato da esteira (basePath, rota, build args) |

## 4. Matriz de decisão

| Tipo de tarefa | Comece por | Fronteira |
|---|---|---|
| Ajustar conteúdo/placeholder (contato, cases, números) | `src/lib/site.ts`, `src/data/*.ts`, `README.md` §placeholders | segura |
| Editar componente/página/estilo | `src/components/`, `src/pages/`, `src/index.css`, `tailwind.config.js` | segura |
| Mudar base path / roteamento | `vite.config.ts` + `nginx.conf` + `k8s/rmambiental.yaml` + [`hard-constraints.md` §2](../../docs/standards/hard-constraints.md) | com aprovação |
| Build da imagem local | `docker build -t rmambiental-frontend:local apps/rmambiental` | com aprovação |
| Publicar/aplicar no cluster | `kubectl apply -f k8s/` ou commit (Argo auto-sync) | com aprovação |
| Editar manifests K8s / Argo Application | `k8s/rmambiental.yaml`, `../../platform/argocd/apps/rmambiental.yaml` | com aprovação |

## 5. Fronteiras de operação

### ✅ Seguras (autônomas)
- `npm install`, `npm run dev`, `npm run build`, `npm run preview` (local, sem efeito no cluster).
- Editar `src/**`, `index.html`, `tailwind.config.js`, `postcss.config.js`, `README.md`, `docs/**`.
- Leitura read-only do cluster: `kubectl get pods,svc,ingressroute -n apps -l app.kubernetes.io/part-of=rmambiental`.

### ⚠️ Com aprovação do operador
- `docker build -t rmambiental-frontend:local apps/rmambiental` (gera imagem nova no nó).
- `kubectl apply -f apps/rmambiental/k8s/rmambiental.yaml` / `kubectl rollout restart deploy/rmambiental-frontend -n apps`.
- `scripts/publish-app.ps1 -App rmambiental` (apply + rollout + smoke).
- Alterar `vite.config.ts` (base), `nginx.conf`, `devops.yaml`, manifests K8s ou a Argo Application —
  mexem em roteamento/GitOps vivo.

### ⛔ Proibidas
- `git push --force`; `--no-verify`.
- Introduzir backend, banco, segredo ou auth neste escopo (é somente-frontend; ver §8).
- Commitar segredos ou colocar segredo em `env`/ConfigMap (ver [`hard-constraints.md` §3](../../docs/standards/hard-constraints.md)).
- Mudar `metadata.name`/labels de recurso vivo sem planejar recriação ([`hard-constraints.md` §4](../../docs/standards/hard-constraints.md)).
- Fazer **strip** de prefixo no frontend, ou rebaixar `priority` abaixo do portal `/` ([`hard-constraints.md` §2](../../docs/standards/hard-constraints.md)).
- Inventar números/clientes/cases reais — placeholders só viram conteúdo real com dado fornecido.

## 6. Validação obrigatória

```bash
# na raiz de apps/rmambiental
npm run build        # tsc/vite — falha o build se TS ou import quebrar
npm run preview      # smoke local: http://localhost:5173/rmambiental/
# após publicar no cluster:
# curl http://nvit.localhost/rmambiental/healthz   -> ok
# curl http://nvit.localhost/rmambiental/          -> index.html (SPA)
```

> Não há lint/typecheck dedicados nem testes neste app (apenas `dev`/`build`/`preview` no
> `package.json`); o `build` faz a verificação de TypeScript via `vite`.

## 7. Política de atualização de docs

| Mudança | Atualizar |
|---|---|
| Conteúdo/placeholder resolvido (contato, cases, números) | `docs/status.md` (marcar estado) + `README.md` §placeholders |
| Nova página/seção ou rota client-side | `docs/status.md` + `README.md` (estrutura) |
| Base path / roteamento / manifests | `devops.yaml` + `k8s/rmambiental.yaml` + `docs/status.md` |
| Publicação no cluster | annotations `devops.flavioneto/*` em `k8s/rmambiental.yaml` + `docs/status.md` |

**Não prometer feature inexistente.** Marcar `✅ Implementado`, `⚠️ Parcial`, `🔵 Planejado` ou
`❌ Fora de escopo`.

## 8. Princípios não-negociáveis

1. AGENTS.md é a fonte das fronteiras; não duplicar em CLAUDE.md nem `.github/`.
2. **Somente-frontend.** Nada de backend/banco/segredo/auth aqui — se a tarefa exigir, é outro escopo.
3. **Frontend NUNCA faz strip**; base path `/rmambiental/` embutido no build; `priority 10` vence o
   portal `/` (`priority 1`). Ver [`hard-constraints.md` §2](../../docs/standards/hard-constraints.md).
4. Conteúdo institucional honesto: sem números/cases inventados (são placeholders ilustrativos).
5. Documentar é parte da entrega; `docs/status.md` reflete o estado real, sem promessas.
