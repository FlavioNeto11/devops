# imobia frontend (Vue 3 SPA) — build node -> nginx. Base path /imobia/.
FROM node:20-alpine AS build
WORKDIR /app
ENV npm_config_audit=false npm_config_fund=false
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
ARG VITE_BASE_PATH=/imobia/
ENV VITE_BASE_PATH=$VITE_BASE_PATH
RUN npm run build
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html/imobia
EXPOSE 80
