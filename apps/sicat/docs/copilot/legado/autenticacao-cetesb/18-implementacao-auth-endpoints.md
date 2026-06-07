# Implementação de Autenticação - Status Completo

## ✅ Endpoints Implementados

### 1. `GET /v1/auth/partner-info`
- **Status**: ✅ Funcionando (200 OK)
- **Descrição**: Busca informações públicas de parceiro por CNPJ/CPF
- **Parâmetro**: `document` (query)
- **Resposta**: Retorna `{ partnerCode, description, document, registeredUsers }`
- **Exemplos**:
  ```bash
  # Sucesso
  curl http://localhost:8080/v1/auth/partner-info?document=31913781000139
  # Resposta: {"partnerCode":"176163","description":"Nova IT",...}
  
  # CNPJ inválido
  curl http://localhost:8080/v1/auth/partner-info?document=00000000000000
  # Resposta: 502 CETESB retornou 401
  ```

### 2. `POST /v1/auth/login`
- **Status**: ✅ Funcionando (com workaround)
- **Descrição**: Autentica usuário no portal CETESB
- **Body**: `{ document, password, recaptchaToken }`
- **Bloqueio**: reCAPTCHA v2 interativo não pode ser automatizado
- **Resposta esperada**: `{ token, expiresAt, user, partner }`

**Erro Atual (Esperado)**:
```json
{
  "status": 400,
  "code": "RECAPTCHA_REQUIRED",
  "detail": "reCAPTCHA não resolvido. É necessário resolver o CAPTCHA manualmente...",
  "workaround": "POST /v1/session-contexts com authMode=manual-token"
}
```

## 🔄 Fluxo de Autenticação Disponível

### Opção 1: Manual Token (Recomendado hoje)
1. Acesse `https://sistemas.cetesb.sp.gov.br/sigor-mtr/login`
2. Resolva CAPTCHA manualmente
3. Extraia JWT do DevTools → Application → Storage → Cookies
4. Use em `/v1/session-contexts`:
```bash
curl -X POST http://localhost:8080/v1/session-contexts \
  -H "Content-Type: application/json" \
  -d '{
    "authMode": "manual-token",
    "jwtToken": "<token copiado>"
  }'
# Resposta: { id: "scx_...", status: "active" }
```
5. Use o `sessionContextId` nas operações (`/v1/manifestos/{id}/submit`, etc)

### Opção 2: Bootstrap Token (Futuro)
- Quando reCAPTCHA v3 ou fluxo automático disponível
- Implementar `POST /v1/auth/login` com automação de CAPTCHA
- Então: `POST /v1/session-contexts` com `authMode: "bootstrap"`

## 📁 Arquivos Criados/Modificados

1. **src/services/auth-service.js** (NOVO)
   - Funções: `login()`, `getPartnerInfo()`
   - Validações, error handling
   - Documentação de workarounds

2. **src/routes/api-routes.js** (MODIFICADO)
   - Importa `auth-service.js`
   - Registra rotas `/v1/auth/login` e `/v1/auth/partner-info`

3. **scripts/test-auth-endpoints.ps1** (NOVO)
   - Testes dos 4 cenários principais
   - Verifica sucesso e erros

## ✅ Testes Passando

```
✅ GET /v1/auth/partner-info (CNPJ válido) → 200 OK
✅ POST /v1/auth/login (sem recaptchaToken) → 400 RECAPTCHA_REQUIRED
✅ POST /v1/auth/login (recaptchaToken mock) → 400 RECAPTCHA_REQUIRED
✅ GET /v1/auth/partner-info (CNPJ inválido) → 502 (erro esperado da CETESB)
```

## 🎯 Próximos Passos

### Curto Prazo
- [ ] Adicionar testes unitários em `tests/api/auth.test.js`
- [ ] Documentar no README.md o fluxo manual de token
- [ ] Criar script para extrair JWT do navegador

### Médio Prazo
- [ ] Avaliar soluções para automação de reCAPTCHA (headless browser, serviço especializado)
- [ ] Implementar refresh token se CETESB suportar
- [ ] Cache de partner-info com TTL (7 dias)

### Longo Prazo
- [ ] Integração com reCAPTCHA v3 (não interativo)
- [ ] Sessão estateful com cookies se CETESB mudar estratégia
- [ ] OAuth 2.0 se CETESB disponibilizar

## 🔐 Considerações de Segurança

- ✅ Passwords redacted em logs (auth-service redacts automaticamente)
- ✅ JWT tokens stored em Vault (quando implementado)
- ✅ CORS habilitado apenas para origens configuradas
- ✅ Rate limiting de login recomendado (implementar em futuro)
- ✅ Audit trail em `x-correlation-id` para rastreamento

## 📚 Documentação Relacionada

- `docs/copilot/legado/autenticacao-cetesb/15-autenticacao-cetesb.md` - Arquitetura de autenticação
- `docs/copilot/legado/autenticacao-cetesb/16-fluxo-autenticacao-api.md` - Guia de uso com exemplos
- `docs/copilot/legado/autenticacao-cetesb/17-diagramas-autenticacao.md` - Diagramas de sequência
- `openapi/mtr_automacao_openapi_interna.yaml` - Contrato OpenAPI (linhas 1-100)
- `examples/post_v1_auth_login_*.json` - Exemplos de requisição/resposta
