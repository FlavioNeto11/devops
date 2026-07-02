# ZapBridge

Cliente mobile de mensageria que conecta à conta de WhatsApp **do próprio usuário** via
[WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys). MVP composto por um **backend
Node.js/TypeScript** (mantém a sessão e persiste dados) e um **app mobile Expo/React Native**.

> **Uso legítimo apenas.** Conecta somente a conta autorizada pelo usuário (QR/pairing). Sem
> WhatsApp Business API, sem scraping, sem envio em massa. Experiência apenas *inspirada* em
> mensageria — sem usar marca/identidade do WhatsApp.

## Estrutura do repositório
```
wpp/
  docs/MVP-FUNCIONAL.md   # documento funcional completo do MVP (20 seções, 45 RFs)
  server/                 # backend: Express + Prisma/SQLite + Socket.IO + Baileys
  app/                    # mobile: Expo + React Native + TypeScript
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

**App**
```bash
cd app
npm install
# edite extra.apiUrl em app.json com o IP da máquina na LAN (ex.: http://192.168.0.10:3000)
npx expo start              # abra no Expo Go (Android/iOS)
```

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
- **`/zapbridge`** — landing + **app web** (Expo/react-native-web servido por nginx).
- **`/zapbridge/api`** — REST (backend, strip).
- **`/zapbridge/socket.io`** — WebSocket em tempo real (backend).

Passos de build/deploy no [server/README.md](server/README.md) (backend) e [app/README.md](app/README.md) (web).

## Roadmap (Fase 2, opcional)
Respostas sugeridas por IA (Claude), detecção de estilo de escrita, resumo de conversa, busca
semântica, multi-sessão, backup e painel web. Onboarding na esteira DevOps local quando publicar.
