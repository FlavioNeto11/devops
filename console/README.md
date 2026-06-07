# DevOps Console

Painel web **somente leitura** que mostra, em tempo real, o estado do cluster
Kubernetes local (contexto `docker-desktop`) da Plataforma DevOps. Ele reune em
um unico lugar a visao de cargas de trabalho, eventos, logs e roteamento
(Traefik), alem de links rapidos para Argo CD, Grafana e o dashboard do Traefik.

> Idioma: documentacao, comentarios e textos de UI em **pt-BR**. Identificadores
> de codigo, chaves YAML e CLI permanecem em ingles.

---

## O que o Console faz

- **Visao geral do cluster**: lista namespaces gerenciados pela plataforma
  (`devops-system`, `traefik`, `argocd`, `observability`, `apps`, `apps-dev`,
  `apps-prod-local`) e o que roda em cada um.
- **Cargas de trabalho**: `Deployments`, `ReplicaSets`, `DaemonSets` e
  `StatefulSets` com status de replicas/rollout, alem dos `Pods` e seu estado.
- **Eventos**: eventos recentes do cluster (warnings, scheduling, pulls de
  imagem) para diagnostico rapido.
- **Logs**: leitura de logs de Pods (stream), util para inspecao pontual.
- **Roteamento**: `IngressRoutes` e `Middlewares` do Traefik
  (`traefik.io/v1alpha1`), mostrando como cada app esta exposta no host unico.
- **Links rapidos**: Argo CD (`/argocd`), Grafana (`/grafana`) e dashboard do
  Traefik, lidos do `ConfigMap` `console-config`.

**Importante:** o Console **nunca** altera nada no cluster. Ele e uma ferramenta
de observacao (ver a secao de seguranca).

---

## Arquitetura

O Console e composto por dois servicos no namespace `devops-system`, expostos no
host unico sob o subpath `/devops`:

```
                         Traefik (entryPoint web :80)
                                     |
   Host(xpto.localhost) && PathPrefix(/devops/api)   -> priority 20
        |  Middleware StripPrefix console-api-strip (remove /devops/api)
        v
   console-backend (ClusterIP :3001)  --(get/list/watch)-->  API do Kubernetes
        ^
        |  REST + SSE
   console-frontend (ClusterIP :80)   <- Host && PathPrefix(/devops)  priority 10
        |  (SEM strip; SPA servida sob /devops/)
        v
                              Navegador do usuario
```

### Backend (`console-backend`)

- **Stack**: Node.js (>= 20), Express e `@kubernetes/client-node`.
- **Imagem local**: `console-backend:local` (`imagePullPolicy: IfNotPresent`).
- **Porta**: `3001` (variavel `PORT`).
- **Healthcheck**: `GET /health` (usado por readiness/liveness probes).
- **Acesso ao cluster** (`src/k8s.js`):
  - Dentro do cluster (Pod): `kc.loadFromCluster()` usa o token da
    ServiceAccount `console` montado no Pod.
  - Em desenvolvimento local: `kc.loadFromDefault()` usa `~/.kube/config`
    (contexto `docker-desktop`).
- **API**: expoe endpoints REST de leitura (overview, workloads, pods, events,
  ingressroutes, ...) e um endpoint **SSE** para atualizacoes em tempo real.
- **Somente leitura**: nenhuma rota chama metodos de escrita do client-node.

### Frontend (`console-frontend`)

- **Stack**: React 18 + Vite 5, servido por nginx.
- **Imagem local**: `console-frontend:local` (`imagePullPolicy: IfNotPresent`).
- **Porta**: `80`.
- **Healthcheck**: `GET /healthz` (definido no `nginx.conf` da imagem).
- **Base path**: build com `base: '/devops/'` (ver `vite.config.js`), pois a SPA
  e servida no subpath `/devops/` **sem** StripPrefix. Os assets sao
  referenciados como `/devops/assets/...`.
- **Consumo da API**: chama `/devops/api/...` (REST) e abre um `EventSource` em
  `/devops/api/stream` (SSE). Em dev, o proxy do Vite encaminha `/devops/api`
  para `http://localhost:3001` removendo o prefixo (espelha o StripPrefix).

### Roteamento (Traefik) e convencao de prefixos

Duas rotas no mesmo host, atendendo `xpto.localhost` (local) e `nvit.io`
(real futuro), no entryPoint `web` (HTTP/80):

| Rota          | PathPrefix    | priority | Servico            | StripPrefix              |
| ------------- | ------------- | -------- | ------------------ | ------------------------ |
| API           | `/devops/api` | 20       | `console-backend`  | **Sim** (`/devops/api`)  |
| Frontend      | `/devops`     | 10       | `console-frontend` | Nao                      |

A rota da API tem `priority` maior para vencer a do frontend (a regra mais
especifica/longa deve ganhar). O Middleware `console-api-strip` remove o prefixo
**completo** `/devops/api`, entao o backend recebe rotas na raiz
(ex.: `/devops/api/health` -> `/health`). Esta e a convencao da plataforma:
**APIs usam `stripPrefix=true`; frontends NAO usam strip**.

HTTPS (`websecure`) fica **pendente** ate configurarmos TLS self-signed.

---

## RBAC somente leitura (least privilege)

O backend usa a ServiceAccount `console` (namespace `devops-system`), ligada por
um `ClusterRoleBinding` ao `ClusterRole` **`console-readonly`**. Esse ClusterRole
concede **exclusivamente** os verbos `get`, `list` e `watch` — **nenhum** verbo
de escrita (`create`, `update`, `patch`, `delete`, `deletecollection`).

Recursos com leitura autorizada:

- **core (`""`)**: `pods`, `pods/log`, `services`, `events`, `configmaps`,
  `namespaces`, `endpoints`.
- **apps**: `deployments`, `replicasets`, `daemonsets`, `statefulsets`.
- **traefik.io**: `ingressroutes`, `middlewares`.
- **networking.k8s.io**: `ingresses`.

Mesmo que o `@kubernetes/client-node` exponha metodos de escrita, qualquer
tentativa de mutacao seria **recusada pelo cluster** por causa deste RBAC. Os
verbos `watch` sao o que viabiliza o SSE em tempo real (ver abaixo).

> O Console **nao** tem acesso a `secrets` — apenas `configmaps`.

---

## Como buildar (imagens locais)

As imagens sao buildadas **localmente** e **nao** sao enviadas a nenhum registry
(o cluster as usa via `IfNotPresent`). A partir de `C:/devops/console`:

```powershell
# Backend (Express + client-node)
docker build -t console-backend:local -f Dockerfile.backend .

# Frontend (React + Vite, servido por nginx, base /devops/)
docker build -t console-frontend:local -f Dockerfile.frontend .
```

> Como o Docker Desktop compartilha o daemon com o Kubernetes, as imagens ficam
> disponiveis para o cluster assim que o build termina — nao e preciso `push`.

---

## Como deployar

Pre-requisitos: namespace `devops-system` criado
(`C:/devops/platform/namespaces/namespaces.yaml`), Traefik instalado com os
Middlewares `compress` e `secure-headers` no namespace `traefik`, e as imagens
locais ja buildadas.

### Opcao A — kubectl

```powershell
kubectl apply -f C:/devops/console/k8s/
```

Isto cria (no namespace `devops-system`): `ServiceAccount`, `ClusterRole` +
`ClusterRoleBinding`, `ConfigMap`, os dois `Deployments` e `Services`, o
`Middleware` `console-api-strip` e a `IngressRoute` `console`.

### Opcao B — script da plataforma (idempotente)

```powershell
C:/devops/scripts/install-dashboard.ps1
```

O script verifica o estado antes de agir (seguro re-rodar): garante o namespace,
aplica os manifests de `k8s/` e aguarda os Deployments ficarem prontos.

Apos o deploy, acesse: **http://xpto.localhost/devops/**

> Para `xpto.localhost` resolver, garanta a entrada `127.0.0.1 xpto.localhost`
> em `C:\Windows\System32\drivers\etc\hosts` (requer privilegios de
> Administrador).

---

## Desenvolvimento local

Rodar fora do cluster, usando seu `~/.kube/config` (contexto `docker-desktop`):

```powershell
# Backend (porta 3001)
cd C:/devops/console/backend
npm install
npm start

# Frontend (Vite dev server, porta 5173)
cd C:/devops/console/frontend
npm install
npm run dev
```

- O backend le a kubeconfig local automaticamente (sem `KUBERNETES_SERVICE_HOST`
  ele usa `loadFromDefault()`).
- O dev server do Vite encaminha `/devops/api` -> `http://localhost:3001`
  removendo o prefixo, espelhando o StripPrefix de producao. Acesse a SPA em
  **http://localhost:5173/devops/**.

---

## Como o SSE atualiza em tempo real

1. O frontend abre uma conexao **Server-Sent Events** (`EventSource`) em
   `/devops/api/stream`.
2. O backend mantem essa resposta HTTP aberta
   (`Content-Type: text/event-stream`) e registra **informers/watches** do
   `@kubernetes/client-node` sobre os recursos observados (Pods, Deployments,
   Events, IngressRoutes, ...). Isso so e possivel porque o RBAC concede o verbo
   `watch`.
3. Quando o cluster emite um evento de mudanca (`ADDED`/`MODIFIED`/`DELETED`), o
   backend serializa o recurso atualizado e o envia como uma mensagem SSE
   (`event:` + `data:`) para todos os clientes conectados.
4. O frontend recebe a mensagem e atualiza o estado da UI **sem recarregar a
   pagina** — o painel reflete o cluster quase instantaneamente.
5. Reconexao: o `EventSource` reconecta sozinho em caso de queda; o backend
   limpa o watch quando a conexao fecha.

---

## Como estender

- **Novo recurso no painel**:
  1. Conceda leitura no `ClusterRole` `console-readonly`
     (`C:/devops/console/k8s/rbac.yaml`) adicionando o recurso com verbos
     `get`/`list`/`watch` — **nunca** verbos de escrita.
  2. No backend, adicione a consulta (`get`/`list`) e, se quiser tempo real,
     registre tambem um `watch`/informer que publica no stream SSE.
  3. No frontend, consuma o novo endpoint (REST) e/ou trate o novo `event:` do
     SSE para renderizar.
- **Novo link rapido** (ex.: outra ferramenta): adicione a URL ao `ConfigMap`
  `console-config` (`configmap.yaml`), injete como env no
  `backend-deployment.yaml` e exponha pela API.
- **Mais namespaces**: como o RBAC e via `ClusterRole`, a leitura ja abrange
  todo o cluster; basta o backend incluir o namespace nas consultas.

> Mantenha a convencao de roteamento ao expor novas rotas: APIs com
> `stripPrefix=true` e `priority` maior; frontends sem strip. A regra de path
> mais especifica deve vencer.

---

## Nota de seguranca

- **Somente leitura por design**: o RBAC (`console-readonly`) concede apenas
  `get`/`list`/`watch`. Nao adicione verbos de escrita sem uma revisao explicita
  — isso violaria o principio de menor privilegio.
- **Sem segredos no repositorio**: nao ha credenciais nos manifests. O Console
  nao le `secrets` (apenas `configmaps`). Para qualquer configuracao sensivel
  use `Secret` a partir de `secret.example.yaml` (templates da plataforma), com
  valores placeholder documentados.
- **Exposicao**: no laboratorio local o Console e servido por **HTTP**
  (`http://xpto.localhost/devops/`). HTTPS (`websecure`) esta pendente
  (self-signed). Nao exponha o Console publicamente sem TLS e sem uma camada de
  autenticacao na frente.
- **Hardening do container**: o Pod do backend roda com `runAsNonRoot`,
  `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false` e `drop: [ALL]`.
