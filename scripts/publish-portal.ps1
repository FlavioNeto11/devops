#requires -Version 7.0
<#
.SYNOPSIS
  Publica o Portal NovaIT (devops-system) com imagem IMUTÁVEL por commit (rollback confiável).

.DESCRIPTION
  Script IDEMPOTENTE. Diferente de um simples rebuild da tag `:local` (mutável, em que
  `kubectl rollout undo` NÃO restaura o conteúdo anterior), este script:
    1. Builda a imagem com uma tag IMUTÁVEL `portal-frontend:<gitsha>` (+ alias `:local`).
    2. Aplica o manifest (idempotente) e faz `kubectl set image` para o `<gitsha>`.
    3. Aguarda o rollout e faz smoke test (/ e /healthz).
  Como cada publicação é uma imagem distinta, `kubectl rollout undo` passa a restaurar a
  imagem anterior de verdade. O CI publica a mesma versão no GHCR
  (ghcr.io/flavioneto11/portal/frontend:<sha>) para histórico/portabilidade.

  O portal está sob Argo (platform/argocd/apps/portal.yaml) com `ignoreDifferences` no campo
  image — então o `set image` deste script NÃO é revertido pelo selfHeal.

.PARAMETER SkipBuild
  Não builda; só aplica + set image + rollout (usa a imagem :local já presente).

.EXAMPLE
  .\scripts\publish-portal.ps1
.EXAMPLE
  .\scripts\publish-portal.ps1 -SkipBuild
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [int]$TimeoutSeconds = 120
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Command { param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Comando obrigatorio ausente no PATH: '$Name'." }
}
Assert-Command kubectl
Assert-Command git

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ctx      = 'portal/frontend'
$ns       = 'devops-system'
$buildDir = Join-Path $repoRoot $ctx

# SHA curto do commit atual (tag imutável). Marca '-dirty' só se houver mudanças
# RASTREADAS não commitadas (ignora untracked, ex.: artefatos de outros processos).
$sha = (git -C $repoRoot rev-parse --short HEAD).Trim()
$dirty = (git -C $repoRoot status --porcelain --untracked-files=no) ? '-dirty' : ''
$tag = "$sha$dirty"
$image = "portal-frontend:$tag"

if (-not $SkipBuild) {
  Assert-Command docker
  Write-Host "== portal :: docker build $image (+ :local) ==" -ForegroundColor Cyan
  docker build -t $image -t 'portal-frontend:local' $buildDir | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'docker build falhou.' }
}

Write-Host "== portal :: kubectl apply -f portal/k8s/portal.yaml ==" -ForegroundColor Cyan
kubectl apply -f (Join-Path $repoRoot 'portal/k8s/portal.yaml') | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'kubectl apply falhou.' }

Write-Host "== portal :: set image (imutável) -> $image ==" -ForegroundColor Cyan
kubectl -n $ns set image deployment/portal "portal=$image" | Out-Host
kubectl -n $ns annotate deployment/portal `
  "devops.flavioneto/imageTag=$tag" "devops.flavioneto/commitSha=$sha" `
  "devops.flavioneto/image=$image" --overwrite | Out-Null

# Força novos pods mesmo quando a TAG não mudou (rebuild da mesma `:<sha>-dirty`
# ou `:local`): com imagePullPolicy IfNotPresent, um `set image` para a MESMA tag
# é no-op; o restart cria pods novos que pegam a imagem local recém-buildada.
Write-Host "== portal :: rollout restart (pega o rebuild da mesma tag) ==" -ForegroundColor Cyan
kubectl -n $ns rollout restart deployment/portal | Out-Host

Write-Host "== portal :: aguardando rollout ==" -ForegroundColor Cyan
kubectl -n $ns rollout status deployment/portal "--timeout=${TimeoutSeconds}s" | Out-Host

Write-Host "== portal :: smoke test ==" -ForegroundColor Cyan
foreach ($path in @('/', '/healthz')) {
  $code = 0
  for ($i = 1; $i -le 6; $i++) {
    try {
      $r = Invoke-WebRequest -Headers @{ Host = 'xpto.localhost' } -Uri "http://127.0.0.1$path" -TimeoutSec 8 -SkipHttpErrorCheck
      $code = [int]$r.StatusCode
      if ($code -ge 200 -and $code -lt 400) { break }
    } catch { $code = 0 }
    Start-Sleep -Seconds 2 # Traefik ainda propagando o endpoint do pod novo
  }
  $ok = ($code -ge 200 -and $code -lt 400)
  Write-Host ("  {0} -> HTTP {1}" -f $path, $code) -ForegroundColor ($ok ? 'Magenta' : 'DarkYellow')
}

Write-Host "[OK] portal publicado como $image." -ForegroundColor Green
Write-Host "Rollback confiável:" -ForegroundColor Gray
Write-Host "  kubectl -n $ns rollout undo deployment/portal        # volta a revisão anterior (imagem imutável distinta)" -ForegroundColor Gray
Write-Host "  kubectl -n $ns set image deployment/portal portal=portal-frontend:<sha-anterior>   # ou pinar um sha" -ForegroundColor Gray
