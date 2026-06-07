#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Worker Manager - Gerenciar worker com controle robusto
    
.DESCRIPTION
    Script para iniciar, parar e monitorar o worker do sistema MTR.
    Garante cleanup adequado e evita processos travados.
    
.PARAMETER Action
    start  - Inicia o worker (background)
    stop   - Para o worker
    once   - Executa uma iteração e sai
    status - Verifica se worker está rodando
    
.EXAMPLE
    .\scripts\worker-manager.ps1 start
    .\scripts\worker-manager.ps1 stop
    .\scripts\worker-manager.ps1 once
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('start', 'stop', 'once', 'status')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'
$WorkerPidFile = Join-Path $PSScriptRoot '..' 'storage' 'temp' 'worker.pid'

function Start-Worker {
    Write-Host "🚀 Iniciando worker..." -ForegroundColor Cyan
    
    # Verificar se já está rodando
    if (Test-Path $WorkerPidFile) {
        $pid = Get-Content $WorkerPidFile
        if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
            Write-Host "⚠️  Worker já está rodando (PID: $pid)" -ForegroundColor Yellow
            return
        }
        Remove-Item $WorkerPidFile -Force
    }
    
    # Criar diretório temp se não existir
    $tempDir = Join-Path $PSScriptRoot '..' 'storage' 'temp'
    if (-not (Test-Path $tempDir)) {
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    }
    
    # Iniciar worker em background
    $env:CETESB_GATEWAY_MODE = 'real'
    $job = Start-Job -ScriptBlock {
        param($workDir)
        Set-Location $workDir
        node --no-warnings src/worker.js 2>&1
    } -ArgumentList (Get-Location).Path
    
    # Aguardar inicialização
    Start-Sleep -Seconds 2
    
    # Verificar se iniciou
    if ($job.State -eq 'Running') {
        $job.Id | Out-File $WorkerPidFile -Encoding utf8
        Write-Host "✓ Worker iniciado (Job ID: $($job.Id))" -ForegroundColor Green
        Write-Host "  Para parar: .\scripts\worker-manager.ps1 stop" -ForegroundColor Gray
    } else {
        Write-Host "❌ Falha ao iniciar worker" -ForegroundColor Red
        Receive-Job $job -ErrorAction SilentlyContinue
    }
}

function Stop-Worker {
    Write-Host "🛑 Parando worker..." -ForegroundColor Cyan
    
    if (-not (Test-Path $WorkerPidFile)) {
        Write-Host "⚠️  Worker não está rodando" -ForegroundColor Yellow
        return
    }
    
    $jobId = Get-Content $WorkerPidFile
    $job = Get-Job -Id $jobId -ErrorAction SilentlyContinue
    
    if ($job) {
        Stop-Job $job -ErrorAction SilentlyContinue
        Remove-Job $job -Force -ErrorAction SilentlyContinue
        Write-Host "✓ Worker parado (Job ID: $jobId)" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Job $jobId não encontrado" -ForegroundColor Yellow
    }
    
    Remove-Item $WorkerPidFile -Force -ErrorAction SilentlyContinue
    
    # Cleanup de processos node orfãos
    Get-Process -Name node -ErrorAction SilentlyContinue | 
        Where-Object { $_.CommandLine -like '*src/worker.js*' -or $_.CommandLine -like '*src\\worker.js*' } |
        Stop-Process -Force -ErrorAction SilentlyContinue
    
    Write-Host "✓ Cleanup concluído" -ForegroundColor Green
}

function Invoke-WorkerOnce {
    Write-Host "🔄 Executando worker (modo once)..." -ForegroundColor Cyan
    
    $env:CETESB_GATEWAY_MODE = 'real'
    node --no-warnings src/worker.js --once
    
    Write-Host "✓ Worker concluído" -ForegroundColor Green
}

function Get-WorkerStatus {
    Write-Host "📊 Status do worker:" -ForegroundColor Cyan
    
    if (-not (Test-Path $WorkerPidFile)) {
        Write-Host "  Status: ⭕ Parado" -ForegroundColor Yellow
        return
    }
    
    $jobId = Get-Content $WorkerPidFile
    $job = Get-Job -Id $jobId -ErrorAction SilentlyContinue
    
    if ($job -and $job.State -eq 'Running') {
        Write-Host "  Status: ✅ Rodando" -ForegroundColor Green
        Write-Host "  Job ID: $jobId" -ForegroundColor Gray
        Write-Host "  State: $($job.State)" -ForegroundColor Gray
    } else {
        Write-Host "  Status: ❌ Parado (PID file existe mas job não está rodando)" -ForegroundColor Red
        Remove-Item $WorkerPidFile -Force -ErrorAction SilentlyContinue
    }
}

# Main
switch ($Action) {
    'start'  { Start-Worker }
    'stop'   { Stop-Worker }
    'once'   { Invoke-WorkerOnce }
    'status' { Get-WorkerStatus }
}
