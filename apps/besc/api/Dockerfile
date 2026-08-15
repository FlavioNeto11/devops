# BESC API (Express + JSON store p/ portal/levantamento + Postgres p/ identidade/RBAC/auditoria).
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# tarballs @flavioneto11/* precisam existir ANTES do npm ci (deps file:vendor/...)
COPY vendor ./vendor
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY src ./src
COPY sql ./sql
COPY seed ./seed
ENV DATA_DIR=/data
EXPOSE 8080
USER node
CMD ["npm", "start"]
