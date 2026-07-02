# app-template — Helm chart da plataforma DevOps

Chart Helm **reutilizavel** que transforma o contrato canonico `devops.yaml`
(o descritor declarativo de uma aplicacao) em recursos Kubernetes prontos:
Deployments, Services ClusterIP, ConfigMaps, exemplo de Secret e rotas de
Ingress do **Traefik** (`IngressRoute` + `Middleware` de `StripPrefix`).

O chart segue a **convencao de roteamento por subpath** da plataforma: o mesmo
host (`nvit.localhost` no local, `dev.nvit.com.br` no real) serve varias apps,
cada uma sob um `basePath` (ex.: `/aplicacao1`).

> **Schema canonico do `devops.yaml`:** [`../../schema/devops-schema.json`](../../schema/devops-schema.json)
> (maquina-legivel; referencia humana em [`../../docs/new-project-contract.md`](../../docs/new-project-contract.md)).
>
> **Meta-docs de um app novo:** parta dos templates em
> [`../meta/`](../meta/) — `AGENTS.md.template`, `CLAUDE.md.template`, `app-README.md.template`
> (padrao: [`../../docs/standards/meta-doc-standard.md`](../../docs/standards/meta-doc-standard.md)).

---

## Pre-requisitos

- Cluster local do Docker Desktop (contexto kube: `docker-desktop`).
- Traefik instalado via Helm no namespace `traefik`, com entrypoints
  `web` (80) e `websecure` (443) e as CRDs `IngressRoute`/`Middleware`
  (`apiVersion: traefik.io/v1alpha1`).
- Namespace de destino criado (ex.: `apps`).
- Helm 3 e `kubectl` no PATH (PowerShell 7).

---

## Como renderizar e instalar

Renderizar (ver o YAML final sem aplicar):

```powershell
helm template ./ -f values.local.yaml
```

Instalar / atualizar no namespace `apps` (ambiente local):

```powershell
helm upgrade --install aplicacao1 ./ -n apps -f values.local.yaml
```

Ambiente DEV/real (host `dev.nvit.com.br`, imagens no GHCR):

```powershell
helm upgrade --install aplicacao1 ./ -n apps -f values.dev.yaml
```

> O nome do release (`aplicacao1` acima) e livre, mas por convencao use o
> `app.name`. Os nomes dos recursos derivam de `app.name`, nao do release.

Validar o chart antes de aplicar:

```powershell
helm lint ./ -f values.local.yaml
```

---

## Como o contrato vira recursos

O contrato `devops.yaml` (veja [`app.yaml`](./app.yaml)) e mapeado para os
valores do chart (`values.local.yaml` / `values.dev.yaml`). A partir dos
`services`, o chart gera:

| `service.type`     | Deployment | Service ClusterIP | Rota no Ingress (se `expose`) |
| ------------------ | :--------: | :---------------: | :---------------------------- |
| `frontend`         |    sim     |        sim        | `PathPrefix(basePath)` **sem strip**, priority menor — na IngressRoute PROPRIA `<app>-frontend` |
| `api` / `api2`     |    sim     |        sim        | `PathPrefix(basePath+path)` **com StripPrefix**, priority maior — na IngressRoute `<app>` |
| `worker`           |    sim     |       nao         | nao (nao e exposto) |

> **Convencao VIVA (imutavel — ver `docs/new-project-contract.md` §11.5):** todo
> Deployment/Service usa selector **exatamente** `{ app.kubernetes.io/name: <app>-<svc> }`
> (sem `part-of` no selector — `spec.selector` e imutavel no apiserver); o Middleware de
> strip chama `<app>-<svc>-strip`; e a rota do frontend vive na IngressRoute separada
> `<app>-frontend` (identico aos produtos vivos gerados pelo antigo `buildK8s()` — e o que
> permite a convergencia v1 -> v2 sem recriar recursos).

Alem disso, sempre sao gerados:

- **ConfigMap `<app.name>-meta`** — metadados (`name`, `namespace`, `host`,
  `basePath`) e dados de publicacao (`commitSha`, `branch`, `imageTag`,
  `deployedAt`, `runId`). O DevOps Console le este ConfigMap.
- **ConfigMap `<app.name>-healthchecks`** — mapa `serviceName -> health.path`
  (insumo para a tela Health do Console; nome POR APP — o antigo nome fixo
  `app-healthchecks` colidia entre apps no mesmo namespace).
- **`secret.example.yaml`** — modelo de Secret (NAO aplicar; copiar para
  `secret.yaml`, que e gitignored, e preencher).

### Dependencias (`dependencies` — contrato v2)

Quando os values trazem `dependencies` (derivados de um `devops.yaml` `version: 2`
pelo compilador `specs/tools/devops-compile.mjs`), o chart provisiona a
infraestrutura da app por engine:

| `engine` | Template | Gera | Resources default |
|---|---|---|---|
| `postgres` | `dependency-postgres.yaml` | PVC `<app>-<dep>` (sem sufixo `-data` — convencao viva) + Deployment `<app>-<dep>` (strategy **Recreate**) + Service 5432 + probes `pg_isready`. `flavor: pgvector` -> `pgvector/pgvector:pg<version>`; sem flavor -> `postgres:<version>-alpine` (default 16). `secretName` OBRIGATORIO (`envFrom`) | requests 128Mi/50m · limits 1Gi/1000m |
| `redis` | `dependency-redis.yaml` | PVC `<app>-<dep>` (AOF) + Deployment (**Recreate**) + Service 6379 + probes `redis-cli ping`. `redis:<version>-alpine` (default 7) | requests 32Mi/25m · limits 256Mi/250m |

O chart **NUNCA renderiza Secret** para dependencias — apenas referencia
`secretName` (Secret criado fora do git; ver `docs/standards/hard-constraints.md` §3).
Engines `mongodb`/`nats` sao reservadas no schema, sem template ainda.

### Multi-env (`app.hosts` + `app.environment` — opt-in, Forja 4.0 B2)

Dois values opcionais suportam o compile de um ambiente efemero
(`devops-compile --env <nome>`; guia: `docs/multi-env.md`):

- **`app.hosts`** (lista): quando setado, a clausula `Host(...)` das
  IngressRoutes usa EXATAMENTE esses hosts — sem anexar `dev.nvit.com.br`
  (host de producao, nunca reatribuido a um env). Sem `app.hosts`, vale o
  comportamento historico (`app.host` + `dev.nvit.com.br`).
- **`app.environment`** (string): quando setado, TODO recurso ganha o label
  `devops.flavioneto/environment: <nome>` (e o ConfigMap `-meta` ganha
  `app.environment`). NAO entra nos selectors (estaveis entre upgrades).

Sem esses values o render e byte-identico ao anterior (retrocompat total).

```yaml
dependencies:
  postgres:
    engine: postgres
    flavor: pgvector       # opcional
    version: "16"
    storage: 2Gi
    secretName: meuapp-db  # POSTGRES_USER/PASSWORD/DB — criado fora do git
  redis:
    engine: redis
```

### Imagem efetiva

A imagem de cada container e computada assim:

- `registry` **vazio** (local): `"<service.image>:<service.tag>"`
  (ex.: `aplicacao1-api:local`) com `imagePullPolicy: IfNotPresent`.
- `registry` **definido** (GHCR): `"<registry>/<app.name>/<serviceName>:<service.tag>"`
  (ex.: `ghcr.io/flavioneto11/aplicacao1/api:<sha>`) com `imagePullPolicy: Always`.

### Annotations de publicacao

Todos os Deployments e o ConfigMap de metadados recebem annotations
`devops.flavioneto/commit-sha`, `/branch`, `/image-tag`, `/deployed-at` e
`/run-id`, alimentadas por `.Values.publish` (preenchidas pelo CI/CD).

---

## Comportamento de StripPrefix (por que frontend nao faz strip e API faz)

Esta e a parte mais importante da convencao. No mesmo host, varias apps
convivem sob subpaths diferentes.

### Frontend (SPA) — **SEM** strip

O frontend e **buildado** com um base path (ex.: `VITE_BASE_PATH=/aplicacao1/`),
entao o nginx ja serve todos os assets e rotas sob `/aplicacao1/`. Se o Traefik
removesse o prefixo, o nginx procuraria os arquivos na raiz e quebraria os
links dos assets. Por isso:

```
Requisicao: GET https://nvit.localhost/aplicacao1/  (ou /aplicacao1/qualquer-rota)
   -> match Host(`nvit.localhost`) && PathPrefix(`/aplicacao1`)  (priority 10)
   -> SEM middleware
   -> nginx recebe /aplicacao1/... e serve a SPA corretamente
```

### API — **COM** strip do prefixo completo

A API e escrita com rotas a partir da raiz (`/health`, `/users`, ...). O
Traefik remove o **prefixo completo** (`basePath` + `path`) antes de encaminhar:

```
Requisicao: GET https://nvit.localhost/aplicacao1/api/health
   -> match Host(`nvit.localhost`) && PathPrefix(`/aplicacao1/api`)  (priority 100)
   -> Middleware StripPrefix prefixes: [/aplicacao1/api]
   -> backend recebe /health
```

### Quem ganha quando os prefixos se sobrepoem

`/aplicacao1/api/...` casa **tanto** com `PathPrefix(/aplicacao1)` quanto com
`PathPrefix(/aplicacao1/api)`. O prefixo mais especifico (mais longo) deve
vencer. O Traefik ja prioriza pelo tamanho da regra, mas o chart define
`priority` explicito por seguranca: **API = 100** (maior) e **frontend = 10**
(menor). Assim `/aplicacao1/api/health` sempre vai para a API, e qualquer
outra rota sob `/aplicacao1` vai para o frontend.

A `priority` e **sobrescrevivel por service** (`services.<svc>.priority`). O
compilador do contrato (`specs/tools/devops-compile.mjs`) aplica a regra de
ouro da plataforma: frontend 10, api 30, api2 40 (`api2 > api > frontend`).
Sem override, valem os defaults historicos do chart (100/10).

---

## Como adicionar uma `api2` ou um `worker`

Edite o `services:` do seu `values.*.yaml`.

### Adicionar uma segunda API (`api2`) — exposta com strip

```yaml
services:
  api2:
    type: api2
    path: /api2          # prefixo final = basePath + path = /aplicacao1/api2
    image: aplicacao1-api2
    tag: local
    port: 8082
    expose: true
    stripPrefix: true    # backend recebe rotas a partir da raiz
    health:
      path: /health
    env:
      LOG_LEVEL: info
```

Resultado: um Deployment, um Service ClusterIP, uma route com `priority: 100`
e um Middleware `aplicacao1-api2-strip` com `prefixes: [/aplicacao1/api2]`.

### Adicionar um worker — sem ingress

```yaml
services:
  worker:
    type: worker
    image: aplicacao1-worker
    tag: local
    port: 8081           # opcional; usado so para a livenessProbe HTTP
    expose: false        # workers nao sao expostos no Traefik
    health:
      path: /health      # opcional; se definido (com port), vira livenessProbe
    env:
      QUEUE_URL: amqp://broker:5672
```

Resultado: apenas um Deployment (sem Service, sem rota). Se `health.path` e
`port` estiverem definidos, o worker ganha uma `livenessProbe` HTTP.

### Expor o health do worker como rota (opcional)

A plataforma documenta a rota opcional `/<base>/worker -> worker health`
(`StripPrefix /<base>/worker`). Para habilitar, marque o worker com
`expose: true` e `stripPrefix: true` e ajuste o `path` para `/worker`. Nesse
caso, gere um Service para ele (ajuste seu fluxo conforme a necessidade), pois
o chart so cria Service para `frontend`/`api`/`api2`.

---

## Override de recursos por service (opcional)

Por padrao, todos os containers usam `defaults.resources`. Para sobrescrever
em um service especifico:

```yaml
services:
  api:
    type: api
    # ...
    resources:
      requests: { cpu: 100m, memory: 128Mi }
      limits:   { cpu: 500m, memory: 512Mi }
```

---

## Secrets

Nunca versione segredos reais. O arquivo
[`templates/secret.example.yaml`](./templates/secret.example.yaml) e apenas um
modelo com placeholders. Copie-o para `templates/secret.yaml` (gitignored),
preencha os valores e aplique manualmente:

```powershell
copy templates\secret.example.yaml templates\secret.yaml
# edite templates\secret.yaml e preencha os valores reais
kubectl apply -f templates\secret.yaml -n apps
```

---

## HTTPS / websecure (pendente)

As rotas atuais usam apenas o entrypoint `web` (HTTP). O suporte a
`websecure` (HTTPS, porta 443) com certificado **self-signed** fica
**pendente** no laboratorio local e sera documentado/configurado a parte.
