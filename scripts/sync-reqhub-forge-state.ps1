#requires -Version 7.0
<#
.SYNOPSIS
  Sincroniza o ConfigMap `reqhub-forge-state` com a baseline ATUAL (products.json +
  implementation-status.json), para o endpoint `GET /reqs/api/v1/forge/state` refletir o
  estado da Forja em TEMPO REAL — sem reassar a imagem do frontend.
.DESCRIPTION
  O reqhub-api monta este ConfigMap em /forge-data e recalcula o progresso de cada produto a
  cada request. Rode este script após QUALQUER mudança na baseline (novo requisito, deploy,
  status do impl-status). A esteira/CI também pode chamá-lo. Idempotente (apply).

  -DeployStatus '<produto>=<deployed|deploy_failed>' registra o resultado do ÚLTIMO deploy do
  produto na chave deploys.json do ConfigMap (o forge-deploy chama após o smoke-contract).
  As entradas existentes são PRESERVADAS (merge com o ConfigMap vivo) e produtos que saíram
  da baseline são podados (forge-delete). Fail-soft: quem não lê deploys.json não é afetado.
.EXAMPLE
  .\scripts\sync-reqhub-forge-state.ps1
.EXAMPLE
  .\scripts\sync-reqhub-forge-state.ps1 -DeployStatus 'shopdesk=deploy_failed'
#>
param(
  [string]$Namespace = 'apps',
  [string]$DeployStatus = ''
)
$ErrorActionPreference = 'Stop'
$base = Join-Path $PSScriptRoot '..\specs\baseline'
$products = Join-Path $base 'products.json'
$status = Join-Path $base 'implementation-status.json'
if (-not (Test-Path $products)) { throw "products.json não encontrado: $products (rode build-products.mjs)" }
if (-not (Test-Path $status)) { throw "implementation-status.json não encontrado: $status (rode impl-status.mjs)" }

# architectures.json = mapa name -> { status, stack, waves } a partir de cada specs/products/<name>/architecture.json
# (a IA da Forja escreve isso; alimenta o "plano de build" visível na aba Arquitetura do reqhub).
$prodsDir = Join-Path $PSScriptRoot '..\specs\products'
$arch = [ordered]@{}
Get-ChildItem $prodsDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $ap = Join-Path $_.FullName 'architecture.json'
  $pp = Join-Path $_.FullName 'product.json'
  if ((Test-Path $ap) -and (Test-Path $pp)) {
    $a = Get-Content $ap -Raw | ConvertFrom-Json
    $p = Get-Content $pp -Raw | ConvertFrom-Json
    $arch[$_.Name] = @{ status = ($(if ($p.phases.architecture.status -eq 'approved') { 'approved' } else { 'proposed' })); stack = $p.stack; waves = @($a.waves) }
  }
}
$archFile = Join-Path ([System.IO.Path]::GetTempPath()) 'architectures.json'
($arch | ConvertTo-Json -Depth 8) | Set-Content -Encoding utf8 $archFile

# deploys.json = mapa name -> { status, at, runId } do resultado do ÚLTIMO deploy por produto
# (o forge-deploy escreve 'deployed' ou 'deploy_failed' via -DeployStatus). Como o ConfigMap é
# recriado inteiro a cada sync, PRESERVAMOS as entradas vivas (merge) e podamos produtos que
# não estão mais em products.json (produto apagado pelo forge-delete).
$deploys = [ordered]@{}
$existing = ''
try { $existing = kubectl get configmap reqhub-forge-state -n $Namespace -o jsonpath='{.data.deploys\.json}' 2>$null } catch {}
if ($existing) {
  try {
    $parsed = $existing | ConvertFrom-Json
    foreach ($prop in $parsed.PSObject.Properties) { $deploys[$prop.Name] = $prop.Value }
  } catch { Write-Warning "deploys.json existente ilegível — recomeçando vazio." }
}
$knownProducts = @(((Get-Content $products -Raw | ConvertFrom-Json).products) | ForEach-Object { $_.name })
foreach ($k in @($deploys.Keys)) { if ($knownProducts -notcontains $k) { $deploys.Remove($k) } }
if ($DeployStatus) {
  if ($DeployStatus -notmatch '^([a-z][a-z0-9-]{1,30})=(deployed|deploy_failed)$') {
    throw "DeployStatus inválido: '$DeployStatus' (esperado <produto>=<deployed|deploy_failed>)"
  }
  $deploys[$Matches[1]] = @{
    status = $Matches[2]
    at     = (Get-Date -AsUTC).ToString('yyyy-MM-ddTHH:mm:ssZ')
    runId  = "$env:GITHUB_RUN_ID"
  }
}
$deploysFile = Join-Path ([System.IO.Path]::GetTempPath()) 'forge-deploys.json'
($deploys | ConvertTo-Json -Depth 4) | Set-Content -Encoding utf8 $deploysFile

kubectl create configmap reqhub-forge-state -n $Namespace `
  --from-file=products.json=$products `
  --from-file=implementation-status.json=$status `
  --from-file=architectures.json=$archFile `
  --from-file=deploys.json=$deploysFile `
  --dry-run=client -o yaml | kubectl apply -f -
Write-Host "OK — ConfigMap reqhub-forge-state atualizado (ns $Namespace) a partir de specs/baseline/." -ForegroundColor Green
Write-Host "    O endpoint /reqs/api/v1/forge/state refletirá em ~60s (propagação do ConfigMap) + 3s (cache)."
