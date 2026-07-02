# zapbridge-server

Backend do **ZapBridge** (MVP): Express + TypeScript + Prisma/SQLite + Socket.IO + Baileys.
Mantém a sessão de WhatsApp do próprio usuário (pareada via QR/pairing), persiste conversas e
mensagens, e entrega tudo ao app por REST + WebSocket.

> **Uso legítimo apenas.** Conecta somente a conta autorizada pelo usuário. Sem WhatsApp Business
> API, sem scraping, sem envio em massa.

## Requisitos
- Node.js 18+ (recomendado 20+)
- npm

## Setup

```bash
cd server
cp .env.example .env          # ajuste JWT_SECRET
npm install
npx prisma migrate dev --name init   # cria o SQLite e o client Prisma
npm run dev                   # sobe em http://localhost:3000
```

> O app mobile precisa alcançar este servidor pela rede. Use o **IP da máquina na LAN**
> (ex.: `http://192.168.0.10:3000`) na variável `API_URL` do app — `localhost` não funciona no
> dispositivo físico.

## Scripts
- `npm run dev` — desenvolvimento com reload (`tsx watch`).
- `npm run build && npm start` — build e execução de produção.
- `npm run prisma:studio` — inspecionar o banco.

## Estrutura
```
src/
  index.ts                 bootstrap Express + Socket.IO
  config/env.ts            variáveis de ambiente
  lib/prisma.ts            PrismaClient singleton
  middleware/auth.ts       JWT guard + assinatura de token
  realtime/io.ts           Socket.IO (auth JWT, rooms por usuário, emitToUser)
  modules/
    auth/                  register/login/logout/me
    whatsapp/              baileys.manager (sessão, QR, eventos) + rotas
    chats/                 listar, histórico, enviar texto/mídia
    contacts/ groups/ media/
  utils/ jid, asyncHandler
```

## Endpoints (resumo)
- `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET /me`
- `POST /whatsapp/session/start` · `POST /whatsapp/session/pair` · `GET /whatsapp/session/status` · `POST /whatsapp/session/disconnect`
- `GET /chats` · `GET /chats/:id` · `GET /chats/:id/messages` · `POST /chats/:id/messages` · `POST /chats/:id/media`
- `GET /contacts` · `GET /groups` · `GET /groups/:id` (detalhes + participantes) · `GET /media/:id`
- `POST /push/token` · `DELETE /push/token` (Expo push)
- `GET /health`

Detalhes em `../docs/MVP-FUNCIONAL.md`.

## Eventos WebSocket (server→app)
`session.qr.updated` · `session.pairing.code` · `session.connected` · `session.disconnected` ·
`chats.synced` · `chat.updated` · `message.received` · `message.sent` ·
`message.status.updated` · `media.downloaded` · `error.connection` · `error.message`.
Handshake autenticado por JWT em `auth.token`.

## Smoke test (sem app)
```bash
# 1) registrar
curl -s -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@a.com","password":"123456","displayName":"Ana"}'
# guarde o token retornado em TOKEN
# 2) iniciar sessão WhatsApp (depois conecte via app para ver o QR)
curl -s -X POST http://localhost:3000/whatsapp/session/start -H "Authorization: Bearer $TOKEN"
# 3) status
curl -s http://localhost:3000/whatsapp/session/status -H "Authorization: Bearer $TOKEN"
```

## Notas
- Credenciais Baileys ficam em `storage/auth/<userId>` (ignoradas no git).
- Mídia fica em `storage/media`.
- Para PostgreSQL, troque o `datasource` em `prisma/schema.prisma` e `DATABASE_URL`.

## Deploy no k8s — `dev.nvit.com.br/zapbridge` (plataforma DevOps local)

Publica o backend atrás do Traefik + Cloudflare Tunnel existentes (namespace `apps`), reusando o
mesmo domínio, **sem abrir portas** e **sem alterar outros apps**. Manifests em
[`deploy/k8s/zapbridge.yaml`](deploy/k8s/zapbridge.yaml).

Rotas (regra de ouro da plataforma):
- `…/zapbridge/api`        → REST, `priority 30`, strip `/zapbridge/api` (backend vê as rotas na raiz).
- `…/zapbridge/socket.io`  → WebSocket (Socket.IO), `priority 40`, **sem** strip (server com
  `SOCKET_IO_PATH=/zapbridge/socket.io`).

Persistência: PVC `zapbridge-data` (RWO, 2Gi) com SQLite (`/data/zapbridge.db`), credenciais Baileys
(`/data/auth`) e mídia (`/data/media`). Deployment `replicas: 1`, `strategy: Recreate`.

```powershell
# 1) imagem local
docker build -t zapbridge-server:local C:\Projetos\wpp\server
# 2) Secret (JWT) — fora do git
kubectl create secret generic zapbridge-config -n apps --from-literal=JWT_SECRET=<valor-forte>
# 3) aplicar
kubectl apply -f C:\Projetos\wpp\server\deploy\k8s\zapbridge.yaml
kubectl rollout status deploy/zapbridge-server -n apps
# 4) validar
curl http://nvit.localhost/zapbridge/api/health        # local (Traefik)
curl https://dev.nvit.com.br/zapbridge/api/health      # público (Cloudflare Tunnel)
```

O app mobile aponta para isso em `app.json → extra`: `apiUrl=https://dev.nvit.com.br/zapbridge/api`,
`socketUrl=https://dev.nvit.com.br`, `socketPath=/zapbridge/socket.io`.

> Para atualizar: rebuild da imagem `:local` + `kubectl rollout restart deploy/zapbridge-server -n apps`.
> GitOps (Argo) e CI/GHCR podem ser adicionados depois (contrato `devops.yaml` + Application do Argo).
