FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY server.js ./
COPY src/ ./src/
COPY migrations/ ./migrations/
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
