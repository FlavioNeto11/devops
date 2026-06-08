# =============================================================================
# RM Ambiental — portal institucional (Vite + React + TS) build de PRODUCAO.
# Servido por nginx sob o subpath /rmambiental/ (base path embutido em vite.config.ts).
#   docker build -t rmambiental-frontend:local apps/rmambiental
# =============================================================================
FROM node:20-alpine AS build
WORKDIR /app
ENV npm_config_audit=false \
    npm_config_fund=false
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
# base /rmambiental/ vem de vite.config.ts (sobrescrevivel via VITE_BASE_PATH).
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
