#requires -Version 7.0
<#
.SYNOPSIS
  Garante o Kubernetes do Docker Desktop HABILITADO e Ready (contexto docker-desktop).
.DESCRIPTION
  Idempotente: se o no ja esta Ready, apenas confirma e sai. Caso contrario,
  habilita via %APPDATA%\Docker\settings-store.json (KubernetesEnabled=true e
  EnableDockerAI=false para evitar o crash do Inference manager), reinicia o
  Docker Desktop e espera o no ficar Ready. Se o Docker travar, chama
  recover-docker.ps1 e tenta novamente.
#>
[CmdletBinding()]
param([int]$TimeoutMin = 15)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'
function Now { Get-Date -Format HH:mm:ss }
function Test-K8sReady {
  $n = kubectl get nodes --no-headers --request-timeout=8s 2>$null
  return ($LASTEXITCODE -eq 0 -and ($n -match '\bReady\b'))
}
function Show-Ready {
  kubectl config use-context docker-desktop 2>$null | Out-Null
  Write-Host "[OK] Kubernetes Ready (contexto docker-desktop)."
  kubectl get nodes 2>$null
}

if (Test-K8sReady) { Show-Ready; return }

$f = Join-Path $env:APPDATA 'Docker\settings-store.json'
if (-not (Test-Path $f)) { throw "settings-store.json nao encontrado em $f. Docker Desktop esta instalado?" }
Copy-Item $f ("$f.bak-" + (Get-Date -Format 'yyyyMMddHHmmss')) -Force
$j = Get-Content $f -Raw | ConvertFrom-Json
$j | Add-Member -NotePropertyName KubernetesEnabled -NotePropertyValue $true -Force
$j | Add-Member -NotePropertyName EnableDockerAI -NotePropertyValue $false -Force
$j | Add-Member -NotePropertyName InferenceCanUseGPUVariant -NotePropertyValue $false -Force
$j | ConvertTo-Json -Depth 10 | Set-Content $f -Encoding utf8
Write-Host "[$(Now)] settings-store.json: KubernetesEnabled=true, EnableDockerAI=false (backup .bak gravado)."
Write-Host "[$(Now)] Reiniciando o Docker Desktop (1a provisao do k8s leva alguns minutos)..."
docker desktop restart 2>&1 | Out-Host

$deadline = (Get-Date).AddMinutes($TimeoutMin)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 15
  if (Test-K8sReady) { Show-Ready; return }
  $st = ((docker desktop status 2>&1 | Out-String) -replace '\s+', ' ').Trim()
  Write-Host ("[{0}] aguardando Kubernetes... ({1})" -f (Now), $st)
}

Write-Host "[$(Now)] Kubernetes nao subiu no prazo; executando recover-docker.ps1..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot 'recover-docker.ps1')
$deadline2 = (Get-Date).AddMinutes($TimeoutMin)
while ((Get-Date) -lt $deadline2) {
  Start-Sleep -Seconds 15
  if (Test-K8sReady) { Show-Ready; return }
  Write-Host ("[{0}] aguardando Kubernetes (apos recovery)..." -f (Now))
}
throw "Kubernetes nao ficou Ready em ${TimeoutMin}min (x2). Rode scripts/recover-docker.ps1, ou habilite manualmente: Docker Desktop -> Settings -> Kubernetes -> Enable."
