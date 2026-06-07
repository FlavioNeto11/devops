#Requires -Version 7.0

param(
  [string]$CorrelationId = "frontend_5cd19089-d277-452e-bce7-0aca7ec29e0b",
  [string]$ApiBaseUrl = "http://localhost:3000",
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [int]$TimeoutSeconds = 10
)

$ErrorActionPreference = "Stop"

# Colors
$RED = "`e[31m"
$GREEN = "`e[32m"
$YELLOW = "`e[33m"
$BLUE = "`e[34m"
$RESET = "`e[0m"

function Write-Title {
  param([string]$Title)
  Write-Host ""
  Write-Host "$BLUE╔════════════════════════════════════════════════════════════════╗$RESET"
  Write-Host "$BLUE║ $Title$RESET"
  Write-Host "$BLUE╚════════════════════════════════════════════════════════════════╝$RESET"
  Write-Host ""
}

function Write-Section {
  param([string]$Title)
  Write-Host "$YELLOW═══ $Title $YELLOW═══$RESET"
}

function Write-Check {
  param([string]$Message, [bool]$Status)
  $icon = $Status ? "$GREEN✓$RESET" : "$RED✗$RESET"
  Write-Host "$icon $Message"
}

function Write-Info {
  param([string]$Message)
  Write-Host "$BLUE→$RESET $Message"
}

function Invoke-ApiCall {
  param(
    [string]$Endpoint,
    [string]$Description
  )
  
  try {
    Write-Info "Consultando: $Description"
    $url = "$ApiBaseUrl$Endpoint"
    $response = Invoke-WebRequest `
      -Uri $url `
      -Method Get `
      -TimeoutSec $TimeoutSeconds `
      -ErrorAction Stop
    
    $data = $response.Content | ConvertFrom-Json
    Write-Check "$Description" $true
    return $data
  }
  catch {
    Write-Check "$Description" $false
    Write-Host "$RED  Erro: $($_.Exception.Message)$RESET"
    return $null
  }
}

function Get-JobFromDatabase {
  param([string]$CorrelationId)
  
  if (-not $DatabaseUrl) {
    Write-Host "$RED[ERRO] Variável DATABASE_URL não definida$RESET"
    return $null
  }
  
  try {
    Write-Info "Acessando banco de dados..."
    
    # Parse connection string
    $connStringPattern = '^postgres(?:ql)?://(?:([^:@]+)(?::([^@]*))?@)?([^:/]+)(?::(\d+))?(?:/(.+))?$'
    if ($DatabaseUrl -match $connStringPattern) {
      $User = $matches[1]
      $Password = $matches[2]
      $Host = $matches[3]
      $Port = if ($matches[4]) { $matches[4] } else { "5432" }
      $Database = if ($matches[5]) { $matches[5] } else { "postgres" }
      
      # Construir comando psql
      $psqlArgs = @(
        "-h", $DbHost,
        "-p", $Port,
        "-U", $User,
        "-d", $Database,
        "-c", "SELECT job_id, operation, status, attempts, max_attempts, queued_at, started_at, claimed_by, last_error_code, last_error_message FROM jobs WHERE correlation_id = '$CorrelationId' LIMIT 1;"
      )
      
      $env:PGPASSWORD = $Password
      $result = & psql @psqlArgs 2>&1
      Remove-Item env:PGPASSWORD
      
      Write-Check "Query ao banco de dados" $true
      Write-Host "$result"
      return $result
    }
    else {
      Write-Host "$RED[ERRO] Formato de DATABASE_URL inválido$RESET"
      return $null
    }
  }
  catch {
    Write-Check "Query ao banco de dados" $false
    Write-Host "$RED  Erro: $($_.Exception.Message)$RESET"
    return $null
  }
}

function Get-AuditLogs {
  param([string]$CorrelationId)
  
  if (-not $DatabaseUrl) {
    return $null
  }
  
  try {
    Write-Info "Consultando audit logs..."
    
    # Parse connection string
    $connStringPattern = '^postgres(?:ql)?://(?:([^:@]+)(?::([^@]*))?@)?([^:/]+)(?::(\d+))?(?:/(.+))?$'
    if ($DatabaseUrl -match $connStringPattern) {
      $User = $matches[1]
      $Password = $matches[2]
      $DbHost = $matches[3]
      $Port = if ($matches[4]) { $matches[4] } else { "5432" }
      $Database = if ($matches[5]) { $matches[5] } else { "postgres" }
      
      $psqlArgs = @(
        "-h", $DbHost,
        "-p", $Port,
        "-U", $User,
        "-d", $Database,
        "-c", "SELECT entry_id, created_at, event_type, component, message, details FROM audit_trail WHERE correlation_id = '$CorrelationId' ORDER BY created_at DESC LIMIT 20;"
      )
      
      $env:PGPASSWORD = $Password
      $result = & psql @psqlArgs 2>&1
      Remove-Item env:PGPASSWORD
      
      Write-Check "Audit logs" $true
      Write-Host "$result"
      return $result
    }
  }
  catch {
    Write-Check "Audit logs" $false
    Write-Host "$RED  Erro: $($_.Exception.Message)$RESET"
    return $null
  }
}

# ═══════════════════════════════════════════════════════════════════════════

Write-Title "DIAGNÓSTICO DE JOB STUCK - manifest.print"

Write-Host "Correlation ID: $BLUE$CorrelationId$RESET"
Write-Host "API Base URL:   $BLUE$ApiBaseUrl$RESET"
Write-Host "Database:       $($DatabaseUrl ? "$BLUE[configurado]$RESET" : "$RED[não configurado]$RESET")"
Write-Host ""

# Verificar API
Write-Section "1️⃣ VERIFICAR STATUS DA API"
$health = Invoke-ApiCall "/v1/health/system" "GET /v1/health/system"

if ($health) {
  Write-Host ""
  Write-Host "Status do Sistema:"
  $health | ConvertTo-Json | Write-Host
}

# Verificar Workers
Write-Section "2️⃣ VERIFICAR STATUS DOS WORKERS"
$workers = Invoke-ApiCall "/v1/health/workers" "GET /v1/health/workers"

if ($workers) {
  Write-Host ""
  Write-Host "Workers Ativos:"
  if ($workers.workers -and $workers.workers.Count -gt 0) {
    $workers.workers | ForEach-Object {
      Write-Host "$GREEN✓$RESET Worker: $($_.worker_id) | Status: $($_.status) | Heartbeat: $($_.last_heartbeat_at)"
    }
  }
  else {
    Write-Host "$RED✗$RESET Nenhum worker registrado!"
  }
  
  Write-Host ""
  Write-Host "Estatísticas:"
  Write-Host "  Total Workers:     $($workers.summary.total_workers)"
  Write-Host "  Healthy:           $($workers.summary.healthy_workers)"
  Write-Host "  Degraded:          $($workers.summary.degraded_workers)"
  Write-Host "  Unhealthy:         $($workers.summary.unhealthy_workers)"
  Write-Host "  Active (last 5m):  $($workers.summary.active_last_5m)"
}

# Verificar Jobs Ativos
Write-Section "3️⃣ LISTAR JOBS ATIVOS"
$activeJobs = Invoke-ApiCall "/v1/health/jobs/active" "GET /v1/health/jobs/active"

if ($activeJobs) {
  Write-Host ""
  
  if ($activeJobs.jobs -and $activeJobs.jobs.Count -gt 0) {
    Write-Host "Total de jobs na fila: $($activeJobs.jobs.Count)"
    Write-Host ""
    
    # Procurar pelo correlation_id específico
    $matchingJob = $activeJobs.jobs | Where-Object { $_.correlation_id -eq $CorrelationId }
    
    if ($matchingJob) {
      Write-Host "$GREEN✓ JOB ENCONTRADO NA FILA ATIVA!$RESET"
      Write-Host ""
      $matchingJob | Format-Table -AutoSize @(
        "job_id",
        "operation",
        "status",
        "attempts",
        "max_attempts",
        @{Label = "Age (s)"; Expression = { $_.age_seconds } },
        "claimed_by",
        "priority"
      )
    }
    else {
      Write-Host "$YELLOW⚠$RESET Job com correlation_id '$CorrelationId' NÃO encontrado na fila ativa!"
      Write-Host ""
      Write-Host "Primeiros 5 jobs na fila:"
      $activeJobs.jobs | Select-Object -First 5 | Format-Table -AutoSize @(
        "job_id",
        "operation",
        "correlation_id",
        "status",
        "attempts"
      )
    }
  }
  else {
    Write-Host "$GREEN✓$RESET Fila ativa vazia (boa notícia!)"
  }
}

# Consultar banco de dados
Write-Section "4️⃣ CONSULTAR JOB NO BANCO DE DADOS"
Get-JobFromDatabase -CorrelationId $CorrelationId

# Consultar audit logs
Write-Section "5️⃣ AUDIT LOGS PARA O CORRELATION_ID"
Get-AuditLogs -CorrelationId $CorrelationId

# Análise e recomendações
Write-Section "6️⃣ ANÁLISE E RECOMENDAÇÕES"

Write-Host ""
Write-Host "$BLUE📋 Checklist de Diagnóstico:$RESET"
Write-Host ""

$issues = @()

if ($health -eq $null) {
  $issues += "❌ API não responde - possível que não esteja rodando"
}
elseif ($health.status -ne "healthy") {
  $issues += "❌ API reporta status anômalo: $($health.status)"
}

if ($workers -eq $null) {
  $issues += "❌ Não foi possível consultar workers"
}
elseif ($workers.summary.total_workers -eq 0) {
  $issues += "❌ Nenhum worker registrado!"
}
elseif ($workers.summary.healthy_workers -eq 0 -and $workers.summary.active_last_5m -eq 0) {
  $issues += "❌ Não há workers ativos (últimos 5 minutos)"
}

if ($activeJobs -ne $null -and $activeJobs.jobs) {
  $matchingJob = $activeJobs.jobs | Where-Object { $_.correlation_id -eq $CorrelationId }
  if ($matchingJob) {
    if ($matchingJob.claimed_by) {
      $issues += "⚠️  Job está sendo processado por worker: $($matchingJob.claimed_by)"
    }
    else {
      $issues += "⚠️  Job está aguardando (não foi reclamado por worker)"
    }
    
    if ($matchingJob.status -eq "queued") {
      $issues += "⚠️  Status é 'queued' - worker ainda não processou"
    }
    elseif ($matchingJob.status -eq "retry_wait") {
      $issues += "⚠️  Status é 'retry_wait' - job falhou e está aguardando retry"
    }
  }
}

if ($issues.Count -eq 0) {
  Write-Host "$GREEN✓ Nenhuma anomalia óbvia detectada$RESET"
}
else {
  Write-Host "$YELLOW Possíveis Problemas:$RESET"
  $issues | ForEach-Object { Write-Host "  $_" }
}

Write-Host ""
Write-Host "$BLUE🔧 Recomendações:$RESET"
Write-Host ""
Write-Host "1. Se nenhum worker está ativo:"
Write-Host "   → Reiniciar o worker: npm run worker"
Write-Host ""
Write-Host "2. Se o job está na fila mas não foi reclamado:"
Write-Host "   → Aguardar polling do worker (padrão: 5s)"
Write-Host "   → Ou reiniciar worker forçado: npm run worker:once"
Write-Host ""
Write-Host "3. Se o job está em 'retry_wait':"
Write-Host "   → Verificar last_error_message acima"
Write-Host "   → Revisar logs do worker"
Write-Host ""
Write-Host "4. Para resetar o job manualmente (se necessário):"
Write-Host "   → UPDATE jobs SET status='queued', claimed_by=NULL WHERE job_id='<job_id>';"
Write-Host ""
Write-Host "5. Para monitorar em tempo real:"
Write-Host "   → npm run smoke:health (repetir)"
Write-Host "   → npm run smoke:worker (se disponível)"
Write-Host ""

Write-Title "FIM DO DIAGNÓSTICO"
