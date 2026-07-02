---
title: "Contrato da Nova Aplicacao — Referencia completa do devops.yaml"
status: canonical
applies_to: [platform]
updated: 2026-07-02
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
| `host`      | string | **Sim**     | Host de entrada no Traefik. Local: `nvit.localhost`. Real futuro: `dev.nvit.com.br`.                  | `nvit.localhost`   |
| `basePath`  | string | **Sim**     | Subpath base sob o qual a app inteira e servida no host unico. Convencao: `/<name>`.               | `/aplicacao1`      |
| `appType`   | enum   | Nao         | Taxonomia da app: `product_software` (default — produto/sistema completo, ex.: sicat/gymops), `cms_portal` (portal/site com conteudo gerenciado pelo CMS do Console, ex.: rmambiental/anarabottini) ou `platform_tool` (ferramenta interna da plataforma, ex.: portal-recorder). | `cms_portal` |

### Observacoes sobre `app`

- **`name`**: e o prefixo de tudo. Os recursos seguem a convencao de nome
  `<app.name>-<serviceName>` (ex.: `aplicacao1-frontend`, `aplicacao1-api`). Mantenha
  curto e em kebab-case (minusculas + hifens).
- **`namespace`**: namespaces validos criados pela plataforma — `apps` (default das apps),
  `apps-dev` (desenvolvimento), `apps-prod-local` ("producao" local). Os demais
  (`devops-system`, `traefik`, `argocd`, `observability`) sao **reservados** a plataforma.
- **`host`**: no laboratorio sempre `nvit.localhost`. O mesmo layout de paths vale para o
  dominio real `dev.nvit.com.br` — basta trocar o `host`. Veja
  [`local-domain-setup.md`](./local-domain-setup.md).
- **`basePath`**: define onde a app aparece no host unico. Aceita-se `/<name>` (com barra)
  como forma canonica. Internamente a plataforma normaliza barras; mantenha **consistencia**
  com o `VITE_BASE_PATH` do frontend (que **sempre** termina com `/`, ex.:
  `/aplicacao1/`).
- **`appType`** (opcional; default `product_software`): classifica a app na taxonomia da
  plataforma. Efeitos: vira o label `devops.flavioneto/app-type` nos recursos (via
  `templates/app-template` ou `scripts/new-app.ps1 -Type <tipo>`), o DevOps Console agrupa e
  exibe por tipo (portais CMS separados de produtos), e o projeto correspondente no modulo
  Projetos & Tarefas/CMS usa o mesmo valor (`projects.app_type` no pm-api). **Nao** muda
  roteamento, build nem deploy — e puramente classificatorio/governanca.

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

> Rota gerada: `Host(nvit.localhost) && PathPrefix(/aplicacao1)` -> `aplicacao1-frontend:80`,
> **sem** middleware de strip. O navegador acessa `http://nvit.localhost/aplicacao1`.

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

> Rota gerada: `Host(nvit.localhost) && PathPrefix(/aplicacao1/api)` (priority ALTA) ->
> `aplicacao1-api:8080`, **com** `Middleware` StripPrefix de `/aplicacao1/api`. O backend
> recebe `/health` para uma chamada a `http://nvit.localhost/aplicacao1/api/health`.

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
   - `host`: `nvit.localhost` (local).
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
# Host local: nvit.localhost  | Host real futuro: dev.nvit.com.br
# Convencao: frontend NUNCA faz strip; APIs SEMPRE fazem strip; /api e /api2
# tem priority MAIOR que /aplicacao2 (prefixos mais especificos vencem).
# =============================================================================
app:
  name: aplicacao2
  namespace: apps
  host: nvit.localhost
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
| Frontend                   | <http://nvit.localhost/aplicacao2>               |
| API (health)               | <http://nvit.localhost/aplicacao2/api/health>    |
| API2 (health)              | <http://nvit.localhost/aplicacao2/api2/health>   |

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

---

## 11. Contrato v2 (`version: 2`) — ambientes, dependencias tipadas e MLOps

> **Aditivo e retrocompativel.** O schema ([`../schema/devops-schema.json`](../schema/devops-schema.json))
> aceita, via `oneOf`, o **v1** (tudo acima — INALTERADO, todo `devops.yaml` existente continua
> valido) OU o **v2**, marcado por `version: 2` explicito. O v2 e um superset do v1 que torna o
> contrato a fonte real de provisionamento de dependencias (Forja 4.0, fase B1).

### 11.1 O que o v2 adiciona

| Campo | Onde | O que declara |
|---|---|---|
| `version: 2` | raiz | opt-in explicito no contrato v2 (ausente = v1) |
| `environments` | raiz | mapa ambiente logico -> `{ namespace, hosts[] }`. Pre-requisito de multi-env; o compilador renderiza hoje o default (`nvit.localhost` + `dev.nvit.com.br`, mesmo comportamento do v1) |
| `dependencies` | raiz | mapa nome -> dependencia **TIPADA** `{ engine, flavor, version, storage, database, secretName, resources }` — provisionamento REAL pelo chart (ver 11.3) |
| `mlops` | raiz | `{ langfuse, budget.monthlyUsd, evals.goldenSet }` — postura de MLOps (declarativo; consumido pela esteira/telemetria, nao gera recurso k8s) |
| `envFrom` | service | lista de Secrets injetados em massa no container (`envFrom`/`secretRef`). Cada item e o **nome** do Secret (string) ou `{ name, optional: true }` — `optional` gera `secretRef` opcional (o pod sobe sem o Secret; padrao dos Secrets `<app>-ai`/`<app>-auth` da Forja). So a referencia — o Secret e criado FORA do git |

### 11.2 Fluxo de compilacao (manifests renderizados no git)

O contrato v2 NAO vai direto pro Argo. O compilador
[`specs/tools/devops-compile.mjs`](../specs/tools/devops-compile.mjs) valida o `devops.yaml`
contra o schema, deriva os values do chart [`templates/app-template`](../templates/app-template/),
roda `helm template`, **remove qualquer Secret** do render e escreve os **manifests renderizados e
COMMITADOS** em `apps/<app>/k8s/<app>.yaml` — que sao o artefato **primario** do GitOps (decisao:
nada de multi-source `$values` no Argo). O compilador tambem verifica os invariantes HARD: labels
`part-of` em tudo, `resources` em todo container, `Host()` + `PathPrefix()` combinados nas rotas,
priorities `api2 > api > frontend` (40 > 30 > 10) e StripPrefix do prefixo COMPLETO.

```powershell
node specs/tools/devops-compile.mjs apps/<app>/devops.yaml          # compila -> apps/<app>/k8s/
node specs/tools/devops-compile.mjs apps/<app>/devops.yaml --check  # acusa drift (CI-friendly)
```

> **Forja usa o compilador (B6).** Os scaffolds da Forja (`specs/forge/scaffold-gymops.mjs`,
> `scaffold-sicat.mjs`, `scaffold-frontend.mjs` — orquestrados por `scripts/scaffold-product.ps1`)
> emitem `devops.yaml` **v2** e geram `apps/<app>/k8s/<app>.yaml` chamando este compilador — o
> antigo string-builder `buildK8s()` foi aposentado. O que o chart ainda **nao** renderiza sai em
> arquivos SUPLEMENTARES ao lado do compilado (gaps documentados na secao 11.5 para a fase B2):
> `k8s/<app>-observability.yaml` (ServiceMonitor + PrometheusRule + Services `*-metrics`) e
> `k8s/<app>-sso.yaml` (rota sombra com ForwardAuth, bloco `oidc-sessao`).

### 11.3 Matriz de provisionamento das `dependencies`

| `engine` | Template do chart | Provisiona | Resources DEFAULT (obrigatorios) |
|---|---|---|---|
| `postgres` | `dependency-postgres.yaml` | PVC `<app>-<dep>-data` + Deployment `<app>-<dep>` (**strategy Recreate**) + Service (5432) + probes `pg_isready` (readiness+liveness). `flavor: pgvector` troca a imagem para `pgvector/pgvector:pg<version>`; sem flavor: `postgres:<version>-alpine` (default 16). `secretName` **obrigatorio** (POSTGRES_USER/PASSWORD/DB via `envFrom`) | requests `128Mi`/`50m`, limits **`1Gi`**/`1000m` — licao do incidente OOM do sicat (512Mi corrompeu o WAL) |
| `redis` | `dependency-redis.yaml` | PVC `<app>-<dep>-data` (AOF `--appendonly yes`) + Deployment (**Recreate**) + Service (6379) + probes `redis-cli ping`. Imagem `redis:<version>-alpine` (default 7) | requests `32Mi`/`25m`, limits `256Mi`/`250m` |
| `mongodb` / `nats` | — **RESERVADO** | sem template ainda; adicionar quando houver consumidor real (o schema aceita, o compilador falha com erro claro) | — |

Regras herdadas (HARD, ver [`standards/hard-constraints.md`](./standards/hard-constraints.md)):
o chart **NUNCA renderiza Secret** — `secretName` e so referencia; o Secret real e criado
imperativamente fora do git (ex.: passo `kubectl create secret generic <app>-db` do
`forge-deploy.yml`). **Nao ha migration Job**: `AUTO_MIGRATE` no boot permanece o padrao (hook
PreSync nao dispara no fluxo `:local` + rollout restart desta plataforma). Override de
`resources` por dependencia e opcional.

### 11.4 Exemplo completo v2 (fixture real do repo)

O app-exemplo [`apps/forge-pilot-v2/`](../apps/forge-pilot-v2/) e a fixture versionada deste
contrato (sem codigo/deploy — valida o pipeline schema -> compile -> manifests):

```yaml
version: 2

app:
  name: forge-pilot-v2
  namespace: apps
  host: nvit.localhost
  basePath: /forge-pilot-v2
  appType: product_software

environments:
  local:
    namespace: apps
    hosts: [nvit.localhost, dev.nvit.com.br]

services:
  frontend:
    type: frontend
    path: /
    image: forge-pilot-v2-frontend
    port: 80
    expose: true
    stripPrefix: false          # HARD: frontend NUNCA faz strip
    priority: 10
    env: { VITE_BASE_PATH: /forge-pilot-v2/ }
    health: { path: / }
  api:
    type: api
    path: /api
    image: forge-pilot-v2-api
    port: 8080
    expose: true
    stripPrefix: true           # HARD: strip do prefixo COMPLETO /forge-pilot-v2/api
    priority: 30
    envFrom: [forge-pilot-v2-db, forge-pilot-v2-config]   # Secrets criados fora do git
    env: { AUTO_MIGRATE: "true", REDIS_URL: redis://forge-pilot-v2-redis:6379 }
    health: { path: /health }
  worker:
    type: worker
    image: forge-pilot-v2-api   # reusa a imagem da api
    port: 8081
    expose: false
    command: ["npm", "run", "worker"]
    envFrom: [forge-pilot-v2-db]
    env: { AUTO_MIGRATE: "false", REDIS_URL: redis://forge-pilot-v2-redis:6379 }
    health: { path: /health }

dependencies:
  postgres:
    engine: postgres
    flavor: pgvector            # -> pgvector/pgvector:pg16
    version: "16"
    storage: 2Gi
    database: forge_pilot_v2
    secretName: forge-pilot-v2-db
  redis:
    engine: redis
    version: "7"
    storage: 1Gi
    resources:                  # override opcional dos defaults
      requests: { cpu: 25m, memory: 32Mi }
      limits: { cpu: 250m, memory: 256Mi }

mlops:
  langfuse: true
  budget: { monthlyUsd: 25 }
  evals: { goldenSet: evals/golden-set.jsonl }
```

### 11.5 Convergir um produto v1 → v2 (checklist do diff-gate)

Converter um produto **vivo** (manifests manuais/string-builder em `k8s/`) para o contrato v2 +
manifests compilados so e permitido se **nenhum recurso vivo for renomeado ou tiver selector
alterado** — o Argo roda com `prune: true` + `selfHeal: true` e "renomear" significa **apagar o
antigo e criar um novo** (hard-constraints §4): Deployment perde os pods, PVC renomeado = **perda
de dados**, `spec.selector` de Deployment e **imutavel** (o apiserver rejeita o apply).

**Checklist (diff-gate) — rode ANTES de commitar qualquer conversao:**

1. Escreva o `devops.yaml` v2 candidato **fora** de `apps/<app>/` (ex.: diretorio temporario),
   espelhando services/env/envFrom/dependencies do k8s vivo.
2. Compile para um destino temporario:
   `node specs/tools/devops-compile.mjs <tmp>/devops.yaml --out <tmp>/k8s/<app>.yaml`.
3. **Diff semantico** contra o vivo (git `apps/<app>/k8s/` + cluster): para cada recurso compare
   `kind/name`, `spec.selector`, labels `part-of`, portas, `claimName` de PVC, nomes de
   Middleware/IngressRoute e rotas (match/priority/strip).
4. **Diff real contra o cluster** (read-only): recarregue o PATH e rode
   `kubectl diff -f <tmp>/k8s/<app>.yaml`. Exit 1 = so mudancas aplicaveis; **exit >1 com
   `field is immutable` = conversao BLOQUEADA**.
5. Qualquer **rename/selector-change inevitavel → PARE** (nao force): documente o bloqueio e
   aguarde o chart ganhar os knobs de compatibilidade (abaixo). Recriacao planejada (delete +
   apply com downtime/perda de estado) e decisao do **operador**, com aprovacao, fora da esteira.
6. Se o gate passou: commite `devops.yaml` v2 + `k8s/<app>.yaml` compilado **juntos** (o
   `--check` do compilador vira o guardiao de drift) e acompanhe o sync do Argo.

**Estado atual (2026-07, fase B6): conversao de produtos v1 VIVOS esta BLOQUEADA.** Piloto
executado no `contaviva-pro` (produto da Forja no ar): o `kubectl diff` do candidato compilado foi
rejeitado pelo apiserver em **todos os 5 Deployments** (`spec.selector: field is immutable` —
vivo `{app.kubernetes.io/name: contaviva-pro-api}` vs chart `{app.kubernetes.io/name: api,
app.kubernetes.io/part-of: contaviva-pro}`), alem de: PVC do Postgres renomeado
(`contaviva-pro-postgres` com dados → `contaviva-pro-postgres-data` vazio = perda de dados via
prune), Middleware renomeado (`-api-strip` → `-api-stripprefix`) e consolidacao das IngressRoutes
(`<app>-frontend` seria podada). O mesmo vale para todos os produtos v1 gerados pelo antigo
`buildK8s()` (mesmas convencoes).

**O que desbloqueia (mudancas no chart `templates/app-template` — fase B2, NAO fazer aqui):**

| Gap do chart | Efeito hoje | Mudanca necessaria |
|---|---|---|
| `selectorLabels` = `{ name: <svc>, part-of: <app> }` | selector imutavel ≠ vivo (`{ name: <app>-<svc> }`) → apiserver rejeita | selector **exatamente** `{ app.kubernetes.io/name: <app>-<svc> }` (sem `part-of` no selector — adicionar chave tambem e mutacao imutavel) + label `name` = `<app>-<svc>` (letra do hard-constraints §1) |
| PVC de dependencia fixo `<app>-<dep>-data` | rename do PVC vivo = perda de dados | knob `dependencies.<dep>.pvcName`/`existingClaim` |
| Middleware fixo `<svc>-stripprefix` | rename do Middleware vivo (stateless, mas e prune+create) | knob ou migracao aceita com recriacao atomica |
| Sem ServiceMonitor/PrometheusRule/porta de metricas | suplemento `k8s/<app>-observability.yaml` gerado pelo scaffold | templates dirigidos pelo bloco `observability:` do contrato |
| Sem `middlewares` extras por service | suplemento `k8s/<app>-sso.yaml` (rota sombra priority+1) | lista `middlewares` por service no contrato/chart |

> **sicat e gymops ficam FORA da convergencia de manifests** (decisao da Forja 4.0): a adocao
> brownfield deles e **por contrato** (A5 — `specs/products/{sicat,gymops}` + `devops.yaml` v1
> continuam a fonte declarativa) e os **manifests manuais em `apps/{sicat,gymops}/k8s/`
> permanecem** como estao. Nao recompile nem converta esses dois.
