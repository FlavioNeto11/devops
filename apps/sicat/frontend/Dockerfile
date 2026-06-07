# =============================================================================
# SICAT frontend (Vue 3 + Vuetify + Vite) - build de PRODUCAO servido por nginx.
# Servido sob o subpath /sicat/ (base path) na esteira; API consumida em /sicat/api.
#   docker build -t sicat-frontend:local \
#     --build-arg VITE_API_BASE_URL=/sicat/api -f frontend/Dockerfile frontend
# (O Dockerfile DEV original continua no repo legado FlavioNeto11/sicat.)
# =============================================================================
FROM node:20-alpine AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    npm_config_audit=false \
    npm_config_fund=false
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
# As VITE_* sao embutidas no bundle em build-time.
ARG VITE_API_BASE_URL=/sicat/api
ARG VITE_REQUIRE_REAL_AUTH=true
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_REQUIRE_REAL_AUTH=$VITE_REQUIRE_REAL_AUTH
# base=/sicat/ -> assets em /sicat/assets e import.meta.env.BASE_URL=/sicat/ (router).
RUN npm run build -- --base=/sicat/

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
