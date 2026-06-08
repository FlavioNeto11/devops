FROM node:20-bookworm-slim

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@9.0.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile \
    && pnpm --filter @gymops/db generate \
    && pnpm --filter @gymops/db build \
    && pnpm --filter @gymops/api build

EXPOSE 3001

# Migrations must be run separately via the CI/CD pipeline before deploying
# (pnpm --filter @gymops/db migrate:deploy)
CMD ["node", "apps/api/dist/index.js"]
