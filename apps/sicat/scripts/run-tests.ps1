#!/usr/bin/env pwsh

# Guia Rápido - Testes Reais CETESB
# 
# Este script mostra como executar testes reais (sem mock) contra CETESB

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗"
Write-Host "║  🧪 Testes de Integração com CETESB                       ║"
Write-Host "║                                                            ║"
Write-Host "║  📝 Escolha o tipo de teste:                              ║"
Write-Host "╚════════════════════════════════════════════════════════════╝"
Write-Host ""

$choice = Read-Host @"
Qual tipo de teste você quer executar?

1️⃣  MOCK (padrão, rápido, sem credenciais)
2️⃣  REAL (verdadeiro, requer credenciais CETESB)
3️⃣  Ver documentação
4️⃣  Sair

Digite o número (1-4)
"@

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "═══════════════════════════════════════════════════════════"
        Write-Host "  🧪 Executando TESTES COM MOCK"
        Write-Host "═══════════════════════════════════════════════════════════"
        Write-Host ""
        Write-Host "⏱️  Testes executarão em ~1.3 segundos"
        Write-Host "✅ Sem dependência de CETESB"
        Write-Host "✅ Sem credenciais necessárias"
        Write-Host ""
        npm test
    }

    "2" {
        Write-Host ""
        Write-Host "═══════════════════════════════════════════════════════════"
        Write-Host "  🔐 TESTES REAIS CONTRA CETESB"
        Write-Host "═══════════════════════════════════════════════════════════"
        Write-Host ""

        # Pedir credenciais
        $username = Read-Host "👤 Usuário CETESB"
        $password = Read-Host -AsSecureString "🔑 Senha CETESB" | ConvertFrom-SecureString -AsPlainText

        if (-not $username -or -not $password) {
            Write-Host "❌ Credenciais obrigatórias"
            exit 1
        }

        Write-Host ""
        Write-Host "⏱️  Conectando à CETESB..."
        Write-Host ""

        # Configurar e executar
        $env:CETESB_USERNAME = $username
        $env:CETESB_PASSWORD = $password
        $env:CETESB_GATEWAY_MODE = "real"

        node tests/smoke/manifest-real-integration.test.js

        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✅ TESTES REAIS PASSARAM!"
        } else {
            Write-Host ""
            Write-Host "❌ Alguns testes falharam"
            exit 1
        }
    }

    "3" {
        Write-Host ""
        Write-Host "📖 Abrindo documentação..."
        Write-Host ""
        
        if (Test-Path docs/TESTING.md) {
            # Tentar abrir com editor padrão
            & cmd /c start docs/TESTING.md
            Write-Host "✅ Documentação aberta em docs/TESTING.md"
        } else {
            Write-Host "❌ Arquivo docs/TESTING.md não encontrado"
        }
    }

    "4" {
        Write-Host "👋 Até logo!"
        exit 0
    }

    default {
        Write-Host "❌ Opção inválida"
        exit 1
    }
}

Write-Host ""
