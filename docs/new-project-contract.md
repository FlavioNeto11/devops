---
title: "Contrato da Nova Aplicacao — Referencia completa do devops.yaml"
status: canonical
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Contrato da Nova Aplicacao — Referencia completa do `devops.yaml`

> **Schema maquina-legivel (fonte para validacao/CI):**
> [`../schema/devops-schema.json`](../schema/devops-schema.json). Este documento e a referencia
> **humana** do mesmo contrato; em divergencia, o JSON Schema e a fonte da verdade do formato.

Este documento e a referencia **canonica e completa** do `devops.yaml`, o descritor que
toda aplicacao precisa para entrar na esteira da Plataforma DevOps Local. Aqui voce
encontra: o significado de **cada campo** de `app` e de `services`, os **tipos** de
servico (`frontend`, `api`, `worker`, `api2`), as regras de `expose`/`stripPrefix`,
`env`, `health`, `port` e `path`, **exemplos para cada tipo**, um **passo-a-passo** de
como escrever o arquivo (para um desenvolvedor humano ou para o Claude) e um **exemplo
completo da `aplicacao2`** (frontend + api + api2).

> Idioma: documentacao e comentarios em pt-BR; chaves YAML, identificadores e CLI em
> ingles. Veja tambem [`path-routing-pattern.md`](./path-routing-pattern.md) (roteamento),
> [`project-onboarding-checklist.md`](./project-onboarding-checklist.md) (checklist) e o
> [`ARCHITECTURE.md`](../ARCHITECTURE.md) (visao geral).

---

## 1. O que e o `devops.yaml`

E o **contrato canonico** da aplicacao: um unico arquivo YAML, na **raiz do repositorio
da app**, que descreve de forma declarativa **como a app deve ser publicada** — quais
servicos existem, quais imagens usar, em que portas escutam, quais rotas expor no Traefik,
quais variaveis de ambiente e onde estao os health checks.

A partir desse arquivo, a plataforma (CI no GitHub Actions + Helm/`kubectl`) gera os
recursos finais do Kubernetes: `Deployment`, `Service`, `IngressRoute` e `Middleware`,
todos coerentes com a [convencao de roteamento](./path-routing-pattern.md).

Fluxo resumido:

```
devops.yaml  ->  GitHub Actions (le services)  ->  build/push (GHCR ou :local)
             ->  helm/kubectl apply            ->  Deployment + Service + IngressRoute + Middleware
             ->  Traefik publica as rotas      ->  DevOps Console mostra em tempo real
```

---

## 2. Schema de alto nivel

```yaml
app:
  name: <string>            # nome logico da app (labels, nomes de recursos, rotas)
  namespace: <string>       # namespace Kubernetes de destino
  host: <string>            # host de entrada no Traefik
  basePath: <string>        # subpath base onde a app e servida (ex.: /aplicacao1)

services:                   # mapa serviceName -> definicao
  <serviceName>:
    type: frontend|api|worker|api2
    path: <string>          # subpath relativo ao basePath (api/api2; opcional p/ frontend)
    image: <string>         # nome da imagem (sem registry; o registry vem dos valores)
    port: <int>             # porta do container/Service
    expose: <bool>          # true => ganha rota no Ingress (Traefik)
    stripPrefix: <bool>     # true => Middleware remove o prefixo COMPLETO (base+path)
    env: { <K>: <V>, ... }  # variaveis de ambiente do container
    health:
      path: <string>        # path do health check (probes + tela Health do Console)
```

---

## 3. Bloco `app` — campo a campo

| Campo       | Tipo   | Obrigatorio | Descricao                                                                                          | Exemplo            |
|-------------|--------|-------------|----------------------------------------------------------------------------------------------------|--------------------|
| `name`      | string | **Sim**     | Nome logico da aplicacao. Usado em labels, nos nomes dos recursos (`<name>-<service>`) e nas rotas. Use minusculas e hifens. | `aplicacao1`       |
| `namespace` | string | **Sim**     | Namespace Kubernetes onde a app e implantada. Deve ser um dos namespaces da plataforma.            | `apps`             |
| `host`      | string | **Sim**     | Host de entrada no Traefik. Local: `xpto.localhost`. Real futuro: `dev.nvit.com.br`.                  | `xpto.localhost`   |
| `basePath`  | string | **Sim**     | Subpath base sob o qual a app inteira e servida no host unico. Convencao: `/<name>`.               | `/aplicacao1`      |

### Observacoes sobre `app`

- **`name`**: e o prefixo de tudo. Os recursos seguem a convencao de nome
  `<app.name>-<serviceName>` (ex.: `aplicacao1-frontend`, `aplicacao1-api`). Mantenha
  curto e em kebab-case (minusculas + hifens).
- **`namespace`**: namespaces validos criados pela plataforma — `apps` (default das apps),
  `apps-dev` (desenvolvimento), `apps-prod-local` ("producao" local). Os demais
  (`devops-system`, `traefik`, `argocd`, `observability`) sao **reservados** a plataforma.
- **`host`**: no laboratorio sempre `xpto.localhost`. O mesmo layout de paths vale para o
  dominio real `dev.nvit.com.br` — basta trocar o `host`. Veja
  [`local-domain-setup.md`](./local-domain-setup.md).
- **`basePath`**: define onde a app aparece no host unico. Aceita-se `/<name>` (com barra)
  como forma canonica. Internamente a plataforma normaliza barras; mantenha **consistencia**
  com o `VITE_BASE_PATH` do frontend (que **sempre** termina com `/`, ex.:
  `/aplicacao1/`).

---

## 4. Bloco `services` — campo a campo

`services` e um **mapa** cuja chave e o **nome do servico** (`serviceName`) e o valor e a
definicao abaixo. O `serviceName` vira sufixo do recurso (`<app.name>-<serviceName>`) e e o
que o CI usa para montar a matriz de build (um build por servico).

| Campo         | Tipo    | Obrigatorio                | Descricao                                                                                                            |
|---------------|---------|----------------------------|--------------------------------------------------------------------------------------------------------------------|
| `type`        | enum    | **Sim**                    | Um de `frontend`, `api`, `worker`, `api2`. Define o comportamento padrao de roteamento e probes.                   |
| `path`        | string  | Sim p/ `api`/`api2`        | Subpath **relativo ao `basePath`** onde o servico responde (ex.: `/api`). Frontend usa `/` (raiz do basePath).     |
| `image`       | string  | **Sim**                    | Nome da imagem **sem** o registry (ex.: `aplicacao1-api`). O registry/tag vem dos valores (GHCR ou `:local`).      |
| `port`        | int     | **Sim**                    | Porta em que o processo escuta dentro do container; tambem a porta do `Service`.                                   |
| `expose`      | bool    | **Sim**                    | `true` => o servico ganha rota no Ingress (Traefik). `false` => sem rota (ex.: worker).                            |
| `stripPrefix` | bool    | Sim quando `expose: true`  | `true` => `Middleware` StripPrefix remove o prefixo **completo** (`basePath`+`path`). Frontend = `false`.          |
| `env`         | mapa    | Nao                        | Variaveis de ambiente do container (chave -> valor). Ex.: `VITE_BASE_PATH`, `APP_VERSION`.                         |
| `health`      | objeto  | Recomendado                | `{ path }` — caminho do health check usado pelos probes e pela tela **Health** do Console.                         |
| `health.path` | string  | -                          | Caminho **na raiz do processo** (apos o strip), ex.: `/health`. Para frontend, normalmente `/`.                    |

### 4.1 `type` — os quatro tipos

| `type`     | O que e                                            | `expose` tipico | `stripPrefix` tipico | Observacao                                                                 |
|------------|----------------------------------------------------|-----------------|----------------------|---------------------------------------------------------------------------|
| `frontend` | SPA (React+Vite servido por nginx).                | `true`          | **`false`**          | Servido no subpath; **build com base path** (`VITE_BASE_PATH=/<base>/`).   |
| `api`      | API HTTP principal (ex.: Express).                 | `true`          | **`true`**           | StripPrefix remove `basePath+path`; o processo ve rotas na **raiz**.       |
| `api2`     | API HTTP secundaria (segundo backend da mesma app).| `true`          | **`true`**           | Igual a `api`, com `path` proprio (ex.: `/api2`).                          |
| `worker`   | Processo de background (sem trafego externo).      | **`false`**     | (n/a)                | Sem ingress. Mantem um health interno para os probes (opcionalmente exposto). |

> **Regra de ouro** (detalhada em [`path-routing-pattern.md`](./path-routing-pattern.md)):
> **frontend NUNCA faz strip** (usa base path no build); **api/api2/worker-health SEMPRE
> fazem strip** (o processo ve a rota na raiz).

### 4.2 `expose` e `stripPrefix`

- **`expose: true`** gera, para o servico, uma `IngressRoute` casando
  `Host(host) && PathPrefix(basePath[+path])`. **`expose: false`** nao cria rota (o
  servico so e acessivel dentro do cluster — caso classico do `worker`).
- **`stripPrefix: true`** cria um `Middleware` do tipo `stripPrefix` (no **namespace da
  app**) que remove o prefixo **completo** antes de encaminhar ao backend. Ex.:
  `/aplicacao1/api/health` chega ao Traefik, o middleware remove `/aplicacao1/api` e o
  backend recebe `/health`.
- **`stripPrefix: false`** (frontend) **nao** remove nada: o nginx serve o conteudo ja sob
  o subpath, porque o build foi feito com `base = /<basePath>/`.

### 4.3 `path`

- E **relativo ao `basePath`**. O prefixo efetivo no host e `basePath + path`.
  Ex.: `basePath: /aplicacao1` + `path: /api` => prefixo `/aplicacao1/api`.
- **Frontend**: use `path: /` (a raiz do basePath). Em muitos casos pode ser omitido, pois
  o frontend e a rota "default" do basePath.
- **api/api2**: **obrigatorio** e deve ser **mais especifico** que o do frontend
  (ex.: `/api`, `/api2`, `/worker`). E o que garante a prioridade correta (veja secao 6).

### 4.4 `image`, `port`, `tag`

- **`image`**: somente o **nome** (sem registry). O registry/tag e resolvido nos valores
  do Helm:
  - **Lab local**: registry vazio => a imagem efetiva e `<image>:local`
    (ex.: `aplicacao1-api:local`), com `imagePullPolicy: IfNotPresent`.
  - **GHCR (esteira)**: `ghcr.io/flavioneto11/<app.name>/<serviceName>:<tag>`
    (tag = SHA do commit; tambem branch e `latest`).
- **`port`**: porta interna do processo/container, tambem usada pelo `Service`. Para o
  **host**, apenas as portas **80** e **443** do Traefik sao publicadas — as portas dos
  servicos sao internas.

### 4.5 `env`

- Mapa de variaveis de ambiente injetadas no container.
- **Frontend**: a variavel mais importante e `VITE_BASE_PATH` (ex.: `/aplicacao1/`), usada
  no build do Vite (`base`) para que os assets resolvam sob o subpath. Para builds com
  Create React App use `PUBLIC_URL`; o `<base href>` do `index.html` segue a mesma ideia.
- **Nunca** coloque segredos em `env` no `devops.yaml`. Segredos vao por `Secret` do
  Kubernetes (`secret.example.yaml` -> `secret.yaml`, ignorado pelo Git). Veja
  [`SECURITY.md`](../SECURITY.md).

### 4.6 `health`

- `{ path }` — caminho do health check. Como APIs fazem strip, informe o caminho **como o
  processo o ve** (na raiz). Ex.: `health.path: /health` para um endpoint que, externamente,
  fica em `/<basePath>/api/health`.
- Usado por: probes do `Deployment` (readiness/liveness) e pela aba **Health** do DevOps
  Console.
- Para `frontend`, normalmente `health.path: /` (o nginx responde a raiz do subpath).

---

## 5. Exemplos por tipo

### 5.1 `frontend` (SPA, sem strip)

```yaml
frontend:
  type: frontend
  path: /                       # raiz do basePath
  image: aplicacao1-frontend    # efetiva: aplicacao1-frontend:local (lab)
  port: 80                      # nginx
  expose: true
  stripPrefix: false            # frontend NUNCA faz strip
  env:
    VITE_BASE_PATH: /aplicacao1/  # base path do build Vite (com barra final)
  health:
    path: /
```

> Rota gerada: `Host(xpto.localhost) && PathPrefix(/aplicacao1)` -> `aplicacao1-frontend:80`,
> **sem** middleware de strip. O navegador acessa `http://xpto.localhost/aplicacao1`.

### 5.2 `api` (backend principal, com strip)

```yaml
api:
  type: api
  path: /api                    # prefixo efetivo: /aplicacao1/api
  image: aplicacao1-api         # efetiva: aplicacao1-api:local (lab)
  port: 8080
  expose: true
  stripPrefix: true             # remove /aplicacao1/api
  env:
    APP_VERSION: local
  health:
    path: /health               # externamente: /aplicacao1/api/health
```

> Rota gerada: `Host(xpto.localhost) && PathPrefix(/aplicacao1/api)` (priority ALTA) ->
> `aplicacao1-api:8080`, **com** `Middleware` StripPrefix de `/aplicacao1/api`. O backend
> recebe `/health` para uma chamada a `http://xpto.localhost/aplicacao1/api/health`.

### 5.3 `api2` (backend secundario, com strip)

```yaml
api2:
  type: api2
  path: /api2                   # prefixo efetivo: /aplicacao1/api2
  image: aplicacao1-api2
  port: 8082
  expose: true
  stripPrefix: true             # remove /aplicacao1/api2
  env: {}
  health:
    path: /health
```

> `api2` e identico a `api`, apenas com `path` proprio. Util quando a app tem dois backends
> distintos (ex.: API publica + API administrativa). Cada um ganha rota + middleware
> proprios.

### 5.4 `worker` (background, sem ingress)

```yaml
worker:
  type: worker
  image: aplicacao1-worker
  port: 8081
  expose: false                 # SEM rota no Ingress
  health:
    path: /health               # health interno (probes)
```

> Como `expose: false`, **nao** ha `IngressRoute`/`Middleware`. O worker mantem um
> servidor HTTP minimo apenas para o health dos probes. Se voce quiser **expor** o health
> do worker (opcional), use `expose: true` + `stripPrefix: true` + `path: /worker`
> (prefixo `/aplicacao1/worker`), exatamente como uma API.

---

## 6. Prioridade entre `/<base>` e `/<base>/api` (critico)

No mesmo host, o `PathPrefix` mais **especifico/longo** deve vencer. A plataforma define
**`priority` explicito** em cada `IngressRoute` para garantir que `/<base>/api` (api) tenha
prioridade **MAIOR** que `/<base>` (frontend). Caso contrario, o prefixo do frontend
"engoliria" as chamadas de API.

- Frontend (`PathPrefix(/aplicacao1)`): **priority baixa**.
- API (`PathPrefix(/aplicacao1/api)`): **priority alta**.

O Traefik tambem usa o tamanho da regra como desempate, mas o `priority` explicito remove
qualquer ambiguidade. Detalhes e exemplos completos de `IngressRoute`/`Middleware` em
[`path-routing-pattern.md`](./path-routing-pattern.md).

---

## 7. Passo-a-passo: como escrever o `devops.yaml` de uma nova app

Vale tanto para um **desenvolvedor** quanto para o **Claude** gerando o arquivo.

1. **Defina o bloco `app`.**
   - `name`: kebab-case, curto (ex.: `aplicacao2`).
   - `namespace`: `apps` (default) — ou `apps-dev`/`apps-prod-local`.
   - `host`: `xpto.localhost` (local).
   - `basePath`: `/<name>` (ex.: `/aplicacao2`).

2. **Liste os servicos** em `services` (a chave e o `serviceName`).
   - Decida o `type` de cada um (`frontend`, `api`, `api2`, `worker`).

3. **Para cada `frontend`:**
   - `expose: true`, `stripPrefix: false`.
   - `image`, `port` (geralmente `80` para nginx).
   - `env.VITE_BASE_PATH: /<basePath>/` (com **barra final**!) — e garanta que o build do
     frontend use essa variavel como `base` do Vite (ou `PUBLIC_URL`/`<base href>`).
   - `health.path: /`.

4. **Para cada `api`/`api2`:**
   - `expose: true`, `stripPrefix: true`.
   - `path` especifico (`/api`, `/api2`) — **mais especifico** que o do frontend.
   - `image`, `port` (ex.: `8080`, `8082`).
   - `health.path` como o **processo** ve (na raiz, ex.: `/health`).
   - O backend deve responder rotas a partir da **raiz** (porque o prefixo e removido).

5. **Para cada `worker`:**
   - `expose: false` (sem ingress).
   - `image`, `port`, `health.path` (health interno para probes).

6. **Confira a consistencia da convencao:**
   - Frontend: `stripPrefix: false` + `VITE_BASE_PATH` casando com o `basePath`.
   - APIs: `stripPrefix: true` + `path` especifico.
   - APIs com `path` mais especifico que o frontend (garante prioridade correta).

7. **Salve como `devops.yaml` na RAIZ** do repositorio da app e siga o
   [`project-onboarding-checklist.md`](./project-onboarding-checklist.md) (Dockerfiles,
   workflows, publicacao).

8. **Valide** localmente renderizando o chart (sem aplicar):
   ```powershell
   # A partir do diretorio do chart template da plataforma (ajuste o caminho do values):
   helm template ./ -f values.local.yaml
   ```
   Resultado esperado: `Deployment`, `Service`, `IngressRoute` e `Middleware` coerentes
   (frontend sem strip; api/api2 com strip e priority alta).

---

## 8. Exemplo completo — `aplicacao2` (frontend + api + api2)

Cenario: uma segunda aplicacao com um **frontend** (SPA), uma **API publica** (`api`) e uma
**API administrativa** (`api2`). Servida em `/aplicacao2` no host unico.

```yaml
# =============================================================================
# devops.yaml - Contrato canonico da aplicacao "aplicacao2"
# -----------------------------------------------------------------------------
# App com tres servicos:
#   - frontend (SPA): servido em /aplicacao2 SEM strip (base /aplicacao2/).
#   - api (publica):  /aplicacao2/api  COM StripPrefix -> backend ve a raiz.
#   - api2 (admin):   /aplicacao2/api2 COM StripPrefix -> backend ve a raiz.
#
# Host local: xpto.localhost  | Host real futuro: dev.nvit.com.br
# Convencao: frontend NUNCA faz strip; APIs SEMPRE fazem strip; /api e /api2
# tem priority MAIOR que /aplicacao2 (prefixos mais especificos vencem).
# =============================================================================
app:
  name: aplicacao2
  namespace: apps
  host: xpto.localhost
  basePath: /aplicacao2

services:
  # ---------------------------------------------------------------------------
  # Frontend (SPA React+Vite servido por nginx). SEM strip.
  # Build com base path /aplicacao2/ (VITE_BASE_PATH).
  # ---------------------------------------------------------------------------
  frontend:
    type: frontend
    path: /
    image: aplicacao2-frontend       # efetiva: aplicacao2-frontend:local (lab)
    port: 80
    expose: true
    stripPrefix: false
    env:
      VITE_BASE_PATH: /aplicacao2/    # barra final obrigatoria
    health:
      path: /

  # ---------------------------------------------------------------------------
  # API publica (Express). COM strip de /aplicacao2/api.
  # /aplicacao2/api/health -> backend recebe /health.
  # ---------------------------------------------------------------------------
  api:
    type: api
    path: /api                        # prefixo efetivo: /aplicacao2/api
    image: aplicacao2-api
    port: 8080
    expose: true
    stripPrefix: true
    env:
      APP_VERSION: local
    health:
      path: /health

  # ---------------------------------------------------------------------------
  # API administrativa (segundo backend). COM strip de /aplicacao2/api2.
  # /aplicacao2/api2/health -> backend recebe /health.
  # ---------------------------------------------------------------------------
  api2:
    type: api2
    path: /api2                       # prefixo efetivo: /aplicacao2/api2
    image: aplicacao2-api2
    port: 8082
    expose: true
    stripPrefix: true
    env: {}
    health:
      path: /health
```

### 8.1 Rotas resultantes da `aplicacao2`

| Path (host unico)         | Service                | StripPrefix              | Prioridade | O que o backend ve                          |
|---------------------------|------------------------|--------------------------|------------|---------------------------------------------|
| `/aplicacao2`             | `aplicacao2-frontend`  | NAO                      | baixa      | conteudo servido sob `/aplicacao2/` (nginx) |
| `/aplicacao2/api`         | `aplicacao2-api`       | SIM (`/aplicacao2/api`)  | alta       | `/aplicacao2/api/health` -> `/health`       |
| `/aplicacao2/api2`        | `aplicacao2-api2`      | SIM (`/aplicacao2/api2`) | alta       | `/aplicacao2/api2/health` -> `/health`      |

### 8.2 Imagens da `aplicacao2`

- **Local (lab):** `aplicacao2-frontend:local`, `aplicacao2-api:local`, `aplicacao2-api2:local`
  (`imagePullPolicy: IfNotPresent`).
- **GHCR (esteira):** `ghcr.io/flavioneto11/aplicacao2/frontend:<sha>`,
  `ghcr.io/flavioneto11/aplicacao2/api:<sha>`, `ghcr.io/flavioneto11/aplicacao2/api2:<sha>`
  (mais tags de branch e `latest`).

### 8.3 URLs de acesso (apos publicar)

| Recurso                    | URL                                              |
|----------------------------|--------------------------------------------------|
| Frontend                   | <http://xpto.localhost/aplicacao2>               |
| API (health)               | <http://xpto.localhost/aplicacao2/api/health>    |
| API2 (health)              | <http://xpto.localhost/aplicacao2/api2/health>   |

> No dominio real, troque `app.host` para `dev.nvit.com.br` (mesmos paths): as URLs viram
> `https://dev.nvit.com.br/aplicacao2`, `.../aplicacao2/api/health`, etc.

---

## 9. Erros comuns (e como evitar)

| Sintoma                                                        | Causa provavel                                               | Correcao                                                                 |
|---------------------------------------------------------------|-------------------------------------------------------------|--------------------------------------------------------------------------|
| Frontend carrega HTML mas **404 nos assets** (JS/CSS).        | `VITE_BASE_PATH` ausente ou sem barra final; build na raiz. | Defina `env.VITE_BASE_PATH: /<base>/` e rebuilde o frontend.             |
| Chamadas de API caem no **frontend** (recebe HTML, nao JSON). | `api.path` nao e mais especifico, ou prioridade invertida.  | Use `path: /api` e garanta priority ALTA para `/<base>/api` (vide sec.6).|
| API recebe `/aplicacao2/api/health` em vez de `/health`.      | `stripPrefix: false` na API.                                | Coloque `stripPrefix: true` na `api`/`api2`.                            |
| Worker tenta expor rota e falha.                              | `expose: true` sem `path`/strip no worker.                  | Para worker de background use `expose: false`.                          |
| Imagem nao encontrada no lab (`ErrImagePull`).                | Imagem `:local` nao buildada no daemon do Docker Desktop.   | Builde localmente (vide checklist) — `IfNotPresent` exige a imagem local.|

---

## 10. Referencias cruzadas

- [`path-routing-pattern.md`](./path-routing-pattern.md) — convencao de roteamento,
  StripPrefix, prioridade, exemplos de `IngressRoute`/`Middleware`, tabela de rotas e
  versao `dev.nvit.com.br`.
- [`project-onboarding-checklist.md`](./project-onboarding-checklist.md) — checklist para
  colocar a app na esteira.
- [`deployment-flow.md`](./deployment-flow.md) — publicar (local e via Actions/GHCR),
  reverter, logs, diagnostico.
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — schema na secao 7 e fluxo da esteira.
- Exemplos no repo: [`templates/app-template/app.yaml`](../templates/app-template/app.yaml)
  (exemplo canonico) e [`apps/sicat/devops.yaml`](../apps/sicat/devops.yaml) (app real, com
  `priority`, `build`, `command`, `dependencies`, `secrets`, `configmaps`).
