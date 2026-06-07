# =============================================================================
# Dockerfile - Frontend (nginx servindo SPA estatica) da aplicacao1
# -----------------------------------------------------------------------------
# Imagem local do laboratorio: aplicacao1-frontend:local
# Imagem GHCR (CI): ghcr.io/flavioneto11/aplicacao1/frontend:<tag>
# =============================================================================
FROM nginx:alpine

# Configuracao do nginx (SPA servida no subpath /aplicacao1/, sem strip).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Conteudo estatico da SPA.
COPY index.html /usr/share/nginx/html/

EXPOSE 80

# nginx:alpine ja define o CMD padrao (nginx -g 'daemon off;').
