---
title: "ZapBridge — Manual para Claude Code"
status: canonical
applies_to: [zapbridge]
updated: 2026-07-21
language: pt-BR
---

# ZapBridge — Manual para Claude Code

> **Comece por aqui.** As fronteiras de operação e a matriz de decisão vivem no
> [`AGENTS.md`](./AGENTS.md) — leia antes de agir. Este arquivo traz o contexto específico do Claude.
>
> Contexto da plataforma: [`../../CLAUDE.md`](../../CLAUDE.md). Máquina:
> [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md). **Não repita** esses conteúdos —
> aponte. Padrão desta camada: [`../../docs/standards/meta-doc-standard.md`](../../docs/standards/meta-doc-standard.md).

## O que é ZapBridge

Cliente de mensageria que conecta à conta de WhatsApp **do próprio usuário** via
[WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) (QR/pairing — **uso legítimo
apenas**, sem WhatsApp Business API, sem scraping, sem envio em massa). Full-stack:

- **`server/`** — backend Node/TypeScript: Express (REST) + Socket.IO (tempo real) + Prisma/SQLite
  (persistência) + Baileys (sessão WhatsApp). Mantém a sessão viva e persiste conversas/mídia.
- **`web/`** — **frontend web atual**: SPA **React 18 + Vite + TypeScript**, buildado com `npm run build`
  (gera `web/dist/`, base `/zapbridge/`) e servido por nginx sob `/zapbridge/`. É o que a esteira builda
  e publica na imagem `zapbridge-web:local`.
- **`app/`** — cliente Expo/React Native **legado/aposentado** (mobile). Mantido só como referência
  histórica; **não** é mais o build do deploy web (ver Armadilhas §8 — PWA/SW aposentados no `web/`).
- **`docs/MVP-FUNCIONAL.md`** — documento funcional completo (20 seções, 45 RFs).

Servido na esteira sob `https://dev.nvit.com.br/zapbridge` (e `nvit.localhost` no dev). É um app
`product_software` com **api** (server, com strip) + **frontend** (web, sem strip) + rota dedicada de
**WebSocket**.

## Ordem de leitura

1. Este arquivo.
2. [`AGENTS.md`](./AGENTS.md) — fronteiras + matriz de decisão (obrigatório antes de agir).
3. [`README.md`](./README.md) — visão do produto e como rodar local.
4. [`server/README.md`](./server/README.md) — setup/build/deploy do backend. (`app/README.md` cobre o
   cliente Expo **legado**; o frontend web atual vive em `web/`.)
5. [`docs/MVP-FUNCIONAL.md`](./docs/MVP-FUNCIONAL.md) — requisitos, telas, API, eventos, fluxos.

## Stack & decisões de arquitetura

| Aspecto | Decisão | Por quê |
|---|---|---|
| Backend | Express 4 + TypeScript 5 | REST simples + middleware de auth JWT |
| Tempo real | Socket.IO 4 (path `/zapbridge/socket.io`) | QR, presença, mensagens em tempo real |
| WhatsApp | Baileys 6 (patch aplicado via `patch-package`) | conecta a conta do usuário por QR/pairing |
| Persistência | Prisma 5 + **SQLite** em PVC (`/data/zapbridge.db`) | estado simples, single-writer |
| Auth Baileys/mídia | arquivos em `/data/auth` e `/data/media` (PVC) | sessão sobrevive a restart |
| Auth do app | JWT (`JWT_SECRET` via Secret `zapbridge-config`) | sessão do usuário do ZapBridge |
| Frontend | **React 18 + Vite + TypeScript** (`web/`) | SPA web sob `/zapbridge/`; base fixada em `vite.config.ts` |
| Frontend legado | Expo 52 + React Native (`app/`) | **aposentado** — mobile histórico, fora do deploy web |
| Runtime web | nginx:alpine servindo `web/dist/` | imagem mínima, MIME-safe (subpath) |
| Deploy | Kubernetes (esteira) + Argo CD | `apps/zapbridge/k8s` via auto-sync |

**Topologia de réplica:** Deployment `Recreate`, **1 réplica** — o socket Baileys mantém estado em
memória e o PVC é RWO. **Nunca** escalar `zapbridge-server` para 2+ réplicas.

## Roteamento (regra de ouro)

Um único `IngressRoute` (`k8s/zapbridge.yaml`) com 3 rotas, prioridade do mais específico:

| Rota | priority | strip | Destino |
|---|---|---|---|
| `/zapbridge/socket.io` | **40** | não (Socket.IO casa o path exato; Traefik faz upgrade WS) | `zapbridge-server:3000` |
| `/zapbridge/api` | **30** | sim (`zapbridge-api-strip` → backend vê rotas na raiz) | `zapbridge-server:3000` |
| `/zapbridge` (resto) | **10** | não (SPA com base `/zapbridge`) | `zapbridge-web:80` |

## Armadilhas conhecidas

1. **Socket.IO atrás do subpath** → o cliente e o servidor precisam casar `path=/zapbridge/socket.io`
   (`web/src/api/client.ts > SOCKET_PATH` e env `SOCKET_IO_PATH` do backend). A rota WS **não** leva
   `compress` nem strip — Socket.IO casa o path inteiro. `SOCKET_URL` no cliente é a **origem**
   (`window.location.origin`), não o subpath.
2. **base path do frontend web** → o build (Vite) embute `/zapbridge/` via `base` no `web/vite.config.ts`.
   O `nginx.conf` usa **prefixo + alias estático** para `/zapbridge/assets/` (nunca `alias` com captura
   de regex — serve `application/octet-stream` e quebra a SPA; ver TROUBLESHOOTING §14). Não há env var
   de build: `API_URL`/`SOCKET_URL` são derivados de `window.location.origin` em `web/src/api/client.ts`.
3. **Baileys no Alpine** → o backend usa `node:20-slim` (Debian) + `openssl` por causa do Prisma
   (musl/openssl no Alpine dá dor). Não trocar para Alpine sem cuidar disso.
4. **patch-package** → `server/patches/@whiskeysockets+baileys+*.patch` é aplicado no `postinstall`. O
   Dockerfile copia `patches/` antes do `npm ci`. Não remover.
5. **SQLite em PVC RWO** → single-writer. Não rodar 2 réplicas, não trocar `strategy` para
   RollingUpdate (duas instâncias gravando = corrupção).
6. **Migrations** → `prisma migrate deploy` roda no **start** do container (não no build). Novas
   migrations: `npx prisma migrate dev` local, commitar `prisma/migrations/**`.
7. **Camada de IA (`server/src/modules/ai/`, opt-in)** → conecta ao stack `@flavioneto11/ai-core`
   (reasoning Claude + embeddings OpenAI). **Banco SEPARADO** `zapbridge-postgres` (pgvector) só p/ IA
   (threads/memória/embeddings/KB) — o SQLite do app NUNCA ganha 2º writer. **Gotcha CJS×ESM:** este
   server é CommonJS, mas os kits `@flavioneto11/*` são ESM-only → carregados via
   `ai-core-loader.ts` (import dinâmico). Tudo fail-soft: sem `AI_DATABASE_URL`/chaves a IA fica off.
   `send_message` nunca silencioso (proposeTools→`/ai/confirm` HMAC). Métricas `:9464`. Tabelas geridas
   pelo ai-core (`ai_chat_threads`/`ai_user_memory`/`knowledge_*`) têm colunas EXATAS conforme
   `packages/ai-core/src/{memory,rag}.js`. Expurgo total no `disconnectSession`.
8. **PWA/Service Worker aposentados no `web/`** → o frontend atual (Vite) **não** é um PWA e **não**
   usa service worker. O `web/public/sw.js` é um **kill-switch**: existe só para substituir o SW antigo
   (do Expo) ainda registrado em navegadores/PWAs instalados — ele limpa os caches, se desregistra e
   recarrega os clients no app novo. Não reintroduzir SW/manifest esperando offline/instalável.

## Variáveis de ambiente chave

**Backend (runtime, em `k8s/zapbridge.yaml`; segredo via Secret):**
```bash
PORT=3000
DATABASE_URL=file:/data/zapbridge.db   # SQLite no PVC
AUTH_DIR=/data/auth                     # credenciais Baileys
MEDIA_DIR=/data/media
SOCKET_IO_PATH=/zapbridge/socket.io
CORS_ORIGIN=https://dev.nvit.com.br
JWT_SECRET=<Secret zapbridge-config>    # NUNCA em env/ConfigMap/git
```

**Frontend web (`web/`):** sem variáveis de build. A `base` (`/zapbridge/`) é fixada em
`web/vite.config.ts`; `API_URL`, `SOCKET_URL` e `SOCKET_PATH` são derivados de `window.location.origin`
em `web/src/api/client.ts`. (O Expo legado em `app/` usava `app.json > experiments.baseUrl`/`extra.*`.)

## Como trabalhar aqui

- **Rodar backend local:** `cd server` → `npm install` → `cp .env.example .env` (ajustar `JWT_SECRET`)
  → `npx prisma migrate dev` → `npm run dev` (http://localhost:3000).
- **Rodar frontend web local:** `cd web` → `npm install` → `npm run dev` (http://localhost:5173/zapbridge/;
  proxy de `/zapbridge/api` e `/zapbridge/socket.io` para `nvit.localhost`).
- **Build das imagens (lab):**
  - backend: `docker build -t zapbridge-server:local apps/zapbridge/server`
  - web: `cd apps/zapbridge/web; npm run build` (Vite → gera `web/dist/`) → `docker build -f apps/zapbridge/web/Dockerfile.web -t zapbridge-web:local apps/zapbridge/web`
- **Publicar/reverter:** commit dos manifests (Argo auto-sync aplica) ou `kubectl rollout restart`
  (com aprovação). Rollback em [`../../docs/runbooks/rollback.md`](../../docs/runbooks/rollback.md).
- **Debugar:** `kubectl logs -n apps deploy/zapbridge-server` / `deploy/zapbridge-web`;
  [`../../TROUBLESHOOTING.md`](../../TROUBLESHOOTING.md).

## GHCR / CI (follow-up)

Hoje as imagens são `:local` (build no nó, `IfNotPresent`) — mesmo padrão de gymops/rmambiental no
lab. O gate estático do `server` entra no `.github/workflows/ci-apps.yml` (lint/build). Pipeline
completo GHCR (build→push→deploy por `<sha>`) é um follow-up opcional; ver
[`../../docs/standards/golden-path.md`](../../docs/standards/golden-path.md).

## Regras inegociáveis

Ver [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md) (labels,
roteamento, segredos, GitOps, imagens) + as específicas de `zapbridge` no [`AGENTS.md`](./AGENTS.md) §8
(1 réplica/Recreate; frontend sem strip; socket.io priority 40 sem compress; segredo só via Secret;
uso legítimo do WhatsApp).
