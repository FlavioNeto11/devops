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
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# 3) Codigo-fonte.
COPY src ./src

EXPOSE 8080
USER node
CMD ["node", "src/index.js"]
