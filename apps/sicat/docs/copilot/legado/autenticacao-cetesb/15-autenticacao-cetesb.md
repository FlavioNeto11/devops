# Autenticação CETESB - Fluxo de Session Context

## Visão Geral

A autenticação com a plataforma MTR da CETESB utiliza um **token JWT** que é obtido através de login e depois reutilizado nas operações de manifesto. O backend **não automatiza o reCAPTCHA** - este é o principal limitador técnico do sistema.

## Dados de Acesso Reais

```yaml
Empresa:
  CNPJ: 31913781000139
  Razão Social: Nova IT
  Código Parceiro: 176163

Usuário:
  Nome: Flavio Padilha Neto
  CPF: 37088641828
  Email/Login: flavio_padilha_neto@msn.com
  Senha: 2dlzft
  Código de Acesso: 333948
```

## Fluxo de Bootstrap (authMode: bootstrap)

### 1. Request ao Backend Interno

```http
POST /v1/session-contexts
Content-Type: application/json
X-Correlation-Id: corr_exemplo_001

{
  "integrationAccountId": "acc_nova_it_prod",
  "partnerDocument": "31913781000139",
  "partnerType": "J",
  "partnerCode": 176163,
  "userAccessCode": 333948,
  "userName": "Flavio Padilha Neto",
  "email": "flavio_padilha_neto@msn.com",
  "authMode": "bootstrap",
  "metadata": {
    "stateCode": 26,
    "stateAbbreviation": "SP",
    "partnerDescription": "Nova IT",
    "autenticacaoNova": true,
    "recaptchaToken": "",
    "credentials": {
      "login": "31913781000139",
      "email": "flavio_padilha_neto@msn.com",
      "password": "2dlzft",
      "cpf": "37088641828"
    }
  }
}
```

### 2. Backend Tenta Login Técnico na CETESB

O backend executa (conceitualmente):

```javascript
// Pseudocódigo - NÃO IMPLEMENTADO devido ao reCAPTCHA
POST https://sistemas.cetesb.sp.gov.br/sigor-mtr/api/auth/login
{
  "login": "31913781000139",
  "password": "2dlzft",
  "recaptchaToken": "???" // ⚠️ BLOQUEIO: não conseguimos resolver reCAPTCHA
}

// Se conseguisse login, retornaria:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2026-03-08T23:59:59Z",
  "user": {
    "accessCode": 333948,
    "name": "Flavio Padilha Neto",
    "partnerCode": 176163
  }
}
```

### 3. Problema: reCAPTCHA Bloqueia Automação

**Por que não funciona:**
- Portal CETESB exige reCAPTCHA v2 (interativo) no login
- Não é possível resolver programaticamente sem intervenção humana
- Serviços de terceiros (2captcha, anti-captcha) são eticamente questionáveis e instáveis

**Situação atual:**
- Bootstrap retorna `status: pending_auth` quando não consegue obter token
- Token precisa ser fornecido manualmente (via `authMode: manual-token`)

### 4. Response do Backend (Status: pending_auth)

```json
{
  "id": "scx_01JQW5M0D2G3CTQYV4N9AB8F1R",
  "integrationAccountId": "acc_nova_it_prod",
  "status": "pending_auth",
  "partnerDocument": "31913781000139",
  "partnerType": "J",
  "partnerCode": 176163,
  "userAccessCode": 333948,
  "userName": "Flavio Padilha Neto",
  "email": "flavio_padilha_neto@msn.com",
  "jwtTokenRef": null,
  "expiresAt": null,
  "lastValidatedAt": null,
  "metadata": {
    "stateCode": 26,
    "stateAbbreviation": "SP",
    "partnerDescription": "Nova IT",
    "autenticacaoNova": true,
    "recaptchaToken": ""
  }
}
```

## Fluxo Alternativo: Manual Token (Recomendado Atualmente)

### 1. Login Manual no Portal CETESB

1. Acesse: https://sistemas.cetesb.sp.gov.br/sigor-mtr/
2. Informe credenciais:
   - Login: `31913781000139` ou `flavio_padilha_neto@msn.com`
   - Senha: `2dlzft`
3. Resolva reCAPTCHA manualmente
4. Após login, inspecione Network → Request Headers → `Authorization: Bearer <TOKEN>`

### 2. Extrair JWT Token

**Via DevTools:**
```javascript
// No console do navegador após login
console.log(localStorage.getItem('auth_token')); // ou sessionStorage
// OU
console.log(document.cookie.match(/token=([^;]+)/)?.[1]);
```

**Exemplo de token:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzMzM5NDgiLCJuYW1lIjoiRmxhdmlvIFBhZGlsaGEgTmV0byIsInBhcnRuZXJDb2RlIjoxNzYxNjMsImlhdCI6MTcwOTg1NjAwMCwiZXhwIjoxNzA5OTQyNDAwfQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

### 3. Registrar Session Context com Token Manual

```http
POST /v1/session-contexts
Content-Type: application/json

{
  "integrationAccountId": "acc_nova_it_prod",
  "partnerDocument": "31913781000139",
  "partnerType": "J",
  "partnerCode": 176163,
  "userAccessCode": 333948,
  "userName": "Flavio Padilha Neto",
  "email": "flavio_padilha_neto@msn.com",
  "authMode": "manual-token",
  "jwtToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2026-03-08T23:59:59Z",
  "metadata": {
    "stateCode": 26,
    "stateAbbreviation": "SP",
    "partnerDescription": "Nova IT",
    "autenticacaoNova": true
  }
}
```

### 4. Backend Armazena Token Seguro

```javascript
// Internamente, o backend:
1. Valida JWT structure (não valida assinatura - CETESB precisa validar)
2. Armazena token em vault/secrets manager:
   - jwtTokenRef: "vault://mtr/session-contexts/scx_01JQW5M0D2G3CTQYV4N9AB8F1R"
3. Persiste metadata em Postgres
4. Retorna contexto com status: "active"
```

### 5. Response (Status: active)

```json
{
  "id": "scx_01JQW5M0D2G3CTQYV4N9AB8F1R",
  "integrationAccountId": "acc_nova_it_prod",
  "status": "active",
  "partnerDocument": "31913781000139",
  "partnerType": "J",
  "partnerCode": 176163,
  "userAccessCode": 333948,
  "userName": "Flavio Padilha Neto",
  "email": "flavio_padilha_neto@msn.com",
  "jwtTokenRef": "vault://mtr/session-contexts/scx_01JQW5M0D2G3CTQYV4N9AB8F1R",
  "expiresAt": "2026-03-08T23:59:59Z",
  "lastValidatedAt": "2026-03-08T14:30:00Z",
  "metadata": {
    "stateCode": 26,
    "stateAbbreviation": "SP",
    "partnerDescription": "Nova IT",
    "autenticacaoNova": true
  }
}
```

## Uso do Session Context nas Operações

### Submit de Manifesto

```http
POST /v1/manifestos/man_01ABC/submit
Content-Type: application/json

{
  "sessionContextId": "scx_01JQW5M0D2G3CTQYV4N9AB8F1R",
  "validateOnly": false,
  "printAfterSubmit": true,
  "requestedBy": "flavio.padilha"
}
```

**Internamente:**
1. Backend recupera `jwtTokenRef` do session context
2. Recupera token real do vault
3. Faz request à CETESB:
   ```http
   PUT https://sistemas.cetesb.sp.gov.br/sigor-mtr/api/mtr/manifesto
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   Content-Type: application/json
   ```

## Renovação de Token

### Detecção de Expiração

```javascript
// Backend valida antes de cada operação
if (sessionContext.expiresAt && new Date() > new Date(sessionContext.expiresAt)) {
  // Tenta renovar token automaticamente
  const renewed = await gateway.refreshToken(sessionContext);
  
  if (!renewed) {
    // Marca sessão como expirada
    await updateSessionContext(sessionContext.id, { status: 'expired' });
    throw new AppError(401, 'Session Expired', 'Token expirado, refaça login manual');
  }
}
```

### Renovação Manual

Se CETESB permitir refresh token:

```http
POST /v1/session-contexts/{id}/refresh
Content-Type: application/json

{
  "refreshToken": "refresh_token_se_disponivel"
}
```

Caso contrário, **repetir fluxo manual-token**.

## Limitações e Workarounds

### ❌ Não Automatizável
- Login inicial (reCAPTCHA)
- Primeiro cadastro de empresa
- Operações que exigem confirmação humana

### ✅ Automatizável (com token válido)
- Criação de manifestos
- Submissão de manifestos
- Impressão de PDFs
- Cancelamento
- Consulta de parceiros
- Sincronização de catálogos

### 🔄 Workaround Atual
1. Faça login manual 1x/dia no portal CETESB
2. Extraia token via DevTools
3. Registre via `POST /v1/session-contexts` com `authMode: manual-token`
4. Use o `sessionContextId` por 24h em todas operações
5. Quando expirar, repita processo

## Estratégias Futuras

### Opção 1: Service Account (se CETESB implementar)
```yaml
Requer CETESB:
  - Criar endpoint /api/auth/service-account
  - Aceitar client_id/client_secret
  - Retornar token sem reCAPTCHA
```

### Opção 2: Browser Automation Controlado
```yaml
Abordagem:
  - Puppeteer/Playwright headless
  - Usuário resolve reCAPTCHA 1x manualmente
  - Browser mantém sessão cookies
  - Backend reutiliza sessão

Limitações:
  - Precisa servidor com display (XVFB)
  - Consome mais recursos
  - Frágil a mudanças no portal
```

### Opção 3: Integração Oficial
```yaml
Recomendação:
  - Solicitar à CETESB API oficial
  - OAuth2 com client credentials
  - Documentação pública
  - SLA garantido
```

## Segurança

### Armazenamento de Tokens
- **Nunca** persista tokens em plain text no banco
- Use AWS Secrets Manager, Azure Key Vault ou HashiCorp Vault
- Referência no banco: `vault://mtr/session-contexts/{id}`

### Armazenamento de Senhas
- Senha do usuário **nunca** é persistida
- Apenas enviada no momento do bootstrap (que atualmente falha)
- Se implementar bootstrap futuramente, usar criptografia assimétrica

### Rotação de Credenciais
```yaml
Periodicidade Recomendada:
  - Senha CETESB: 90 dias (política interna)
  - JWT Token: 24h (expira automaticamente)
  - Session Context: renovar ao expirar
```

## Troubleshooting

### Token retorna 401 Unauthorized
```bash
# Verificar expiração
GET /v1/session-contexts/{id}
# Se expirado, refazer login manual e atualizar

# Testar token direto na CETESB
curl -H "Authorization: Bearer $TOKEN" \
  https://sistemas.cetesb.sp.gov.br/sigor-mtr/api/user/profile
```

### Session Context pendente
```bash
# Verificar status
GET /v1/session-contexts/{id}

# Se pending_auth, fornecer token manualmente
POST /v1/session-contexts
{
  "authMode": "manual-token",
  "jwtToken": "...",
  # ... outros campos
}
```

### Credenciais incorretas
```yaml
Sintomas:
  - Login manual falha no portal
  - Erro "usuário ou senha inválidos"

Solução:
  1. Recuperar senha via portal CETESB
  2. Atualizar variável de ambiente PASSWORD_CETESB
  3. Atualizar metadata.credentials.password (se aplicável)
```

## Referências

- [OpenAPI Session Contexts](../../../../openapi/mtr_automacao_openapi_interna.yaml#L35-L180)
- [Gateway CETESB](../../../../src/gateways/cetesb-gateway.js)
- [Session Context Service](../../../../src/services/session-context-service.ts)
- [Decision Log: Por que não automatizar reCAPTCHA](../../13-decision-log.md#dl-004)

## Próximos Passos

1. ✅ Documentar fluxo manual-token (este documento)
2. ⏳ Implementar refresh token se CETESB disponibilizar
3. ⏳ Criar script CLI para extração automática de token do browser
4. ⏳ Solicitar formalmente API oficial à CETESB
5. ⏳ Implementar rotação automática de tokens expirados

---

**Última atualização:** 2026-03-08  
**Responsável:** Sistema de documentação automática
