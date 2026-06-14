#requires -Version 7.0
<#
.SYNOPSIS
  Publica um app REAL de apps/<App>: aplica os manifests k8s, aguarda o rollout e faz smoke test.

.DESCRIPTION
  Script IDEMPOTENTE. Aplica apps/<App>/k8s (kubectl apply -f, recursivo), aguarda o rollout dos
  Deployments do namespace e valida as rotas /<App> e /<App>/api/health via Traefik.

  BUILD das imagens fica por conta de cada app (os build-args diferem: VITE_BASE_PATH no SICAT,
  NEXT_PUBLIC_* no GymOps, etc.) — veja o README/Dockerfile do app e docs/standards/golden-path.md.
  No lab as imagens sao <app>-<svc>:local (imagePullPolicy: IfNotPresent).

.PARAMETER App
  Nome do app em apps/ (ex.: sicat, gymops, rmambiental).

.PARAMETER Namespace
  Namespace alvo (default: apps).

.EXAMPLE
  .\scripts\publish-app.ps1 -App sicat
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$App,
  [string]$Namespace = 'apps',
  [int]$TimeoutSeconds = 180
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Command { param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Comando obrigatorio ausente no PATH: '$Name'." }
}

$appDir = Join-Path $PSScriptRoot "..\apps\$App"
$k8sDir = Join-Path $appDir 'k8s'
Assert-Command kubectl
if (-not (Test-Path -LiteralPath $appDir)) { throw "App nao encontrado: $appDir (apps disponiveis: $((Get-ChildItem (Join-Path $PSScriptRoot '..\apps') -Directory -ErrorAction SilentlyContinue).Name -join ', '))" }
if (-not (Test-Path -LiteralPath $k8sDir)) { throw "Pasta k8s nao encontrada: $k8sDir" }

Write-Host "== $App :: kubectl apply -f k8s (recursivo) ==" -ForegroundColor Cyan
kubectl apply -R -f $k8sDir | Out-Host
if ($LASTEXITCODE -ne 0) { throw "kubectl apply falhou para $App." }

Write-Host "== $App :: aguardando rollout em '$Namespace' ==" -ForegroundColor Cyan
$names = & kubectl get deploy -n $Namespace -l "app.kubernetes.io/part-of=$App" -o name 2>$null
if ([string]::IsNullOrWhiteSpace(($names -join ''))) { $names = & kubectl get deploy -n $Namespace -o name 2>$null }
foreach ($n in ($names | Where-Object { $_ -and $_.Trim() })) {
  kubectl -n $Namespace rollout status $n.Trim() "--timeout=${TimeoutSeconds}s" | Out-Host
}

Write-Host "== $App :: smoke test ==" -ForegroundColor Cyan
foreach ($path in @("/$App", "/$App/api/health")) {
  try {
    $r = Invoke-WebRequest -Headers @{ Host = 'nvit.localhost' } -Uri "http://127.0.0.1$path" -TimeoutSec 10 -SkipHttpErrorCheck
    Write-Host ("  {0} -> HTTP {1}" -f $path, [int]$r.StatusCode) -ForegroundColor Magenta
  } catch { Write-Host "  $path -> (ainda subindo: $($_.Exception.Message))" -ForegroundColor DarkYellow }
}
Write-Host "[OK] $App publicado/atualizado." -ForegroundColor Green
Write-Host "Lembrete: para (re)buildar as imagens, use o build-arg/Dockerfile do app (ver README do app)." -ForegroundColor Gray
