#requires -Version 7.0
<#
.SYNOPSIS
  Troca o dominio publico da plataforma nas IngressRoutes (e na documentacao).
.DESCRIPTION
  Substitui o host antigo pelo novo host primario em TODOS os fontes do repo
  (*.yaml, *.yml, *.ps1, *.md): rotas do Traefik (Host(`...`)), values do Helm,
  rotas inline dos instaladores, gerador new-app.ps1 e docs. O host local
  (xpto.localhost) e PRESERVADO para desenvolvimento.

  Por padrao apenas EDITA os fontes (commit voce mesmo). Com -Apply, tambem
  reaplica as IngressRoutes que NAO sao gerenciadas pelo Argo (console, argocd,
  grafana, traefik). As apps sob GitOps (aplicacao1/2/3) atualizam via
  commit/push -> Argo auto-sync (evita conflito de selfHeal).
.EXAMPLE
  .\scripts\set-domain.ps1 -PrimaryHost nvit.io
  git add -A; git commit -m "chore: dominio nvit.io"; git push
  .\scripts\set-domain.ps1 -PrimaryHost nvit.io -OldHost nvit.io -ApplyOnly   # so reaplica
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$PrimaryHost,   # ex.: nvit.io
  [string]$OldHost = 'www.xpto.com',                    # host a ser substituido
  [string]$LocalHost = 'xpto.localhost',                # host local preservado
  [switch]$Apply,                                       # tambem reaplica rotas nao-Argo
  [switch]$ApplyOnly                                    # nao edita; so reaplica
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

if (-not $ApplyOnly) {
  Write-Host "== Substituindo host '$OldHost' -> '$PrimaryHost' nos fontes de $repo =="
  $files = Get-ChildItem -Recurse -File $repo -Include *.yaml, *.yml, *.ps1, *.md |
    Where-Object { $_.FullName -notmatch '\\\.git\\' -and $_.Name -ne 'set-domain.ps1' }
  $changed = @()
  foreach ($f in $files) {
    $raw = Get-Content $f.FullName -Raw
    if ($raw.Contains($OldHost)) {
      $raw.Replace($OldHost, $PrimaryHost) | Set-Content $f.FullName -Encoding utf8 -NoNewline
      $changed += $f.FullName.Substring($repo.Length + 1)
    }
  }
  Write-Host "Arquivos atualizados: $($changed.Count)"
  $changed | ForEach-Object { Write-Host "  $_" }
  if (-not $Apply) {
    Write-Host "`n[OK] Fontes atualizados. Proximos passos:"
    Write-Host "  git -C $repo add -A; git -C $repo commit -m 'chore: dominio $PrimaryHost'; git -C $repo push"
    Write-Host "  .\scripts\set-domain.ps1 -PrimaryHost $PrimaryHost -ApplyOnly   # reaplica no cluster"
    return
  }
}

# ---- Reaplicar rotas no cluster ----
Write-Host "`n== Reaplicando IngressRoutes (host: $PrimaryHost + $LocalHost) =="
$hosts = "Host(``$PrimaryHost``) || Host(``$LocalHost``)"

# Rotas NAO gerenciadas pelo Argo: console + traefik (apply direto dos manifests do repo)
foreach ($d in @("$repo\console\k8s", "$repo\platform\traefik")) {
  if (Test-Path $d) { kubectl apply -f $d 2>&1 | Where-Object { $_ -match 'ingressroute|middleware' } | Out-Host }
}
# argocd e grafana usam rotas inline -> reaplica aqui com o novo host
@"
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: argocd-server
  namespace: argocd
spec:
  entryPoints: [ web ]
  routes:
    - match: ($hosts) && PathPrefix(``/argocd``)
      kind: Rule
      priority: 10
      services:
        - name: argocd-server
          port: 80
"@ | kubectl apply -f - 2>&1 | Out-Host
@"
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: grafana
  namespace: observability
spec:
  entryPoints: [ web ]
  routes:
    - match: ($hosts) && PathPrefix(``/grafana``)
      kind: Rule
      priority: 10
      services:
        - name: kube-prometheus-stack-grafana
          port: 80
"@ | kubectl apply -f - 2>&1 | Out-Host

# Apps sob GitOps (aplicacao1/2/3): aplicar so se o Git ja estiver atualizado
# (rode o commit/push antes; assim o apply casa com o Git e o Argo nao reverte).
foreach ($d in (Get-ChildItem -Directory "$repo\samples" -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'k8s' })) {
  if (Test-Path $d) { kubectl apply -f $d 2>&1 | Where-Object { $_ -match 'ingressroute|middleware' } | Out-Host }
}
Write-Host "`n[OK] Rotas reaplicadas. Host primario: $PrimaryHost (local preservado: $LocalHost)."
