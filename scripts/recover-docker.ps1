#requires -Version 7.0
<#
.SYNOPSIS
  Recupera o Docker Desktop travado no boot (sockets AF_UNIX orfaos / crash do
  Inference manager apos um encerramento forcado).
.DESCRIPTION
  Encerra processos, faz wsl --shutdown, ISOLA (renomeia) as pastas de socket
  orfas em %LOCALAPPDATA%\docker-* e Docker\run (nao da para deletar), desativa o
  Docker AI (causa comum do crash) e sobe o Docker Desktop limpo.
  Use quando aparecer "An unexpected error occurred" citando
  ...\Docker\run\dockerInference ou ...\docker-secrets-engine\engine.sock.
  NAO use "Reset to factory defaults" do Docker (apaga tudo).
#>
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'
function Now { Get-Date -Format HH:mm:ss }

Write-Host "[$(Now)] Encerrando processos do Docker Desktop..."
Get-Process -Name "Docker Desktop", "com.docker.backend", "com.docker.build", "com.docker.dev-envs" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
try { Stop-Service com.docker.service -Force -ErrorAction Stop; Write-Host "[$(Now)] servico com.docker.service parado." } catch { Write-Host "[$(Now)] servico: $($_.Exception.Message)" }
Start-Sleep -Seconds 3

Write-Host "[$(Now)] wsl --shutdown..."
wsl --shutdown 2>&1 | Out-Host
Start-Sleep -Seconds 4

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
Write-Host "[$(Now)] Isolando pastas de socket orfas em $env:LOCALAPPDATA (renomeando)..."
Get-ChildItem -Force $env:LOCALAPPDATA -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'docker-*' -and $_.Name -notlike '*.broken-*' } |
  ForEach-Object {
    try { Rename-Item -LiteralPath $_.FullName -NewName "$($_.Name).broken-$ts" -ErrorAction Stop; Write-Host "  renomeado: $($_.Name)" }
    catch { Write-Host "  (ignorado) $($_.Name): $($_.Exception.Message)" }
  }
$run = Join-Path $env:LOCALAPPDATA 'Docker\run'
if (Test-Path $run) {
  try { Rename-Item -LiteralPath $run -NewName "run.broken-$ts" -ErrorAction Stop; Write-Host "  renomeado: Docker\run" } catch { Write-Host "  (ignorado) Docker\run: $($_.Exception.Message)" }
}

# Desativa o Docker AI (Inference manager e a causa comum do crash no boot).
# INCIDENTE 2026-06-12: no Docker Desktop 4.54, EnableDockerAI=false NAO desliga
# o Inference manager — ele segue criando o socket Docker\run\dockerInference e
# crashando por socket orfao; quem desliga de verdade e EnableInference=false.
# Cada crash deixa orfao o socket do servico que JA tinha subido (efeito domino:
# dockerInference -> docker-secrets-engine\engine.sock). Se o boot falhar apos
# este script, RE-RODE-O: ele isola as pastas de novo a cada execucao.
$f = Join-Path $env:APPDATA 'Docker\settings-store.json'
if (Test-Path $f) {
  try {
    $j = Get-Content $f -Raw | ConvertFrom-Json
    $j | Add-Member -NotePropertyName EnableDockerAI -NotePropertyValue $false -Force
    $j | Add-Member -NotePropertyName EnableInference -NotePropertyValue $false -Force
    $j | Add-Member -NotePropertyName InferenceCanUseGPUVariant -NotePropertyValue $false -Force
    $j | ConvertTo-Json -Depth 10 | Set-Content $f -Encoding utf8
    Write-Host "[$(Now)] Docker AI/Inference desativados em settings-store.json."
  } catch { Write-Host "[$(Now)] aviso settings-store.json: $($_.Exception.Message)" }
}

try { Start-Service com.docker.service -ErrorAction Stop } catch {}
Start-Sleep -Seconds 2
Write-Host "[$(Now)] Iniciando o Docker Desktop..."
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
Write-Host "[$(Now)] Recovery disparado. Aguarde o engine subir: docker desktop status"
