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
.EXAMPLE
  .\scripts\sync-reqhub-forge-state.ps1
#>
param([string]$Namespace = 'apps')
$ErrorActionPreference = 'Stop'
$base = Join-Path $PSScriptRoot '..\specs\baseline'
$products = Join-Path $base 'products.json'
$status = Join-Path $base 'implementation-status.json'
if (-not (Test-Path $products)) { throw "products.json não encontrado: $products (rode build-products.mjs)" }
if (-not (Test-Path $status)) { throw "implementation-status.json não encontrado: $status (rode impl-status.mjs)" }
kubectl create configmap reqhub-forge-state -n $Namespace `
  --from-file=products.json=$products `
  --from-file=implementation-status.json=$status `
  --dry-run=client -o yaml | kubectl apply -f -
Write-Host "OK — ConfigMap reqhub-forge-state atualizado (ns $Namespace) a partir de specs/baseline/." -ForegroundColor Green
Write-Host "    O endpoint /reqs/api/v1/forge/state refletirá em ~60s (propagação do ConfigMap) + 3s (cache)."
