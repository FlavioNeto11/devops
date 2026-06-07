# Troubleshooting (Resolucao de Problemas)

Problemas comuns da plataforma com os **comandos exatos** de correcao. Execute em
**PowerShell 7**. Para um diagnostico automatico do ambiente, rode primeiro:

```powershell
cd C:/devops
.\scripts\diagnose.ps1
```

> Visao geral em [`README.md`](./README.md) · Arquitetura em
> [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 1. Docker Desktop nao esta rodando

Sintoma: `docker` falha com "cannot connect to the Docker daemon" ou similar.

```powershell
# Verificar
docker info

# Iniciar o Docker Desktop (ajuste o caminho se necessario)
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Aguardar e revalidar
docker version
```

Aguarde o icone do Docker Desktop ficar "Running" antes de prosseguir.

---

## 2. Kubernetes nao habilitado no Docker Desktop

Sintoma: `kubectl` nao encontra o cluster, ou nao existe o contexto `docker-desktop`.

```powershell
# Verificar contextos disponiveis
kubectl config get-contexts

# Verificar se o cluster responde
kubectl cluster-info
```

Se nao houver o cluster: abra **Docker Desktop → Settings → Kubernetes →** marque
***Enable Kubernetes*** → **Apply & Restart**. Aguarde o Kubernetes ficar "Running" e
repita `kubectl cluster-info`.

---

## 3. Contexto kube errado

Sintoma: comandos `kubectl` atingem outro cluster (ex.: minikube, nuvem).

```powershell
# Ver o contexto atual
kubectl config current-context

# Selecionar o contexto correto
kubectl config use-context docker-desktop

# Confirmar
kubectl config current-context   # deve imprimir: docker-desktop
```

---

## 4. Pod do Traefik nao fica Ready

Sintoma: rotas nao respondem; pod do Traefik em `Pending`/`CrashLoopBackOff`.

```powershell
# Estado dos pods do Traefik
kubectl get pods -n traefik -o wide

# Detalhes e eventos do pod
kubectl describe pod -n traefik -l app.kubernetes.io/name=traefik

# Logs do controlador
kubectl logs -n traefik -l app.kubernetes.io/name=traefik --tail=100

# Reaplicar a instalacao da plataforma (idempotente)
.\scripts\bootstrap.ps1
```

Causa comum: portas 80/443 em uso (ver item 11) ou CRDs ausentes.

---

## 5. `xpto.localhost` nao resolve / arquivo hosts

Sintoma: o navegador nao abre `http://xpto.localhost/...`.

Na maioria dos sistemas, `*.localhost` resolve para `127.0.0.1` automaticamente. Se nao
resolver, adicione ao arquivo `hosts` (execute o PowerShell **como Administrador**):

```powershell
# Caminho do arquivo hosts no Windows
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"

# Ver entradas existentes para xpto
Select-String -Path $hosts -Pattern "xpto.localhost"

# Adicionar a entrada (apenas se ainda nao existir)
if (-not (Select-String -Path $hosts -Pattern "xpto.localhost" -Quiet)) {
    Add-Content -Path $hosts -Value "127.0.0.1`txpto.localhost"
}

# Validar resolucao
Resolve-DnsName xpto.localhost
```

Depois, teste no navegador ou via `curl`:

```powershell
curl.exe -v http://xpto.localhost/devops
```

---

## 6. 404 ou rota errada (prioridade / strip)

Sintoma: `/aplicacao1/api/health` retorna 404, ou cai no frontend em vez da API.

Causa tipica: a rota `/aplicacao1` (frontend) esta vencendo `/aplicacao1/api` por falta
de `priority`, ou o `Middleware` StripPrefix nao esta aplicado.

```powershell
# Listar as IngressRoutes e conferir priority
kubectl get ingressroute -A

# Detalhar a rota da aplicacao1 (regras, priority, middlewares)
kubectl describe ingressroute -n apps

# Conferir os Middlewares de StripPrefix
kubectl get middleware -A
kubectl describe middleware -n apps
```

Lembre da convencao (ver [`ARCHITECTURE.md`](./ARCHITECTURE.md)):
- Frontend: `stripPrefix=false`, `priority` **menor**.
- API: `stripPrefix=true`, `priority` **maior** (para `/<base>/api` vencer `/<base>`).

Reaplicar a aplicacao apos ajustes:

```powershell
.\scripts\publish-sample-app.ps1
```

---

## 7. Falha no login do GHCR

Sintoma: `docker login ghcr.io` retorna "unauthorized" ou "denied".

```powershell
# Use um PAT com escopos write:packages e read:packages (ver SECURITY.md)
$env:CR_PAT = "<SEU_PAT_AQUI>"
$env:CR_PAT | docker login ghcr.io -u flavioneto11 --password-stdin
Remove-Item Env:CR_PAT
```

Verifique: usuario em **minusculo** (`flavioneto11`), PAT nao expirado e com os escopos
corretos. No laboratorio com imagens `:local`, o login no GHCR nao e necessario.

---

## 8. Runner offline

Sintoma: o workflow do GitHub Actions fica em "Queued" porque o runner self-hosted esta
offline.

```powershell
# Verificar o servico do runner (o nome costuma comecar com "actions.runner")
Get-Service | Where-Object { $_.Name -like "actions.runner*" }

# Iniciar o servico do runner
Get-Service | Where-Object { $_.Name -like "actions.runner*" } | Start-Service

# Conferir status
Get-Service | Where-Object { $_.Name -like "actions.runner*" } | Select-Object Name, Status
```

Confirme tambem em **GitHub → repo → Settings → Actions → Runners** se o runner aparece
como "Idle". Se o token de registro expirou, gere um novo e re-registre (ver
[`SECURITY.md`](./SECURITY.md)).

---

## 9. Senha inicial do Argo CD

Sintoma: nao consegue logar no Argo CD em `/argocd`.

```powershell
# Usuario padrao: admin
# A senha inicial fica no Secret argocd-initial-admin-secret (base64)
$enc = kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}"
[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($enc))
```

Acesse <http://xpto.localhost/argocd> com `admin` e a senha exibida. Troque a senha apos
o primeiro login.

---

## 10. Sub-path do Grafana

Sintoma: Grafana abre quebrado (CSS/assets 404) em `/grafana`.

O Grafana precisa saber que roda sob um subpath. Confirme a configuracao
(`serve_from_sub_path=true` e `root_url=.../grafana`):

```powershell
# Inspecionar variaveis de ambiente do pod do Grafana
kubectl get pods -n observability -l app.kubernetes.io/name=grafana
kubectl describe pod -n observability -l app.kubernetes.io/name=grafana

# Reaplicar a plataforma para reconciliar a config (idempotente)
.\scripts\bootstrap.ps1
```

Esperado (equivalente):
```
GF_SERVER_ROOT_URL=http://xpto.localhost/grafana
GF_SERVER_SERVE_FROM_SUB_PATH=true
```

---

## 11. Porta 80/443 ja em uso

Sintoma: Traefik nao sobe / nao atende; outro processo ocupa 80 ou 443 (ex.: IIS,
World Wide Web Publishing Service).

```powershell
# Descobrir quem usa as portas 80 e 443
Get-NetTCPConnection -LocalPort 80,443 -State Listen |
    Select-Object LocalAddress, LocalPort, OwningProcess

# Mapear o PID para o processo
Get-NetTCPConnection -LocalPort 80 -State Listen |
    ForEach-Object { Get-Process -Id $_.OwningProcess }

# Caso seja o IIS, parar/desabilitar o servico (como Administrador)
Stop-Service -Name W3SVC -ErrorAction SilentlyContinue
Set-Service  -Name W3SVC -StartupType Disabled
```

Libere as portas e reinicie o Docker Desktop / reaplique o `bootstrap.ps1`.

---

## 12. Imagem nao encontrada (IfNotPresent + build local)

Sintoma: pod em `ErrImagePull`/`ImagePullBackOff` para imagens `:local`.

Imagens locais (`aplicacao1-*:local`, `console-*:local`) usam
`imagePullPolicy: IfNotPresent` e **nao** existem no registry — precisam estar buildadas
no daemon Docker local.

```powershell
# Conferir se a imagem existe localmente
docker images | Select-String "aplicacao1|console"

# (Re)buildar e reaplicar a aplicacao de exemplo (idempotente)
.\scripts\publish-sample-app.ps1

# Inspecionar o motivo do erro no pod
kubectl describe pod -n apps -l app=aplicacao1
```

Como o Kubernetes do Docker Desktop compartilha o **mesmo** daemon, basta a imagem
existir no `docker images` local — nao ha push para registry no fluxo `:local`.

---

## 13. Docker Desktop / WSL2: crash no boot, habilitar k8s, node-exporter, Argo CD subpath

Armadilhas reais encontradas ao subir a plataforma neste host (Windows Server + WSL2).

### 13.1 Habilitar o Kubernetes sem a GUI

**Atalho:** `C:\devops\scripts\enable-kubernetes.ps1` automatiza isto (idempotente; chama
`recover-docker.ps1` se o engine travar). Manualmente: o CLI `docker desktop` (v0.2.x)
**nao** tem toggle de Kubernetes — habilite via arquivo de settings e reinicie:

```powershell
$f = "$env:APPDATA\Docker\settings-store.json"
Copy-Item $f "$f.bak" -Force
$j = Get-Content $f -Raw | ConvertFrom-Json
$j | Add-Member -NotePropertyName KubernetesEnabled -NotePropertyValue $true -Force
$j | ConvertTo-Json -Depth 10 | Set-Content $f -Encoding utf8
docker desktop restart
# Aguarde (1a vez leva alguns minutos):
kubectl get nodes        # docker-desktop deve ficar Ready
```

(Equivale a Docker Desktop -> Settings -> Kubernetes -> *Enable Kubernetes* -> Apply.)

### 13.2 Docker Desktop crasha no boot apos um force-kill ("An unexpected error occurred")

Sintoma: ao iniciar, aparece *"Docker Desktop encountered an unexpected error"* citando
`...\Docker\run\dockerInference` ou `...\docker-secrets-engine\engine.sock`
(*"The file cannot be accessed by the system"*). Causa: um encerramento forcado deixou
sockets AF_UNIX orfaos que o Docker nao consegue remover no boot.

**Nao** clique em *"Reset to factory defaults"* (apaga imagens/containers/config).

**Atalho:** `C:\devops\scripts\recover-docker.ps1` automatiza toda a recuperacao abaixo. Manualmente:

```powershell
# 1) Parar tudo
Get-Process -Name "Docker Desktop","com.docker.backend","com.docker.build" -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
Stop-Service com.docker.service -Force -EA SilentlyContinue
wsl --shutdown

# 2) Tirar as pastas de socket do caminho (nao da para deletar; renomeie)
$ts = Get-Date -Format yyyyMMdd-HHmmss
Get-ChildItem -Force $env:LOCALAPPDATA -Directory | Where-Object { $_.Name -like 'docker-*' } |
    ForEach-Object { Rename-Item $_.FullName "$($_.Name).broken-$ts" }
if (Test-Path "$env:LOCALAPPDATA\Docker\run") { Rename-Item "$env:LOCALAPPDATA\Docker\run" "run.broken-$ts" }

# 3) Desativar o Docker AI (Inference manager costuma falhar nesse cenario)
$f = "$env:APPDATA\Docker\settings-store.json"; $j = Get-Content $f -Raw | ConvertFrom-Json
$j | Add-Member EnableDockerAI $false -Force
$j | ConvertTo-Json -Depth 10 | Set-Content $f -Encoding utf8

# 4) Subir limpo
Start-Service com.docker.service
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

### 13.3 node-exporter em CrashLoopBackOff (kube-prometheus-stack)

Sintoma: `prometheus-node-exporter` em `CrashLoopBackOff` com
`path / is mounted on / but it is not a shared or slave mount`. Causa: o mount do rootfs
do host nao funciona no backend WSL2. Fix (ja aplicado em
`platform/observability/prometheus-values.yaml`):

```yaml
prometheus-node-exporter:
  hostRootFsMount:
    enabled: false
```

Reinstale a observabilidade apos o ajuste:

```powershell
helm uninstall kube-prometheus-stack -n observability
.\scripts\install-observability.ps1
```

### 13.4 Argo CD em `/argocd` abre em branco (assets 404)

Sintoma: `/argocd` responde 200, mas a UI nao renderiza; o HTML traz `<base href="/">`
mesmo com `server.rootpath`/`server.basehref` corretos no configmap/env (quirk do Argo CD
atras de subpath). Use o **port-forward** (confiavel):

```powershell
kubectl port-forward svc/argocd-server -n argocd 8080:80
# Acesse http://localhost:8080
```

### 13.5 Append no arquivo hosts "gruda" na ultima linha

Se o `hosts` nao terminar com quebra de linha, um `Add-Content` cola a nova entrada na
ultima linha existente (corrompe ambas). Garanta o newline antes:

```powershell
$h = "$env:SystemRoot\System32\drivers\etc\hosts"
if ((Get-Content $h -Raw) -notmatch "`n$") { Add-Content $h "" }
Add-Content $h "127.0.0.1`txpto.localhost"
```

---

## Ainda com problemas?

Colete um diagnostico completo e revise os logs indicados:

```powershell
.\scripts\diagnose.ps1
kubectl get pods -A
kubectl get events -A --sort-by=.lastTimestamp
```
