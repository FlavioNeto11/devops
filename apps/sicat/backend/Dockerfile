# syntax=docker/dockerfile:1
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
# Pacotes @flavioneto11/* vendorizados (dep file: no package.json) precisam existir ANTES do npm ci.
COPY vendor ./vendor
# tsx/typescript sao devDependencies mas necessarias em runtime -> inclui dev.
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install; fi
COPY . .
# RAG: gera o indice de conhecimento (artifacts/conversation-knowledge-index.json) em BUILD-TIME.
# As fontes (docs/copilot + docs/ai-chat) vem via COPY (des-ignoradas no .dockerignore).
# A chave OpenAI vem via secret do BuildKit (NUNCA embarcada na imagem; o mount e efemero).
# Sem o secret, a imagem builda sem indice (RAG degrada p/ vazio; reindex posterior popula).
#   docker build --secret id=openai_key,src=<arquivo-com-a-chave> ...
RUN --mount=type=secret,id=openai_key \
    sh -c 'if [ -s /run/secrets/openai_key ]; then OPENAI_API_KEY="$(cat /run/secrets/openai_key)" npm run build:rag; else echo "[build:rag] sem secret openai_key -> indice nao gerado nesta build"; fi'
ENV NODE_ENV=production \
    PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
