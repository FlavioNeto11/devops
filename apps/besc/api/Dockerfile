# BESC API (Express + JSON store). Sem deps nativas, sem banco externo.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY src ./src
ENV DATA_DIR=/data
EXPOSE 8080
USER node
CMD ["npm", "start"]
