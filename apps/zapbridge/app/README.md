# zapbridge-app

App mobile do **ZapBridge** (MVP) em **Expo / React Native / TypeScript**. Conecta-se ao
`zapbridge-server` por REST + WebSocket para exibir e responder as conversas da conta de WhatsApp
do próprio usuário (pareada via QR).

> Experiência apenas *inspirada* em mensageria. Sem marca/identidade de terceiros. Uso legítimo da
> própria conta.

## Requisitos
- Node.js 18+
- App **Expo Go** no celular (Android/iOS) **ou** emulador
- O `zapbridge-server` rodando e acessível na mesma rede

## Setup

```bash
cd app
npm install
# Aponte o app para o backend: edite extra.apiUrl em app.json com o IP da máquina na LAN
#   ex.: "apiUrl": "http://192.168.0.10:3000"  (NÃO use localhost no dispositivo físico)
npx expo start
```

Abra o QR do Expo no app Expo Go (ou pressione `a`/`i` para emulador).

## Fluxo de uso
1. Crie a conta (Cadastro) → login.
2. Toque em **Conectar WhatsApp** → escaneie o QR com o celular dono da conta.
3. As conversas sincronizam e aparecem na lista.
4. Abra uma conversa, envie texto/imagem; mensagens novas chegam em tempo real.
5. Em **Configurações**, veja o número/status e **Desconecte** quando quiser.

## Estrutura
```
src/
  App.tsx                  bootstrap + revalidação de sessão + bind realtime
  navigation/RootNavigator alterna Auth vs App
  api/client.ts            Axios + JWT (SecureStore)
  realtime/socket.ts       socket.io-client autenticado
  store/                   auth | session | chats (Zustand)
  screens/                 Login, Register, ConnectWhatsApp, ChatList, Chat,
                           Contacts, Groups, Settings, MediaViewer
  components/              ChatListItem, MessageBubble, MessageInput,
                           ConnectionBanner, EmptyState, SkeletonList
  theme/theme.ts           paleta própria
```

## Notas
- `API_URL` vem de `app.json → extra.apiUrl` (lido via `expo-constants`).
- Token JWT guardado em `expo-secure-store` (nativo) ou `localStorage` (web) — ver
  [tokenStore.ts](src/storage/tokenStore.ts).
- Imagens recebidas são servidas por `GET /media/:id` com `Authorization`.

## Versão web — `https://dev.nvit.com.br/zapbridge` (landing + app web)

O mesmo código roda na web via **react-native-web** (Expo). A entrada na web é uma **landing**
([LandingScreen](src/screens/LandingScreen.tsx)); o resto é o app funcional (login, QR, conversas,
tempo real). Base path `/zapbridge` vem de `app.json → experiments.baseUrl`.

```powershell
# 1) gerar o bundle web estático (gera app/dist)
cd app
npx expo export --platform web
# 2) imagem nginx (serve dist sob /zapbridge, MIME-safe)
docker build -f Dockerfile.web -t zapbridge-web:local .
# 3) publicar no k8s (Deployment/Service; a rota /zapbridge entra no IngressRoute zapbridge)
kubectl apply -f ../server/deploy/k8s/zapbridge-web.yaml
kubectl apply -f ../server/deploy/k8s/zapbridge.yaml
```

Roteamento (mesmo host, prioridades do Traefik): `/zapbridge/api` (30, backend) e
`/zapbridge/socket.io` (40, backend) vencem; o restante de `/zapbridge` cai no frontend (10).
Como o app web é servido na **mesma origem** da API, não há CORS.

> Atualizar a web: novo `expo export` → rebuild `zapbridge-web:local` →
> `kubectl rollout restart deploy/zapbridge-web -n apps`.
