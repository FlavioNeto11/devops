# =============================================================================
# Reqhub — workbench estático (nginx) da base de requisitos.
# CONTEXTO DE BUILD = RAIZ DO REPO (precisa de specs/baseline/ + apps/reqhub/frontend/).
#   docker build -t reqhub-frontend:local -f apps/reqhub/Dockerfile .
# A baseline gerada (specs/baseline/*.json) é assada em /data e servida em /reqs/data/.
# Rebuild quando specs/baseline muda (ci-reqhub dispara em specs/baseline/**).
# =============================================================================
FROM nginx:alpine
COPY apps/reqhub/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/reqhub/frontend/ /usr/share/nginx/html/
COPY specs/baseline/ /usr/share/nginx/html/data/
# Artefatos por produto do Forge (build-plan.json por produto) — servidos em /reqs/data/products/<name>/.
COPY specs/products/ /usr/share/nginx/html/data/products/
EXPOSE 80
