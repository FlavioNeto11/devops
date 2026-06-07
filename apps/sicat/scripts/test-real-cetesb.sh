#!/bin/bash

# Teste Real de Integração com CETESB
# Uso: ./test-real-cetesb.sh [username] [password]
# Exemplo: ./test-real-cetesb.sh "seu_usuario" "sua_senha"

set -e

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🔐 Teste Real contra CETESB (SEM MOCK)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Argumentos
USERNAME="${1:-}"
PASSWORD="${2:-}"

# Se não passou username/password, tentar ler do .env
if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then
    if [ -f .env ]; then
        echo "📝 Lendo .env..."
        while IFS='=' read -r key value; do
            if [ "$key" = "CETESB_USERNAME" ]; then
                USERNAME="$value"
            elif [ "$key" = "CETESB_PASSWORD" ]; then
                PASSWORD="$value"
            fi
        done < .env
    fi
fi

# Se ainda não tem, pedir ao usuário
if [ -z "$USERNAME" ]; then
    echo "❌ Credenciais não encontradas no .env"
    echo ""
    echo "Por favor, forneça suas credenciais CETESB:"
    echo ""
    read -p "👤 Usuário CETESB: " USERNAME
    read -sp "🔑 Senha CETESB: " PASSWORD
    echo ""
fi

if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then
    echo "❌ Credenciais obrigatórias não fornecidas"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🚀 Executando testes REAIS..."
echo "═══════════════════════════════════════════════════════════"
echo ""

# Executar com as credenciais
export CETESB_USERNAME="$USERNAME"
export CETESB_PASSWORD="$PASSWORD"
export CETESB_GATEWAY_MODE="real"

echo "⏱️  Iniciando testes em tempo real..."
echo "   Modo: REAL (sem mock)"
echo "   Gateway: CETESB"
echo ""

# Executar o teste
node tests/smoke/manifest-real-integration.test.js

if [ $? -eq 0 ]; then
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  ✅ Testes REAL bem-sucedidos!"
    echo "═══════════════════════════════════════════════════════════"
else
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  ❌ Testes REAL falharam"
    echo "═══════════════════════════════════════════════════════════"
    exit 1
fi
