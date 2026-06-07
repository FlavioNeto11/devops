#requires -Version 7.0
<#
.SYNOPSIS
  Instala o conector do Cloudflare Tunnel (cloudflared) como servico Windows,
  ligando os dominios (dev.nvit.com.br / nvit.com.br) ao Traefik local (localhost:80)
  SEM abrir portas/firewall. O TLS publico (HTTPS) e terminado na Cloudflare.
.DESCRIPTION
  Modelo "remotely-managed": o tunnel e criado no painel da Cloudflare (Zero Trust),
  e este script apenas instala o conector com o TOKEN. As regras de Public Hostname
  (dev.nvit.com.br -> http://localhost:80) ficam no painel. Guia completo em
  docs/cloudflare-tunnel-setup.md.
.EXAMPLE
  .\scripts\install-cloudflare-tunnel.ps1                       # mostra os passos manuais
  .\scripts\install-cloudflare-tunnel.ps1 -TunnelToken eyJ...   # instala o conector
  .\scripts\install-cloudflare-tunnel.ps1 -Uninstall           # remove o servico
#>
[CmdletBinding()]
param(
  [string]$TunnelToken,                 # modo painel (Zero Trust) - exige cartao
  [switch]$Cli,                         # modo CLI-managed (SEM cartao) - recomendado
  [string]$TunnelName = 'nvit-local',
  [string]$TunnelDomain = 'dev.nvit.com.br',
  [switch]$Uninstall
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

if ($Uninstall) {
  try { cloudflared service uninstall } catch { Write-Host $_.Exception.Message }
  Write-Host "[OK] Servico cloudflared removido."
  return
}

# 1) Instalar cloudflared se faltar
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "Instalando cloudflared via winget..."
  winget install -e --id Cloudflare.cloudflared --silent --accept-package-agreements --accept-source-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
Write-Host ("cloudflared: " + (cloudflared --version 2>&1 | Select-Object -First 1))

# ---------------------------------------------------------------------------
# Modo CLI-managed (SEM Zero Trust / SEM cartao). Requer 'cloudflared tunnel login'.
# ---------------------------------------------------------------------------
if ($Cli) {
  $userCfDir = Join-Path $env:USERPROFILE '.cloudflared'
  if (-not (Test-Path (Join-Path $userCfDir 'cert.pem'))) {
    Write-Host "`n[ACAO MANUAL] Autentique primeiro (abre o navegador; escolha o dominio '$TunnelDomain'; NAO pede cartao):" -ForegroundColor Yellow
    Write-Host "    cloudflared tunnel login"
    Write-Host "Depois rode de novo: .\scripts\install-cloudflare-tunnel.ps1 -Cli -TunnelDomain $TunnelDomain`n"
    return
  }
  Write-Host "Login OK (cert.pem encontrado)."
  # Criar o tunnel (idempotente)
  $tun = @(cloudflared tunnel list --output json 2>$null | ConvertFrom-Json) | Where-Object { $_ -and $_.name -eq $TunnelName } | Select-Object -First 1
  if (-not $tun) {
    cloudflared tunnel create $TunnelName 2>&1 | Out-Host
    $tun = @(cloudflared tunnel list --output json 2>$null | ConvertFrom-Json) | Where-Object { $_ -and $_.name -eq $TunnelName } | Select-Object -First 1
  }
  else { Write-Host "Tunnel '$TunnelName' ja existe." }
  if (-not $tun) { throw "Falha ao criar/listar o tunnel '$TunnelName'." }
  $uuid = $tun.id
  Write-Host "Tunnel '$TunnelName' id=$uuid"

  # Config + credenciais em pasta de sistema (o servico roda como SYSTEM)
  $sysDir = 'C:\cloudflared'
  New-Item -ItemType Directory -Force -Path $sysDir | Out-Null
  Copy-Item (Join-Path $userCfDir "$uuid.json") (Join-Path $sysDir "$uuid.json") -Force
  $cfg = @"
tunnel: $uuid
credentials-file: $sysDir\$uuid.json
ingress:
  - hostname: $TunnelDomain
    service: http://localhost:80
  - service: http_status:404
"@
  $cfgPath = Join-Path $sysDir 'config.yml'
  Set-Content $cfgPath $cfg -Encoding utf8
  Write-Host "Config: $cfgPath  (ingress $TunnelDomain -> http://localhost:80)"

  # Rota DNS (CNAME $TunnelDomain -> <uuid>.cfargotunnel.com)
  Write-Host "-> cloudflared tunnel route dns $TunnelName $TunnelDomain"
  cloudflared tunnel route dns $TunnelName $TunnelDomain 2>&1 | Out-Host

  # Instalar como servico Windows usando o config de sistema
  Write-Host "-> instalando servico (config de sistema)..."
  & cloudflared --config $cfgPath service install 2>&1 | Out-Host
  Start-Sleep -Seconds 4
  $svc = Get-Service cloudflared -ErrorAction SilentlyContinue
  if ($svc) {
    if ($svc.Status -ne 'Running') { try { Start-Service cloudflared } catch {} }
    Write-Host ("[OK] Servico cloudflared: {0}" -f (Get-Service cloudflared).Status)
  }
  else { Write-Host "[AVISO] servico nao encontrado; teste em 1o plano (abaixo)." }
  Write-Host "`n[OK] Tunnel CLI-managed configurado (sem Zero Trust/cartao)."
  Write-Host "Se o servico nao subir, teste em primeiro plano:"
  Write-Host "    cloudflared --config $cfgPath tunnel run $TunnelName"
  Write-Host "Valide (apos DNS propagar): https://$TunnelDomain/devops"
  return
}

if (-not $TunnelToken) {
  Write-Host @"

============================================================================
 ACAO MANUAL NECESSARIA - token do tunnel ausente
============================================================================
Faca UMA vez (detalhes em docs/cloudflare-tunnel-setup.md):

 1) Conta Cloudflare (gratis) -> Add a site -> adicione 'dev.nvit.com.br' (e 'nvit.com.br').
    A Cloudflare importa os registros atuais. Depois, na HOSTINGER, troque os
    NAMESERVERS do dominio pelos dois que a Cloudflare indicar.

 2) Cloudflare -> Zero Trust -> Networks -> Tunnels -> Create a tunnel
    -> Cloudflared -> nome 'nvit-local' -> Save.

 3) Na tela "Install connector" (Windows), COPIE o TOKEN (string longa eyJ...).

 4) Aba "Public Hostnames" do tunnel -> Add:
       Subdomain: (vazio)   Domain: dev.nvit.com.br   ->  Service: HTTP   URL: localhost:80
    (opcional) Subdomain: *  Domain: dev.nvit.com.br  ->  Service: HTTP   URL: localhost:80

 5) Rode de novo, agora com o token:
       .\scripts\install-cloudflare-tunnel.ps1 -TunnelToken <SEU_TOKEN>

 6) (Redirect nvit.com.br -> dev.nvit.com.br) Cloudflare -> dominio nvit.com.br ->
    Rules -> Redirect Rules -> dynamic redirect para https://dev.nvit.com.br + path.
============================================================================
"@
  return
}

# 2) Instalar o conector como servico com o token
Write-Host "Instalando o conector cloudflared como servico Windows..."
cloudflared service install $TunnelToken
Start-Sleep -Seconds 4
$svc = Get-Service cloudflared -ErrorAction SilentlyContinue
if ($svc) { Write-Host ("[OK] Servico cloudflared: {0}" -f $svc.Status) } else { Write-Host "[AVISO] servico cloudflared nao encontrado; verifique a saida acima." }
Write-Host "`nO tunnel liga os Public Hostnames (no painel) ao Traefik local (localhost:80)."
Write-Host "Valide (apos o DNS propagar): https://dev.nvit.com.br/devops  e  https://dev.nvit.com.br/aplicacao1"
Write-Host "Lembre: as rotas internas ja aceitam o host dev.nvit.com.br (scripts/set-domain.ps1)."
