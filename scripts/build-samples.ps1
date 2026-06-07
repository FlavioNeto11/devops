#requires -Version 7.0
<#
.SYNOPSIS
  Builda as imagens locais (<app>-<service>:local) de TODAS as apps em samples/.
.DESCRIPTION
  Para cada samples/<app>/<service>/ que tiver um Dockerfile, builda
  <app>-<service>:local (imagePullPolicy IfNotPresent -> sem registry).
  Apps que reusam imagens (ex.: aplicacao2 usa aplicacao1-api:local + nginx) nao
  tem Dockerfile e sao puladas. Com -Apply, tambem faz kubectl apply de cada k8s/.
#>
[CmdletBinding()]
param(
  [string]$SamplesDir = (Join-Path $PSScriptRoot '..\samples'),
  [switch]$Apply
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $SamplesDir)) { throw "Pasta de samples nao encontrada: $SamplesDir" }
$samples = (Resolve-Path $SamplesDir).Path
Write-Host "== Build das imagens :local dos samples em $samples =="
$built = 0
Get-ChildItem -Directory $samples | ForEach-Object {
  $app = $_.Name
  Get-ChildItem -Directory $_.FullName -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'Dockerfile') } |
    ForEach-Object {
      $img = "$app-$($_.Name)`:local"
      Write-Host "  -> docker build -t $img"
      docker build -q -t $img $_.FullName | Out-Host
      $built++
    }
}
Write-Host "[OK] $built imagem(ns) :local buildada(s)."

if ($Apply) {
  Write-Host "`n== kubectl apply dos manifests dos samples =="
  Get-ChildItem -Directory $samples | Where-Object { Test-Path (Join-Path $_.FullName 'k8s') } | ForEach-Object {
    Write-Host "  -> apply $($_.Name)/k8s"
    kubectl apply -f (Join-Path $_.FullName 'k8s') | Out-Host
  }
}
