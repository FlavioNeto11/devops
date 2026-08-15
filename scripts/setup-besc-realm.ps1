#requires -Version 7.0
<#
.SYNOPSIS
  Provisiona o realm `besc` + client publico `besc-spa` no Keycloak da plataforma (idempotente).

.DESCRIPTION
  Script IDEMPOTENTE. Segue o padrao da plataforma (docs/sso-keycloak.md): realms/clients sao
  criados via kcadm DENTRO do pod do Keycloak (ns identity) — fora do git. Passos:
    1. Le as credenciais bootstrap do Secret `keycloak-secrets` (ns identity).
    2. Autentica o kcadm no realm master (server local do proprio pod).
    3. Cria o realm `besc` SE nao existir (auto-registro habilitado, e-mail como username).
    4. Cria o client OIDC publico `besc-spa` SE nao existir (Authorization Code + PKCE S256,
       sem direct access grants), com redirectUris/webOrigins dos 3 ambientes
       (dev.nvit.com.br, nvit.localhost e Vite dev :5173).
    5. Imprime o resumo (issuer publico/interno + client).

  NOTA (verifyEmail=false): a plataforma NAO tem SMTP configurado, entao a verificacao de
  e-mail do realm fica DESLIGADA por ora. Religar quando houver SMTP — o gate regulatorio do
  BESC (apps/besc/docs/evolution/10-gate-regulatorio.md) vai exigir isso antes de operacao real.

.PARAMETER Namespace
  Namespace do Keycloak (default: identity).

.PARAMETER Deployment
  Nome do Deployment do Keycloak (default: keycloak).

.EXAMPLE
  .\scripts\setup-besc-realm.ps1
#>
[CmdletBinding()]
param(
  [string]$Namespace = 'identity',
  [string]$Deployment = 'keycloak'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Command { param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Comando obrigatorio ausente no PATH: '$Name'." }
}
Assert-Command kubectl

$kcadm = '/opt/keycloak/bin/kcadm.sh'

# Executa kcadm dentro do pod. Argumentos passados como ARRAY ao kubectl exec (sem shell no
# meio) — valores com aspas/colchetes (JSON, attributes."chave") chegam literais ao kcadm.
function Invoke-Kcadm {
  param(
    [Parameter(Mandatory)][string[]]$KcadmArgs,
    [switch]$AllowFailure
  )
  $out = & kubectl exec -n $Namespace "deploy/$Deployment" -- $kcadm @KcadmArgs 2>&1
  $code = $LASTEXITCODE
  if ($code -ne 0 -and -not $AllowFailure) {
    # Nao ecoa os argumentos completos (podem conter credenciais) — so o comando.
    throw "kcadm falhou (exit $code) em '$($KcadmArgs[0]) $($KcadmArgs[1])': $($out | Out-String)"
  }
  return [pscustomobject]@{ ExitCode = $code; Output = ($out | Out-String) }
}

function Read-SecretKey { param([string]$Key)
  $b64 = kubectl -n $Namespace get secret keycloak-secrets -o jsonpath="{.data.$Key}"
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($b64)) {
    throw "Nao consegui ler a key '$Key' do Secret keycloak-secrets (ns $Namespace)."
  }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
}

# --- 1. credenciais bootstrap do Keycloak (Secret selado, ns identity) --------
Write-Host '== Keycloak :: lendo credenciais bootstrap (Secret keycloak-secrets) ==' -ForegroundColor Cyan
$adminUser = Read-SecretKey 'KC_BOOTSTRAP_ADMIN_USERNAME'
$adminPass = Read-SecretKey 'KC_BOOTSTRAP_ADMIN_PASSWORD'

# --- 2. login do kcadm no realm master ----------------------------------------
Write-Host '== Keycloak :: kcadm config credentials (realm master) ==' -ForegroundColor Cyan
Invoke-Kcadm -KcadmArgs @(
  'config', 'credentials',
  '--server', 'http://localhost:8080/auth',
  '--realm', 'master',
  '--user', $adminUser,
  '--password', $adminPass
) | Out-Null

# --- 3. realm besc (cria se nao existir) --------------------------------------
$realmCreated = $false
$check = Invoke-Kcadm -KcadmArgs @('get', 'realms/besc') -AllowFailure
if ($check.ExitCode -eq 0) {
  Write-Host "[OK] realm 'besc' ja existe — nada a fazer." -ForegroundColor Green
} else {
  Write-Host "== Keycloak :: criando realm 'besc' ==" -ForegroundColor Cyan
  Invoke-Kcadm -KcadmArgs @(
    'create', 'realms',
    '-s', 'realm=besc',
    '-s', 'enabled=true',
    '-s', 'registrationAllowed=true',          # auto-cadastro de investidores (doc 01 §1)
    '-s', 'registrationEmailAsUsername=true',
    # Sem SMTP na plataforma -> verificacao de e-mail DESLIGADA (religar quando houver;
    # o gate regulatorio vai exigir). resetPasswordAllowed tambem depende de SMTP.
    '-s', 'verifyEmail=false',
    '-s', 'resetPasswordAllowed=false',
    '-s', 'loginTheme=keycloak'
  ) | Out-Null
  $realmCreated = $true
  Write-Host "[OK] realm 'besc' criado." -ForegroundColor Green
}

# --- 4. client publico besc-spa (cria se nao existir) --------------------------
$clientCreated = $false
$clients = Invoke-Kcadm -KcadmArgs @('get', 'clients', '-r', 'besc', '-q', 'clientId=besc-spa', '--fields', 'id,clientId')
if ($clients.Output -match '"clientId"\s*:\s*"besc-spa"') {
  Write-Host "[OK] client 'besc-spa' ja existe — nada a fazer." -ForegroundColor Green
} else {
  Write-Host "== Keycloak :: criando client 'besc-spa' (publico, PKCE S256) ==" -ForegroundColor Cyan
  Invoke-Kcadm -KcadmArgs @(
    'create', 'clients', '-r', 'besc',
    '-s', 'clientId=besc-spa',
    '-s', 'protocol=openid-connect',
    '-s', 'publicClient=true',                 # SPA: sem client secret; PKCE obrigatorio
    '-s', 'standardFlowEnabled=true',          # Authorization Code
    '-s', 'directAccessGrantsEnabled=false',   # sem password grant
    '-s', 'attributes."pkce.code.challenge.method"=S256',
    '-s', 'redirectUris=["https://dev.nvit.com.br/besc/*","http://nvit.localhost/besc/*","http://localhost:5173/*"]',
    '-s', 'webOrigins=["https://dev.nvit.com.br","http://nvit.localhost","http://localhost:5173"]'
  ) | Out-Null
  $clientCreated = $true
  Write-Host "[OK] client 'besc-spa' criado." -ForegroundColor Green
}

# --- 5. resumo ------------------------------------------------------------------
Write-Host ''
Write-Host '== Resumo ==' -ForegroundColor Cyan
Write-Host ("  realm  : besc {0}" -f ($realmCreated ? '(criado agora)' : '(ja existia)'))
Write-Host ("  client : besc-spa {0} — publico, PKCE S256, sem direct access grants" -f ($clientCreated ? '(criado agora)' : '(ja existia)'))
Write-Host '  issuer publico : https://dev.nvit.com.br/auth/realms/besc'
Write-Host '  userinfo interno: http://keycloak.identity.svc.cluster.local:8080/auth/realms/besc/protocol/openid-connect/userinfo'
Write-Host '  redirectUris   : https://dev.nvit.com.br/besc/* · http://nvit.localhost/besc/* · http://localhost:5173/*'
Write-Host '[OK] realm besc provisionado/verificado.' -ForegroundColor Green
