#requires -Version 7.0
<#
.SYNOPSIS
  Registra a Tarefa Agendada que roda o watchdog de boot (boot-up-platform.ps1)
  ao logon, para a plataforma voltar sozinha apos um reinicio.
.DESCRIPTION
  Idempotente (recria a task). Principal = usuario atual, LogonType Interactive
  (NAO armazena senha), RunLevel Highest (precisa de Admin p/ recover-docker e
  Start-Service). Trigger = ao logon.

  IMPORTANTE: o Docker Desktop e um app de SESSAO — so sobe quando existe uma
  sessao interativa. Para um reboot 100% desacompanhado (sem ninguem logar), e
  preciso habilitar o AUTO-LOGIN do Windows (a senha e do operador; este script
  NAO mexe em credenciais). Veja docs/runbooks/docker-desktop-recovery.md.
.EXAMPLE
  pwsh -NoProfile -ExecutionPolicy Bypass -File C:\devops\scripts\install-boot-task.ps1
#>
[CmdletBinding()]
param([string]$TaskName = 'NVIT Platform Boot Watchdog')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script = Join-Path $PSScriptRoot 'boot-up-platform.ps1'
if (-not (Test-Path $script)) { throw "Nao encontrei $script" }

$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { $pwsh = 'C:\Program Files\PowerShell\7\pwsh.exe' }

$user = "$env:USERDOMAIN\$env:USERNAME"
$action  = New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
# Interactive => roda na sessao do usuario logado, SEM senha armazenada. Highest => elevado.
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 3)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "[OK] Tarefa '$TaskName' registrada (ao logon de $user, elevada, sem senha)."
Write-Host "     Script: $script"
Write-Host "     Log:    $(Join-Path (Split-Path $PSScriptRoot -Parent) 'logs\boot-up-platform.log')"
Write-Host ""
Write-Host "Para reboot DESACOMPANHADO, habilite o auto-login (a senha e sua):" -ForegroundColor Yellow
Write-Host "  Opcao A (recomendada, senha criptografada via LSA): baixar Sysinternals Autologon e rodar 'autologon.exe'."
Write-Host "  Opcao B: 'netplwiz' -> desmarcar 'Os usuarios devem digitar...' -> confirmar a senha."
