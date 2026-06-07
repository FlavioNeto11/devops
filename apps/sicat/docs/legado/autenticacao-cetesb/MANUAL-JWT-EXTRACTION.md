# 🔐 Como Obter JWT do CETESB para Testes

Este guia explica como obter um token JWT válido do CETESB manualmente para executar testes de impressão de MTR.

## ⚠️ Por Que Preciso Fazer Isso?

O login automatizado na CETESB requer **reCAPTCHA**, que expira rapidamente e não pode ser reutilizado de HARs antigos. Por isso, a forma mais confiável de testar é:

1. Fazer login manual via browser
2. Extrair o JWT válido
3. Usar o JWT nos testes

---

## 📋 Passo a Passo

### 1️⃣ Fazer Login no CETESB

1. Abra o browser (Chrome, Edge, Firefox)
2. Acesse: https://mtr.cetesb.sp.gov.br
3. Faça login com suas credenciais:
   - **CNPJ**: 31913781000139
   - **E-mail**: flavio_padilha_neto@msn.com
   - **Senha**: 2dlzft

### 2️⃣ Abrir DevTools

- **Windows/Linux**: `F12` ou `Ctrl+Shift+I`
- **Mac**: `Cmd+Option+I`

### 3️⃣ Ir para Application/Storage

1. Clique na aba **Application** (Chrome/Edge) ou **Storage** (Firefox)
2. No painel esquerdo, expanda **Local Storage**
3. Clique em **https://mtr.cetesb.sp.gov.br**

### 4️⃣ Copiar o Token

1. Procure a chave `access_token` ou `token` na lista
2. Clique no valor (começa com `eyJ...`)
3. Clique com botão direito → **Copy Value**
4. O token está copiado!

**Exemplo de como parece:**
```
Key: access_token
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNzYxNjMsMzMzOTQ4Iiwicm9sZSI6MSwiZXhwIjoxNzcyOTE0OTY4fQ.someSignatureHere123456...
```

---

## 🧪 Executar Teste com JWT

### Opção 1: Teste Completo de Impressão

```powershell
# Colar JWT entre aspas
node tests/manual/test-print-with-manual-jwt.js "eyJhbGc..."
```

Este teste vai:
- ✅ Criar session context com seu JWT
- ✅ Buscar manifestos de hoje (ou criar novo se não existir)
- ✅ Solicitar impressão do manifesto
- ✅ Aguardar worker processar
- ✅ Baixar PDF

### Opção 2: Usar JWT em Outros Scripts

```javascript
// Substituir no código
const REAL_JWT_TOKEN = "eyJhbGc..."; // Cole seu JWT aqui
```

---

## ⏰ Validade do Token

JWTs do CETESB geralmente expiram em **algumas horas**. O script vai verificar automaticamente se o token está válido:

```
✓ JWT fornecido: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  Expira em: 2026-03-09T23:42:48.000Z
  ✓ Válido por mais 180 minutos
```

Se expirado:
```
❌ JWT EXPIRADO! (expirou 45 minutos atrás)

Por favor, faça novo login e obtenha token atualizado.
```

---

## 🔍 Verificar JWT Rapidamente

Use o script de verificação:

```powershell
node scripts/check-jwt.js "eyJhbGc..."
```

Saída:
```
✅ JWT válido e não expirado
Expira em: 2026-03-09T23:42:48Z (em 3 horas)
```

---

## 🚀 Workflow Completo de Teste

### Setup (uma vez)

```powershell
# 1. Subir infraestrutura
docker compose up -d postgres

# 2. Migrations
npm run migrate

# 3. Iniciar API (modo REAL)
$env:CETESB_GATEWAY_MODE="real"
npm run dev
```

### Loop de Teste (repetir conforme necessário)

```powershell
# Terminal 1: API já rodando
# Terminal 2: Worker
npm run worker

# Terminal 3: Obter JWT do browser → Executar teste
node tests/manual/test-print-with-manual-jwt.js "SEU_JWT_AQUI"
```

---

## 📊 Exemplo de Execução Bem-Sucedida

```
╔═══════════════════════════════════════════════════════════╗
║  Teste: Impressão MTR com JWT Manual                    ║
╚═══════════════════════════════════════════════════════════╝

✓ JWT fornecido: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  Expira em: 2026-03-09T23:42:48.000Z
  ✓ Válido por mais 180 minutos

1️⃣  Criando session context...

Status: 201
✓ Session created: ctx_1741551234567
  Status: active

2️⃣  Buscando manifestos de hoje (09/03/2026)...

Status: 200
✓ Encontrados 3 manifestos

3️⃣  Imprimindo manifesto: mani_1741551234568

  Hash CETESB: ABC123XYZ789
  Status atual: submitted

Status: 202
✓ Print enqueued (202 Accepted)
  Command ID: cmd_1741551234569

4️⃣  Aguardando worker processar print...

⚠️  Execute em outro terminal: npm run worker

[1] Status: printing
[2] Status: printing
[3] Status: printed

✅ MTR impresso com sucesso!
   Documentos: 1
   - manifest_pdf: /v1/manifestos/mani_1741551234568/documents/doc_1741551234570/download

5️⃣  Baixando PDF do MTR...

→ GET http://127.0.0.1:8080/v1/manifestos/mani_1741551234568/documents/doc_1741551234570/download
✓ PDF baixado com sucesso!
  Tamanho: 45678 bytes
  Salvo em: storage/documents/mani_1741551234568/

╔═════════════════════════════════════════════════════════════╗
║  ✅ Teste de Impressão MTR - Sucesso!                      ║
╚═════════════════════════════════════════════════════════════╝

Fluxo executado:
  1. ✅ Session context criada com JWT manual
  2. ✅ Manifestos buscados (ou novo criado)
  3. ✅ Impressão solicitada
  4. ✅ Worker processou print
  5. ✅ PDF baixado

Manifesto ID: mani_1741551234568
Status final: printed
Documentos: 1
```

---

## 🐛 Troubleshooting

### ❌ JWT Expirado
**Problema**: `JWT EXPIRADO! (expirou X minutos atrás)`

**Solução**: Faça novo login no browser e copie token atualizado

### ❌ 401 Unauthorized
**Problema**: CETESB retorna 401 mesmo com token válido

**Possíveis causas**:
- Token corrompido ao copiar (verifique se copiou completo)
- Token de outro ambiente (produção vs staging)
- Sessão CETESB expirada no lado do servidor

**Solução**: Fazer logout completo, limpar cookies, fazer novo login

### ❌ Timeout Aguardando Worker
**Problema**: Worker não processa job

**Solução**:
```powershell
# Verificar se worker está rodando
npm run worker

# Verificar logs do worker
# Procurar por erros no terminal do worker
```

### ❌ PDF Não Baixa
**Problema**: Status muda para 'printed' mas PDF não aparece

**Verificar**:
```powershell
# Verificar se pasta foi criada
ls storage/documents/

# Verificar logs do worker
# Procurar por erro ao salvar PDF
```

---

## 📖 Referências

- **Script de teste**: `tests/manual/test-print-with-manual-jwt.js`
- **Script de verificação**: `scripts/check-jwt.js`
- **HAR de login**: `docs/cetesb/mtr.cetesb.sp.gov.br_login.har`
- **HAR de impressão**: `docs/cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har`
- **Decision Log**: `docs/copilot/13-decision-log.md` (DL-023)

---

## 💡 Dica: Salvar JWT em Arquivo

Para evitar copiar/colar repetidamente:

```powershell
# Criar arquivo com JWT (uma vez)
"eyJhbGc..." > storage/temp/current-jwt.txt

# Usar em testes
$jwt = Get-Content storage/temp/current-jwt.txt
node tests/manual/test-print-with-manual-jwt.js "$jwt"
```

⚠️ **NUNCA** commitar o arquivo `current-jwt.txt` no git! (já está em `.gitignore`)
