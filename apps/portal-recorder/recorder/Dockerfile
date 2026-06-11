# syntax=docker/dockerfile:1
#
# Dockerfile do recorder do portal-recorder (dirige o Chromium via Playwright/CDP).
# Base oficial da Playwright: já traz o Chromium + libs do sistema em /ms-playwright
# (PLAYWRIGHT_BROWSERS_PATH apontado). A versão do npm `playwright` DEVE casar com a
# tag da imagem (1.54.2) — senão o browser instalado não bate com o cliente.
#
# Build: docker build -t portal-recorder-recorder:local apps/portal-recorder/recorder
FROM mcr.microsoft.com/playwright:v1.54.2-jammy

WORKDIR /app
ENV NODE_ENV=production
# não baixar browsers no npm install — já vêm na imagem base
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY src ./src

EXPOSE 8090 8091
USER pwuser
CMD ["node", "src/index.js"]
