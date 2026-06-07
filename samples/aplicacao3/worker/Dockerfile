FROM node:20-alpine
WORKDIR /app
COPY worker.js ./
COPY package.json ./
USER node
ENV PORT=8081
EXPOSE 8081
CMD ["node", "worker.js"]
