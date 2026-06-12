# =============================================================================
# site-renderer — renderer generico dos portais CMS (Vite + React), build de
# producao servido por nginx sob /sites/ (base embutida em vite.config.js).
#   docker build -t site-renderer:local console/site-renderer
# =============================================================================
FROM node:20-alpine AS build
WORKDIR /app
ENV npm_config_audit=false \
    npm_config_fund=false
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
