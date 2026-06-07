#!/usr/bin/env pwsh
# Script de execução rápida dos testes de manifest submit

Write-Host "🧪 Executando testes de POST /v1/manifestos/:id/submit" -ForegroundColor Cyan
Write-Host ""

# Verifica se dependências estão instaladas
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Instalando dependências..." -ForegroundColor Yellow
    npm install
}

# Verifica se o banco está rodando
Write-Host "📦 Verificando banco de dados..." -ForegroundColor Yellow
$pgRunning = docker ps --filter "name=postgres" --filter "status=running" --format "{{.Names}}"
if (-not $pgRunning) {
    Write-Host "⚠️  Banco não está rodando. Subindo..." -ForegroundColor Yellow
    docker-compose up -d postgres
    Start-Sleep -Seconds 3
}

# Executa migrações
Write-Host "🔄 Executando migrações..." -ForegroundColor Yellow
npm run migrate

Write-Host ""
Write-Host "▶️  Executando testes..." -ForegroundColor Green
Write-Host ""

# Executa os testes
npm run test:manifest:submit

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Todos os testes passaram!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Alguns testes falharam. Verifique os logs acima." -ForegroundColor Red
    exit 1
}
