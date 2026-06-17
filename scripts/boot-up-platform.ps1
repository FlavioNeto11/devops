#requires -Version 7.0
<#
.SYNOPSIS
  Watchdog de BOOT da plataforma DevOps local: garante Docker engine + Kubernetes
  no ar e auto-recupera as falhas tipicas de reinicio (start parcial, sockets
  orfaos). Idempotente — pode rodar a qualquer momento.
.DESCRIPTION
  Pensado para rodar via Tarefa Agendada "ao logon" (ver
  scripts\install-boot-task.ps1). Sequencia:
    1. com.docker.service -> Automatic + iniciado.
    2. Se o engine nao responder, lanca o Docker Desktop; se persistir o start
       parcial (servico Stopped / vmmem ausente / pipe ausente), chama
       recover-docker.ps1 e espera de novo.
    3. Espera o Kubernetes ficar Ready (KubernetesEnabled ja persiste no
       settings-store.json; nao reescreve nada aqui).
  Tudo logado em logs\boot-up-platform.log. NAO sobe a plataforma do zero (isso e
  o up.ps1); aqui so garantimos engine+k8s — os pods/Argo se recriam sozinhos.
.EXAMPLE
  pwsh -NoProfile -ExecutionPolicy Bypass -File C:\devops\scripts\boot-up-platform.ps1
#>
[CmdletBinding()]
param([int]$EngineTimeoutMin = 6, [int]$K8sTimeoutMin = 10)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$here = $PSScriptRoot
$logDir = Join-Path (Split-Path $here -Parent) 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'boot-up-platform.log'

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Write-Host $line
  Add-Content -Path $logFile -Value $line -Encoding utf8
}
function Update-ProcessPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Test-EngineUp { docker version --format '{{.Server.Version}}' 2>$null | Out-Null; return ($LASTEXITCODE -eq 0) }
function Test-K8sReady {
  $n = kubectl get nodes --no-headers --request-timeout=8s 2>$null
  return ($LASTEXITCODE -eq 0 -and ($n -match '\bReady\b'))
}

Update-ProcessPath
Log "==== boot-up-platform iniciado ===="

# 1) Servico privilegiado: Automatic + iniciado (nao starta o engine sozinho, mas e pre-requisito).
try {
  $svc = Get-Service com.docker.service -ErrorAction Stop
  if ($svc.StartType -ne 'Automatic') { Set-Service com.docker.service -StartupType Automatic; Log "com.docker.service -> Automatic" }
  if ($svc.Status -ne 'Running') { Start-Service com.docker.service -ErrorAction SilentlyContinue; Log "com.docker.service iniciado" }
} catch { Log "aviso com.docker.service: $($_.Exception.Message)" }

# 2) Engine: ja up? senao lanca o Docker Desktop e, se preciso, recupera.
if (Test-EngineUp) {
  Log "engine ja esta UP"
} else {
  $dd = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
    if (Test-Path $dd) { Start-Process $dd; Log "Docker Desktop lancado" }
  } else { Log "Docker Desktop ja em execucao; aguardando engine" }

  $deadline = (Get-Date).AddMinutes($EngineTimeoutMin)
  $recovered = $false
  while (-not (Test-EngineUp)) {
    if ((Get-Date) -ge $deadline) {
      if ($recovered) { Log "engine NAO subiu mesmo apos recover-docker; abortando (verifique a GUI/login)"; break }
      Log "engine nao subiu em ${EngineTimeoutMin}min — executando recover-docker.ps1"
      & (Join-Path $here 'recover-docker.ps1') *>> $logFile
      $recovered = $true
      $deadline = (Get-Date).AddMinutes($EngineTimeoutMin)
    }
    Start-Sleep -Seconds 15
  }
  if (Test-EngineUp) { Log "engine UP" }
}

# 3) Kubernetes Ready (KubernetesEnabled ja persistido; so esperamos).
if (Test-EngineUp) {
  Update-ProcessPath
  $deadline = (Get-Date).AddMinutes($K8sTimeoutMin)
  while (-not (Test-K8sReady)) {
    if ((Get-Date) -ge $deadline) { Log "Kubernetes NAO ficou Ready em ${K8sTimeoutMin}min (rode enable-kubernetes.ps1)"; break }
    Start-Sleep -Seconds 15
  }
  if (Test-K8sReady) { Log "Kubernetes READY — pods/Argo se recriam sozinhos" }
} else {
  Log "engine fora — pulando checagem do Kubernetes"
}

Log "==== boot-up-platform finalizado ===="
