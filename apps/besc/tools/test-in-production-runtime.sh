#!/usr/bin/env sh
# Roda a suíte da API DENTRO da imagem de produção (Node do Dockerfile = .nvmrc) contra a imagem de
# Postgres de produção (pgvector/pgvector:pg16, POSTGRES_USER superusuário como no cluster).
# tested_runtime == production_runtime. Só usa Docker local; nunca toca o cluster.
# Uso (na raiz do monorepo): sh apps/besc/tools/test-in-production-runtime.sh
set -eu
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
NET=besc-parity; PG=besc-parity-pg; IMG=besc-api:parity
docker build -q -t "$IMG" "$ROOT/apps/besc/api" >/dev/null
docker build -q -t besc-frontend:parity "$ROOT/apps/besc/frontend" >/dev/null   # build de produção do frontend
docker network create "$NET" >/dev/null 2>&1 || true
docker rm -f "$PG" >/dev/null 2>&1 || true
docker run -d --rm --name "$PG" --network "$NET" -e POSTGRES_USER=besc -e POSTGRES_PASSWORD=t -e POSTGRES_DB=besc pgvector/pgvector:pg16 >/dev/null
i=0; until docker logs "$PG" 2>&1 | grep -q "PostgreSQL init process complete"; do i=$((i+1)); [ "$i" -gt 90 ] && exit 1; sleep 1; done; sleep 2
status=0
MSYS_NO_PATHCONV=1 docker run --rm --network "$NET" --user root -e TEST_PG_ADMIN_URL="postgres://besc:t@$PG:5432/besc" -v "$ROOT:/src:ro" "$IMG" sh -c '
  set -e; mkdir -p /tmp/repo; cd /src
  tar --exclude=node_modules --exclude=dist -cf - apps/besc/api apps/besc/k8s apps/besc/frontend/src apps/besc/frontend/.nvmrc apps/besc/frontend/Dockerfile apps/besc/frontend/package.json platform/argocd/apps/besc.yaml scripts/besu-deploy-contract.ps1 | tar -xf - -C /tmp/repo
  rm -rf /tmp/repo/apps/besc/api/node_modules && ln -s /app/node_modules /tmp/repo/apps/besc/api/node_modules
  chown -R node:node /tmp/repo; cd /tmp/repo/apps/besc/api
  echo "tested_runtime: node $(node -v) (imagem de produção da API)"
  su node -s /bin/sh -c "TEST_PG_ADMIN_URL=$TEST_PG_ADMIN_URL node --test"' || status=$?
docker rm -f "$PG" >/dev/null 2>&1 || true
exit $status
