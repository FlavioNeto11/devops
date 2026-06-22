# ShopDesk — Loja + Checkout + NF API + worker (mesma imagem) — gerado pela Forge.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# vendor/ (kits @flavioneto11/* .tgz) ANTES do install p/ resolver as deps file:vendor/*.
COPY vendor ./vendor
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY src ./src
# Contrato OpenAPI (servido em runtime: GET /v1/openapi.yaml e /v1/openapi.json; importado por src/server.js).
COPY openapi ./openapi
EXPOSE 8080 9464
USER node
CMD ["npm", "start"]
