# imobia API/worker — Node 20 + TypeScript via tsx (mesma imagem, dois comandos).
# Prisma: openssl exigido pelos engines no bookworm-slim; `prisma generate` gera o client
# ANTES do runtime; `prisma/` fica no runtime para o `migrate deploy` no boot (npm start).
# Kits @flavioneto11/* vendorados como file:vendor/*.tgz. Runtime nao-root.
# IMPORTANTE: instalar deps ANTES de NODE_ENV=production (tsx/typescript sao devDeps).
FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV npm_config_audit=false npm_config_fund=false
COPY package*.json ./
COPY vendor ./vendor
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev; fi
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["npm", "start"]
