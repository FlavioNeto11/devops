# =============================================================================
# install-claude-usage-task.ps1 — registra (idempotente) a tarefa agendada que mantém o
# painel /reqs/#/aiusage atualizado com o consumo da assinatura Claude Code (Opus/Sonnet).
# Roda scripts/sync-reqhub-claude-usage.ps1 a cada 15 min (S4U; não precisa de senha).
# Reprovisiona após reboot/reinstalação. Requer PowerShell 7 como Admin.
#
# Uso:  pwsh scripts/install-claude-usage-task.ps1            # registra/atualiza
#       pwsh scripts/install-claude-usage-task.ps1 -Remove    # remove a tarefa
# =============================================================================
param([int]$IntervalMinutes = 15, [switch]$Remove)
$ErrorActionPreference = 'Stop'
$TaskName = 'reqhub-claude-usage-sync'
$script = Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts/sync-reqhub-claude-usage.ps1'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "[task] '$TaskName' removida." -ForegroundColor Yellow
  return
}

$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source; if (-not $pwsh) { $pwsh = 'powershell.exe' }
$action  = New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
# -RepetitionInterval sem -RepetitionDuration = repete indefinidamente (MaxValue dá overflow no XML).
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal `
  -Description "Agrega o consumo da assinatura Claude Code (Opus/Sonnet) e envia ao painel /reqs (a cada $IntervalMinutes min)." -Force | Out-Null
Write-Host "[task] '$TaskName' registrada — roda a cada $IntervalMinutes min ($pwsh)." -ForegroundColor Green
Write-Host "[task] valide: Start-ScheduledTask -TaskName $TaskName ; depois veja ingestedAt em /reqs/#/aiusage." -ForegroundColor Cyan
