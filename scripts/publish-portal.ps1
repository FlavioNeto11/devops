#requires -Version 7.0
<#
.SYNOPSIS
  Release GitOps do Portal NovaIT: builda a imagem, FIXA a tag no manifest (git), valida contra
  o cluster e só então publica. Tag = conteúdo (tree-sha de portal/frontend) ⇒ alinha com o CI.

.DESCRIPTION
  GitOps REAL: a tag da imagem é a fonte da verdade em `portal/k8s/portal.yaml`; o Argo CD reconcilia
  esse manifest (sem `kubectl set image` nem `ignoreDifferences`).

  TAG = `git rev-parse HEAD:portal/frontend` (12c) — o hash do CONTEÚDO de portal/frontend (assets,
  Dockerfile, nginx.conf). É determinístico: a MESMA tag sai aqui e no CI (que computa o mesmo tree-sha
  e publica `ghcr.io/flavioneto11/portal/frontend:<treesha>`). Assim a imagem que o manifest pina é
  exatamente a que o CI publica — pré-requisito para ativar GHCR-pull sem desalinhamento.

  Fluxo (exige árvore RASTREADA limpa — o bump precisa ser o único commit):
    1. Build `portal-frontend:<treesha>` (+ alias `:local`).
    2. Bump do `image:` no manifest + `git commit` LOCAL (ainda NÃO pushado).
    3. VALIDATE-THEN-PUSH: `kubectl apply` + rollout + smoke + `git push` — TUDO dentro de um try.
       Em QUALQUER falha (apply/rollout/smoke/PUSH): AUTO-ROLLBACK (descarta o commit do bump e
       reaplica o manifest anterior; cada passo do rollback é checado e avisa se não completou).
    4. Refresh do Argo (best-effort, com aviso se falhar) para alinhar o desired na hora.
  Rollback de um release já publicado: `git revert <commit do bump>` (o Argo reconcilia).

.PARAMETER NoPush
  Não dá `git push` (deploy local de validação; o Argo só verá após push/refresh).

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
Assert-Command kubectl; Assert-Command git; Assert-Command docker; Assert-Command tar

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ns = 'devops-system'
$manifest = Join-Path $repoRoot 'portal/k8s/portal.yaml'

# Exige árvore RASTREADA limpa (o único commit deve ser o bump do manifest).
if (git -C $repoRoot status --porcelain --untracked-files=no) {
  throw "Há mudanças rastreadas não commitadas. Commite/descarte antes do release (o bump precisa ser isolado)."
}

# Exige portal/frontend SEM mudanças não commitadas/untracked: como o build sai do
# `git archive HEAD` (abaixo), uma mudança local NÃO entraria na imagem — o operador
# precisa commitar primeiro para o deploy refletir sua intenção. (Arquivos ignorados
# pelo .gitignore — node_modules, *.log — já não entram, pois não estão em HEAD.)
$ctxDirty = git -C $repoRoot status --porcelain -- portal/frontend
if ($ctxDirty) {
  throw "portal/frontend tem mudanças não commitadas (não entrariam no build de HEAD):`n$ctxDirty`nCommite antes do release."
}

# TAG = hash do CONTEÚDO de portal/frontend (igual aqui e no CI). Muda só quando o
# conteúdo muda; commits que só tocam portal/k8s (o bump) NÃO mudam a tag.
$tag = (git -C $repoRoot rev-parse 'HEAD:portal/frontend').Trim().Substring(0, 12)
$image = "portal-frontend:$tag"

# Já publicado este conteúdo? Então não há release novo (idempotente).
$current = ([regex]::Match((Get-Content $manifest -Raw), 'image:\s*portal-frontend:(\S+)')).Groups[1].Value
if ($current -eq $tag) {
  Write-Host "[OK] portal já está no conteúdo $tag (manifest inalterado) — nada a publicar." -ForegroundColor Green
  Write-Host "Para recriar o pod sem mudar conteúdo: kubectl -n $ns rollout restart deployment/portal" -ForegroundColor Gray
  return
}

# Build a partir de `git archive HEAD:portal/frontend` (SÓ o conteúdo versionado que
# o tree-sha representa). Garante bit-a-bit igual ao CI: nenhum arquivo do working
# tree (untracked OU ignorado pelo .gitignore, ex.: node_modules, *.log) entra na
# imagem. (PowerShell corromperia um pipe binário, então passa por arquivo/temp dir.)
Write-Host "== portal :: build de git archive HEAD:portal/frontend -> $image ==" -ForegroundColor Cyan
$ctxDir = Join-Path ([System.IO.Path]::GetTempPath()) "portal-ctx-$tag"
$ctxTar = "$ctxDir.tar"
Remove-Item $ctxDir, $ctxTar -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $ctxDir | Out-Null
try {
  Invoke-Checked "git archive" { git -C $repoRoot archive --format=tar -o $ctxTar 'HEAD:portal/frontend' }
  Invoke-Checked "tar extract" { tar -x -f $ctxTar -C $ctxDir }
  Invoke-Checked "docker build" { docker build -t $image -t 'portal-frontend:local' $ctxDir | Out-Host }
} finally {
  Remove-Item $ctxDir, $ctxTar -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "== portal :: bump do image no manifest -> $image ==" -ForegroundColor Cyan
$mraw = Get-Content $manifest -Raw
$bumped = [regex]::Replace($mraw, 'image:\s*portal-frontend:\S+', "image: $image")
if ($bumped -eq $mraw) { throw "Não encontrei 'image: portal-frontend:<tag>' em $manifest para bumpar." }
Set-Content -Path $manifest -Value $bumped -NoNewline

Write-Host "== portal :: commit local do bump (sem push ainda) ==" -ForegroundColor Cyan
Invoke-Checked "git add" { git -C $repoRoot add portal/k8s/portal.yaml }
Invoke-Checked "git commit" { git -C $repoRoot commit -m "chore(portal): deploy $tag" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" | Out-Host }

# AUTO-ROLLBACK: descarta o commit do bump (não pushado) e reaplica o manifest
# anterior. Cada passo é checado; avisa alto se o rollback NÃO completou.
function Invoke-AutoRollback { param([string]$Reason)
  Write-Host "== portal :: AUTO-ROLLBACK ($Reason) ==" -ForegroundColor Red
  $ok = $true
  git -C $repoRoot reset --hard HEAD~1 | Out-Host
  if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Host "  [ERRO] git reset --hard HEAD~1 falhou" -ForegroundColor Red }
  kubectl apply -f $manifest | Out-Host
  if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Host "  [ERRO] kubectl apply (rollback) falhou" -ForegroundColor Red }
  kubectl -n $ns rollout status deployment/portal "--timeout=${TimeoutSeconds}s" | Out-Host
  if ($LASTEXITCODE -ne 0) { $ok = $false; Write-Host "  [ERRO] rollout status (rollback) falhou" -ForegroundColor Red }
  if (-not $ok) { Write-Host "  [ATENCAO] ROLLBACK INCOMPLETO — verifique git (git log/status) e o cluster MANUALMENTE." -ForegroundColor Red }
  return $ok
}

# VALIDATE-THEN-PUSH: tudo (inclusive o push) dentro do try. Falha em QUALQUER passo
# (apply/rollout/smoke/push) dispara o auto-rollback — a main nunca fica adiantada
# de um deploy ruim nem atrás de um bom (push é o último passo validado).
try {
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
    if ($code -lt 200 -or $code -ge 400) { throw "Smoke FALHOU em '$path' (HTTP $code)." }
  }

  if (-not $NoPush) {
    Write-Host "== portal :: deploy saudável -> git push ==" -ForegroundColor Cyan
    Invoke-Checked "git push" { git -C $repoRoot push origin HEAD | Out-Host }
  }
} catch {
  $rolledBack = Invoke-AutoRollback -Reason $_.Exception.Message
  $tail = if ($rolledBack) { 'git local + cluster voltados ao estado anterior' } else { 'ATENCAO: o rollback pode NAO ter completado — verifique manualmente' }
  throw "Release FALHOU ($tail): $($_.Exception.Message)"
}

# Só chega aqui com tudo verde E pushado. Refresh do Argo (best-effort, com aviso).
if (-not $NoPush) {
  Write-Host "== portal :: refresh do Argo (alinha o desired ao novo commit) ==" -ForegroundColor Cyan
  kubectl -n argocd annotate application portal argocd.argoproj.io/refresh=hard --overwrite 2>$null | Out-Host
  if ($LASTEXITCODE -ne 0) { Write-Host "[AVISO] refresh do Argo falhou (nao-fatal; o auto-sync alinha no proximo poll)." -ForegroundColor Yellow }
}

Write-Host "[OK] portal $tag publicado e saudável." -ForegroundColor Green
Write-Host "Rollback: git revert <commit do bump> (o Argo reconcilia o conteúdo anterior)." -ForegroundColor Gray
