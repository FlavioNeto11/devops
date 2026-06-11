# syntax=docker/dockerfile:1
#
# Dockerfile da API do ai-control-plane (governança de IA da plataforma).
# ----------------------------------------------------------------------
# Contexto de build esperado: a pasta "api" (apps/ai-control-plane/api):
#   docker build -t ai-control-plane-api:local apps/ai-control-plane/api
#
# Imagem LOCAL do laboratório: ai-control-plane-api:local
# (buildada localmente, NÃO enviada ao registry; imagePullPolicy: IfNotPresent).

FROM node:20-alpine

WORKDIR /app

# Produção: desabilita devDependencies em libs que checam NODE_ENV.
ENV NODE_ENV=production

# 1) Apenas manifestos de dependências primeiro (cache de camadas).
COPY package*.json ./

# 2) Instalação limpa/reprodutível com lockfile (npm ci); fallback npm install.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# 3) Código-fonte.
COPY src ./src

# Porta HTTP (alinhada a src/index.js e ao Service ClusterIP).
EXPOSE 8080

# Usuário não-root 'node' (uid 1000) da imagem oficial.
USER node

CMD ["node", "src/index.js"]
