---
title: "Fluxo de Deploy Fim-a-Fim (instalar, publicar, reverter, operar)"
status: guide
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

# Fluxo de Deploy Fim-a-Fim (instalar, publicar, reverter, operar)

Este e o guia operacional completo da Plataforma DevOps Local. Ele cobre o **fluxo
fim-a-fim** com diagrama textual e, com **comandos e resultados esperados**, mostra como:
**instalar do zero (bootstrap)**, **resetar (reset-platform)**, **publicar
frontend/API/worker** (local e via Actions/GHCR), **reverter publicacao**, **ver logs**,
**diagnosticar falhas**, **usar Argo CD**, **usar Grafana** e **usar o DevOps Console**.

> Pre-requisitos e Quick Start no [`README.md`](../README.md). Componentes em
> [`ARCHITECTURE.md`](../ARCHITECTURE.md). Roteamento em
> [`path-routing-pattern.md`](./path-routing-pattern.md). Runner em
> [`github-runner-setup.md`](./github-runner-setup.md). Dominio em
> [`local-domain-setup.md`](./local-domain-setup.md).

> Convencoes destes comandos: PowerShell 7 (`pwsh`), contexto kube **`docker-desktop`**,
> raiz do repo **`C:/devops`**. Os scripts sao **idempotentes** (seguros para re-rodar).

---

## 1. Diagrama do fluxo fim-a-fim

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  DESENVOLVEDOR                                                                  │
│    edita devops.yaml + codigo  ──►  git push (github.com/FlavioNeto11/devops)   │
└───────────────┬───────────────────────────────────────────────┬───────────────┘
                │ (fluxo via Actions/GHCR)                        │ (fluxo LOCAL :local)
                ▼                                                 ▼
┌──────────────────────────────┐                  ┌──────────────────────────────┐
│ GitHub Actions (app-pipeline)│                  │ scripts/publish-app.ps1│
│  discover -> build -> deploy │                  │  docker build -t <img>:local  │
└───────────────┬──────────────┘                  │  kubectl apply (IfNotPresent) │
                │ build/push (ubuntu)              └───────────────┬──────────────┘
                ▼                                                  │
┌──────────────────────────────┐                                  │
│ GHCR ghcr.io/flavioneto11/... │                                  │
│   tags: <sha>, <branch>,latest│                                  │
└───────────────┬──────────────┘                                  │
                │ deploy (self-hosted runner Windows)             │
                ▼                                                  ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ Kubernetes local (docker-desktop)                                                │
│   Deployment (ANOTADO: sha, branch, autor, deployed-at, run-id) + Service        │
│   + IngressRoute + Middleware (StripPrefix p/ APIs)                               │
└───────────────┬─────────────────────────────────────────────────┬──────────────┘
                │ rollout                                           │ watch (get/list/watch)
                ▼                                                   ▼
┌──────────────────────────────┐                    ┌──────────────────────────────┐
│ Traefik (web:80) publica rotas│                    │ DevOps Console (SSE -> React) │
│  /<app>, /<app>/api │                    │  estado EM TEMPO REAL         │
└──────────────────────────────┘                    │  http://xpto.localhost/devops │
                                                     └──────────────────────────────┘

         Observabilidade: Prometheus (metricas) + Grafana (/grafana) + Loki/Promtail (logs)
         GitOps (opcional): Argo CD (/argocd) reconcilia manifests declarativos
```

- **Fluxo LOCAL (`:local`)**: builda imagens localmente (sem GHCR) e aplica com
  `imagePullPolicy: IfNotPresent`. E o caminho padrao do laboratorio.
- **Fluxo via Actions/GHCR**: build/push no GHCR e deploy pelo **runner self-hosted**
  (necessario para alcancar o cluster local). Requer o runner ativo.

---

## 2. Instalar do zero (bootstrap)

Pre-requisitos atendidos (Docker Desktop + Kubernetes, `kubectl`, `helm`, PowerShell 7,
contexto `docker-desktop`) — veja [`README.md`](../README.md).

### 2.1 Sequencia

**Recomendado — UM comando (idempotente), em PowerShell 7 como Administrador:**

```powershell
pwsh -File C:/devops/scripts/up.ps1
```

O `up.ps1` faz a esteira inteira: pre-requisitos → ferramentas (winget) → `hosts` →
**habilita o Kubernetes** (via [`enable-kubernetes.ps1`](../scripts/enable-kubernetes.ps1),
que chama [`recover-docker.ps1`](../scripts/recover-docker.ps1) se o Docker travar no boot)
→ instala a plataforma → builda os samples → publica a `<app>` → valida.

**Ou por partes:**

```powershell
# 0) Conferir pre-requisitos (idempotente)
pwsh -File C:/devops/scripts/check-prereqs.ps1

# 1) Bootstrap: cria namespaces e instala Traefik, Argo CD e observabilidade
pwsh -File C:/devops/scripts/bootstrap.ps1

# 2) Validar que tudo subiu e esta Ready
pwsh -File C:/devops/scripts/validate-platform.ps1

# 3) Publicar a app de exemplo (imagens :local) + DevOps Console
pwsh -File C:/devops/scripts/publish-app.ps1 -App <app>
```

> O `bootstrap.ps1` orquestra os instaladores individuais
> ([`install-traefik.ps1`](../scripts/install-traefik.ps1),
> [`install-argocd.ps1`](../scripts/install-argocd.ps1),
> [`install-observability.ps1`](../scripts/install-observability.ps1) e o
> [`namespaces.yaml`](../platform/namespaces/namespaces.yaml)). Voce pode roda-los
> individualmente se preferir granularidade.

### 2.2 Resultado esperado

```powershell
kubectl get ns
```

```
NAME                STATUS   AGE
apps                Active   3m
apps-dev            Active   3m
apps-prod-local     Active   3m
argocd              Active   3m
devops-system       Active   3m
observability       Active   3m
traefik             Active   3m
```

```powershell
kubectl get pods -A
```

Esperado: pods de `traefik`, `argocd`, `observability` (Prometheus/Grafana/Loki/Promtail),
`devops-system` (console) e `apps` (<app>) em `Running`/`Ready`.

Acessos (com `xpto.localhost` resolvendo para `127.0.0.1` — veja
[`local-domain-setup.md`](./local-domain-setup.md)):

| Recurso        | URL                                |
|----------------|------------------------------------|
| Console        | <http://xpto.localhost/devops>     |
| Aplicacao 1    | <http://xpto.localhost/<app>> |
| Argo CD        | <http://xpto.localhost/argocd>     |
| Grafana        | <http://xpto.localhost/grafana>    |

> **Idempotencia**: re-rodar `bootstrap.ps1` e seguro — Helm faz `upgrade --install` e os
> `kubectl apply` convergem ao estado desejado, sem duplicar recursos.

---

## 3. Resetar a plataforma (reset-platform)

Use o reset para voltar a um estado limpo (ex.: experimento deu errado). Ha dois niveis.

### 3.1 Reset via script (recomendado)

```powershell
# Remove releases Helm e namespaces da plataforma (NAO desinstala o Docker Desktop).
pwsh -File C:/devops/scripts/reset-platform.ps1
```

O `reset-platform.ps1` (idempotente) executa, em alto nivel:

1. `helm uninstall` das releases (`traefik`, `argocd`, `kube-prometheus-stack`, `loki`,
   `promtail`) em seus namespaces.
2. `kubectl delete namespace` dos namespaces da plataforma (apps, apps-dev,
   apps-prod-local, argocd, observability, traefik, devops-system).
3. Aguarda a remocao (namespaces saem de `Terminating`).

> O reset **nao** apaga imagens locais do Docker. Para limpa-las, use a secao 3.3.

### 3.2 Reset manual (equivalente, passo-a-passo)

```powershell
# Releases Helm (ignore erros se ja nao existirem)
helm uninstall traefik -n traefik
helm uninstall argocd -n argocd
helm uninstall kube-prometheus-stack -n observability
helm uninstall loki -n observability
helm uninstall promtail -n observability

# Namespaces (cascateia a remocao dos recursos dentro deles)
kubectl delete namespace apps apps-dev apps-prod-local argocd observability traefik devops-system --ignore-not-found

# Conferir
kubectl get ns
```

Resultado esperado: os namespaces da plataforma desaparecem; sobram apenas os do sistema
(`default`, `kube-system`, etc.).

### 3.3 Limpar imagens locais (opcional)

```powershell
docker image rm <app>-frontend:local <app>-api:local <app>-worker:local 2>$null
docker image rm console-backend:local console-frontend:local 2>$null
docker image ls | Select-String '<app>|console'
```

### 3.4 Reinstalar apos o reset

```powershell
pwsh -File C:/devops/scripts/bootstrap.ps1
pwsh -File C:/devops/scripts/validate-platform.ps1
pwsh -File C:/devops/scripts/publish-app.ps1 -App <app>
```

---

## 4. Publicar — visao geral

Ha dois caminhos para publicar uma app/servico:

| Caminho                 | Quando usar                                   | Imagem                         | Deploy                              |
|-------------------------|-----------------------------------------------|--------------------------------|-------------------------------------|
| **Local (`:local`)**    | Laboratorio, iteracao rapida.                 | `docker build -t <img>:local`  | `kubectl apply` / `helm upgrade`.   |
| **Via Actions/GHCR**    | Esteira completa, rastreavel por SHA.         | `ghcr.io/flavioneto11/...:<sha>` | runner self-hosted aplica no cluster.|

Os tres servicos (**frontend**, **API**, **worker**) seguem o mesmo padrao de build + apply;
muda apenas a convencao de roteamento (frontend sem strip; API com strip; worker sem
ingress) — veja [`path-routing-pattern.md`](./path-routing-pattern.md).

---

## 5. Publicar FRONTEND

### 5.1 Local (`:local`)

```powershell
# 1) Build da imagem do frontend (com o base path correto no build do Vite).
#    O Dockerfile do frontend deve receber VITE_BASE_PATH como ARG e usa-lo no 'vite build'.
docker build `
  --build-arg VITE_BASE_PATH=/<app>/ `
  -t <app>-frontend:local `
  -f C:/devops/apps/<app>/frontend/Dockerfile `
  C:/devops/apps/<app>/frontend

# 2) Aplicar/atualizar no cluster.
#    a) Se ja existe o Deployment, force recarregar a imagem :local com restart:
kubectl rollout restart deployment/<app>-frontend -n apps
#    b) Ou aplique os manifests (idempotente):
kubectl apply -n apps -f C:/devops/apps/<app>/k8s --recursive

# 3) Acompanhar o rollout
kubectl rollout status deployment/<app>-frontend -n apps --timeout=180s
```

Resultado esperado:

```
deployment "<app>-frontend" successfully rolled out
```

Validar a rota (sem strip, servido sob `/<app>/`):

```powershell
curl.exe -I http://xpto.localhost/<app>
```

```
HTTP/1.1 200 OK
content-type: text/html
```

> Atalho: o [`publish-app.ps1`](../scripts/publish-app.ps1) builda e aplica os
> tres servicos da `<app>` de uma vez. Use `-Rebuild` para forcar build sem cache e
> reiniciar os Deployments.

### 5.2 Via Actions/GHCR

1. Garanta o `devops.yaml` na raiz do repo e os Dockerfiles por servico (veja
   [`project-onboarding-checklist.md`](./project-onboarding-checklist.md)).
2. `git push` na `main` (ou **Run workflow** manual). O pipeline `discover -> build ->
   deploy` builda `ghcr.io/flavioneto11/<app>/frontend:<sha>` e o runner faz o deploy.

```powershell
git add . ; git commit -m "feat: atualiza frontend" ; git push
gh run watch          # acompanha discover/build/deploy em tempo real
```

Resultado esperado: build publica a imagem por SHA; o job de deploy anota o Deployment e
conclui o rollout. Veja os metadados:

```powershell
kubectl get deployment <app>-frontend -n apps -o jsonpath='{.metadata.annotations}'
```

```
{"devops.flavioneto/branch":"main","devops.flavioneto/commit-sha":"<sha>",...}
```

---

## 6. Publicar API

### 6.1 Local (`:local`)

```powershell
# 1) Build da imagem da API.
docker build `
  -t <app>-api:local `
  -f C:/devops/apps/<app>/api/Dockerfile `
  C:/devops/apps/<app>/api

# 2) Recarregar no cluster
kubectl rollout restart deployment/<app>-api -n apps
kubectl rollout status  deployment/<app>-api -n apps --timeout=180s
```

Validar a rota (com StripPrefix: `/<app>/api/health` -> backend ve `/health`):

```powershell
curl.exe http://xpto.localhost/<app>/api/health
```

```
{"status":"ok"}
```

> Se a chamada retornar **HTML** em vez de JSON, a prioridade da rota esta invertida (o
> frontend capturou `/<app>/api`). Garanta `priority` ALTA para `/<app>/api` e
> `stripPrefix: true` — veja [`path-routing-pattern.md`](./path-routing-pattern.md) (sec.5).

### 6.2 Via Actions/GHCR

Mesmo fluxo do frontend: `git push` -> build `ghcr.io/flavioneto11/<app>/api:<sha>` ->
deploy pelo runner. Confirme o health apos o rollout:

```powershell
gh run watch
curl.exe http://xpto.localhost/<app>/api/health   # {"status":"ok"}
```

---

## 7. Publicar WORKER

O worker e um processo de background **sem ingress** (`expose: false`); valida-se por
**probes**/logs, nao por rota.

### 7.1 Local (`:local`)

```powershell
docker build `
  -t <app>-worker:local `
  -f C:/devops/apps/<app>/worker/Dockerfile `
  C:/devops/apps/<app>/worker

kubectl rollout restart deployment/<app>-worker -n apps
kubectl rollout status  deployment/<app>-worker -n apps --timeout=180s
```

### 7.2 Validar o worker (sem rota externa)

```powershell
# Pods do worker
kubectl get pods -n apps -l app.kubernetes.io/name=<app>-worker

# Health interno via port-forward (8081 = porta do health do worker)
kubectl port-forward -n apps deployment/<app>-worker 8081:8081
# Em outro terminal:
curl.exe http://localhost:8081/health      # {"status":"ok"}

# Logs do worker
kubectl logs -n apps -l app.kubernetes.io/name=<app>-worker --tail=50 -f
```

Resultado esperado: pod `Running`/`Ready`; health responde 200; logs mostram o
processamento de background.

### 7.3 Via Actions/GHCR

`git push` -> build `ghcr.io/flavioneto11/<app>/worker:<sha>` -> deploy pelo runner.
Validacao pelos logs/probes (sem rota), como na secao 7.2.

---

## 8. Reverter publicacao (rollback)

Ha tres formas, conforme a app foi publicada. Todas mantem o app no ar durante a reversao.

### 8.1 `kubectl rollout undo` (mais direto)

```powershell
# Ver o historico de revisoes do Deployment
kubectl rollout history deployment/<app>-api -n apps
```

```
deployment.apps/<app>-api
REVISION  CHANGE-CAUSE
1         <none>
2         <none>
3         <none>
```

```powershell
# Voltar para a revisao IMEDIATAMENTE anterior
kubectl rollout undo deployment/<app>-api -n apps

# Ou voltar para uma revisao especifica
kubectl rollout undo deployment/<app>-api -n apps --to-revision=1

# Acompanhar
kubectl rollout status deployment/<app>-api -n apps --timeout=180s
```

Resultado esperado:

```
deployment "<app>-api" successfully rolled out
```

> Dica: para um historico legivel, registre o `CHANGE-CAUSE` ao aplicar
> (`kubectl annotate deployment/<x> kubernetes.io/change-cause="..."`).

### 8.2 `helm rollback` (apps instaladas via Helm chart)

```powershell
# Historico de releases
helm history <app> -n apps
```

```
REVISION  STATUS      CHART            DESCRIPTION
1         superseded  app-template-... Install complete
2         deployed    app-template-... Upgrade complete
```

```powershell
# Reverter para a revisao anterior (ou informe o numero desejado)
helm rollback <app> 1 -n apps
helm status <app> -n apps        # esperado: STATUS: deployed
```

### 8.3 Argo CD (rollback/history) — apps gerenciadas por GitOps

- **Pela UI** (`/argocd`): abra a Application -> **History and Rollback** -> selecione a
  revisao (sync anterior) -> **Rollback**.
- **Pela CLI**:
  ```powershell
  argocd app history <app>
  argocd app rollback <app> <ID_DA_REVISAO>
  ```

> Atencao com **auto-sync**: se a Application estiver com `syncPolicy.automated`, o Argo CD
> pode re-sincronizar para o estado do Git e **desfazer** um rollback manual feito via
> `kubectl`/`helm`. Para reverter de verdade em GitOps, **reverta no Git** (ou desligue o
> auto-sync temporariamente) e deixe o Argo CD reconciliar.

---

## 9. Ver logs

### 9.1 `kubectl logs`

```powershell
# Logs de um Deployment (todos os pods do label), seguindo (-f) as ultimas 100 linhas
kubectl logs -n apps deployment/<app>-api --tail=100 -f

# Por label (util quando ha varias replicas)
kubectl logs -n apps -l app.kubernetes.io/name=<app>-api --tail=100 -f

# Logs do container ANTERIOR (apos um crash/restart)
kubectl logs -n apps deployment/<app>-api --previous

# Eventos do namespace (pulls de imagem, agendamento, OOM, etc.)
kubectl get events -n apps --sort-by=.lastTimestamp
```

Resultado esperado: linhas de log da aplicacao (ex.: `listening on :8080`,
`GET /health 200`).

### 9.2 No DevOps Console

- Acesse <http://xpto.localhost/devops>, aba **Logs** (ou a aba do recurso) e selecione o
  Pod/Deployment. O Console transmite logs em **tempo real via SSE** (somente leitura — o
  RBAC permite `pods/log`). Veja a secao 12.

### 9.3 No Grafana/Loki

- O **Promtail** coleta os logs dos pods; o **Loki** armazena e consulta. No Grafana
  (<http://xpto.localhost/grafana>), use **Explore** com o datasource **Loki** e uma query
  LogQL, por exemplo:
  ```logql
  {namespace="apps", app="<app>-api"}
  ```
  ```logql
  {namespace="apps"} |= "error"
  ```
- Vantagem: logs **historicos** e correlacionados entre pods/namespaces (o `kubectl logs`
  some quando o pod e recriado). Veja a secao 11.

---

## 10. Diagnosticar falhas

### 10.1 Script de diagnostico

```powershell
pwsh -File C:/devops/scripts/diagnose.ps1
```

O `diagnose.ps1` coleta, com cabecalhos de secao: contexto/versoes (`kubectl`, `helm`,
`docker`), `kubectl get nodes`, pods por namespace, eventos recentes, status do Traefik/
IngressRoutes, e testes de rota HTTP. Use a saida para localizar o ponto de falha. (Os
arquivos coletados ficam em `diagnostics/`, ignorado pelo Git — veja
[`SECURITY.md`](../SECURITY.md).)

### 10.2 Diagnostico manual rapido

```powershell
# 1) Contexto correto?
kubectl config current-context                      # esperado: docker-desktop

# 2) Algo fora de Running/Ready?
kubectl get pods -A | Select-String -NotMatch 'Running|Completed'

# 3) Detalhar um pod problematico (eventos no final)
kubectl describe pod -n apps <nome-do-pod>

# 4) Rota nao responde? Verifique IngressRoutes e o Traefik
kubectl get ingressroute -A
kubectl get pods -n traefik
kubectl logs -n traefik deployment/traefik --tail=100

# 5) Imagem nao sobe? (ErrImagePull/ImagePullBackOff)
kubectl get events -n apps --sort-by=.lastTimestamp | Select-String -Pattern 'Pull|Image'
```

### 10.3 Sintomas comuns

| Sintoma                              | Causa provavel                                              | Acao                                                                       |
|--------------------------------------|------------------------------------------------------------|----------------------------------------------------------------------------|
| `ImagePullBackOff` no lab.           | Imagem `:local` nao buildada no daemon do Docker Desktop.   | Builde a imagem localmente (secoes 5-7); `IfNotPresent` exige a imagem.    |
| Rota 404 no Traefik.                 | `Host`/`PathPrefix` nao casam, ou IngressRoute ausente.    | `kubectl get ingressroute -A`; confira `host`/`basePath`/`path`.          |
| API recebe HTML.                     | Prioridade invertida (frontend captura `/api`).            | `priority` ALTA p/ `/<base>/api` + `stripPrefix: true`.                    |
| Pod em `CrashLoopBackOff`.           | Erro no processo / readiness falhando.                     | `kubectl logs --previous`; ajuste o codigo/health.                        |
| Deploy via Actions preso em fila.    | Runner self-hosted offline / labels nao casam.             | Veja [`github-runner-setup.md`](./github-runner-setup.md) (sec.9).        |
| `helm` reclama de release existente. | Release ja instalada.                                       | Use `helm upgrade --install` (idempotente) ou `helm rollback`.            |

---

## 11. Usar o Grafana

- **Acesso**: <http://xpto.localhost/grafana> (servido em subpath via
  `serve_from_sub_path=true` + `root_url=.../grafana` — veja
  [`platform/observability/grafana-values.yaml`](../platform/observability/grafana-values.yaml)).
- **Login (laboratorio)**: usuario `admin`, senha `admin` (`grafana.adminPassword: admin`).
  **Troque em producao** (de preferencia via Secret).
- **Dashboards**: dashboards provisionados por **ConfigMap** com o label `grafana_dashboard`
  aparecem automaticamente (sidecar). O **`cluster-overview`** mostra a visao geral do
  cluster (CPU/memoria/pods).
- **Datasources**:
  - **Prometheus** (criado pelo `kube-prometheus-stack`) — metricas.
  - **Loki** (`http://loki.observability:3100`) — logs.
- **Ver logs no Grafana**: menu **Explore** -> datasource **Loki** -> query LogQL (veja a
  secao 9.3).

Validacao rapida:

```powershell
kubectl get pods -n observability
```

Esperado: pods do Prometheus, Grafana, Loki e Promtail em `Running`. Abra
`/grafana`, faca login com `admin/admin` e confira o dashboard **cluster-overview** e o
datasource **Loki** em **Explore**.

> Recuperar a senha do admin (se alterada via Secret):
> ```powershell
> kubectl get secret -n observability kube-prometheus-stack-grafana `
>   -o jsonpath='{.data.admin-password}' | %{ [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_)) }
> ```

---

## 12. Usar o Argo CD

- **Acesso**: <http://xpto.localhost/argocd> (`argocd server --insecure`, `rootpath
  /argocd`, `basehref /argocd/` — veja
  [`platform/argocd/helm-values.yaml`](../platform/argocd/helm-values.yaml)).
- **Login**:
  - Usuario: `admin`.
  - Senha inicial: armazenada no Secret `argocd-initial-admin-secret`:
    ```powershell
    kubectl get secret argocd-initial-admin-secret -n argocd `
      -o jsonpath='{.data.password}' | %{ [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_)) }
    ```
    Saida esperada: a senha inicial (string aleatoria). Troque-a apos o primeiro login.
- **Login via CLI** (opcional):
  ```powershell
  argocd login xpto.localhost --grpc-web --insecure --username admin --password <SENHA>
  ```
  > `--grpc-web` e util porque o Argo CD esta atras do Traefik em subpath/HTTP.

### 12.1 Sync manual vs automatico

- **Manual** (recomendado para comecar): na UI, abra a Application -> **Sync** -> **Synchronize**.
  Pela CLI:
  ```powershell
  argocd app sync <app>
  argocd app get  <app>     # mostra Health e Sync status
  ```
  Resultado esperado: `Sync Status: Synced` e `Health Status: Healthy`.
- **Automatico** (auto-sync): definido **por Application** em `spec.syncPolicy.automated`
  (`prune` + `selfHeal`). Para ativar, descomente o bloco na Application e reaplique — veja
  o cabecalho do [`helm-values.yaml`](../platform/argocd/helm-values.yaml). Comece em manual
  e so ative o automated quando confiar no laboratorio.

### 12.2 App-of-apps

O padrao **app-of-apps** usa uma Application "raiz" que aponta para um diretorio com **outras
Applications** (a plataforma e as apps). O Argo CD sincroniza a raiz, que por sua vez cria/
gerencia as filhas. Assim um unico `sync` reconcilia toda a plataforma de forma declarativa.

### 12.3 Rollback (resumo)

Veja a secao 8.3: **History and Rollback** na UI, ou `argocd app history` + `argocd app
rollback`. Em auto-sync, prefira **reverter no Git**.

---

## 13. Usar o DevOps Console

- **Acesso**: <http://xpto.localhost/devops> (frontend React, base `/devops/`; backend em
  `/devops/api` com StripPrefix).
- **O que e**: painel **somente leitura** do cluster, com atualizacao em **tempo real via
  SSE**. Backend Node.js (Express + `@kubernetes/client-node`) no namespace `devops-system`,
  com RBAC `get`/`list`/`watch` (sem `create`/`update`/`delete`) — veja
  [`console/k8s/rbac.yaml`](../console/k8s/rbac.yaml).
- **Abas/visoes tipicas**:
  - **Overview**: namespaces gerenciados e saude geral.
  - **Deployments**: replicas, status de rollout e as **anotacoes de rastreabilidade**
    (`devops.flavioneto/commit-sha`, `branch`, `deployed-at`, `run-id`).
  - **Pods**: estado dos pods e restarts.
  - **Logs**: stream de logs por Pod/Deployment (SSE, tempo real).
  - **Rotas/Ingress**: como cada app esta exposta (IngressRoute/Middleware) no host unico.
  - **Health**: resultado dos health checks (`health.path` do `devops.yaml`).
  - **Links rapidos**: Argo CD, Grafana e Traefik (vindos do
    [`ConfigMap`](../console/k8s/configmap.yaml): `ARGOCD_URL`, `GRAFANA_URL`,
    `TRAEFIK_URL`).
- **Tempo real**: como o backend usa `watch`, mudancas no cluster (novo deploy, pod
  reiniciando, rollout) aparecem na UI **sem recarregar a pagina**.

Validacao rapida:

```powershell
kubectl get pods -n devops-system
curl.exe -I http://xpto.localhost/devops
# Healthcheck da API do Console (StripPrefix /devops/api -> backend ve /health)
curl.exe http://xpto.localhost/devops/api/health
```

Esperado: pods do console `Running`; `/devops` retorna 200; `/devops/api/health` retorna um
JSON de status. Abra a UI e confirme que um `kubectl rollout restart` em alguma app aparece
em tempo real na aba **Deployments/Pods**.

---

## 14. Resumo de comandos (cola rapida)

```powershell
# Instalar / validar / publicar
pwsh -File C:/devops/scripts/bootstrap.ps1
pwsh -File C:/devops/scripts/validate-platform.ps1
pwsh -File C:/devops/scripts/publish-app.ps1 -App <app>

# Resetar
pwsh -File C:/devops/scripts/reset-platform.ps1

# Publicar local (exemplo API)
docker build -t <app>-api:local -f C:/devops/apps/<app>/api/Dockerfile C:/devops/apps/<app>/api
kubectl rollout restart deployment/<app>-api -n apps
kubectl rollout status  deployment/<app>-api -n apps --timeout=180s

# Reverter
kubectl rollout undo deployment/<app>-api -n apps
helm rollback <app> <rev> -n apps
argocd app rollback <app> <id>

# Logs / diagnostico
kubectl logs -n apps deployment/<app>-api --tail=100 -f
pwsh -File C:/devops/scripts/diagnose.ps1

# Senhas
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath='{.data.password}' | %{ [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_)) }
```

---

## 15. Referencias

- [`README.md`](../README.md) — Quick Start, pre-requisitos, URLs.
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — componentes, fluxo, namespaces, portas.
- [`path-routing-pattern.md`](./path-routing-pattern.md) — roteamento/strip/prioridade.
- [`new-project-contract.md`](./new-project-contract.md) — `devops.yaml`.
- [`github-runner-setup.md`](./github-runner-setup.md) — runner self-hosted.
- [`local-domain-setup.md`](./local-domain-setup.md) — dominio local/real, HTTPS, tuneis.
- [`project-onboarding-checklist.md`](./project-onboarding-checklist.md) — adicionar nova app.
- [`SECURITY.md`](../SECURITY.md) — segredos, PAT, RBAC, HTTPS.

> Nota: todos os scripts existem em [`scripts/`](../scripts). Subida do zero:
> **`up.ps1`** (UM comando — faz tudo). Orquestradores/auxiliares: `bootstrap.ps1`,
> `enable-kubernetes.ps1`, `recover-docker.ps1`, `install-platform.ps1` + `install-*.ps1`,
> `publish-app.ps1`, `new-app.ps1` (gera app novo + Application
> do Argo), `validate-platform.ps1`, `reset-platform.ps1`, `diagnose.ps1`,
> `check-prereqs.ps1`, `install-tools.ps1`. Caminhos e namespaces seguem o contrato compartilhado.
