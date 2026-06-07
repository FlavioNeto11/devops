# 🧪 Testes Sem Mock - Guia Rápido

## 🎯 Objetivo

Executar testes **de verdade** contra a CETESB, sem respostas mockadas.

## 🚀 3 Maneiras de Testar

### 1️⃣ **Mais Fácil: Menu Interativo**

```powershell
.\run-tests.ps1
```

Escolha a opção e siga as instruções na tela.

---

### 2️⃣ **Rápido: Script com Credenciais**

**Windows (PowerShell):**
```powershell
.\test-real-cetesb.ps1 -Username "seu_usuario" -Password "sua_senha"
```

**Linux/Mac (Bash):**
```bash
./test-real-cetesb.sh "seu_usuario" "sua_senha"
```

---

### 3️⃣ **Avançado: Node Direto**

**PowerShell:**
```powershell
$env:CETESB_USERNAME = "seu_usuario"
$env:CETESB_PASSWORD = "sua_senha"
node tests/smoke/manifest-real-integration.test.js
```

**Bash:**
```bash
export CETESB_USERNAME="seu_usuario"
export CETESB_PASSWORD="sua_senha"
node tests/smoke/manifest-real-integration.test.js
```

---

## 📝 Alternativa: Usar .env

Adicione ao arquivo `.env` no raiz do projeto:

```env
CETESB_USERNAME=seu_usuario
CETESB_PASSWORD=sua_senha
CETESB_GATEWAY_MODE=real
```

Depois execute:
```powershell
.\test-real-cetesb.ps1
```

---

## ✅ Testes Inclusos

Quando você executa os testes reais, são testados:

1. **Listar Manifestos** - Busca manifestos reais da sua conta CETESB
2. **Criar Manifesto** - Cria um manifesto de teste localmente
3. **Buscar Partners** - Consulta parceiros reais

---

## 🔐 Segurança

- **Credenciais não são gravadas em arquivo**
- **Token JWT é obtido em tempo real**
- **Dados sensíveis não aparecem em logs**
- **Seu .env está protegido (.gitignore)**

---

## 📞 Precisa de Ajuda?

1. **Erro de login**: Verifique suas credenciais CETESB
2. **Conexão recusada**: Verifique internet/VPN
3. **Timeout**: Aumentar timeout: `CETESB_REQUEST_TIMEOUT_MS=60000`

Ver mais detalhes em: `docs/TESTING.md`

---

## 🎓 Exemplo Completo

```powershell
# Windows PowerShell - Tudo de uma vez

$username = "seu_usuario_cetesb"
$password = "sua_senha_cetesb"

.\test-real-cetesb.ps1 -Username $username -Password $password

# Saída esperada:
# ✅ Login realizado
# ✅ Token JWT obtido
# ✅ 15 manifestos encontrados
# ✅ Manifesto criado localmente
# ✅ Testes REAL bem-sucedidos!
```

---

**Pronto! Seus testes estão configurados para rodar contra CETESB real.**
