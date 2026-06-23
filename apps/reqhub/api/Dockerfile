# syntax=docker/dockerfile:1
#
# Dockerfile da API de IA de autoria do Reqhub.
# ---------------------------------------------
# Contexto de build = a pasta "api" (apps/reqhub/api):
#   docker build -t reqhub-api:local apps/reqhub/api
#
# Imagem LOCAL do laboratorio: reqhub-api:local (IfNotPresent, sem registry).
# CI/GHCR publica ghcr.io/flavioneto11/reqhub/api:<sha>.

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# 1) Manifestos + tarballs vendados (cache de camadas; @flavioneto11/* sao file:vendor).
COPY package*.json ./
COPY vendor ./vendor

# 2) Instalacao limpa/reprodutivel com lockfile (npm ci); fallback npm install.
#    O "|| npm install" cobre DRIFT do lockfile: ao adicionar deps novas (file-ingest-kit,
#    ai-ingest-middleware, multer, pdf-parse/mammoth/xlsx/jszip) sem regenerar o lock no host,
#    o npm ci falharia por estar fora de sync -> caimos no npm install (que reescreve o lock
#    DENTRO da imagem). Idealmente o operador roda `npm install` no host e commita o lock.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev || npm install --omit=dev; else npm install --omit=dev; fi

# 3) Codigo-fonte.
COPY src ./src

EXPOSE 8080
USER node
CMD ["node", "src/index.js"]
