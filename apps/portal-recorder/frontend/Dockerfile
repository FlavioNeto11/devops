# =============================================================================
# Dockerfile — portal-recorder (frontend React + Vite)
# -----------------------------------------------------------------------------
# Build multi-stage. O CONTEXTO de build e a pasta `frontend/` (os COPY
# referenciam os arquivos diretamente, sem prefixo de subpasta).
#
#   Build local (imagem do laboratorio, NAO enviada ao registry):
#     docker build -t portal-recorder-frontend:local .
#       (executado de dentro de C:/devops/apps/portal-recorder/frontend)
#
# A imagem final usa imagePullPolicy: IfNotPresent no cluster.
# A SPA e gerada com base '/portal-rec/' (ver vite.config.js) e servida pelo nginx
# sob o subpath /portal-rec/ (ver nginx.conf).
# =============================================================================

# ----------------------------------------------------------------- Stage 1: build
FROM node:20-alpine AS build
WORKDIR /app

# Copia apenas os manifests primeiro para aproveitar o cache de camadas do Docker:
# enquanto package*.json nao mudar, a instalacao nao roda de novo.
COPY package*.json ./

# Instalacao reproduzivel. Se nao houver package-lock.json, cai para `npm install`.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copia o restante do codigo do frontend e gera o build de producao em /app/dist.
COPY . ./
RUN npm run build

# ----------------------------------------------------------------- Stage 2: runtime
FROM nginx:alpine AS runtime

# Configuracao do nginx que serve a SPA sob /portal-rec/ (alias + try_files).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Artefatos estaticos buildados (base /portal-rec/) servidos pelo nginx.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Health check do container alinhado ao endpoint `location = /healthz` do nginx.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

# nginx:alpine ja define o CMD padrao (nginx -g 'daemon off;').
