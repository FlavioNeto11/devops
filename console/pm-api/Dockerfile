# =============================================================================
# pm-api — Projetos & Tarefas (API de escrita do Console). Node 20 + Express + pg.
# Isolado do backend read-only de cluster (SA sem ClusterRole; so fala com pm-postgres).
#   docker build -t console-pm:local C:/devops/console/pm-api
# =============================================================================
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production npm_config_audit=false npm_config_fund=false
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY src ./src
COPY scripts ./scripts
USER node
EXPOSE 3002
CMD ["node", "src/index.js"]
