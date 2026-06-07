# Padrao de Roteamento por Path (StripPrefix vs Base Path)

Este documento descreve a **convencao de roteamento** da Plataforma DevOps Local sob um
**host unico**: quando ha `StripPrefix` e quando **nao** ha, **por que** frontends usam
base path (e nao strip), **por que** APIs usam `StripPrefix`, como o **Traefik resolve a
prioridade** entre `/<base>` e `/<base>/api`, exemplos completos de `IngressRoute` +
`Middleware`, a **tabela das rotas** do dominio e a **versao para `nvit.io`**.

> Pre-requisito conceitual: o [`new-project-contract.md`](./new-project-contract.md)
> (campos `expose`, `stripPrefix`, `path`, `basePath`). Visao geral em
> [`ARCHITECTURE.md`](../ARCHITECTURE.md) (secao 4). Ingress = **Traefik** (CRDs
> `traefik.io/v1alpha1`).

---

## 1. A convencao em uma frase

> **Frontends (SPA) NAO fazem strip** (sao buildados com um *base path*); **APIs, api2 e
> worker-health SEMPRE fazem strip** (o `Middleware` StripPrefix remove o prefixo
> **completo** e o processo ve as rotas na raiz).

| Tipo de servico        | `expose` | `stripPrefix` | Como o backend "ve" a rota                                                         |
|------------------------|----------|---------------|-----------------------------------------------------------------------------------|
| Frontend (SPA)         | `true`   | **`false`**   | O nginx serve o conteudo **ja sob** o subpath (build com `base=/<basePath>/`).     |
| API / api2 / worker-health | `true` | **`true`**  | O Traefik remove `basePath+path`; o processo recebe `/...` (raiz).                |
| Worker (background)    | `false`  | (n/a)         | Sem rota (so health interno para probes).                                         |

---

## 2. Por que frontends usam **base path** (e nao strip)

Uma SPA (React+Vite, Angular, etc.) gera um `index.html` que referencia assets
(`/assets/app-xyz.js`, `/assets/app-xyz.css`) e o roteador do lado do cliente monta URLs.
Esses caminhos sao **resolvidos pelo navegador a partir da raiz do host**, a menos que o
build seja informado de que a app vive sob um **subpath**.

Se servissemos o frontend em `/aplicacao1` e **removessemos** o prefixo via StripPrefix, o
nginx entregaria o `index.html`, mas o HTML pediria os assets em `/assets/...` (raiz do
host) — que **nao existem** ali. Resultado: HTML carrega, **assets dao 404**, a SPA quebra.

A solucao correta e **buildar a SPA com um base path** que coincide com o `basePath`:

- **Vite**: `base: '/aplicacao1/'` (via `VITE_BASE_PATH=/aplicacao1/` lido no
  `vite.config`). Os assets passam a ser referenciados como `/aplicacao1/assets/...`.
- **Create React App (CRA)**: `PUBLIC_URL=/aplicacao1` no build.
- **HTML puro / outros**: `<base href="/aplicacao1/">` no `<head>`.

Com o base path correto, **nao se remove o prefixo**: o navegador pede
`/aplicacao1/assets/app.js`, o Traefik roteia `/aplicacao1` -> `frontend`, e o nginx
(servindo o conteudo sob `/aplicacao1/`) entrega o asset. Por isso **frontend =
`stripPrefix: false`**.

> A barra final em `VITE_BASE_PATH=/aplicacao1/` e **importante**: o Vite a usa para montar
> as URLs absolutas dos assets. Sempre termine com `/`.

### 2.1 Diagrama (frontend, sem strip)

```
Navegador                Traefik (web:80)                 nginx (frontend)
   |  GET /aplicacao1         |                                  |
   |------------------------->| match PathPrefix(/aplicacao1)    |
   |                          | (SEM middleware de strip)        |
   |                          |--------------------------------->| serve index.html
   |  GET /aplicacao1/assets/app.js                               |  (conteudo sob
   |------------------------->| match PathPrefix(/aplicacao1)    |   /aplicacao1/)
   |                          |--------------------------------->| serve o asset
   |<-------------------------|<---------------------------------|  200 OK
```

---

## 3. Por que APIs usam **StripPrefix**

Uma API (Express, FastAPI, etc.) normalmente define rotas a partir da **raiz**:
`app.get('/health', ...)`, `app.get('/version', ...)`. O processo **nao sabe** que, no host
unico, ele vive sob `/aplicacao1/api`.

Se **nao** removessemos o prefixo, a API receberia `GET /aplicacao1/api/health` e
responderia **404**, porque ela so conhece `/health`. Reescrever todas as rotas da API para
incluir o prefixo seria fragil e acoplaria o codigo ao roteamento.

A solucao e o `Middleware` **StripPrefix** do Traefik, que remove o prefixo **completo**
(`basePath` + `path`) **antes** de encaminhar ao backend:

- Externo: `GET /aplicacao1/api/health`
- O Traefik aplica `stripPrefix` de `/aplicacao1/api`
- Backend recebe: `GET /health` -> responde 200

Por isso **api/api2/worker-health = `stripPrefix: true`**, e o `health.path` no
`devops.yaml` e informado **como o processo ve** (na raiz, ex.: `/health`).

### 3.1 Diagrama (API, com strip)

```
Cliente                  Traefik (web:80)                          API (backend)
   | GET /aplicacao1/api/health |                                       |
   |--------------------------->| match PathPrefix(/aplicacao1/api)     |
   |                            | Middleware StripPrefix /aplicacao1/api|
   |                            | reescreve para  /health               |
   |                            |-------------------------------------->| GET /health
   |<---------------------------|<--------------------------------------|  200 {"status":"ok"}
```

> O StripPrefix remove o prefixo **completo** (base+path), nao apenas o `path`. Para
> `basePath=/aplicacao1` e `path=/api`, o prefixo removido e `/aplicacao1/api`.

---

## 4. Onde vivem os Middlewares de StripPrefix

- Os `Middleware` de **StripPrefix sao especificos de cada app** (o prefixo depende de
  `basePath`+`path`). Por isso **NAO** ficam no namespace `traefik`; sao criados no
  **namespace da propria aplicacao** (ex.: `apps` para a `aplicacao1`).
- No namespace `traefik` ficam apenas os middlewares **transversais** (compartilhados):
  `compress`, `secure-headers` e (desabilitado) `redirect-https` — veja
  [`platform/traefik/middlewares.yaml`](../platform/traefik/middlewares.yaml).
- O provider CRD do Traefik esta com `allowCrossNamespace: true`, entao uma `IngressRoute`
  no namespace da app pode referenciar middlewares do namespace `traefik` informando o
  campo `namespace` no item (ex.: `name: compress`, `namespace: traefik`).

---

## 5. Como o Traefik resolve a prioridade entre `/<base>` e `/<base>/api`

No **mesmo host**, dois `PathPrefix` podem casar a mesma requisicao:
`PathPrefix(/aplicacao1)` (frontend) e `PathPrefix(/aplicacao1/api)` (API). Uma requisicao
para `/aplicacao1/api/health` casa **os dois**. Quem vence?

- **Regra do Traefik:** entre rotas que casam, vence a de **maior `priority`**. Quando
  `priority` nao e informado, o Traefik usa o **tamanho (comprimento) da regra** como
  prioridade implicita — regras mais longas/especificas ganham. Logo,
  `PathPrefix(/aplicacao1/api)` (mais longa) tenderia a vencer `PathPrefix(/aplicacao1)`.
- **Por seguranca, definimos `priority` EXPLICITO** em cada `IngressRoute`:
  - Frontend (`/<base>`): **priority baixa** (ex.: `10`).
  - API (`/<base>/api`): **priority alta** (ex.: `100`).

Assim garantimos, sem ambiguidade, que **o prefixo mais especifico vence**:
`/aplicacao1/api` -> API; qualquer outra coisa sob `/aplicacao1` -> frontend.

> **Por que isso importa?** Se o frontend (priority alta por engano) capturasse
> `/aplicacao1/api/...`, as chamadas de API receberiam **HTML** (o `index.html` da SPA) em
> vez de JSON. Manter a API com **priority MAIOR** evita exatamente isso.

### 5.1 Regra pratica de prioridade

- Quanto **mais especifico** o prefixo, **maior** deve ser o `priority`.
- Use uma escala simples e consistente, por exemplo:
  - `/<base>` (frontend) -> `priority: 10`
  - `/<base>/worker` -> `priority: 90`
  - `/<base>/api2` -> `priority: 100`
  - `/<base>/api` -> `priority: 100`
- Em caso de empate de `priority` entre dois prefixos distintos, o Traefik ainda desempata
  pelo comprimento da regra — mas evite empatar prefixos que se sobrepoem.

---

## 6. Exemplos completos: `IngressRoute` + `Middleware`

Os exemplos abaixo usam o namespace **`apps`** (onde a `aplicacao1` roda) e a sintaxe das
CRDs do Traefik (`traefik.io/v1alpha1`). Os valores entre crases (`` ` ``) sao a sintaxe de
match do Traefik.

### 6.1 Frontend (sem strip, priority baixa)

```yaml
# IngressRoute do frontend da aplicacao1 — SEM StripPrefix.
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: aplicacao1-frontend
  namespace: apps
  labels:
    app.kubernetes.io/name: aplicacao1-frontend
    app.kubernetes.io/part-of: aplicacao1
    app.kubernetes.io/managed-by: devops-platform
spec:
  entryPoints:
    - web                                   # HTTP/porta 80 (websecure pendente)
  routes:
    - match: Host(`xpto.localhost`) && PathPrefix(`/aplicacao1`)
      kind: Rule
      priority: 10                          # BAIXA: perde para /aplicacao1/api
      services:
        - name: aplicacao1-frontend
          port: 80
      middlewares:
        - name: compress                    # transversal (namespace traefik)
          namespace: traefik
        - name: secure-headers
          namespace: traefik
      # SEM middleware de strip: o frontend foi buildado com base /aplicacao1/.
```

### 6.2 API (com strip, priority alta)

```yaml
# Middleware StripPrefix ESPECIFICO da API (vive no namespace da app: apps).
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: aplicacao1-api-stripprefix
  namespace: apps
  labels:
    app.kubernetes.io/part-of: aplicacao1
    app.kubernetes.io/managed-by: devops-platform
spec:
  stripPrefix:
    prefixes:
      - /aplicacao1/api                     # prefixo COMPLETO (basePath + path)
---
# IngressRoute da API — COM StripPrefix e priority ALTA.
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: aplicacao1-api
  namespace: apps
  labels:
    app.kubernetes.io/name: aplicacao1-api
    app.kubernetes.io/part-of: aplicacao1
    app.kubernetes.io/managed-by: devops-platform
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`xpto.localhost`) && PathPrefix(`/aplicacao1/api`)
      kind: Rule
      priority: 100                         # ALTA: vence /aplicacao1 (frontend)
      services:
        - name: aplicacao1-api
          port: 8080
      middlewares:
        - name: aplicacao1-api-stripprefix  # remove /aplicacao1/api (namespace apps)
        - name: compress
          namespace: traefik
        - name: secure-headers
          namespace: traefik
```

### 6.3 Worker health (opcional, com strip)

```yaml
# (Opcional) Expor o health do worker em /aplicacao1/worker — COM StripPrefix.
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: aplicacao1-worker-stripprefix
  namespace: apps
spec:
  stripPrefix:
    prefixes:
      - /aplicacao1/worker
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: aplicacao1-worker
  namespace: apps
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`xpto.localhost`) && PathPrefix(`/aplicacao1/worker`)
      kind: Rule
      priority: 90
      services:
        - name: aplicacao1-worker
          port: 8081
      middlewares:
        - name: aplicacao1-worker-stripprefix
        - name: compress
          namespace: traefik
```

> Por padrao o worker usa `expose: false` (sem `IngressRoute`). Crie o acima **apenas** se
> quiser expor o health do worker externamente.

---

## 7. Tabela das rotas do dominio (host unico)

Host local: **`xpto.localhost`** | Host real futuro: **`nvit.io`** (mesmo layout).
Todas as rotas locais usam o entrypoint **`web` (HTTP/80)**; **`websecure` (HTTPS/443)**
fica **pendente** (self-signed) — veja [`SECURITY.md`](../SECURITY.md) e
[`local-domain-setup.md`](./local-domain-setup.md).

| Path                  | Service / destino     | StripPrefix              | Prioridade | Notas                                                       |
|-----------------------|-----------------------|--------------------------|------------|-------------------------------------------------------------|
| `/devops`             | `console-frontend`    | **NAO**                  | baixa      | SPA base `/devops/`.                                        |
| `/devops/api`         | `console-backend`     | **SIM** (`/devops/api`)  | alta       | API somente leitura (SSE).                                  |
| `/argocd`             | Argo CD `server`      | **NAO**                  | -          | `argocd server --insecure`, `rootpath /argocd`.            |
| `/grafana`            | Grafana               | **NAO**                  | -          | `serve_from_sub_path=true`, `root_url=.../grafana`.        |
| `/aplicacao1`         | `aplicacao1-frontend` | **NAO**                  | baixa      | SPA `VITE_BASE_PATH=/aplicacao1/`.                         |
| `/aplicacao1/api`     | `aplicacao1-api`      | **SIM** (`/aplicacao1/api`) | alta    | `/aplicacao1/api/health` -> backend ve `/health`.          |
| `/aplicacao1/worker`  | `aplicacao1-worker`   | **SIM** (`/aplicacao1/worker`) | alta | Health do worker (opcional).                               |

### 7.1 Por que `/argocd` e `/grafana` NAO usam StripPrefix

Argo CD e Grafana sao casos especiais: **eles proprios** sabem servir sob um subpath, entao
**nao** precisamos de StripPrefix — basta configura-los:

- **Argo CD**: `server --insecure` + `server.rootpath: /argocd` + `server.basehref:
  /argocd/`. A UI e a API ja respondem sob `/argocd`. Veja
  [`platform/argocd/helm-values.yaml`](../platform/argocd/helm-values.yaml).
- **Grafana**: `serve_from_sub_path: true` + `root_url: http://xpto.localhost/grafana`. O
  Grafana serve os assets sob `/grafana`. Veja
  [`platform/observability/grafana-values.yaml`](../platform/observability/grafana-values.yaml).

E o mesmo principio do frontend (servir sob subpath), mas via **configuracao da propria
aplicacao** em vez de `VITE_BASE_PATH`.

---

## 8. Versao para o dominio real `nvit.io`

O layout de paths e **identico**; muda apenas o **host** (e, idealmente, HTTPS). Para
migrar uma rota do local para o real:

1. **Troque o `host`** no `devops.yaml` (`app.host: nvit.io`) e/ou no `match` das
   `IngressRoute` (`Host(`nvit.io`)`).
2. **Mantenha os mesmos `PathPrefix`, `priority` e `Middleware`** (a logica de strip nao
   muda).
3. **Ajuste as URLs externas** dos componentes que embutem a URL publica:
   - Argo CD: `configs.cm.url: https://nvit.io/argocd`.
   - Grafana: `root_url: https://nvit.io/grafana`.
   - Console (`ConfigMap`): `ARGOCD_URL`/`GRAFANA_URL` apontando para `nvit.io`.
   - Frontends: `VITE_BASE_PATH` **nao muda** (continua `/<base>/`, e relativo ao host).
4. **Habilite HTTPS** (`websecure`) com certificado valido (Let's Encrypt/ACME no Traefik)
   ou via **Cloudflare Tunnel** com TLS gerenciado — veja
   [`local-domain-setup.md`](./local-domain-setup.md).

### 8.1 Exemplo: IngressRoute da API para `nvit.io` (HTTPS)

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: aplicacao1-api
  namespace: apps
spec:
  entryPoints:
    - websecure                              # HTTPS/porta 443
  routes:
    - match: Host(`nvit.io`) && PathPrefix(`/aplicacao1/api`)
      kind: Rule
      priority: 100
      services:
        - name: aplicacao1-api
          port: 8080
      middlewares:
        - name: aplicacao1-api-stripprefix   # MESMO strip do local
        - name: compress
          namespace: traefik
        - name: secure-headers
          namespace: traefik
  tls:
    # Em producao: certResolver ACME (Let's Encrypt) ou Secret TLS valido.
    certResolver: letsencrypt
```

> Tabela de rotas para `nvit.io` (mesmos paths do local):
> `/devops`, `/devops/api`, `/argocd`, `/grafana`, `/aplicacao1`, `/aplicacao1/api`,
> `/aplicacao1/worker` — apenas com `Host(`nvit.io`)` e (idealmente) `websecure`.

---

## 9. Checklist rapido de roteamento

- [ ] Frontend: `stripPrefix: false` + `VITE_BASE_PATH=/<base>/` (barra final).
- [ ] API/api2: `stripPrefix: true` + `path` especifico (`/api`, `/api2`).
- [ ] `priority` da API **maior** que a do frontend (`/<base>/api` > `/<base>`).
- [ ] Middleware StripPrefix da app no **namespace da app** (nao no `traefik`).
- [ ] `health.path` informado como o **processo** o ve (na raiz, apos o strip).
- [ ] Worker: `expose: false` (a menos que queira expor o health).
- [ ] Para `nvit.io`: trocar `Host(...)`, usar `websecure`+TLS, atualizar URLs
      externas (Argo/Grafana/Console).

---

## 10. Referencias

- [`new-project-contract.md`](./new-project-contract.md) — `expose`, `stripPrefix`, `path`,
  `basePath`, exemplos por tipo, `aplicacao2`.
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — secao 4 (roteamento) e secao 5 (portas).
- [`platform/traefik/middlewares.yaml`](../platform/traefik/middlewares.yaml) —
  `compress`, `secure-headers`, `redirect-https` (transversais).
- [`platform/traefik/dashboard-ingressroute.yaml`](../platform/traefik/dashboard-ingressroute.yaml)
  — exemplo real de `IngressRoute` com `priority` e middlewares.
- [`local-domain-setup.md`](./local-domain-setup.md) — host local, dominio real, HTTPS,
  Cloudflare Tunnel.
