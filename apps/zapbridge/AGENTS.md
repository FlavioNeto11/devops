---
title: "ZapBridge — Contrato de Agentes"
status: canonical
applies_to: [zapbridge]
updated: 2026-07-21
language: pt-BR
---

# ZapBridge — Contrato de Agentes

> **Fonte única, tool-agnóstica.** Qualquer agente (Claude Code, Copilot, futuros) lê este arquivo
> primeiro ao trabalhar em `zapbridge`. O [`CLAUDE.md`](./CLAUDE.md) é a camada específica do Claude e
> aponta para cá. Padrão: [`../../docs/standards/meta-doc-standard.md`](../../docs/standards/meta-doc-standard.md).
>
> Contrato da plataforma: [`../../AGENTS.md`](../../AGENTS.md). Em conflito, regra do escopo mais
> específico prevalece se marcada.

## 1. Visão geral

**ZapBridge** é um **cliente de mensageria** que conecta à conta de WhatsApp do próprio usuário via
Baileys (QR/pairing). Full-stack na esteura DevOps local sob `https://dev.nvit.com.br/zapbridge` (e
`nvit.localhost` no dev). Stack em uma linha: **Express + Socket.IO + Prisma/SQLite + Baileys**
(backend, `server/`) e **React 18 + Vite + TypeScript** (SPA web, `web/`), empacotado em **nginx** sob
`/zapbridge/`. O cliente **Expo/React Native** em `app/` é **legado/aposentado** (não é o build web).
Idioma de produto: pt-BR. Estado: deployado no lab
(`:local`), pods Running. **Uso legítimo apenas** (sem Business API, sem scraping, sem envio em massa).

## 2. Como começar uma tarefa (sempre)

1. Ler este `AGENTS.md` e o [`CLAUDE.md`](./CLAUDE.md).
2. Ler [`README.md`](./README.md) e, se mexer em requisito, [`docs/MVP-FUNCIONAL.md`](./docs/MVP-FUNCIONAL.md).
3. Consultar a matriz de decisão (§4) e as regras HARD da plataforma
   ([`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md)).
4. Planejar → executar → validar (§6) → atualizar docs → relatório final.

## 3. Ordem oficial de leitura

| # | Doc | Para quê |
|---|---|---|
| 1 | [`AGENTS.md`](./AGENTS.md) | Este arquivo — fronteiras + matriz de decisão |
| 2 | [`CLAUDE.md`](./CLAUDE.md) | Stack, roteamento, armadilhas, env vars, dev/debug |
| 3 | [`README.md`](./README.md) | Visão do produto e como rodar local |
| 4 | [`server/README.md`](./server/README.md) · frontend web em `web/` (Vite) · [`app/README.md`](./app/README.md) (Expo legado) | Setup/build/deploy |
| 5 | [`devops.yaml`](./devops.yaml) | Contrato da esteira (basePath, rotas, build) |

## 4. Matriz de decisão

| Tipo de tarefa | Comece por | Fronteira |
|---|---|---|
| Editar rota/lógica do backend | `server/src/modules/**`, `server/src/index.ts` | segura |
| Editar tela/componente do frontend web | `web/src/pages/**`, `web/src/components/**` (Expo em `app/` é legado) | segura |
| Alterar schema do banco | `server/prisma/schema.prisma` + `npx prisma migrate dev` (commit migrations) | segura (local) / com aprovação (deploy) |
| Mudar base path / roteamento / socket path | `web/vite.config.ts` (`base`) + `web/nginx.conf` + `k8s/zapbridge.yaml` + [`hard-constraints.md` §2](../../docs/standards/hard-constraints.md) | com aprovação |
| Build das imagens locais | `docker build` (server / web) — ver [`CLAUDE.md`](./CLAUDE.md) | com aprovação |
| Publicar/aplicar no cluster | commit dos manifests (Argo auto-sync) ou `kubectl rollout restart` | com aprovação |
| Editar manifests K8s / Argo Application | `k8s/*.yaml`, `../../platform/argocd/apps/zapbridge.yaml` | com aprovação |
| Mexer no Secret `zapbridge-config` | `kubectl create secret` (fora do git) | com aprovação |

## 5. Fronteiras de operação

### ✅ Seguras (autônomas)
- `npm install`, `npm run dev`/`build` no `server/` e no `web/` (frontend Vite) — local.
- `npx prisma migrate dev` / `prisma generate` local; editar `prisma/schema.prisma` e commitar migrations.
- Editar `server/src/**`, `web/src/**`, `web/vite.config.ts` (conteúdo), READMEs, `docs/**`.
- Leitura read-only do cluster: `kubectl get pods,svc,ingressroute -n apps -l app.kubernetes.io/part-of=zapbridge`.

### ⚠️ Com aprovação do operador
- `docker build` das imagens `zapbridge-server:local` / `zapbridge-web:local` (gera imagem no nó).
- `kubectl apply -k apps/zapbridge/k8s` / `kubectl rollout restart deploy/zapbridge-server|zapbridge-web -n apps`.
- Alterar roteamento (`web/vite.config.ts` base, `web/nginx.conf`, `SOCKET_IO_PATH`, IngressRoute), `devops.yaml`,
  manifests K8s ou a Argo Application — mexem em roteamento/GitOps vivo.
- Criar/rotacionar o Secret `zapbridge-config`.

### ⛔ Proibidas
- `git push --force`; `--no-verify`.
- Commitar segredos (JWT_SECRET, credenciais Baileys, `dev.db`, `.env`) — só `zapbridge-config` no
  cluster; `secret.example.yaml` leva placeholder. Ver [`hard-constraints.md` §3](../../docs/standards/hard-constraints.md).
- Escalar `zapbridge-server` para 2+ réplicas ou trocar `strategy` para RollingUpdate (SQLite RWO +
  socket Baileys em memória = corrupção/sessão dupla).
- Fazer **strip** no frontend, rebaixar `priority` do socket.io abaixo da api/frontend, ou pôr
  `compress` na rota WS ([`hard-constraints.md` §2](../../docs/standards/hard-constraints.md)).
- Mudar `metadata.name`/labels de recurso vivo sem planejar recriação ([`hard-constraints.md` §4](../../docs/standards/hard-constraints.md)).
- Qualquer uso não-legítimo do WhatsApp (Business API, scraping, envio em massa, marca/identidade do WhatsApp).

## 6. Validação obrigatória

```bash
# backend (apps/zapbridge/server)
npm run build        # tsc — falha se TS/import quebrar
# frontend web (apps/zapbridge/web)
npm run build        # Vite (tsc --noEmit && vite build) — gera web/dist/ (base /zapbridge/).
                     # SEM PWA/service worker: web/public/sw.js é kill-switch do SW antigo (Expo).
# após publicar no cluster:
# curl http://nvit.localhost/zapbridge/api/health  -> ok
# curl http://nvit.localhost/zapbridge/healthz      -> ok (nginx)
# curl http://nvit.localhost/zapbridge/             -> index.html (SPA)
```

> Não há suíte de testes dedicada hoje; a verificação é `build` (TS) + smoke das rotas. O fluxo E2E
> real (conectar WhatsApp por QR, enviar/receber) está descrito no [`README.md`](./README.md).

## 7. Política de atualização de docs

| Mudança | Atualizar |
|---|---|
| Nova rota/módulo no backend | `server/README.md` + (se for requisito) `docs/MVP-FUNCIONAL.md` |
| Nova tela/fluxo no frontend web | `web/` + `docs/MVP-FUNCIONAL.md` |
| Schema do banco / migration | `prisma/schema.prisma` + commitar `prisma/migrations/**` |
| Base path / roteamento / socket / manifests | `devops.yaml` + `k8s/*.yaml` + `CLAUDE.md` (tabela de rotas) |
| Publicação no cluster | annotations `devops.flavioneto/*` nos Deployments + nota de estado |

**Não prometer feature inexistente.** Marcar `✅ Implementado`, `⚠️ Parcial`, `🔵 Planejado` ou
`❌ Fora de escopo`.

## 8. Princípios não-negociáveis

1. AGENTS.md é a fonte das fronteiras; não duplicar em CLAUDE.md nem `.github/`.
2. **1 réplica, `Recreate`.** SQLite RWO + socket Baileys em memória: nunca 2 instâncias do backend.
3. **Frontend NUNCA faz strip**; base `/zapbridge` embutida no build; `socket.io` priority 40 (sem
   strip, sem compress) > `api` 30 > `frontend` 10. Ver [`hard-constraints.md` §2](../../docs/standards/hard-constraints.md).
4. **Segredo só via Secret** `zapbridge-config` (criado fora do git). `secret.example.yaml` é
   placeholder e fica fora do `kustomization.yaml` (Argo não o gerencia/pruna).
5. **Uso legítimo do WhatsApp**: conta do próprio usuário por QR/pairing; sem Business API, scraping,
   envio em massa ou uso de marca/identidade do WhatsApp.
6. Documentar é parte da entrega; o estado nos docs reflete o real, sem promessas.
