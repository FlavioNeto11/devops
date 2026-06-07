#!/usr/bin/env pwsh

<#
.SYNOPSIS
Teste Real de Integração com CETESB
.DESCRIPTION
Executa testes contra CETESB real sem mocking
.PARAMETER Username
Nome de usuário CETESB
.PARAMETER Password
Senha CETESB
.EXAMPLE
./test-real-cetesb.ps1 -Username "seu_usuario" -Password "sua_senha"
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$Username,
    
    [Parameter(Mandatory=$false)]
    [string]$Password
)

# Se não passou username/password, tentar ler do .env ou pedir ao usuário
if (-not $Username -or -not $Password) {
    Write-Host "═══════════════════════════════════════════════════════════"
    Write-Host "  🔐 Teste Real contra CETESB (SEM MOCK)"
    Write-Host "═══════════════════════════════════════════════════════════"
    Write-Host ""
    
    # Tentar carregar do .env
    if (Test-Path .env) {
        Write-Host "📝 Lendo .env..."
        $envContent = Get-Content .env
        foreach ($line in $envContent) {
            if ($line -match '^CETESB_USERNAME=(.+)$') {
                $Username = $matches[1]
            }
            if ($line -match '^CETESB_PASSWORD=(.+)$') {
                $Password = $matches[1]
            }
        }
    }
    
    # Se ainda não tem, pedir ao usuário
    if (-not $Username) {
        Write-Host "❌ Credenciais não encontradas no .env"
        Write-Host ""
        Write-Host "Por favor, forneça suas credenciais CETESB:"
        Write-Host ""
        $Username = Read-Host "👤 Usuário CETESB"
        $Password = Read-Host -AsSecureString "🔑 Senha CETESB" | ConvertFrom-SecureString -AsPlainText
    }
}

if (-not $Username -or -not $Password) {
    Write-Host "❌ Credenciais obrigatórias não fornecidas"
    exit 1
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════"
Write-Host "  🚀 Executando testes REAIS..."
Write-Host "═══════════════════════════════════════════════════════════"
Write-Host ""

# Executar com as credenciais
$env:CETESB_USERNAME = $Username
$env:CETESB_PASSWORD = $Password
$env:CETESB_GATEWAY_MODE = "real"

Write-Host "⏱️  Iniciando testes em tempo real..."
Write-Host "   Modo: REAL (sem mock)"
Write-Host "   Gateway: CETESB"
Write-Host ""

# Executar o teste
node tests/smoke/manifest-real-integration.test.js

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════"
    Write-Host "  ✅ Testes REAL bem-sucedidos!"
    Write-Host "═══════════════════════════════════════════════════════════"
} else {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════"
    Write-Host "  ❌ Testes REAL falharam"
    Write-Host "═══════════════════════════════════════════════════════════"
}

exit $LASTEXITCODE
