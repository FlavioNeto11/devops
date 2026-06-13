# =============================================================================
# Portal NovaIT — landing na raiz (/) que lista as apps publicadas.
# Imagem local do laboratorio: portal-frontend:local (imagePullPolicy IfNotPresent).
#   docker build -t portal-frontend:local C:/devops/portal/frontend
# Estatico (nginx). Copiamos apenas os artefatos servidos — testes, package.json
# e docs do componente NAO entram na imagem.
# =============================================================================
FROM nginx:alpine

LABEL org.opencontainers.image.title="NovaIT Portal" \
      org.opencontainers.image.description="Landing publica da plataforma DevOps NovaIT" \
      org.opencontainers.image.source="https://github.com/FlavioNeto11/devops"

# Config do servidor (headers, gzip, cache, 404).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Conteudo estatico servido na raiz.
COPY index.html 404.html robots.txt sitemap.xml site.webmanifest favicon.svg /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
