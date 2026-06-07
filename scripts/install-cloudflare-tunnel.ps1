#requires -Version 7.0
<#
.SYNOPSIS
  Instala o conector do Cloudflare Tunnel (cloudflared) como servico Windows,
  ligando os dominios (nvit.io / nvit.com.br) ao Traefik local (localhost:80)
  SEM abrir portas/firewall. O TLS publico (HTTPS) e terminado na Cloudflare.
.DESCRIPTION
  Modelo "remotely-managed": o tunnel e criado no painel da Cloudflare (Zero Trust),
  e este script apenas instala o conector com o TOKEN. As regras de Public Hostname
  (nvit.io -> http://localhost:80) ficam no painel. Guia completo em
  docs/cloudflare-tunnel-setup.md.
.EXAMPLE
  .\scripts\install-cloudflare-tunnel.ps1                       # mostra os passos manuais
  .\scripts\install-cloudflare-tunnel.ps1 -TunnelToken eyJ...   # instala o conector
  .\scripts\install-cloudflare-tunnel.ps1 -Uninstall           # remove o servico
#>
[CmdletBinding()]
param([string]$TunnelToken, [switch]$Uninstall)
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

if (-not $TunnelToken) {
  Write-Host @"

============================================================================
 ACAO MANUAL NECESSARIA - token do tunnel ausente
============================================================================
Faca UMA vez (detalhes em docs/cloudflare-tunnel-setup.md):

 1) Conta Cloudflare (gratis) -> Add a site -> adicione 'nvit.io' (e 'nvit.com.br').
    A Cloudflare importa os registros atuais. Depois, na HOSTINGER, troque os
    NAMESERVERS do dominio pelos dois que a Cloudflare indicar.

 2) Cloudflare -> Zero Trust -> Networks -> Tunnels -> Create a tunnel
    -> Cloudflared -> nome 'nvit-local' -> Save.

 3) Na tela "Install connector" (Windows), COPIE o TOKEN (string longa eyJ...).

 4) Aba "Public Hostnames" do tunnel -> Add:
       Subdomain: (vazio)   Domain: nvit.io   ->  Service: HTTP   URL: localhost:80
    (opcional) Subdomain: *  Domain: nvit.io  ->  Service: HTTP   URL: localhost:80

 5) Rode de novo, agora com o token:
       .\scripts\install-cloudflare-tunnel.ps1 -TunnelToken <SEU_TOKEN>

 6) (Redirect nvit.com.br -> nvit.io) Cloudflare -> dominio nvit.com.br ->
    Rules -> Redirect Rules -> dynamic redirect para https://nvit.io + path.
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
Write-Host "Valide (apos o DNS propagar): https://nvit.io/devops  e  https://nvit.io/aplicacao1"
Write-Host "Lembre: as rotas internas ja aceitam o host nvit.io (scripts/set-domain.ps1)."
