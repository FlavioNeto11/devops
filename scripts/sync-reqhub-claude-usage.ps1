# =============================================================================
# sync-reqhub-claude-usage.ps1 — agrega o consumo da assinatura Claude Code (Opus/Sonnet)
# dos transcripts locais e ENVIA para o painel /reqs (POST /v1/ai-usage/subscription).
# A assinatura não tem API pública de limites; esta é a fonte honesta (consumo real local).
# Idempotente; rode periodicamente (ou via tarefa agendada) para manter o painel atualizado.
#
# Uso:  pwsh scripts/sync-reqhub-claude-usage.ps1
# =============================================================================
param([int]$Port = 8088)
$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$repo = Split-Path $PSScriptRoot -Parent

Write-Host '[claude-usage] agregando transcripts locais...' -ForegroundColor Cyan
$json = & node (Join-Path $repo 'scripts/claude-usage.mjs') --json
if ($LASTEXITCODE -ne 0 -or -not $json) { throw 'falha ao agregar (claude-usage.mjs)' }

$pf = Start-Job -ScriptBlock { param($p) kubectl port-forward svc/reqhub-api -n apps "$($p):8080" } -ArgumentList $Port
try {
  Start-Sleep -Seconds 4
  $headers = @{ 'Content-Type' = 'application/json'; 'X-Auth-Request-Email' = 'admin@nvit.com.br'; 'X-Auth-Request-Groups' = 'platform-admins' }
  $r = Invoke-RestMethod -Uri "http://localhost:$Port/v1/ai-usage/subscription" -Method Post -Headers $headers -Body $json -TimeoutSec 20
  $t5 = $r.totals.'5h'.billable
  $t7 = $r.totals.'7d'.billable
  Write-Host "[claude-usage] enviado. 5h=$t5 tok | 7d=$t7 tok | ingestedAt=$($r.ingestedAt)" -ForegroundColor Green
} finally { Stop-Job $pf -ErrorAction SilentlyContinue; Remove-Job $pf -Force -ErrorAction SilentlyContinue }
