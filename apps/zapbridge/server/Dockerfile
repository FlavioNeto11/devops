# zapbridge-server — imagem do backend (Express + Prisma + Socket.IO + Baileys).
# node:20-slim (Debian) evita as dores do Prisma no Alpine (musl/openssl).
FROM node:20-slim

# Prisma precisa do openssl em runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências (mantém o CLI do Prisma p/ `migrate deploy` no start).
# patches/ precisa estar presente para o postinstall (patch-package) rodar.
# vendor/ tem os kits @flavioneto11/* (deps file:) — precisa existir ANTES do npm ci.
# .npmrc traz legacy-peer-deps (peer multer do ai-ingest-middleware) — necessário no npm ci.
COPY package*.json .npmrc ./
COPY patches ./patches
COPY vendor ./vendor
RUN npm ci

# Gera o Prisma Client.
COPY prisma ./prisma
RUN npx prisma generate

# Compila o TypeScript.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Diretório de dados (montado por PVC no k8s: SQLite + auth Baileys + mídia).
RUN mkdir -p /data && chown -R node:node /data /app
USER node

ENV NODE_ENV=production
EXPOSE 3000

# Aplica migrations e sobe o servidor.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
