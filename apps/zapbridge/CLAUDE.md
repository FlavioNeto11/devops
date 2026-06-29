---
title: "ZapBridge — Manual para Claude Code"
status: canonical
applies_to: [zapbridge]
updated: 2026-06-29
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
- **`app/`** — cliente Expo/React Native + **react-native-web**: no celular vira app nativo; na web é
  buildado (`expo export --platform web`) e servido por nginx como SPA sob `/zapbridge/`.
- **`docs/MVP-FUNCIONAL.md`** — documento funcional completo (20 seções, 45 RFs).

Servido na esteira sob `https://dev.nvit.com.br/zapbridge` (e `nvit.localhost` no dev). É um app
`product_software` com **api** (server, com strip) + **frontend** (web, sem strip) + rota dedicada de
**WebSocket**.

## Ordem de leitura

1. Este arquivo.
2. [`AGENTS.md`](./AGENTS.md) — fronteiras + matriz de decisão (obrigatório antes de agir).
3. [`README.md`](./README.md) — visão do produto e como rodar local.
4. [`server/README.md`](./server/README.md) e [`app/README.md`](./app/README.md) — setup/build/deploy de cada lado.
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
| Frontend | Expo 52 + React Native 0.76 + react-native-web | um código → mobile + web (SPA) |
| Runtime web | nginx:alpine servindo `app/dist/` | imagem mínima, MIME-safe (subpath) |
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
   (`app/app.json > extra.socketPath` e env `SOCKET_IO_PATH`). A rota WS **não** leva `compress` nem
   strip — Socket.IO casa o path inteiro. `socketUrl` no app é a **origem** (`https://dev.nvit.com.br`),
   não o subpath.
2. **base path do app web** → o build embute `/zapbridge` via `app.json > experiments.baseUrl`. O
   `nginx.conf` usa **prefixo + alias estático** para `/_expo/`, `/assets/`, `/icons/` (nunca `alias`
   com captura de regex — serve `application/octet-stream` e quebra a SPA; ver TROUBLESHOOTING §14).
3. **Baileys no Alpine** → o backend usa `node:20-slim` (Debian) + `openssl` por causa do Prisma
   (musl/openssl no Alpine dá dor). Não trocar para Alpine sem cuidar disso.
4. **patch-package** → `server/patches/@whiskeysockets+baileys+*.patch` é aplicado no `postinstall`. O
   Dockerfile copia `patches/` antes do `npm ci`. Não remover.
5. **SQLite em PVC RWO** → single-writer. Não rodar 2 réplicas, não trocar `strategy` para
   RollingUpdate (duas instâncias gravando = corrupção).
6. **Migrations** → `prisma migrate deploy` roda no **start** do container (não no build). Novas
   migrations: `npx prisma migrate dev` local, commitar `prisma/migrations/**`.

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

**App web (build-time, em `app/app.json`):** `experiments.baseUrl=/zapbridge`, `extra.apiUrl`,
`extra.socketUrl`, `extra.socketPath`.

## Como trabalhar aqui

- **Rodar backend local:** `cd server` → `npm install` → `cp .env.example .env` (ajustar `JWT_SECRET`)
  → `npx prisma migrate dev` → `npm run dev` (http://localhost:3000).
- **Rodar app local:** `cd app` → `npm install` → ajustar `extra.apiUrl` em `app.json` → `npx expo start`.
- **Build das imagens (lab):**
  - backend: `docker build -t zapbridge-server:local apps/zapbridge/server`
  - web: `cd apps/zapbridge/app; npm run build:web` → `docker build -f apps/zapbridge/app/Dockerfile.web -t zapbridge-web:local apps/zapbridge/app`
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
