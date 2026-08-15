# ZapBridge

Cliente de mensageria que conecta à conta de WhatsApp **do próprio usuário** via
[WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys). Composto por um **backend
Node.js/TypeScript** (mantém a sessão e persiste dados) e um **frontend web React 18 + Vite** (`web/`).

> O cliente **Expo/React Native** em `app/` é **legado/aposentado** (mobile histórico) e não é mais o
> build publicado na web.

> **Uso legítimo apenas.** Conecta somente a conta autorizada pelo usuário (QR/pairing). Sem
> WhatsApp Business API, sem scraping, sem envio em massa. Experiência apenas *inspirada* em
> mensageria — sem usar marca/identidade do WhatsApp.

## Estrutura do repositório
```
wpp/
  docs/MVP-FUNCIONAL.md   # documento funcional completo do MVP (20 seções, 45 RFs)
  server/                 # backend: Express + Prisma/SQLite + Socket.IO + Baileys
  web/                    # frontend web ATUAL: React 18 + Vite + TypeScript (SPA, deploy)
  app/                    # LEGADO/aposentado: cliente mobile Expo + React Native
```

## Como rodar (resumo)

**Backend**
```bash
cd server
cp .env.example .env        # ajuste JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run dev                 # http://localhost:3000
```

**Frontend web (`web/`)**
```bash
cd web
npm install
npm run dev                 # http://localhost:5173/zapbridge/ (proxy de /zapbridge/api → nvit.localhost)
npm run build               # Vite → gera web/dist/ (base /zapbridge/), servido por nginx no deploy
```
> O cliente Expo em `app/` é legado; instruções históricas em [`app/README.md`](app/README.md).

## Verificação end-to-end
1. Registrar/login no app.
2. Conectar WhatsApp → escanear o QR com o celular dono da conta.
3. Ver conversas sincronizadas, abrir uma conversa, enviar texto (pending → sent).
4. Enviar mensagem de outro telefone e vê-la chegar em tempo real.
5. Enviar uma imagem; desconectar a sessão em Configurações.

Detalhes completos (telas, requisitos, regras, API, eventos, fluxos, critérios de aceite e fase 2)
em [`docs/MVP-FUNCIONAL.md`](docs/MVP-FUNCIONAL.md).

## Produto na web — `https://dev.nvit.com.br/zapbridge`

O ZapBridge está publicado na plataforma DevOps local (Traefik + Cloudflare Tunnel), reusando o
mesmo domínio, sem abrir portas e sem alterar outros apps:
- **`/zapbridge`** — **app web** (React 18 + Vite, servido por nginx).
- **`/zapbridge/api`** — REST (backend, strip).
- **`/zapbridge/socket.io`** — WebSocket em tempo real (backend).

Passos de build/deploy no [server/README.md](server/README.md) (backend); o frontend web vive em
`web/` (build Vite — ver acima). ([`app/README.md`](app/README.md) cobre o cliente Expo legado.)

## Roadmap (Fase 2, opcional)
Respostas sugeridas por IA (Claude), detecção de estilo de escrita, resumo de conversa, busca
semântica, multi-sessão, backup e painel web. Onboarding na esteira DevOps local quando publicar.
