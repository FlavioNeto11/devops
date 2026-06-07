# =============================================================================
# Dockerfile - API (Express / Node.js) da aplicacao1
# -----------------------------------------------------------------------------
# Imagem local do laboratorio: aplicacao1-api:local
# Imagem GHCR (CI): ghcr.io/flavioneto11/aplicacao1/api:<tag>
# =============================================================================
FROM node:20-alpine

WORKDIR /app

# Instala dependencias primeiro (cache de camadas).
COPY package.json package-lock.json* ./
# Instalacao reproduzivel quando ha lockfile (npm ci); senao cai para npm install.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Codigo da aplicacao.
COPY server.js ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
