#requires -Version 7.0
<#
.SYNOPSIS
  UM comando para subir TODA a plataforma DevOps local do zero (idempotente).
.DESCRIPTION
  Orquestra: pre-requisitos -> ferramentas (winget) -> hosts -> habilitar
  Kubernetes (Docker Desktop) -> instalar plataforma (Traefik, Argo CD,
  Observabilidade, Console) -> buildar imagens dos samples -> publicar
  aplicacao1 -> validar. Tudo idempotente; pode rodar mais de uma vez.

  RODE EM PowerShell 7 COMO ADMINISTRADOR (necessario para editar o hosts e
  controlar servicos do Docker).
.EXAMPLE
  .\scripts\up.ps1                  # sobe tudo
.EXAMPLE
  .\scripts\up.ps1 -SkipTools       # nao tenta instalar ferramentas via winget
.EXAMPLE
  .\scripts\up.ps1 -SkipPlatform -SkipSamples   # so valida (sem reinstalar)
#>
[CmdletBinding()]
param([switch]$SkipTools, [switch]$SkipHosts, [switch]$SkipPlatform, [switch]$SkipSamples)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
function Banner($t) {
  Write-Host "`n##############################################################################" -ForegroundColor Cyan
  Write-Host "##  $t" -ForegroundColor Cyan
  Write-Host "##############################################################################" -ForegroundColor Cyan
}
function Update-ProcessPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }

Update-ProcessPath
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "AVISO: nao esta como Administrador - hosts/servicos podem falhar. Recomendado: abrir PowerShell 7 como Admin." -ForegroundColor Yellow }

Banner "0/7 Pre-requisitos (informativo)"
& "$here\check-prereqs.ps1"   # k8s ainda pode estar desabilitado aqui; sera habilitado no passo 3

if (-not $SkipTools) { Banner "1/7 Ferramentas (winget, idempotente)"; & "$here\install-tools.ps1"; Update-ProcessPath }
else { Banner "1/7 Ferramentas (pulado)" }

if (-not $SkipHosts) {
  Banner "2/7 Arquivo hosts (xpto.localhost / www.xpto.com / traefik.localhost)"
  $hf = "$env:WINDIR\System32\drivers\etc\hosts"
  $c = Get-Content $hf -Raw -ErrorAction SilentlyContinue
  if ($c -and ($c -notmatch "`n$")) { Add-Content -Path $hf -Value "" }   # garante newline antes do append
  foreach ($h in 'xpto.localhost', 'www.xpto.com', 'traefik.localhost') {
    if (-not $c -or ($c -notmatch ('\b' + [regex]::Escape($h) + '\b'))) { Add-Content -Path $hf -Value "127.0.0.1`t$h"; Write-Host "  + $h" }
    else { Write-Host "  = $h (ja existe)" }
  }
}
else { Banner "2/7 Hosts (pulado)" }

Banner "3/7 Kubernetes (Docker Desktop)"
& "$here\enable-kubernetes.ps1"

if (-not $SkipPlatform) { Banner "4/7 Plataforma (Traefik, Argo CD, Observabilidade, Console)"; & "$here\install-platform.ps1" }
else { Banner "4/7 Plataforma (pulado)" }

if (-not $SkipSamples) {
  Banner "5/7 Imagens dos samples (:local)"
  & "$here\build-samples.ps1"
  Banner "6/7 Publicar aplicacao1 (canonica)"
  & "$here\publish-sample-app.ps1"
}
else { Banner "5-6/7 Samples (pulado)" }

Banner "7/7 Validacao"
& "$here\validate-platform.ps1"

Banner "PRONTO - plataforma DevOps local no ar"
Write-Host "  Console : http://xpto.localhost/devops"
Write-Host "  Sample  : http://xpto.localhost/aplicacao1   (API: /aplicacao1/api/health)"
Write-Host "  Grafana : http://xpto.localhost/grafana"
Write-Host "  Argo CD : kubectl port-forward svc/argocd-server -n argocd 8080:80  ->  http://localhost:8080"
Write-Host "  Traefik : http://traefik.localhost/dashboard/"
Write-Host ""
Write-Host "  App novo: .\scripts\new-app.ps1 -Name <app> -Services frontend,api,worker"
Write-Host "  CI/CD   : docker login ghcr.io -u flavioneto11 (PAT write:packages) + .\scripts\install-github-runner.ps1"
