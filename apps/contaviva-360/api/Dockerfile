# ContaViva 360 API + worker BullMQ (Fastify) — gerado pela Forge.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY vendor ./vendor
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY src ./src
EXPOSE 8080 9464
USER node
CMD ["npm", "start"]
