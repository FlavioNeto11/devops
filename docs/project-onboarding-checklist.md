# Checklist de Onboarding de uma Nova Aplicacao

Checklist objetivo e acionavel para adicionar uma nova aplicacao a Plataforma DevOps Local
(do repositorio ao app no ar, com rotas validadas e visivel no DevOps Console). Use junto
com a referencia completa do contrato em [`new-project-contract.md`](./new-project-contract.md)
e a convencao de roteamento em [`path-routing-pattern.md`](./path-routing-pattern.md).

> Exemplo de referencia ao longo do checklist: uma app `aplicacao2` (frontend + api +
> api2), servida em `/aplicacao2` no host `xpto.localhost`.

> **Atalho (gera tudo no padrao):** `C:\devops\scripts\new-app.ps1 -Name <app> -Services frontend,api,api2,worker`
> cria `devops.yaml` + Dockerfiles + `k8s/` + workflow + **Application do Argo (GitOps)** e
> imprime os comandos de `docker build`/`kubectl apply`. Os passos abaixo explicam o que ele
> gera (e como fazer manualmente, se preferir). Exemplos reais no repo: `samples/aplicacao1`,
> `samples/aplicacao2` (multi-API) e `samples/aplicacao3` (gerada pelo `new-app.ps1`).

---

## 0. Antes de comecar (pre-requisitos)

- [ ] Plataforma instalada e saudavel: `bootstrap.ps1` rodou e `validate-platform.ps1`
      passou (veja [`deployment-flow.md`](./deployment-flow.md), secao 2).
- [ ] Contexto kube correto: `kubectl config current-context` -> **`docker-desktop`**.
- [ ] `docker`, `kubectl`, `helm`, PowerShell 7 disponiveis no PATH.
- [ ] (Para fluxo via Actions/GHCR) runner self-hosted ativo — veja
      [`github-runner-setup.md`](./github-runner-setup.md).

---

## 1. Criar o repositorio da aplicacao

- [ ] Criar o repo (ex.: `FlavioNeto11/aplicacao2`) ou uma pasta de app no monorepo.
- [ ] Definir a estrutura de servicos. Convencao sugerida: um diretorio por servico com seu
      proprio `Dockerfile`:
      ```
      aplicacao2/
      ├── devops.yaml                 # contrato canonico (RAIZ)
      ├── .github/workflows/
      │   └── pipeline.yaml           # copia do template (discover -> build -> deploy)
      ├── services/
      │   ├── frontend/  (Dockerfile, codigo SPA)
      │   ├── api/       (Dockerfile, codigo backend)
      │   └── api2/      (Dockerfile, codigo backend admin)
      └── k8s/                        # manifests (ou use o Helm chart da plataforma)
      ```
- [ ] Inicializar o Git e fazer o primeiro commit do esqueleto.

---

## 2. Escrever o `devops.yaml` (na RAIZ)

> Referencia campo-a-campo: [`new-project-contract.md`](./new-project-contract.md).

- [ ] Bloco `app`: `name` (kebab-case), `namespace` (`apps` por padrao), `host`
      (`xpto.localhost`), `basePath` (`/aplicacao2`).
- [ ] Um item em `services` por servico, com `type` correto
      (`frontend`/`api`/`api2`/`worker`).
- [ ] **Frontend**: `expose: true`, `stripPrefix: false`, `env.VITE_BASE_PATH=/aplicacao2/`
      (barra final), `port` (geralmente `80`), `health.path: /`.
- [ ] **API/api2**: `expose: true`, `stripPrefix: true`, `path` especifico (`/api`, `/api2`),
      `port` (ex.: `8080`, `8082`), `health.path` como o processo ve (ex.: `/health`).
- [ ] **Worker** (se houver): `expose: false`, `port`, `health.path` (health interno).
- [ ] Conferir a convencao: APIs com `path` **mais especifico** que o frontend; frontend
      **nunca** faz strip.

Exemplo minimo (veja o completo em
[`new-project-contract.md`](./new-project-contract.md), secao 8):

```yaml
app:
  name: aplicacao2
  namespace: apps
  host: xpto.localhost
  basePath: /aplicacao2
services:
  frontend:
    type: frontend
    path: /
    image: aplicacao2-frontend
    port: 80
    expose: true
    stripPrefix: false
    env: { VITE_BASE_PATH: /aplicacao2/ }
    health: { path: / }
  api:
    type: api
    path: /api
    image: aplicacao2-api
    port: 8080
    expose: true
    stripPrefix: true
    health: { path: /health }
  api2:
    type: api2
    path: /api2
    image: aplicacao2-api2
    port: 8082
    expose: true
    stripPrefix: true
    health: { path: /health }
```

- [ ] Validar a renderizacao (sem aplicar):
      ```powershell
      helm template ./ -f values.local.yaml     # a partir do diretorio do chart
      ```
      Esperado: `Deployment`, `Service`, `IngressRoute` e `Middleware` coerentes (frontend
      sem strip; api/api2 com strip e priority alta).

---

## 3. Escrever um `Dockerfile` por servico

- [ ] **Frontend (SPA + nginx)**: receber o base path como **ARG** e usa-lo no build:
      ```dockerfile
      # services/frontend/Dockerfile (exemplo Vite + nginx)
      FROM node:20-alpine AS build
      WORKDIR /app
      COPY package*.json ./
      RUN npm ci
      COPY . .
      ARG VITE_BASE_PATH=/aplicacao2/
      ENV VITE_BASE_PATH=$VITE_BASE_PATH
      RUN npm run build                       # vite build usa base=VITE_BASE_PATH
      FROM nginx:alpine
      COPY --from=build /app/dist /usr/share/nginx/html
      EXPOSE 80
      ```
      > Garanta que o `vite.config` use `base: process.env.VITE_BASE_PATH`. Para CRA, use
      > `PUBLIC_URL`; para HTML puro, ajuste `<base href>`. Veja
      > [`path-routing-pattern.md`](./path-routing-pattern.md), secao 2.
- [ ] **API/api2 (backend)**: definir rotas a partir da **raiz** (`/health`, `/version`,
      ...), pois o Traefik faz StripPrefix:
      ```dockerfile
      # services/api/Dockerfile (exemplo Node/Express)
      FROM node:20-alpine
      WORKDIR /app
      COPY package*.json ./
      RUN npm ci --omit=dev
      COPY . .
      EXPOSE 8080
      CMD ["node", "server.js"]              # app.get('/health', ...) na raiz
      ```
- [ ] **Worker**: processo de background com um health HTTP minimo na porta declarada.
- [ ] Testar cada imagem localmente:
      ```powershell
      docker build -t aplicacao2-api:local -f services/api/Dockerfile services/api
      docker run --rm -p 8080:8080 aplicacao2-api:local
      curl.exe http://localhost:8080/health   # {"status":"ok"}
      ```

---

## 4. Copiar os workflows do template (esteira via Actions/GHCR)

- [ ] Copiar o pipeline da app para `.github/workflows/pipeline.yaml` a partir de
      [`templates/github-actions/app-pipeline-template.yaml`](../templates/github-actions/app-pipeline-template.yaml).
- [ ] O pipeline ja faz `discover` (le o `devops.yaml`) -> `build` (matrix por service) ->
      `deploy`. Ele consome os workflows reutilizaveis **centrais** via `uses:`:
      ```yaml
      uses: FlavioNeto11/devops/.github/workflows/reusable-build-push.yaml@main
      uses: FlavioNeto11/devops/.github/workflows/reusable-deploy-k8s.yaml@main
      ```
- [ ] Ajustar, se necessario, `context`/`dockerfile` por service (padrao sugerido:
      `./services/<service>` e `./services/<service>/Dockerfile`) e o `manifestsPath`
      (padrao `./k8s`).
- [ ] Imagens publicadas seguirao: `ghcr.io/flavioneto11/aplicacao2/<service>:<sha>`
      (+ branch + `latest`). Owner do GHCR sempre **minusculo** (`flavioneto11`).

---

## 5. Configurar o base path do frontend

- [ ] `VITE_BASE_PATH=/aplicacao2/` definido no `devops.yaml` **e** consumido no build
      (ARG/ENV no Dockerfile + `base` no `vite.config`).
- [ ] Confirmar que os assets no `index.html` gerado referenciam `/aplicacao2/assets/...`
      (e nao `/assets/...`).
- [ ] (CRA) usar `PUBLIC_URL=/aplicacao2`; (HTML puro) `<base href="/aplicacao2/">`.

---

## 6. Definir o strip nas APIs

- [ ] `stripPrefix: true` em `api` e `api2`.
- [ ] `path` especifico (`/api`, `/api2`) — mais especifico que o do frontend.
- [ ] As rotas no codigo do backend estao na **raiz** (o prefixo e removido pelo Traefik).
- [ ] `priority` da API maior que a do frontend (garantido pelo template/Helm; se escrever
      `IngressRoute` a mao, defina `priority` explicito — veja
      [`path-routing-pattern.md`](./path-routing-pattern.md), secao 5).

---

## 7. Criar `k8s/` ou usar o Helm chart da plataforma

Duas opcoes (escolha uma):

- [ ] **Opcao A — Helm chart da plataforma** (recomendado): reutilize o chart em
      [`templates/app-template/`](../templates/app-template) com um `values.local.yaml`
      derivado do `devops.yaml`:
      ```powershell
      helm upgrade --install aplicacao2 C:/devops/templates/app-template `
        -n apps -f C:/devops/templates/app-template/values.local.yaml
      ```
- [ ] **Opcao B — manifests proprios em `k8s/`**: `Deployment` + `Service` +
      `IngressRoute` + `Middleware` (StripPrefix das APIs no **namespace da app**), seguindo
      os exemplos de [`path-routing-pattern.md`](./path-routing-pattern.md) (secao 6). O job
      de deploy aplica via `kubectl apply -f ./k8s --recursive`.
- [ ] Imagens locais: `imagePullPolicy: IfNotPresent` e tag `:local`.

---

## 8. Publicar (local ou via Actions)

- [ ] **Local (`:local`)** — iteracao rapida:
      ```powershell
      # Build dos tres servicos
      docker build --build-arg VITE_BASE_PATH=/aplicacao2/ -t aplicacao2-frontend:local -f services/frontend/Dockerfile services/frontend
      docker build -t aplicacao2-api:local  -f services/api/Dockerfile  services/api
      docker build -t aplicacao2-api2:local -f services/api2/Dockerfile services/api2
      # Aplicar (Helm chart da plataforma ou kubectl apply -f k8s)
      helm upgrade --install aplicacao2 C:/devops/templates/app-template -n apps -f values.local.yaml
      kubectl rollout status deployment/aplicacao2-frontend -n apps --timeout=180s
      ```
- [ ] **Via Actions/GHCR** — esteira completa:
      ```powershell
      git add . ; git commit -m "feat: onboarding aplicacao2" ; git push
      gh run watch        # discover -> build -> deploy (runner self-hosted)
      ```

---

## 9. Validar as rotas

- [ ] Frontend (sem strip):
      ```powershell
      curl.exe -I http://xpto.localhost/aplicacao2          # HTTP/1.1 200 OK (text/html)
      ```
- [ ] API (com strip: `/aplicacao2/api/health` -> backend ve `/health`):
      ```powershell
      curl.exe http://xpto.localhost/aplicacao2/api/health  # {"status":"ok"}
      ```
- [ ] API2 (com strip):
      ```powershell
      curl.exe http://xpto.localhost/aplicacao2/api2/health # {"status":"ok"}
      ```
- [ ] Confirmar prioridade: a chamada de API retorna **JSON** (e nao o HTML do frontend).
- [ ] Conferir IngressRoutes/Middlewares criados:
      ```powershell
      kubectl get ingressroute,middleware -n apps | Select-String aplicacao2
      ```

---

## 10. Conferir no DevOps Console

- [ ] Abrir <http://xpto.localhost/devops> e localizar `aplicacao2` nas abas
      **Deployments**/**Pods** (estado em tempo real).
- [ ] Verificar **Health** (resultado do `health.path`) e a aba de **Rotas/Ingress**
      (frontend sem strip; api/api2 com strip).
- [ ] (Via Actions) conferir as **anotacoes de rastreabilidade** no Deployment:
      ```powershell
      kubectl get deployment aplicacao2-api -n apps -o jsonpath='{.metadata.annotations}'
      ```
      Esperado: `devops.flavioneto/commit-sha`, `branch`, `image-tag`, `deployed-at`,
      `run-id`.

---

## 11. Pos-onboarding (boas praticas)

- [ ] **Segredos**: nada de segredo no `devops.yaml`/`ConfigMap`. Use
      `secret.example.yaml` -> `secret.yaml` (ignorado) — veja [`SECURITY.md`](../SECURITY.md).
- [ ] **GitOps (opcional)**: criar uma Application no Argo CD apontando para o repo/manifests
      e, quando confiar, ligar `syncPolicy.automated` — veja
      [`deployment-flow.md`](./deployment-flow.md), secao 12.
- [ ] **Observabilidade**: confirmar logs no Grafana/Loki
      (`{namespace="apps", app="aplicacao2-api"}`) e, se quiser, publicar um dashboard via
      ConfigMap com label `grafana_dashboard`.
- [ ] **Rollback testado**: saber reverter (`kubectl rollout undo` / `helm rollback` /
      Argo CD) — veja [`deployment-flow.md`](./deployment-flow.md), secao 8.
- [ ] **Dominio real (futuro)**: para `dev.nvit.com.br`, trocar `app.host` e ajustar
      HTTPS/tunel — veja [`local-domain-setup.md`](./local-domain-setup.md).

---

## 12. Resumo (checklist condensado)

- [ ] 1. Repo criado (estrutura por servico).
- [ ] 2. `devops.yaml` na raiz (app + services; convencao de strip/base path).
- [ ] 3. `Dockerfile` por servico (frontend com `VITE_BASE_PATH`; APIs com rotas na raiz).
- [ ] 4. Workflows copiados do template (`.github/workflows/pipeline.yaml`).
- [ ] 5. Base path do frontend configurado (assets sob `/aplicacao2/`).
- [ ] 6. Strip definido nas APIs (`stripPrefix: true`, `path` especifico, priority alta).
- [ ] 7. `k8s/` proprio **ou** Helm chart da plataforma.
- [ ] 8. Publicado (local com scripts/Helm **ou** push para Actions).
- [ ] 9. Rotas validadas (frontend 200; `/api/health` e `/api2/health` retornam JSON).
- [ ] 10. Visivel e saudavel no DevOps Console.

---

## 13. Referencias

- [`new-project-contract.md`](./new-project-contract.md) — referencia completa do
  `devops.yaml` e exemplo `aplicacao2`.
- [`path-routing-pattern.md`](./path-routing-pattern.md) — strip vs base path, prioridade,
  exemplos de IngressRoute/Middleware.
- [`deployment-flow.md`](./deployment-flow.md) — publicar, reverter, logs, diagnostico,
  Argo CD, Grafana, Console.
- [`github-runner-setup.md`](./github-runner-setup.md) — runner para o deploy via Actions.
- [`local-domain-setup.md`](./local-domain-setup.md) — dominio local/real e HTTPS.
- [`templates/`](../templates) — chart e workflows reutilizaveis;
  [`samples/aplicacao1`](../samples/aplicacao1) — exemplo pronto.
