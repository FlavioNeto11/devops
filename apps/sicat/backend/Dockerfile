# =============================================================================
# SICAT backend (Node 20 + TypeScript/ESM via tsx) - imagem UNICA usada por:
#   - api    -> CMD npm start          (tsx src/server.ts, porta 8080)
#   - worker -> command npm run worker (tsx src/worker.ts)
# Build (contexto apps/sicat; .dockerignore exclui node_modules/frontend/etc):
#   docker build -t sicat-api:local -f Dockerfile .
# =============================================================================
FROM node:20-alpine
WORKDIR /app
# Evita baixar browsers do Playwright (devDep so de testes) e acelera o npm.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    npm_config_audit=false \
    npm_config_fund=false
RUN apk add --no-cache ca-certificates && update-ca-certificates
COPY package*.json ./
# tsx/typescript sao devDependencies mas necessarias em runtime -> inclui dev.
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install; fi
COPY . .
ENV NODE_ENV=production \
    PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
