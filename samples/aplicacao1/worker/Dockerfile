# =============================================================================
# Dockerfile - Worker (Node.js) da aplicacao1
# -----------------------------------------------------------------------------
# Imagem local do laboratorio: aplicacao1-worker:local
# Imagem GHCR (CI): ghcr.io/flavioneto11/aplicacao1/worker:<tag>
# Sem dependencias externas (apenas modulos nativos do Node), logo nao ha npm ci.
# =============================================================================
FROM node:20-alpine

WORKDIR /app

# Codigo do worker (sem dependencias externas).
COPY worker.js ./
COPY package.json ./

ENV PORT=8081
EXPOSE 8081

CMD ["node", "worker.js"]
