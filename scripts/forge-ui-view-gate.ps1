#requires -Version 7.0
<#
.SYNOPSIS
  Gate determinístico de CONTRATO do motor generate-ui (Forja 4.1 F4): valida os
  REFs e o CÓDIGO das views geradas contra o backend REAL antes do guard/PR.

.DESCRIPTION
  Lição do PR #211 (contaviva-360): o motor gerava views com contratos fabricados
  (campos errados, rotas inexistentes, multipart contra rota JSON-only, CTAs para
  rotas removidas, view inalcançável) e nada barrava o PR. Este gate roda, na
  ordem, DEPOIS do passo "Rodar o motor" e ANTES do passo "Guard de blast-radius"
  do workflow .github/workflows/greenfield-ui.yml:

    1. specs/tools/validate-refinement-contract.mjs --product <p>
       (REFs vs contrato; funciona também SEM openapi — tabela extraída do backend)
    2. specs/tools/validate-view-contracts.mjs --product <p>
       (api.js + views + router.js vs backend: rotas, métodos, payloads, enums,
        multipart, campos de resposta, navegação e alcançabilidade)

  FALHOU => exit 1 (o job para; branch/PR NÃO são criados). O diff do motor é
  preservado em forge-ui-diff.patch ANTES de falhar — o passo "Preservar diff do
  motor (artefato)" roda com if: always() e sobe o patch, então o trabalho caro
  (~1h de motor) não se perde: o operador analisa o patch e a saída estruturada
  dos validadores (forge-ui-gate-report.json) no log/artefato.

  Passo (1 linha de step) a inserir no greenfield-ui.yml entre "Rodar o motor" e
  "Guard de blast-radius":

    - name: Gate de contrato das views (falha => sem PR)
      run: pwsh -File scripts/forge-ui-view-gate.ps1 -Product $env:PRODUCT

.EXAMPLE
  .\scripts\forge-ui-view-gate.ps1 -Product contaviva-360
#>
param(
  [Parameter(Mandatory = $true)][string]$Product
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false  # checamos $LASTEXITCODE na mão

if ($Product -notmatch '^[a-z][a-z0-9-]{1,30}$') {
  Write-Host "::error::product inválido: '$Product'"
  exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path "apps/$Product")) {
  Write-Host "::error::apps/$Product não existe — nada a validar."
  exit 1
}

# deps das tools (yaml) — o runner pode estar num checkout limpo
if (-not (Test-Path 'specs/tools/node_modules')) {
  Push-Location specs/tools
  npm ci --silent 2>$null | Out-Null
  Pop-Location
}

$failed = $false
$report = [ordered]@{ product = $Product; steps = @() }

function Invoke-Gate([string]$label, [string[]]$cmd) {
  Write-Host "== $label =="
  $out = & node @cmd 2>&1
  $code = $LASTEXITCODE
  $out | ForEach-Object { Write-Host $_ }
  $script:report.steps += [ordered]@{ step = $label; exit = $code }
  if ($code -ne 0) {
    Write-Host "::error::$label REPROVOU (exit $code) — contrato fabricado detectado; branch/PR não serão criados."
    $script:failed = $true
  }
}

Invoke-Gate 'validate-refinement-contract (REFs vs contrato real)' @('specs/tools/validate-refinement-contract.mjs', '--product', $Product)
Invoke-Gate 'validate-view-contracts (views/api.js/router vs backend real)' @('specs/tools/validate-view-contracts.mjs', '--product', $Product)

$report | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 forge-ui-gate-report.json

if ($failed) {
  # preserva o diff do motor ANTES de falhar (o run é caro — nada se perde):
  # o passo "Preservar diff do motor (artefato)" (if: always()) sobe este patch.
  git add -AN 2>$null | Out-Null   # intent-to-add p/ o diff incluir arquivos NOVOS
  git diff | Set-Content -Encoding utf8 forge-ui-diff.patch
  Write-Host "::error::Gate de contrato das views REPROVOU — diff preservado em forge-ui-diff.patch (artefato forge-ui-diff)."
  exit 1
}

Write-Host "::notice::Gate de contrato das views OK para '$Product' — segue para o guard de blast-radius."
exit 0
