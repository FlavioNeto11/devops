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
    Write-Host "[specs] regenerando baseline..." -ForegroundColor Cyan
    node build-baseline.mjs
    Write-Host "[specs] atualizando history.json (diff vs baseline anterior)..." -ForegroundColor Cyan
    node emit-history.mjs
    Write-Host "[specs] baseline + history regenerados. Revise specs/baseline/ e commite junto com os requisitos." -ForegroundColor Green
  } else {
    node build-baseline.mjs --check
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[specs] baseline desatualizada ou inválida. Rode: scripts/specs-baseline-check.ps1 -Fix" -ForegroundColor Red
      exit 1
    }
  }
} finally { Pop-Location }
