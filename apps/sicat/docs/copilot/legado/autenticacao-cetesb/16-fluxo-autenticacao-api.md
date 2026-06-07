# Fluxo de Autenticação Completo

Este guia demonstra o fluxo completo de autenticação do backend MTR CETESB.

## 1️⃣ Buscar Informações do Parceiro (Opcional)

Antes de fazer login, você pode consultar os dados do parceiro para validar o CNPJ/CPF e descobrir os usuários cadastrados.

```bash
curl -X GET "http://localhost:8080/v1/auth/partner-info?document=31913781000139" \
  -H "X-Correlation-Id: corr_partner_001"
```

**Resposta:**
```json
{
  "partnerCode": 176163,
  "description": "Nova IT",
  "document": "31913781000139",
  "state": {
    "code": 26,
    "abbreviation": "SP"
  },
  "registeredUsers": [
    {
      "accessCode": 333948,
      "name": "Flavio Padilha Neto",
      "email": "flavio_padilha_neto@msn.com"
    }
  ]
}
```

---

## 2️⃣ Fazer Login com Usuário e Senha

### Opção A: Login com reCAPTCHA Token (Automático)

Se você conseguiu resolver o reCAPTCHA programaticamente ou manualmente em outra interface:

```bash
curl -X POST "http://localhost:8080/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: corr_login_001" \
  -d '{
    "document": "31913781000139",
    "password": "2dlzft",
    "recaptchaToken": "03AGdBq24PBCd...XYZ"
  }'
```

### Opção B: Login sem reCAPTCHA (Receberá erro com instruções)

```bash
curl -X POST "http://localhost:8080/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: corr_login_002" \
  -d '{
    "document": "31913781000139",
    "password": "2dlzft"
  }'
```

**Resposta de Erro (400):**
```json
{
  "type": "https://api.exemplo.local/problems/recaptcha-required",
  "title": "reCAPTCHA Obrigatório",
  "status": 400,
  "code": "RECAPTCHA_REQUIRED",
  "detail": "Login requer reCAPTCHA. Forneça recaptchaToken válido ou resolva manualmente no portal CETESB.",
  "correlationId": "corr_login_002",
  "recaptchaSiteKey": "6LcXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "loginUrl": "https://sistemas.cetesb.sp.gov.br/sigor-mtr/login"
}
```

### Resposta de Sucesso (200)

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2026-03-08T23:59:59Z",
  "user": {
    "accessCode": 333948,
    "name": "Flavio Padilha Neto",
    "email": "flavio_padilha_neto@msn.com",
    "cpf": "37088641828",
    "document": "31913781000139",
    "documentType": "J"
  },
  "partner": {
    "code": 176163,
    "description": "Nova IT",
    "state": {
      "code": 26,
      "abbreviation": "SP"
    }
  }
}
```

---

## 3️⃣ Criar Session Context Automaticamente

Com o token obtido no login, crie um session context para reutilizar nas operações:

```bash
# Extrair dados da resposta do login
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
PARTNER_CODE=176163
USER_ACCESS_CODE=333948

curl -X POST "http://localhost:8080/v1/session-contexts" \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: corr_session_001" \
  -d '{
    "integrationAccountId": "acc_nova_it_prod",
    "partnerDocument": "31913781000139",
    "partnerType": "J",
    "partnerCode": 176163,
    "userAccessCode": 333948,
    "userName": "Flavio Padilha Neto",
    "email": "flavio_padilha_neto@msn.com",
    "authMode": "manual-token",
    "jwtToken": "'"$TOKEN"'",
    "expiresAt": "2026-03-08T23:59:59Z",
    "metadata": {
      "stateCode": 26,
      "stateAbbreviation": "SP",
      "partnerDescription": "Nova IT",
      "autenticacaoNova": true
    }
  }'
```

**Resposta:**
```json
{
  "id": "scx_01JQW5M0D2G3CTQYV4N9AB8F1R",
  "integrationAccountId": "acc_nova_it_prod",
  "status": "active",
  "partnerCode": 176163,
  "userAccessCode": 333948,
  "userName": "Flavio Padilha Neto",
  "jwtTokenRef": "vault://mtr/session-contexts/scx_01JQW5M0D2G3CTQYV4N9AB8F1R",
  "expiresAt": "2026-03-08T23:59:59Z"
}
```

---

## 4️⃣ Usar Session Context nas Operações

Agora você pode usar o `sessionContextId` em todas as operações de manifesto:

```bash
SESSION_CONTEXT_ID="scx_01JQW5M0D2G3CTQYV4N9AB8F1R"

# Criar manifesto
curl -X POST "http://localhost:8080/v1/manifestos" \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: corr_manifest_001" \
  -d '{
    "integrationAccountId": "acc_nova_it_prod",
    "sessionContextId": "'"$SESSION_CONTEXT_ID"'",
    "manifestType": 1,
    ...
  }'

# Submeter manifesto
curl -X POST "http://localhost:8080/v1/manifestos/man_123/submit" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionContextId": "'"$SESSION_CONTEXT_ID"'",
    "validateOnly": false,
    "printAfterSubmit": true
  }'
```

---

## 🔄 Fluxo Simplificado (Script Completo)

```bash
#!/bin/bash

# 1. Buscar info do parceiro
PARTNER_INFO=$(curl -s "http://localhost:8080/v1/auth/partner-info?document=31913781000139")
echo "Parceiro: $(echo $PARTNER_INFO | jq -r '.description')"

# 2. Fazer login (assumindo reCAPTCHA resolvido manualmente ou por serviço)
LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:8080/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "document": "31913781000139",
    "password": "2dlzft",
    "recaptchaToken": "03AGdBq24PBCd...XYZ"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
EXPIRES_AT=$(echo $LOGIN_RESPONSE | jq -r '.expiresAt')
PARTNER_CODE=$(echo $LOGIN_RESPONSE | jq -r '.partner.code')
ACCESS_CODE=$(echo $LOGIN_RESPONSE | jq -r '.user.accessCode')

echo "Token obtido, válido até: $EXPIRES_AT"

# 3. Criar session context
SESSION_RESPONSE=$(curl -s -X POST "http://localhost:8080/v1/session-contexts" \
  -H "Content-Type: application/json" \
  -d '{
    "integrationAccountId": "acc_nova_it_prod",
    "partnerDocument": "31913781000139",
    "partnerType": "J",
    "partnerCode": '$PARTNER_CODE',
    "userAccessCode": '$ACCESS_CODE',
    "userName": "Flavio Padilha Neto",
    "email": "flavio_padilha_neto@msn.com",
    "authMode": "manual-token",
    "jwtToken": "'$TOKEN'",
    "expiresAt": "'$EXPIRES_AT'",
    "metadata": {
      "stateCode": 26,
      "stateAbbreviation": "SP"
    }
  }')

SESSION_CONTEXT_ID=$(echo $SESSION_RESPONSE | jq -r '.id')
echo "Session Context criado: $SESSION_CONTEXT_ID"

# 4. Agora pode usar em qualquer operação
echo "Pronto para usar sessionContextId=$SESSION_CONTEXT_ID"
```

---

## ⚠️ Limitações Atuais

### reCAPTCHA
- **Problema:** Portal CETESB exige reCAPTCHA v2 interativo
- **Workaround:** 
  1. Resolva manualmente no browser
  2. Extraia token via DevTools
  3. Use no request de login

### Renovação Automática
- **Problema:** CETESB pode não ter endpoint de refresh token
- **Workaround:** Quando token expirar (24h), refaça login completo

---

## 🔐 Segurança

### Armazenamento do Token
```javascript
// ✅ CORRETO: Armazenar em variável de ambiente
export JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

// ❌ ERRADO: Nunca commitar token no código
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Rotação de Credenciais
- Senha CETESB: Rotacionar a cada 90 dias
- JWT Token: Renovar diariamente
- Session Context: Recriar quando token expirar

---

## 📚 Referências

- [OpenAPI Completo](../../../../openapi/mtr_automacao_openapi_interna.yaml)
- [Documentação de Autenticação](./15-autenticacao-cetesb.md)
- [Exemplos de Requisições](../../../../examples/)
