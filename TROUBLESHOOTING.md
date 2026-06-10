---
title: "Troubleshooting (Resolucao de Problemas)"
status: reference
applies_to: [platform]
updated: 2026-06-09
language: pt-BR
---

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

### 13.6 `docker desktop restart` trava em "stopping" (e o flag AutoStart)

Nesta máquina o `docker desktop restart` (CLI) pode falhar ao parar o Docker
(`context deadline exceeded`, processos seguem rodando) e deixá-lo preso em **"stopping"**
→ engine `500`, k8s com `TLS handshake timeout`, apps fora. **Recuperação**:

```powershell
.\scripts\recover-docker.ps1   # mata processos, wsl --shutdown, renomeia sockets orfaos, relanca
# aguarde o engine + k8s; os pods (Deployments) se recriam sozinhos em ~1-2 min
kubectl get pods -A
```

Editar `settings-store.json` (ex.: ligar `"AutoStart": true`) com o Docker **rodando** não
adianta — o Docker reescreve o arquivo e reverte. Para ligar o autostart, use o **toggle da
GUI** ("Start Docker Desktop when you log in") ou edite com o Docker **parado**. O
start-on-login básico já vem da chave Run do Windows (`HKCU\...\Run\Docker Desktop`).

---

## 14. SPA (Vite/React) em branco sob subpath: MIME dos assets + cache Cloudflare

Sintoma: uma SPA servida num subpath (ex.: o **DevOps Console** em `/devops/`) responde
`200` e o HTML carrega, mas a **pagina fica em branco** no navegador. Apps de frontend
estaticos (so `index.html`, como aplicacao1/2/3) NAO sao afetados — o problema aparece
quando ha bundles separados (`/assets/*.js`, `*.css`).

### 14.1 Causa raiz no nginx: `alias` com captura de regex serve `octet-stream`

Um `location` por **regex** que usa `alias` com a variavel de captura faz o nginx perder
o tipo por extensao e cair no `default_type` (`application/octet-stream`). Com
`<script type="module">` + o header `X-Content-Type-Options: nosniff` (do middleware
`secure-headers`), o navegador **recusa executar** o modulo e a SPA nao monta → tela branca.

```nginx
# ERRADO - alias com captura $1 de regex -> mime vira application/octet-stream
location ~* ^/devops/(assets/.*\.(?:js|css))$ {
    alias /usr/share/nginx/html/$1;
}

# CERTO - prefixo + alias ESTATICO (sem variavel) -> mime.types aplicado (js/css corretos)
location /devops/assets/ {
    alias /usr/share/nginx/html/assets/;
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

Diagnostico (compare o `content-type` no ORIGIN vs no publico):

```powershell
# ORIGIN (Traefik -> nginx direto): tem que ser application/javascript / text/css
curl.exe -s -o NUL -w "%{content_type}`n" -H "Host: dev.nvit.com.br" http://127.0.0.1/devops/assets/<arquivo>.js
# PUBLICO
curl.exe -s -o NUL -w "%{content_type}`n" https://dev.nvit.com.br/devops/assets/<arquivo>.js
```

### 14.2 A Cloudflare cacheia o `octet-stream` antigo (immutable/1y)

Mesmo depois de corrigir o nginx, o publico pode continuar `octet-stream`: a borda da
Cloudflare cacheia `.js`/`.css` por extensao e, como os assets vinham com
`Cache-Control: public, immutable, max-age=31536000`, a resposta ERRADA fica presa por 1 ano.
Confirme pelos headers:

```powershell
curl.exe -sI https://dev.nvit.com.br/devops/assets/<arquivo>.js | Select-String 'content-type|cf-cache-status|cache-control'
# cf-cache-status: HIT + content-type: application/octet-stream = cache velho
# Teste com cache-buster (ignora a borda): deve voltar application/javascript
curl.exe -s -o NUL -w "%{content_type}`n" "https://dev.nvit.com.br/devops/assets/<arquivo>.js?v=1"
```

Solucoes (qualquer uma):
- **Purgar o cache** no painel Cloudflare → *Caching → Purge Everything* (ou por URL). O HTML
  (`text/html`) e `DYNAMIC` (nao cacheado), entao basta invalidar os assets.
- **Mudar o nome dos assets** (self-contained, sem painel): no `vite.config.js`, ajuste o
  padrao de saida para gerar URLs novas (cache MISS), ex. separador `.`:
  ```js
  build: { rollupOptions: { output: {
    entryFileNames: 'assets/[name].[hash].js',
    chunkFileNames: 'assets/[name].[hash].js',
    assetFileNames: 'assets/[name].[hash][extname]',
  } } }
  ```

> Atencao: o token dentro de `~/.cloudflared/cert.pem` (gerado pelo `cloudflared tunnel login`)
> **nao** e um API Token Bearer valido para o endpoint `purge_cache` (retorna 401 / code 10000).
> Para purgar via API e preciso um API Token com permissao *Zone → Cache Purge*.

---

## 15. Keycloak (SSO) e cofre de segredos (Sealed Secrets)

Detalhes completos em `docs/sso-keycloak.md`. Gotchas mais comuns:

### 15.1 Keycloak sob subpath `/auth`: issuer/probes errados

- **Probes 404 em `:9000/health/ready`**: com `KC_HTTP_RELATIVE_PATH=/auth`, o health da
  interface de management TAMBEM vai para `/auth` → use **`/auth/health/ready`** e
  **`/auth/health/live`** (porta `management` 9000), nao `/health/...`.
- **Issuer sem `/auth`** (`.../realms/x` em vez de `.../auth/realms/x`): defina
  **`KC_HOSTNAME=https://dev.nvit.com.br/auth`** (com o path), junto de
  `KC_HTTP_RELATIVE_PATH=/auth`. Confira em
  `.../auth/realms/<realm>/.well-known/openid-configuration` (`issuer`).
- **URLs http atras do proxy**: `KC_PROXY_HEADERS=xforwarded` + `KC_HTTP_ENABLED=true`
  + `KC_HOSTNAME` com `https://` no inicio.

### 15.2 `helm upgrade` falha: conflito de field-manager em Secret (SSA)

Sintoma: `UPGRADE FAILED: conflict ... Kind=Secret ... conflict with "kubectl-patch" using v1: .data.admin-password`.
Causa: o Secret teve um campo alterado por `kubectl patch`/`apply` e o Server-Side Apply
do Helm se recusa a sobrescrever um campo de outro field-manager. Resetar os
`managedFields` nem sempre resolve. **Solucao que funciona**: deletar o Secret e re-rodar
o upgrade (o chart o recria, agora dono dele):

```powershell
kubectl -n <ns> delete secret <nome-do-secret>
helm upgrade --install <release> <chart> -n <ns> --version <v> -f <values>   # recria limpo
```
(Pods em execucao nao sao afetados pela delecao; o upgrade recria o Secret e faz o rollout.)

### 15.3 Sealed Secrets nao "adota" um Secret existente

O controller nao sobrescreve um Secret criado a mao (protecao). Anote-o com
`sealedsecrets.bitnami.com/managed=true` e reinicie o controller
(`kubectl -n kube-system rollout restart deploy/sealed-secrets-controller`) → ele assume
a posse (ownerReference → SealedSecret).

---

## Ainda com problemas?

Colete um diagnostico completo e revise os logs indicados:

```powershell
.\scripts\diagnose.ps1
kubectl get pods -A
kubectl get events -A --sort-by=.lastTimestamp
```
