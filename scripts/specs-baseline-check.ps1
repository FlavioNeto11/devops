#requires -Version 7.0
<#
.SYNOPSIS
  Valida a base de requisitos (specs/) contra o schema e checa se a baseline
  gerada (specs/baseline/*.json) está em dia com os artefatos versionados.

.DESCRIPTION
  Fonte da verdade orientada por requisitos: os artefatos vivem em
  specs/requirements/**/*.yaml; a baseline consumida pela UI e pelo Claude é
  gerada por specs/tools/build-baseline.mjs (determinística). Este script é o
  atalho LOCAL do operador (o CI roda o mesmo `--check` em ubuntu via node).

  - Sem flags: roda `--check` (NÃO escreve). Falha (exit 1) se houver erro de
    schema/integridade OU se a baseline commitada estiver desatualizada.
  - Com -Fix: regenera a baseline (specs/tools build) — use após editar requisitos.

.EXAMPLE
  .\scripts\specs-baseline-check.ps1
.EXAMPLE
  .\scripts\specs-baseline-check.ps1 -Fix
#>
[CmdletBinding()]
param([switch]$Fix)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tools = Join-Path $repoRoot 'specs/tools'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node ausente no PATH." }
if (-not (Test-Path (Join-Path $tools 'node_modules'))) {
  Write-Host "[specs] instalando deps de specs/tools..." -ForegroundColor Cyan
  Push-Location $tools
  try { npm ci --no-audit --no-fund --loglevel=error } finally { Pop-Location }
}

Push-Location $tools
try {
  if ($Fix) {
    # Cada gerador é checado: -Fix que falha no meio devolvia exit 0 e o caller (ex.: o passo
    # "regenerar baseline" do greenfield-launch) seguia verde com a baseline NÃO gerada (run
    # 28630602701, launch do besc-next). Fail-closed: primeiro erro aborta com exit 1.
    function Invoke-Gen { param([string]$Label, [string]$Script)
      Write-Host "[specs] $Label..." -ForegroundColor Cyan
      node $Script
      if ($LASTEXITCODE -ne 0) { Write-Host "[specs] FALHOU: $Script (exit $LASTEXITCODE) — baseline NÃO regenerada." -ForegroundColor Red; exit 1 }
    }
    Invoke-Gen 'regenerando baseline' 'build-baseline.mjs'
    Invoke-Gen 'regenerando índices (products/blueprints/capabilities)' 'build-products.mjs'
    Invoke-Gen 'atualizando history.json (diff vs baseline anterior)' 'emit-history.mjs'
    Invoke-Gen 'reconciliando implementation-status.json' 'impl-status.mjs'
    Invoke-Gen 'gerando coverage-report.json' 'coverage-report.mjs'
    Write-Host "[specs] baseline + history + status + coverage regenerados. Revise specs/baseline/ e commite junto com os requisitos." -ForegroundColor Green
  } else {
    node build-baseline.mjs --check
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[specs] baseline desatualizada ou inválida. Rode: scripts/specs-baseline-check.ps1 -Fix" -ForegroundColor Red
      exit 1
    }
    node impl-status.mjs --check
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[specs] implementation-status desatualizado. Rode: scripts/specs-baseline-check.ps1 -Fix" -ForegroundColor Red
      exit 1
    }
    node coverage-report.mjs --check
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[specs] coverage-report desatualizado. Rode: scripts/specs-baseline-check.ps1 -Fix" -ForegroundColor Red
      exit 1
    }
  }
} finally { Pop-Location }
