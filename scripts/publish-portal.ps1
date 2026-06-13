#requires -Version 7.0
<#
.SYNOPSIS
  Release GitOps do Portal NovaIT: builda imagem imutável, fixa a tag NO MANIFEST (git),
  commita e aplica. Rollback = `git revert`. Falha alto (sem falso sucesso).

.DESCRIPTION
  GitOps REAL: a tag da imagem é a fonte da verdade em `portal/k8s/portal.yaml`; o Argo CD
  (platform/argocd/apps/portal.yaml) reconcilia esse manifest. Este script NÃO usa
  `kubectl set image` nem `ignoreDifferences`. Passos (idempotente, mas exige árvore RASTREADA
  limpa — o bump do manifest precisa ser o único commit):
    1. Build `portal-frontend:<gitsha>` (imutável) + alias `:local`.
    2. Troca o `image:` em `portal/k8s/portal.yaml` para o `<gitsha>`.
    3. `git commit` + `git push` do bump (o Argo aplica; aqui também `kubectl apply` p/ feedback).
    4. Aguarda rollout e faz smoke — **THROW** se rollout/`/`/`/healthz` falharem.
  Cada release é uma imagem distinta ⇒ `git revert` do bump volta a versão anterior de verdade.
  A imagem é LOCAL (Docker Desktop compartilha o daemon; `IfNotPresent`, sem registry). O CI publica
  o mesmo artefato em GHCR (`ghcr.io/flavioneto11/portal/frontend:<sha>`) para portabilidade.

.PARAMETER NoPush
  Commita o bump localmente mas não dá `git push` (o Argo só verá após push/refresh).

.EXAMPLE
  .\scripts\publish-portal.ps1
#>
[CmdletBinding()]
param(
  [switch]$NoPush,
  [int]$TimeoutSeconds = 120
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Command { param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Comando obrigatorio ausente no PATH: '$Name'." }
}
function Invoke-Checked { param([string]$What, [scriptblock]$Block)
  & $Block
  if ($LASTEXITCODE -ne 0) { throw "Falhou (exit $LASTEXITCODE): $What" }
}
Assert-Command kubectl; Assert-Command git; Assert-Command docker

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ns = 'devops-system'
$manifest = Join-Path $repoRoot 'portal/k8s/portal.yaml'
$buildDir = Join-Path $repoRoot 'portal/frontend'

# Exige árvore RASTREADA limpa (o único commit deve ser o bump do manifest).
if (git -C $repoRoot status --porcelain --untracked-files=no) {
  throw "Há mudanças rastreadas não commitadas. Commite/descarte antes do release (o bump do manifest precisa ser isolado)."
}
$sha = (git -C $repoRoot rev-parse --short HEAD).Trim()
$image = "portal-frontend:$sha"

Write-Host "== portal :: docker build $image (+ :local) ==" -ForegroundColor Cyan
Invoke-Checked "docker build" { docker build -t $image -t 'portal-frontend:local' $buildDir | Out-Host }

Write-Host "== portal :: bump do image no manifest -> $image ==" -ForegroundColor Cyan
$content = Get-Content $manifest -Raw
$bumped = [regex]::Replace($content, 'image:\s*portal-frontend:\S+', "image: $image")
if ($bumped -eq $content) { throw "Não encontrei 'image: portal-frontend:<tag>' em $manifest para bumpar." }
Set-Content -Path $manifest -Value $bumped -NoNewline

Write-Host "== portal :: commit + push do bump ==" -ForegroundColor Cyan
Invoke-Checked "git add" { git -C $repoRoot add portal/k8s/portal.yaml }
Invoke-Checked "git commit" { git -C $repoRoot commit -m "chore(portal): deploy $sha" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" | Out-Host }
if (-not $NoPush) { Invoke-Checked "git push" { git -C $repoRoot push origin HEAD | Out-Host } }

# Aplica o manifest declarativo (mesma fonte que o Argo reconcilia) p/ feedback imediato.
Write-Host "== portal :: kubectl apply (declarativo) + rollout ==" -ForegroundColor Cyan
Invoke-Checked "kubectl apply" { kubectl apply -f $manifest | Out-Host }
Invoke-Checked "rollout status" { kubectl -n $ns rollout status deployment/portal "--timeout=${TimeoutSeconds}s" | Out-Host }

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
  Write-Host ("  {0} -> HTTP {1}" -f $path, $code) -ForegroundColor (($code -ge 200 -and $code -lt 400) ? 'Magenta' : 'Red')
  if ($code -lt 200 -or $code -ge 400) { throw "Smoke FALHOU em '$path' (HTTP $code) — release NÃO está saudável." }
}

Write-Host "[OK] portal $sha publicado e saudável." -ForegroundColor Green
Write-Host "Rollback (GitOps): git revert <commit do bump> ; o Argo (ou kubectl apply) volta o sha anterior." -ForegroundColor Gray
