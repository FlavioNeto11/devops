# =============================================================================
# sync-claude-plan-usage.ps1 — PROBE AUTOMÁTICO dos limites da ASSINATURA Claude (Max) -> painel /reqs.
#
# Lê os headers `anthropic-ratelimit-unified-*` de um probe mínimo (1 token) à API da Anthropic usando
# o token OAuth VIVO do Claude Code (~/.claude/.credentials.json), que a própria CLI/desktop mantém
# atualizado enquanto você usa o Claude. USO ESTRITAMENTE LEITURA — NUNCA faz refresh/escreve o token
# (sem risco de deslogar). Se o token estiver expirado (Claude inativo há muito), PULA (painel mantém a
# última leitura). Converte os headers no shape de plano e POSTa em /v1/ai-usage/subscription (source=auto).
#
# Headers expostos: 5h-utilization (sessão), 7d-utilization (semanal todos os modelos), resets, overage.
# O split "só Sonnet" NÃO é exposto pela API -> fica em branco no painel (nota honesta).
#
# -DumpHeaders : só imprime os headers de rate-limit (inspeção).
# Uso          : pwsh scripts/sync-claude-plan-usage.ps1   (agende a cada ~15min)
# =============================================================================
param([switch]$DumpHeaders, [int]$Port = 8088, [string]$Model = 'claude-haiku-4-5-20251001')
$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')

# --- token OAuth VIVO do Claude Code (somente leitura) ---
$credPath = Join-Path $env:USERPROFILE '.claude\.credentials.json'
if (-not (Test-Path $credPath)) { Write-Warning "credentials.json não encontrado ($credPath) — login do Claude Code ausente."; exit 0 }
$oauth = (Get-Content $credPath -Raw | ConvertFrom-Json).claudeAiOauth
if (-not $oauth -or -not $oauth.accessToken) { Write-Warning 'sem accessToken no credentials.json.'; exit 0 }
$exp = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$oauth.expiresAt).LocalDateTime
if ($exp -lt (Get-Date)) { Write-Warning "token OAuth expirado em $exp (Claude Code inativo) — pulando; o painel mantém a última leitura. NÃO faço refresh (evita relogin)."; exit 0 }
$tok = $oauth.accessToken

# --- probe mínimo: captura SÓ os headers (corpo descartado) ---
$body = '{"model":"' + $Model + '","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
$tmp = New-TemporaryFile
$raw = curl.exe -s -D - -o $tmp.FullName -X POST 'https://api.anthropic.com/v1/messages' `
  -H "authorization: Bearer $tok" -H 'anthropic-version: 2023-06-01' -H 'anthropic-beta: oauth-2025-04-20' `
  -H 'content-type: application/json' --data $body 2>$null
Remove-Item $tmp -ErrorAction SilentlyContinue

$status = ''
$rl = @{}
foreach ($line in ($raw -split "`n")) {
  if ($line -match '^HTTP/') { $status = $line.Trim() }
  elseif ($line -match '^(anthropic-ratelimit[^:]*):\s*(.+?)\s*$') { $rl[$matches[1].ToLower()] = $matches[2] }
}

if ($DumpHeaders) {
  Write-Host "STATUS: $status" -ForegroundColor Cyan
  if ($rl.Count -eq 0) { Write-Host '(nenhum header anthropic-ratelimit-*)' -ForegroundColor Yellow }
  else { $rl.GetEnumerator() | Sort-Object Name | ForEach-Object { Write-Host ("  {0} = {1}" -f $_.Key, $_.Value) } }
  return
}
if ($status -notmatch ' 200') { Write-Warning "probe não-200 ($status) — pulando."; exit 0 }

# --- conversão dos headers unified -> shape de plano ---
function Get($k) { if ($rl.ContainsKey($k)) { return $rl[$k] } return $null }
function UtilPct($v) { if ($null -eq $v -or $v -eq '') { return $null }; return [int][math]::Round([double]$v * 100) }
function ResetRel($epoch) {  # 5h: relativo "em Xh Ym"
  if (-not $epoch) { return $null }
  $d = [DateTimeOffset]::FromUnixTimeSeconds([int64]$epoch).LocalDateTime - (Get-Date)
  if ($d.TotalSeconds -le 0) { return 'agora' }
  if ($d.TotalHours -ge 1) { return ('em ' + [int][math]::Floor($d.TotalHours) + 'h ' + $d.Minutes + 'min') }
  return ('em ' + $d.Minutes + 'min')
}
function ResetDay($epoch) {  # 7d: dia+hora "seg., 07:00"
  if (-not $epoch) { return $null }
  $dt = [DateTimeOffset]::FromUnixTimeSeconds([int64]$epoch).LocalDateTime
  $dias = @('dom','seg','ter','qua','qui','sex','sáb')
  return ($dias[[int]$dt.DayOfWeek] + '., ' + $dt.ToString('HH:mm'))
}

$payload = [ordered]@{
  source = 'auto'
  plan   = 'Max (20x)'
  session      = @{ pct = (UtilPct (Get 'anthropic-ratelimit-unified-5h-utilization')); resetsLabel = (ResetRel (Get 'anthropic-ratelimit-unified-5h-reset')) }
  weeklyAll    = @{ pct = (UtilPct (Get 'anthropic-ratelimit-unified-7d-utilization')); resetsLabel = (ResetDay (Get 'anthropic-ratelimit-unified-7d-reset')) }
  weeklySonnet = @{ pct = $null }  # não exposto pela API
}
if ($null -eq $payload.session.pct -and $null -eq $payload.weeklyAll.pct) { Write-Warning 'headers sem utilization — pulando.'; exit 0 }

# --- envia ao painel (port-forward + headers de admin de borda) ---
$json = ($payload | ConvertTo-Json -Depth 6)
$pf = Start-Job -ScriptBlock { param($p) kubectl port-forward svc/reqhub-api -n apps "$($p):8080" } -ArgumentList $Port
try {
  Start-Sleep -Seconds 4
  $headers = @{ 'Content-Type' = 'application/json'; 'X-Auth-Request-Email' = 'plan-sync@host'; 'X-Auth-Request-Groups' = 'platform-admins' }
  $r = Invoke-RestMethod -Uri "http://localhost:$Port/v1/ai-usage/subscription" -Method Post -Headers $headers -Body $json -TimeoutSec 20
  Write-Host ("[claude-plan] OK sessao=$($r.session.pct)% (reset $($r.session.resetsLabel)) | semanal=$($r.weeklyAll.pct)% (reset $($r.weeklyAll.resetsLabel)) | src=$($r.source)") -ForegroundColor Green
} finally { Stop-Job $pf -ErrorAction SilentlyContinue; Remove-Job $pf -Force -ErrorAction SilentlyContinue }
