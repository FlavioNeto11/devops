# =============================================================================
# Portal NovaIT - landing na raiz (/) que lista as apps publicadas dinamicamente.
# Imagem local do laboratorio: portal-frontend:local (imagePullPolicy IfNotPresent).
#   docker build -t portal-frontend:local C:/devops/portal/frontend
# =============================================================================
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
