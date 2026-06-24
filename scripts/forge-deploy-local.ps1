#requires -Version 7.0
<#
.SYNOPSIS
  Deploy LOCAL de um produto da Forja: builda as imagens :local, garante o Secret <prod>-db do
  Postgres (idempotente) e religa os Deployments. Roda na MÁQUINA do cluster (onde o Docker funciona).
.DESCRIPTION
  O runner-serviço do GitHub Actions não tem acesso ao Docker daemon (pipe negado), então o build das
  imagens :local não roda no CI. Este script é o equivalente local do workflow forge-deploy.yml — o
  operador (ou o Claude com acesso de Admin) roda aqui para publicar/atualizar o app da Forja.
.EXAMPLE
  .\scripts\forge-deploy-local.ps1 -Name forjademo
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$RepoRoot = 'C:\devops'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$prod = $Name
if ($prod -notmatch '^[a-z][a-z0-9-]{1,30}$') { throw "product inválido: '$prod'" }
$appDir = Join-Path $RepoRoot "apps/$prod"
if (-not (Test-Path $appDir)) { throw "apps/$prod não existe em $RepoRoot — faça 'git pull' primeiro." }

# 1) imagens :local (uma por serviço com Dockerfile; context = a pasta do serviço).
Get-ChildItem -Path $appDir -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'Dockerfile') } | ForEach-Object {
  $tag = "${prod}-$($_.Name):local"
  Write-Host "== docker build $tag ==" -ForegroundColor Cyan
  docker build -t $tag $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "build de $tag falhou." }
}

# 2) Secret <prod>-db (só se houver Postgres E o secret faltar — não rotaciona a senha do PVC).
$needsDb = Select-String -Path (Join-Path $appDir 'k8s/*.yaml') -Pattern "$prod-postgres" -Quiet
if ($needsDb) {
  $exists = (kubectl -n apps get secret "$prod-db" --ignore-not-found -o name 2>$null)
  if (-not $exists) {
    $pw = -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    $durl = "postgresql://${prod}:$pw@$prod-postgres:5432/$prod"
    kubectl -n apps create secret generic "$prod-db" --from-literal=POSTGRES_USER=$prod --from-literal=POSTGRES_PASSWORD=$pw --from-literal=POSTGRES_DB=$prod --from-literal=DATABASE_URL=$durl
    Write-Host "secret $prod-db criado." -ForegroundColor Green
  } else { Write-Host "secret $prod-db já existe — mantido." }
}

# 3) aplica os manifests (se o Argo ainda não tiver) + religa p/ pegar a :local nova.
kubectl apply -f (Join-Path $appDir 'k8s')
kubectl -n apps rollout restart deployment -l app.kubernetes.io/part-of=$prod
kubectl -n apps rollout status deployment -l app.kubernetes.io/part-of=$prod --timeout=180s
Write-Host "OK — '$prod' publicado. Acesse /$prod" -ForegroundColor Green
