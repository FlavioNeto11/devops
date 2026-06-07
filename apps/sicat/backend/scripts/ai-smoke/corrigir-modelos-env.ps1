$ErrorActionPreference = "Stop"

function Update-EnvFile {
  param(
    [string]$Path,
    [hashtable]$Values
  )

  $dir = Split-Path -Parent $Path

  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  if (-not (Test-Path $Path)) {
    New-Item -ItemType File -Path $Path -Force | Out-Null
  }

  $lines = Get-Content -Path $Path -Encoding UTF8
  $output = New-Object System.Collections.Generic.List[string]
  $updated = @{}

  foreach ($line in $lines) {
    if ($line -match '^\s*([^#=\s]+)\s*=') {
      $key = $Matches[1].Trim()

      if ($Values.ContainsKey($key)) {
        if (-not $updated.ContainsKey($key)) {
          $output.Add("$key=$($Values[$key])")
          $updated[$key] = $true
        }

        continue
      }
    }

    $output.Add($line)
  }

  foreach ($key in $Values.Keys) {
    if (-not $updated.ContainsKey($key)) {
      $output.Add("$key=$($Values[$key])")
    }
  }

  Set-Content -Path $Path -Value $output -Encoding UTF8
}

function Ensure-GitIgnoreEntry {
  param([string]$Entry)

  $gitignorePath = ".gitignore"

  if (-not (Test-Path $gitignorePath)) {
    Set-Content -Path $gitignorePath -Value @($Entry) -Encoding UTF8
    return
  }

  $content = Get-Content -Path $gitignorePath -Encoding UTF8

  if ($content -notcontains $Entry) {
    Add-Content -Path $gitignorePath -Value $Entry -Encoding UTF8
  }
}

$rootValues = @{
  "OPENAI_AGENT_MODEL"      = "gpt-5-mini"
  "OPENAI_SYNTHESIS_MODEL"  = "gpt-4.1-mini"
  "OPENAI_ESCALATION_MODEL" = "gpt-5.1"
  "OPENAI_MODEL"            = "gpt-5-mini"
}

$smokeValues = @{
  "OPENAI_AGENT_MODEL"                      = "gpt-5-mini"
  "OPENAI_SYNTHESIS_MODEL"                  = "gpt-4.1-mini"
  "OPENAI_JUDGE_MODEL"                      = "gpt-4.1-mini"
  "OPENAI_ESCALATION_MODEL"                 = "gpt-5.1"
  "OPENAI_MODEL"                            = "gpt-5-mini"
  "SICAT_AI_SMOKE_ALLOW_MUTATIONS"          = "false"
  "SICAT_AI_SMOKE_FORCE_SAFE_PROMPT_PREFIX" = "true"
  "SICAT_AI_SMOKE_TIMEOUT_MS"               = "45000"
  "SICAT_AI_SMOKE_CONCURRENCY"              = "1"
  "SICAT_AI_SMOKE_OUTPUT_DIR"               = "artifacts/ai-smoke"
}

Update-EnvFile -Path ".env" -Values $rootValues
Update-EnvFile -Path "scripts\ai-smoke\.env" -Values $smokeValues

Ensure-GitIgnoreEntry ".env"
Ensure-GitIgnoreEntry ".env.*"
Ensure-GitIgnoreEntry "scripts/ai-smoke/.env"
Ensure-GitIgnoreEntry "artifacts/ai-smoke/"

Write-Host ""
Write-Host "Ambientes atualizados sem duplicar chaves." -ForegroundColor Green
Write-Host ""
Write-Host ".env raiz:" -ForegroundColor Cyan
Write-Host "OPENAI_AGENT_MODEL=gpt-5-mini"
Write-Host "OPENAI_SYNTHESIS_MODEL=gpt-4.1-mini"
Write-Host "OPENAI_ESCALATION_MODEL=gpt-5.1"
Write-Host "OPENAI_MODEL=gpt-5-mini"
Write-Host ""
Write-Host "scripts/ai-smoke/.env:" -ForegroundColor Cyan
Write-Host "OPENAI_AGENT_MODEL=gpt-5-mini"
Write-Host "OPENAI_SYNTHESIS_MODEL=gpt-4.1-mini"
Write-Host "OPENAI_JUDGE_MODEL=gpt-4.1-mini"
Write-Host "OPENAI_ESCALATION_MODEL=gpt-5.1"
Write-Host "OPENAI_MODEL=gpt-5-mini"
Write-Host ""
Write-Host "Tambem garanti entradas no .gitignore para evitar commit de .env e artifacts." -ForegroundColor Yellow
Write-Host "Reinicie o backend para carregar o novo modelo." -ForegroundColor Yellow
