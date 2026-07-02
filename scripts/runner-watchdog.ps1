#requires -Version 7.0
<#
.SYNOPSIS
  Watchdog do runner self-hosted do GitHub Actions: detecta serviço parado ou queda de
  conexão com o broker e REINICIA o runner sozinho. Roda via Tarefa Agendada (SYSTEM),
  a cada ~10 min e no boot.
.DESCRIPTION
  Causa observada (2026-06-25): o listener do runner perdia a conexão com
  broker.actions.githubusercontent.com (SocketException 995 / ConnectionReset) e ficava
  preso "online" sem pegar jobs — workflows self-hosted (deploy/forge) travavam.
  Este watchdog reinicia o serviço quando:
    - o serviço não está Running; OU
    - o log recente acusa erros de conexão SEM retomar "Listening for Jobs".
  Idempotente; cooldown entre restarts evita loop; tudo logado em scripts/logs.
.EXAMPLE
  pwsh -File C:\devops\scripts\runner-watchdog.ps1
#>
param(
  [int]$CooldownMin = 15   # não reinicia mais de 1x neste intervalo
)
$ErrorActionPreference = 'Stop'
$runnerDir = 'C:\devops\runner'
$logDir    = Join-Path $runnerDir '_diag'
$wdLog     = 'C:\devops\scripts\logs\runner-watchdog.log'
$stateFile = 'C:\devops\scripts\logs\runner-watchdog.state'
New-Item -ItemType Directory -Force -Path (Split-Path $wdLog) | Out-Null

function Write-WdLog([string]$msg) {
  Add-Content -Path $wdLog -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $msg)
}

try {
  $svc = Get-Service -Name 'actions.runner.*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $svc) { Write-WdLog 'nenhum serviço actions.runner.* — nada a fazer.'; return }

  $unhealthy = $false; $reason = ''
  if ($svc.Status -ne 'Running') {
    $unhealthy = $true; $reason = "serviço em estado '$($svc.Status)'"
  } else {
    $log = Get-ChildItem (Join-Path $logDir 'Runner_*.log') -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime | Select-Object -Last 1
    if ($log) {
      $tail   = Get-Content $log.FullName -Tail 60 -ErrorAction SilentlyContinue
      $errPat = 'SocketException|ConnectionReset|Unable to read data from the transport|ERR  BrokerServer'
      $okPat  = 'Listening for Jobs|Running job|Job .* completed|Session created'
      $errN = @($tail | Select-String -Pattern $errPat).Count
      $okN  = @($tail | Select-String -Pattern $okPat).Count
      $staleMin = [int]((Get-Date) - $log.LastWriteTime).TotalMinutes
      # erros de conexão recentes E sem nenhum sinal de recuperação depois => preso
      if ($errN -ge 3 -and $okN -eq 0) {
        $unhealthy = $true; $reason = "log com $errN erro(s) de conexão sem recuperação (último write há ${staleMin} min)"
      }
    }
  }

  if (-not $unhealthy) { Write-WdLog "ok — runner '$($svc.Name)' saudável (Status=$($svc.Status))."; return }

  # cooldown: evita loop de restart
  if (Test-Path $stateFile) {
    [datetime]$lastDt = [datetime]::MinValue
    if ([datetime]::TryParse((Get-Content $stateFile -Raw), [ref]$lastDt) -and
        ((Get-Date) - $lastDt).TotalMinutes -lt $CooldownMin) {
      Write-WdLog "unhealthy ($reason) mas em cooldown (último restart $lastDt) — aguardando."; return
    }
  }

  Write-WdLog "UNHEALTHY ($reason) — reiniciando '$($svc.Name)'."
  Restart-Service -Name $svc.Name -Force
  Start-Sleep -Seconds 8
  (Get-Date).ToString('o') | Set-Content -Path $stateFile
  Write-WdLog "restart concluído — Status agora: $((Get-Service -Name $svc.Name).Status)."
} catch {
  Write-WdLog "ERRO no watchdog: $($_.Exception.Message)"
}
