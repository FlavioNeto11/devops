#requires -Version 7.0
<#
.SYNOPSIS
  Empacota (npm pack) os pacotes de packages/* em tarballs para consumo OFFLINE nos builds :local.
.DESCRIPTION
  Os apps sao monorepos separados e os builds rodam em docker (contexto = pasta do app), que nao
  enxerga C:\devops\packages. Solucao do laboratorio: empacotar cada @flavioneto11/<pkg> em .tgz e
  copiar para apps/<App>/vendor/, referenciando via "file:vendor/<tgz>" no package.json do servico.
  (No CI/producao usa-se o GitHub Packages — ver docs/standards/shared-libraries-and-versioning.md.)
.PARAMETER App
  Se informado, copia os tarballs tambem para apps/<App>/vendor/ e imprime as refs file: a usar.
.EXAMPLE
  .\scripts\vendor-packages.ps1                 # gera tarballs em .vendor\
  .\scripts\vendor-packages.ps1 -App gymops     # + copia para apps/gymops/vendor\
#>
[CmdletBinding()]
param([string]$App)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$pkgRoot = Join-Path $root 'packages'
$vendor  = Join-Path $root '.vendor'
New-Item -ItemType Directory -Force -Path $vendor | Out-Null

$tarballs = @()
Get-ChildItem -Directory $pkgRoot -ErrorAction Stop | Where-Object { Test-Path (Join-Path $_.FullName 'package.json') } | ForEach-Object {
  Write-Host "== npm pack $($_.Name) ==" -ForegroundColor Cyan
  Push-Location $_.FullName
  try {
    $out = npm pack --pack-destination $vendor 2>&1
    $tgz = ($out | Where-Object { $_ -match '\.tgz\s*$' } | Select-Object -Last 1).ToString().Trim()
    if ($tgz) { $tarballs += $tgz; Write-Host "  -> $tgz" -ForegroundColor Gray }
  } finally { Pop-Location }
}
Write-Host "[OK] $($tarballs.Count) tarball(s) em $vendor" -ForegroundColor Green

if ($App) {
  $appDir = Join-Path $root "apps\$App"
  if (-not (Test-Path $appDir)) { throw "App nao encontrado: $appDir" }
  $appVendor = Join-Path $appDir 'vendor'
  New-Item -ItemType Directory -Force -Path $appVendor | Out-Null
  Copy-Item (Join-Path $vendor '*.tgz') $appVendor -Force
  Write-Host "`nTarballs copiados para apps\$App\vendor\. Referencie no package.json do servico:" -ForegroundColor Green
  Get-ChildItem $appVendor -Filter *.tgz | ForEach-Object {
    if ($_.Name -match '^(flavioneto11-)?(?<pkg>[a-z-]+)-\d') {
      Write-Host ("  `"@flavioneto11/{0}`": `"file:vendor/{1}`"" -f $Matches.pkg, $_.Name) -ForegroundColor Yellow
    } else {
      Write-Host ("  file:vendor/{0}" -f $_.Name) -ForegroundColor Yellow
    }
  }
  Write-Host "Garanta que o Dockerfile do servico faca COPY do vendor/ ANTES do install." -ForegroundColor Gray
}
