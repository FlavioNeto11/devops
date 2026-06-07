# 🧪 Testes de Integração MTR

Este documento descreve como executar testes contra o sistema CETESB.

## 📋 Tipos de Teste

### 1️⃣ **Testes Automatizados Locais**

Executa a suíte automatizada local com ambiente interno e integrações isoladas nos testes quando necessário.

```bash
npm test
```

**Características:**
- ✅ Rápido para feedback local
- ✅ Adequado para CI/CD
- ✅ Dependências externas isoladas quando necessário

**Testes inclusos:**
- ✅ POST /v1/manifestos/{id}/submit (API Routes)
- ✅ POST /v1/manifestos/{id}/cancel (Integration)
- ✅ POST /v1/manifestos create (Integration)
- ✅ GET /v1/manifestos fallback + upsert (Service)
- ✅ GET /v1/manifestos search (Integration)
- ✅ enqueueManifestSubmit (Integration)
- ✅ handleManifestSubmit (Worker)

**Resultado:** 40/40 testes passando

---

### 2️⃣ **Testes SEM MOCK** (REAL)

Executa testes contra CETESB real - valida integração de verdade.

#### 🔧 Opção A: PowerShell (Windows)

```powershell
# Com credenciais diretas
.\test-real-cetesb.ps1 -Username "seu_usuario" -Password "sua_senha"

# Ou lê do .env se configurado
.\test-real-cetesb.ps1
```

#### 🔧 Opção B: Bash (Linux/Mac)

```bash
# Com credenciais diretas
./test-real-cetesb.sh "seu_usuario" "sua_senha"

# Ou lê do .env se configurado
./test-real-cetesb.sh
```

#### 🔧 Opção C: Variáveis de Ambiente

```bash
export CETESB_USERNAME="seu_usuario"
export CETESB_PASSWORD="sua_senha"
export CETESB_GATEWAY_MODE="real"

node tests/smoke/manifest-real-integration.test.js
```

#### 🔧 Opção D: Arquivo .env

Adicione ao seu `.env`:

```env
CETESB_USERNAME=seu_usuario
CETESB_PASSWORD=sua_senha
CETESB_GATEWAY_MODE=real
```

Depois execute:

```bash
# PowerShell
.\test-real-cetesb.ps1

# Bash
./test-real-cetesb.sh

# Node direto
node tests/smoke/manifest-real-integration.test.js
```

**Nota sobre recaptchaToken**: Todos os testes usam `recaptchaToken: ""` (string vazia) pois CETESB **não valida** esse campo via API backend. Testes podem omitir o campo ou enviá-lo vazio sem impacto.

---

## 🧩 Testes Reais Inclusos

O arquivo `tests/smoke/manifest-real-integration.test.js` contém:

### ✅ Teste 1: Listar Manifestos Reais

```javascript
✓ deve listar manifestos reais da CETESB
```

**O que faz:**
- Autentica com credenciais reais na CETESB
- Recupera token JWT real
- Lista manifestos do usuário autenticado
- Valida resposta com dados reais

**Dados esperados:**
- Lista de manifestos com status real
- Paginação
- Metadados do sistema CETESB

---

### ✅ Teste 2: Criar Manifesto Real

```javascript
✓ deve criar manifesto real na CETESB
```

**O que faz:**
- Cria um manifesto localmente com dados de teste
- Valida persistência no banco
- Utiliza partners reais do exemplo CETESB

**Dados de Teste:**
- Driver: "Test Driver - Real"
- Placa: "TEST0001"
- Generator: 176163 (Nova IT)
- Carrier: 160627 (CASAMAX)
- Receiver: 40110 (MARDAN)

---

### ✅ Teste 3: Buscar Partners Reais

```javascript
✓ deve buscar dados de partners reais da CETESB
```

**O que faz:**
- Consulta partners reais do sistema CETESB
- Valida dados de resposta

---

## 📊 Fluxo de Autenticação Real

```
1. POST /api/mtr/carregaDadosLogin
   ↓ (enviar usuário/senha)
   ↓
2. ✅ Recebe JWT token válido
   ↓
3. Cria SessionContext local com token real
   ↓
4. Executa operações autenticadas
```

---

## 🔐 Segurança

### ⚠️ **IMPORTANTE**

- Nunca commit credenciais reais no repositório
- Use `.env` ou variáveis de ambiente
- `.env` está no `.gitignore` por padrão
- Token JWT válido por ~24h (configurável)

### ✅ Boas Práticas

1. **Credenciais em `.env` (local apenas)**
   ```env
   CETESB_USERNAME=seu_usuario_real
   CETESB_PASSWORD=sua_senha_real
   ```

2. **Em CI/CD, use secrets**
   ```yaml
   - name: Run Real CETESB Tests
     env:
       CETESB_USERNAME: ${{ secrets.CETESB_USERNAME }}
       CETESB_PASSWORD: ${{ secrets.CETESB_PASSWORD }}
     run: node tests/smoke/manifest-real-integration.test.js
   ```

3. **Nunca logging de credenciais**
   - O teste não imprime credenciais
   - Token é mascarado no output

---

## 📝 Variáveis de Ambiente Relevantes

```env
# Modo de gateway
CETESB_GATEWAY_MODE=real

# URLs
CETESB_BASE_URL=https://mtrr.cetesb.sp.gov.br
CETESB_API_BASE_URL=https://mtrr.cetesb.sp.gov.br
CETESB_PORTAL_ORIGIN=https://mtr.cetesb.sp.gov.br

# Autenticação
CETESB_USERNAME=seu_usuario       # Para testes reais
CETESB_PASSWORD=sua_senha         # Para testes reais

# Timeout
CETESB_REQUEST_TIMEOUT_MS=30000   # 30s por padrão

# Header
CETESB_TOKEN_HEADER_MODE=both     # "both", "authorization", ou "x-access-token"
CETESB_USER_AGENT=mtr-automation-node/3.0
```

---

## 🚀 Exemplo Completo (Windows)

```powershell
# 1. Abrir PowerShell na pasta do projeto
cd C:\GIT\PADILHA\sicat

# 2. Executar teste real com credenciais
.\test-real-cetesb.ps1 -Username "flavio.padilha" -Password "sua_senha_aqui"

# Saída esperada:
# ═══════════════════════════════════════════════════════════
# 🔐 Teste Real contra CETESB (SEM MOCK)
# ═══════════════════════════════════════════════════════════
#
# 🔐 Autenticando com usuário: flavio.padilha
# ✅ Login realizado
# ✅ Token JWT obtido para: Nova IT (code: 176163)
# ✅ Account criada: acc_real_xxxx
# ✅ SessionContext criada com token real: scx_real_xxxx
# 
# 📋 Manifestos encontrados: 15
# 📄 Total: 105
# ✅ Manifesto encontrado: man_xxxx
#    Status: draft
#    External: pending_submission
# ...
# ═══════════════════════════════════════════════════════════
# ✅ Testes REAL bem-sucedidos!
# ═══════════════════════════════════════════════════════════
```

---

## 🐛 Troubleshooting

### ❌ "Login failed: 401"

**Causa:** Credenciais incorretas

**Solução:**
- Verificar usuário/senha no portal CETESB
- Tentar login manual em: https://mtr.cetesb.sp.gov.br

### ❌ "Error: ECONNREFUSED"

**Causa:** Sem acesso à internet ou CETESB offline

**Solução:**
- Verificar conexão de internet
- Verificar status de https://mtrr.cetesb.sp.gov.br

### ❌ "Timeout after 30s"

**Causa:** CETESB lento ou timeout curto

**Solução:**
```bash
# Aumentar timeout para 60s
CETESB_REQUEST_TIMEOUT_MS=60000 node tests/smoke/manifest-real-integration.test.js
```

### ⚠️ "SKIPPING REAL CETESB TEST"

**Causa:** Credenciais não configuradas

**Solução:**
```bash
# Opção 1: Adicionar ao .env
echo "CETESB_USERNAME=seu_usuario" >> .env
echo "CETESB_PASSWORD=sua_senha" >> .env

# Opção 2: Usar script com parâmetros
.\test-real-cetesb.ps1 -Username "seu_usuario" -Password "sua_senha"

# Opção 3: Variáveis de ambiente
$env:CETESB_USERNAME = "seu_usuario"; $env:CETESB_PASSWORD = "sua_senha"; node tests/smoke/manifest-real-integration.test.js
```

---

---

## ✅ Próximos Passos

1. **Testes Locais**
   ```bash
   npm test
   ```

2. **Testes Reais** (quando tiver credenciais)
   ```bash
   .\test-real-cetesb.ps1 -Username "seu_usuario" -Password "sua_senha"
   ```

3. **CI/CD Pipeline**
   - Executar suíte local isolada em CI/CD
   - Executar testes reais em staging (com secrets)

---

## 📞 Suporte

Para dúvidas sobre:
- **Testes real**: Ver comentários em `tests/smoke/manifest-real-integration.test.js`
- **Configuração CETESB**: Ver `src/lib/config.js`
- **Gateway CETESB**: Ver `src/gateways/cetesb-gateway.js`
