#requires -Version 7.0
<#
.SYNOPSIS
  UM comando para subir TODA a plataforma DevOps local do zero (idempotente).
.DESCRIPTION
  Orquestra: pre-requisitos -> ferramentas (winget) -> hosts -> habilitar
  Kubernetes (Docker Desktop) -> instalar plataforma (Traefik, Argo CD,
  Observabilidade, Console) -> validar. Tudo idempotente; pode rodar mais de
  uma vez. Apps de negocio sao adicionados a parte (scripts\new-app.ps1).

  RODE EM PowerShell 7 COMO ADMINISTRADOR (necessario para editar o hosts e
  controlar servicos do Docker).
.EXAMPLE
  .\scripts\up.ps1                  # sobe tudo
.EXAMPLE
  .\scripts\up.ps1 -SkipTools       # nao tenta instalar ferramentas via winget
.EXAMPLE
  .\scripts\up.ps1 -SkipPlatform    # so valida (sem reinstalar a plataforma)
#>
[CmdletBinding()]
param([switch]$SkipTools, [switch]$SkipHosts, [switch]$SkipPlatform)
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

Banner "0/5 Pre-requisitos (informativo)"
& "$here\check-prereqs.ps1"   # k8s ainda pode estar desabilitado aqui; sera habilitado no passo 3

if (-not $SkipTools) { Banner "1/5 Ferramentas (winget, idempotente)"; & "$here\install-tools.ps1"; Update-ProcessPath }
else { Banner "1/5 Ferramentas (pulado)" }

if (-not $SkipHosts) {
  Banner "2/5 Arquivo hosts (xpto.localhost / dev.nvit.com.br / traefik.localhost)"
  $hf = "$env:WINDIR\System32\drivers\etc\hosts"
  $c = Get-Content $hf -Raw -ErrorAction SilentlyContinue
  if ($c -and ($c -notmatch "`n$")) { Add-Content -Path $hf -Value "" }   # garante newline antes do append
  foreach ($h in 'xpto.localhost', 'dev.nvit.com.br', 'traefik.localhost') {
    if (-not $c -or ($c -notmatch ('\b' + [regex]::Escape($h) + '\b'))) { Add-Content -Path $hf -Value "127.0.0.1`t$h"; Write-Host "  + $h" }
    else { Write-Host "  = $h (ja existe)" }
  }
}
else { Banner "2/5 Hosts (pulado)" }

Banner "3/5 Kubernetes (Docker Desktop)"
& "$here\enable-kubernetes.ps1"

if (-not $SkipPlatform) { Banner "4/5 Plataforma (Traefik, Argo CD, Observabilidade, Console)"; & "$here\install-platform.ps1" }
else { Banner "4/5 Plataforma (pulado)" }

Banner "5/5 Validacao"
& "$here\validate-platform.ps1"

Banner "PRONTO - plataforma DevOps local no ar"
Write-Host "  Console : http://xpto.localhost/devops"
Write-Host "  Grafana : http://xpto.localhost/grafana"
Write-Host "  Argo CD : kubectl port-forward svc/argocd-server -n argocd 8080:80  ->  http://localhost:8080"
Write-Host "  Traefik : http://traefik.localhost/dashboard/"
Write-Host ""
Write-Host "  App novo: .\scripts\new-app.ps1 -Name <app> -Services frontend,api,worker"
Write-Host "  CI/CD   : docker login ghcr.io -u flavioneto11 (PAT write:packages) + .\scripts\install-github-runner.ps1"
