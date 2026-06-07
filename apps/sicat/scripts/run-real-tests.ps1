#!/usr/bin/env pwsh

# Script para executar testes REAIS com credenciais do HAR file
# Credenciais extraídas de: docs/cetesb/mtr.cetesb.sp.gov.br_login.har

Write-Host "=" * 70
Write-Host "EXECUTANDO TESTES REAIS CONTRA CETESB"
Write-Host "=" * 70
Write-Host ""

# Credenciais extraidas do HAR file
$env:CETESB_USERNAME = "31913781000139"
$env:CETESB_PASSWORD = "2dlzft"
$env:CETESB_GATEWAY_MODE = "real"

Write-Host "Autenticacao:"
Write-Host "  Usuario: $($env:CETESB_USERNAME)"
Write-Host "  Modo: $($env:CETESB_GATEWAY_MODE)"
Write-Host ""
Write-Host "Iniciando testes..."
Write-Host ""

# Executar os testes reais
node tests/smoke/manifest-real-integration.test.js

$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "=" * 70

if ($exitCode -eq 0) {
    Write-Host "SUCESSO! Testes reais executados com sucesso!"
} else {
    Write-Host "FALHA! Alguns testes falharam (codigo: $exitCode)"
}

Write-Host "=" * 70

exit $exitCode
