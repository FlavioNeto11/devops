#requires -Version 7.0
<#
.SYNOPSIS
  Cria/atualiza o Secret `reqhub-api-config` (ns apps) que LIGA a IA de autoria do
  Reqhub (reqhub-api). VOCÊ roda este script com a SUA OpenAI API key — o Claude NÃO
  insere credenciais (regra de segurança). O token (REQHUB_API_TOKEN) é gerado aqui.

.DESCRIPTION
  Sem este Secret, o reqhub-api responde 503 (fail-closed) e o workbench segue
  read-only normalmente. Com ele:
    - OPENAI_API_KEY: sua chave OpenAI (gpt-5) — passada por -OpenAiKey (nunca commitada).
    - token         : Bearer exigido nas rotas /reqs/api/v1/* (gerado aleatório aqui;
                      é o mesmo que você cola no painel de IA do Editor do Reqhub).

  LAB (default): aplica o Secret direto (kubectl). GITOPS (-Seal): emite um SealedSecret
  em apps/reqhub/k8s/reqhub-api-sealedsecret.yaml (commitável; o real nunca vai ao git).

.EXAMPLE
  # Lab: liga a IA agora e reinicia o pod
  .\scripts\setup-reqhub-secret.ps1 -OpenAiKey "sk-..."

.EXAMPLE
  # GitOps: gera o SealedSecret p/ commitar (precisa de kubeseal)
  .\scripts\setup-reqhub-secret.ps1 -OpenAiKey "sk-..." -Seal
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$OpenAiKey,
  [string]$Token,
  [string]$Namespace = 'apps',
  [switch]$Seal
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) { throw 'kubectl ausente no PATH.' }
if ([string]::IsNullOrWhiteSpace($OpenAiKey) -or $OpenAiKey -eq 'CHANGE_ME') { throw 'Informe sua OPENAI_API_KEY real em -OpenAiKey.' }

if ([string]::IsNullOrWhiteSpace($Token)) {
  $pool = [char[]]((48..57) + (97..122))   # 0-9a-z
  $Token = -join (1..40 | ForEach-Object { $pool | Get-Random })
  Write-Host "[reqhub] REQHUB_API_TOKEN gerado (guarde p/ colar no painel de IA do Editor):" -ForegroundColor Cyan
  Write-Host "         $Token" -ForegroundColor Yellow
}

# Monta o Secret como YAML (dry-run client) — nunca grava a key em disco fora do que você pedir.
$secretYaml = kubectl create secret generic reqhub-api-config -n $Namespace `
  --from-literal=OPENAI_API_KEY="$OpenAiKey" `
  --from-literal=token="$Token" `
  --dry-run=client -o yaml

if ($Seal) {
  if (-not (Get-Command kubeseal -ErrorAction SilentlyContinue)) { throw 'kubeseal ausente — instale (Sealed Secrets) ou rode sem -Seal (lab).' }
  $out = Join-Path $PSScriptRoot '..\apps\reqhub\k8s\reqhub-api-sealedsecret.yaml'
  $secretYaml | kubeseal --format yaml | Set-Content -Path $out -Encoding utf8
  Write-Host "[reqhub] SealedSecret -> $out (commitável; o Argo aplica). Faça commit/push." -ForegroundColor Green
} else {
  $secretYaml | kubectl apply -f -
  kubectl rollout restart deployment/reqhub-api -n $Namespace
  kubectl rollout status deployment/reqhub-api -n $Namespace --timeout=60s
  Write-Host "[reqhub] Secret aplicado e reqhub-api reiniciado. Verifique:" -ForegroundColor Green
  Write-Host "         (curl http://xpto.localhost/reqs/api/health  -> ai:true)" -ForegroundColor Green
}
