#requires -Version 7.0
<#
.SYNOPSIS
  Gera o scaffold de um app novo ja no padrao da plataforma DevOps local (C:\devops).
.DESCRIPTION
  Cria, a partir do nome e da lista de servicos, a estrutura pronta para a esteira:
    <OutDir>\<Name>\
      devops.yaml                      (contrato canonico)
      <svc>\Dockerfile (+ fonte)       (frontend nginx | api/api2/worker node)
      k8s\<Name>.yaml                  (Deployments+Services+Middlewares+IngressRoute)
      .github\workflows\ci-cd.yaml     (usa os reusable centrais)
      README.md
  Convencoes aplicadas automaticamente:
    - frontend: stripPrefix=false (servido no subpath), priority menor.
    - api/api2/worker: stripPrefix=true; priority = 20 + tamanho do prefixo
      (garante que /<base>/api2 vença /<base>/api).
    - imagens locais <Name>-<svc>:local (imagePullPolicy IfNotPresent).
.EXAMPLE
  .\scripts\new-app.ps1 -Name aplicacao3 -Services frontend,api,api2,worker
.EXAMPLE
  .\scripts\new-app.ps1 -Name billing -BasePath /billing -Services frontend,api -Force
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$BasePath,
  [string[]]$Services = @('frontend', 'api', 'worker'),
  # Taxonomia da app (docs/new-project-contract.md): cms_portal = portal/site
  # gerenciado pelo CMS do Console; product_software = produto/sistema completo;
  # platform_tool = ferramenta interna da plataforma.
  [ValidateSet('product_software', 'cms_portal', 'platform_tool')]
  [string]$Type = 'product_software',
  [string]$Namespace = 'apps',
  [string]$AppHost = 'xpto.localhost',
  [string]$OutDir = 'C:\devops\apps',
  [string]$ArgoAppsDir = 'C:\devops\platform\argocd\apps',
  [switch]$NoArgo,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$bt = '`'   # backtick literal para os matches do Traefik

if (-not $BasePath) { $BasePath = "/$Name" }
if ($BasePath -notmatch '^/') { $BasePath = "/$BasePath" }
$root = Join-Path $OutDir $Name

function Get-Type([string]$s) { if ($s -match '^frontend') { 'frontend' } elseif ($s -match '^api2') { 'api2' } elseif ($s -match '^api') { 'api' } elseif ($s -match '^worker') { 'worker' } else { 'api' } }
function Get-Port([string]$s) { switch (Get-Type $s) { 'frontend' { 80 } 'worker' { 8081 } default { 8080 } } }
function Get-SvcPath([string]$s) { switch (Get-Type $s) { 'frontend' { '/' } 'api' { '/api' } 'api2' { '/api2' } 'worker' { '/worker' } default { "/$s" } } }
function Get-Expose([string]$s) { (Get-Type $s) -ne 'worker' }
function Get-Strip([string]$s) { (Get-Type $s) -ne 'frontend' }
function Expand([string]$t, [string]$svc) {
  $t -replace '@@APP@@', $Name -replace '@@BASE@@', $BasePath -replace '@@SVC@@', $svc -replace '@@PORT@@', (Get-Port $svc) -replace '@@NS@@', $Namespace -replace '@@HOST@@', $AppHost
}

if ((Test-Path $root) -and -not $Force) { throw "Pasta '$root' ja existe. Use -Force para sobrescrever." }
New-Item -ItemType Directory -Force -Path $root, (Join-Path $root 'k8s'), (Join-Path $root '.github\workflows') | Out-Null

Write-Host "== Gerando app '$Name' (basePath $BasePath, ns $Namespace) com servicos: $($Services -join ', ') =="

# ---------------------------------------------------------------- templates (literais)
$tplFrontDockerfile = @'
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
'@
$tplNginx = @'
server {
  listen 80;
  location = /healthz { return 200 'ok'; add_header Content-Type text/plain; }
  location = @@BASE@@ { return 301 @@BASE@@/; }
  location @@BASE@@/ {
    alias /usr/share/nginx/html/;
    index index.html;
    try_files $uri $uri/ @@BASE@@/index.html;
  }
}
'@
$tplIndex = @'
<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8" /><title>@@APP@@</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem}.c{background:#1e293b;border-radius:12px;padding:1.5rem 2rem;max-width:760px;margin:auto}code{background:#334155;padding:.15rem .4rem;border-radius:6px}a{color:#7dd3fc}</style></head>
<body><div class="c"><h1>@@APP@@ publicada via DevOps local</h1>
<p>Frontend servido sob <code>@@BASE@@</code>. APIs roteadas por path nesta mesma base.</p></div></body></html>
'@
$tplApiServer = @'
const express = require("express");
const app = express();
const PORT = process.env.PORT || @@PORT@@;
// Traefik faz StripPrefix do prefixo completo; as rotas ficam na raiz.
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/version", (req, res) => res.json({ app: "@@APP@@", service: "@@SVC@@", version: process.env.APP_VERSION || "local", commit: process.env.COMMIT_SHA || "local" }));
app.get("/hello", (req, res) => res.json({ message: "Ola de @@APP@@/@@SVC@@" }));
app.listen(PORT, () => console.log("[@@APP@@-@@SVC@@] porta " + PORT));
'@
$tplApiPkg = @'
{
  "name": "@@APP@@-@@SVC@@",
  "version": "1.0.0",
  "private": true,
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": { "express": "^4.19.2" }
}
'@
$tplApiDockerfile = @'
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY server.js ./
USER node
ENV PORT=@@PORT@@
EXPOSE @@PORT@@
CMD ["node", "server.js"]
'@
$tplWorker = @'
const http = require("http");
const PORT = process.env.PORT || @@PORT@@;
setInterval(() => console.log("[@@APP@@-@@SVC@@] tick " + new Date().toISOString()), 5000);
http.createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ status: "ok" })); }
  else { res.writeHead(404); res.end(); }
}).listen(PORT, () => console.log("[@@APP@@-@@SVC@@] health na porta " + PORT));
'@
$tplWorkerPkg = @'
{
  "name": "@@APP@@-@@SVC@@",
  "version": "1.0.0",
  "private": true,
  "main": "worker.js",
  "scripts": { "start": "node worker.js" }
}
'@
$tplWorkerDockerfile = @'
FROM node:20-alpine
WORKDIR /app
COPY worker.js ./
COPY package.json ./
USER node
ENV PORT=@@PORT@@
EXPOSE @@PORT@@
CMD ["node", "worker.js"]
'@
$tplWf = @'
name: ci-cd-@@APP@@
on:
  push:
    branches: [ main ]
  workflow_dispatch: {}
jobs:
  build:
    strategy:
      matrix:
        service: [ @@MATRIX@@ ]
    uses: FlavioNeto11/devops/.github/workflows/reusable-build-push.yaml@main
    with:
      app: @@APP@@
      service: ${{ matrix.service }}
      context: ./${{ matrix.service }}
    secrets: inherit
  deploy:
    needs: build
    uses: FlavioNeto11/devops/.github/workflows/reusable-deploy-k8s.yaml@main
    with:
      app: @@APP@@
      namespace: @@NS@@
      manifestsPath: ./k8s
    secrets: inherit
'@

# ---------------------------------------------------------------- fonte por servico
foreach ($svc in $Services) {
  $t = Get-Type $svc
  $dir = Join-Path $root $svc
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  switch ($t) {
    'frontend' {
      Set-Content (Join-Path $dir 'Dockerfile') (Expand $tplFrontDockerfile $svc) -Encoding utf8
      Set-Content (Join-Path $dir 'nginx.conf')  (Expand $tplNginx $svc)          -Encoding utf8
      Set-Content (Join-Path $dir 'index.html')  (Expand $tplIndex $svc)          -Encoding utf8
    }
    'worker' {
      Set-Content (Join-Path $dir 'worker.js')    (Expand $tplWorker $svc)         -Encoding utf8
      Set-Content (Join-Path $dir 'package.json') (Expand $tplWorkerPkg $svc)      -Encoding utf8
      Set-Content (Join-Path $dir 'Dockerfile')   (Expand $tplWorkerDockerfile $svc) -Encoding utf8
    }
    default {
      Set-Content (Join-Path $dir 'server.js')    (Expand $tplApiServer $svc)      -Encoding utf8
      Set-Content (Join-Path $dir 'package.json') (Expand $tplApiPkg $svc)         -Encoding utf8
      Set-Content (Join-Path $dir 'Dockerfile')   (Expand $tplApiDockerfile $svc)  -Encoding utf8
    }
  }
  Write-Host "  -> servico '$svc' ($t) gerado"
}

# ---------------------------------------------------------------- devops.yaml
$d = [System.Text.StringBuilder]::new()
[void]$d.AppendLine("# Contrato gerado por new-app.ps1 (ver ~/.claude/CLAUDE.md e docs/new-project-contract.md)")
[void]$d.AppendLine("app:")
[void]$d.AppendLine("  name: $Name")
[void]$d.AppendLine("  namespace: $Namespace")
[void]$d.AppendLine("  host: $AppHost")
[void]$d.AppendLine("  basePath: $BasePath")
[void]$d.AppendLine("  appType: $Type")
[void]$d.AppendLine("services:")
foreach ($svc in $Services) {
  $t = Get-Type $svc
  [void]$d.AppendLine("  ${svc}:")
  [void]$d.AppendLine("    type: $t")
  [void]$d.AppendLine("    path: $(Get-SvcPath $svc)")
  [void]$d.AppendLine("    image: ghcr.io/flavioneto11/$Name/$svc")
  [void]$d.AppendLine("    port: $(Get-Port $svc)")
  [void]$d.AppendLine("    expose: $((Get-Expose $svc).ToString().ToLower())")
  [void]$d.AppendLine("    stripPrefix: $((Get-Strip $svc).ToString().ToLower())")
  if ($t -ne 'frontend') { [void]$d.AppendLine("    health: { path: /health }") }
}
Set-Content (Join-Path $root 'devops.yaml') $d.ToString() -Encoding utf8

# ---------------------------------------------------------------- k8s/<Name>.yaml
$k = [System.Text.StringBuilder]::new()
$routes = @()
foreach ($svc in $Services) {
  $p = Get-Port $svc
  $img = "$Name-$svc`:local"
  $probe = if ((Get-Type $svc) -eq 'frontend') { '/healthz' } else { '/health' }
  [void]$k.AppendLine(@"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $Name-$svc
  namespace: $Namespace
  labels:
    app.kubernetes.io/name: $Name
    app.kubernetes.io/component: $svc
    app.kubernetes.io/part-of: $Name
    devops.flavioneto/app-type: $Type
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: $Name
      app.kubernetes.io/component: $svc
  template:
    metadata:
      labels:
        app.kubernetes.io/name: $Name
        app.kubernetes.io/component: $svc
        app.kubernetes.io/part-of: $Name
        devops.flavioneto/app-type: $Type
    spec:
      containers:
        - name: $svc
          image: $img
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: $p
          readinessProbe:
            httpGet:
              path: $probe
              port: http
            initialDelaySeconds: 3
            periodSeconds: 10
          resources:
            requests:
              cpu: "10m"
              memory: "32Mi"
            limits:
              cpu: "200m"
              memory: "128Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: $Name-$svc
  namespace: $Namespace
  labels:
    app.kubernetes.io/part-of: $Name
spec:
  selector:
    app.kubernetes.io/name: $Name
    app.kubernetes.io/component: $svc
  ports:
    - name: http
      port: $p
      targetPort: http
---
"@)
  if (Get-Expose $svc) {
    if (Get-Strip $svc) {
      $mwName = "$Name-$svc-strip"
      $full = "$BasePath$(Get-SvcPath $svc)"
      [void]$k.AppendLine(@"
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: $mwName
  namespace: $Namespace
  labels:
    app.kubernetes.io/part-of: $Name
spec:
  stripPrefix:
    prefixes:
      - $full
---
"@)
      $routes += [pscustomobject]@{ Prefix = $full; Prio = 20 + $full.Length; Svc = "$Name-$svc"; Port = $p; Mw = $mwName }
    }
    else {
      $routes += [pscustomobject]@{ Prefix = $BasePath; Prio = 10; Svc = "$Name-$svc"; Port = $p; Mw = $null }
    }
  }
}
# IngressRoute (rotas ordenadas por prioridade desc; mais especifico vence)
$hostMatch = "(Host($bt$AppHost$bt) || Host(${bt}dev.nvit.com.br$bt))"
[void]$k.AppendLine("apiVersion: traefik.io/v1alpha1")
[void]$k.AppendLine("kind: IngressRoute")
[void]$k.AppendLine("metadata:")
[void]$k.AppendLine("  name: $Name")
[void]$k.AppendLine("  namespace: $Namespace")
[void]$k.AppendLine("  labels:")
[void]$k.AppendLine("    app.kubernetes.io/name: $Name")
[void]$k.AppendLine("    app.kubernetes.io/part-of: $Name")
[void]$k.AppendLine("spec:")
[void]$k.AppendLine("  entryPoints:")
[void]$k.AppendLine("    - web")
[void]$k.AppendLine("  routes:")
foreach ($r in ($routes | Sort-Object -Property Prio -Descending)) {
  [void]$k.AppendLine("    - match: $hostMatch && PathPrefix($bt$($r.Prefix)$bt)")
  [void]$k.AppendLine("      kind: Rule")
  [void]$k.AppendLine("      priority: $($r.Prio)")
  [void]$k.AppendLine("      services:")
  [void]$k.AppendLine("        - name: $($r.Svc)")
  [void]$k.AppendLine("          port: $($r.Port)")
  if ($r.Mw) {
    [void]$k.AppendLine("      middlewares:")
    [void]$k.AppendLine("        - name: $($r.Mw)")
  }
}
Set-Content (Join-Path $root "k8s\$Name.yaml") $k.ToString() -Encoding utf8

# ---------------------------------------------------------------- workflow + README
$wf = $tplWf -replace '@@APP@@', $Name -replace '@@NS@@', $Namespace -replace '@@MATRIX@@', ($Services -join ', ')
Set-Content (Join-Path $root '.github\workflows\ci-cd.yaml') $wf -Encoding utf8

$readme = @"
# $Name

App gerado por ``scripts/new-app.ps1`` no padrao da plataforma DevOps local.

- Host: http://$AppHost$BasePath  (real futuro: http://dev.nvit.com.br$BasePath)
- Namespace: $Namespace · Servicos: $($Services -join ', ')

## Publicar LOCAL (imagens :local)
``````powershell
$(foreach ($svc in $Services) { "docker build -t $Name-$svc`:local `"$root\$svc`"`n" })kubectl apply -f "$root\k8s\$Name.yaml"
kubectl -n $Namespace rollout status deploy/$Name-$($Services[0])
``````

## Publicar via GitHub Actions (GHCR + runner)
Faça push deste projeto; o ``.github/workflows/ci-cd.yaml`` builda no GHCR e faz deploy via runner self-hosted.

## Validar
``````powershell
$(foreach ($svc in $Services) { if (Get-Expose $svc) { "Invoke-WebRequest -UseBasicParsing http://$AppHost$BasePath$(if((Get-Strip $svc)){ (Get-SvcPath $svc)+'/health' })`n" } })``````
Confira tambem no DevOps Console: http://$AppHost/devops
"@
Set-Content (Join-Path $root 'README.md') $readme -Encoding utf8

# ---------------------------------------------------------------- Argo CD Application (GitOps)
$argoMsg = ""
if (-not $NoArgo) {
  $repoRoot = 'C:\devops'
  if ($root.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    $relK8s = (($root.Substring($repoRoot.Length).TrimStart('\') -replace '\\', '/')) + '/k8s'
  }
  else {
    $relK8s = "apps/$Name/k8s"
    Write-Host "  -> AVISO: app fora de C:\devops; ajuste source.path da Application do Argo manualmente."
  }
  New-Item -ItemType Directory -Force -Path $ArgoAppsDir | Out-Null
  $argoApp = @"
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: $Name
  namespace: argocd
  labels:
    devops.flavioneto/app-type: $Type
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/FlavioNeto11/devops
    path: $relK8s
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: $Namespace
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
"@
  $argoPath = Join-Path $ArgoAppsDir "$Name.yaml"
  Set-Content $argoPath $argoApp -Encoding utf8
  $argoMsg = "$argoPath  (commit + push para o app-of-apps colocar a app sob GitOps)"
  Write-Host "  -> Argo Application gerada: $argoPath"
}

# ---------------------------------------------------------------- resumo
Write-Host "`n[OK] App '$Name' gerado em: $root"
Write-Host "`nProximos passos (LOCAL):"
foreach ($svc in $Services) { Write-Host "  docker build -t $Name-$svc`:local `"$(Join-Path $root $svc)`"" }
Write-Host "  kubectl apply -f `"$(Join-Path $root "k8s\$Name.yaml")`""
Write-Host "`nRotas que serao publicadas:"
foreach ($r in ($routes | Sort-Object -Property Prio -Descending)) { Write-Host ("  http://{0}{1}   (priority {2} -> {3}:{4})" -f $AppHost, $r.Prefix, $r.Prio, $r.Svc, $r.Port) }
Write-Host "`nContrato: $(Join-Path $root 'devops.yaml')  |  Console: http://$AppHost/devops"
if ($argoMsg) { Write-Host "GitOps:   $argoMsg" }
Write-Host "`nRegistro na plataforma (OBRIGATORIO - ver docs/standards/golden-path.md secao 9):"
Write-Host "  - Projetos & Tarefas: console/pm-api/scripts/seed.js  (PROJECTS + ITEMS)"
Write-Host "  - Compartilhados:     console/pm-api/src/data/shared-resources.json  (consumer)"
Write-Host "  - Dominio raiz /:     portal/frontend/index.html  (card + stat + rodape)"
Write-Host "  - Argo:               commit/merge da Application na branch 'main'"
Write-Host "  Aplicar: rebuild console-pm:local e portal-frontend:local + kubectl rollout restart (ns devops-system)."
