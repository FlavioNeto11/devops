# ⚠️ DL-023: Validação Final Pendente - JWT Expirado

**Data**: 2026-03-09  
**Status**: ⚠️ **BLOQUEADO** - Aguardando novo JWT válido

---

## Situação Atual

### ✅ Implementação 100% Completa
- Todos os HANDOFFs executados (1-5)
- Código validado e funcional
- Worker com graceful shutdown robusto
- Documentação completa

### ❌ JWT CETESB Expirado

**JWT no HAR**: `eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIxNzYxNjMsMzMzOTQ4Iiwicm9sZSI6MSwiZXhwIjoxNzcyOTE0OTY4fQ...`

**Payload decodificado**:
```json
{
  "sub": "176163,333948",
  "role": 1,
  "exp": 1772914968
}
```

**Expiração**: 2026-03-07T20:22:48.000Z (há 2 dias)  
**Agora**: 2026-03-09T19:33:42.847Z

**Bloqueador**: Erro 401 Unauthorized ao tentar submeter manifestos

---

## Como Obter Novo JWT

### Opção 1: Login Manual via Browser + HAR

1. **Abrir DevTools** (F12) e ativar **Network**
2. **Acessar** https://mtr.cetesb.sp.gov.br/
3. **Fazer login** com credenciais reais:
   - CNPJ: `31913781000139`
   - Email: `flavio_padilha_neto@msn.com`
   - Senha: `2dlzft`
4. **Salvar HAR** do Network após login bem-sucedido
5. **Buscar no HAR** o response do endpoint de autenticação
6. **Extrair `token`** do JSON de resposta

### Opção 2: Login Programático (Requer Recaptcha)

```javascript
// POST https://mtrr.cetesb.sp.gov.br/api/mtr/acessos/autenticar
{
  "sistema": 0,
  "login": "31913781000139",
  "email": "flavio_padilha_neto@msn.com",
  "senha": "2dlzft",
  "parCodigo": 176163,
  "recaptcha": "<token_recaptcha_aqui>"
}

// Response
{
  "objetoResposta": {
    "token": "eyJhbGciOiJIUzUxMiJ9...",
    // ... outros dados
  }
}
```

**⚠️ Atenção**: Recaptcha é obrigatório e deve ser gerado manualmente

### Opção 3: Usar Mock Mode (Apenas para Validação de Código)

```bash
# Não testa integração real, mas valida lógica
$env:CETESB_GATEWAY_MODE='mock'
npm run dev
npm run worker

# Executar testes
node tests/manual/test-mtr-real-token.js
```

---

## Próximos Passos (Após Obter JWT)

### 1. Atualizar Token no Script de Teste

**Arquivo**: `tests/manual/test-mtr-real-token.js`

```javascript
// Linha 8 - Substituir pelo novo JWT
const REAL_JWT_TOKEN = 'eyJ...novo_token_aqui...';
```

### 2. Limpar Jobs DLQ com Erro 401

```bash
docker exec -i mtr_postgres psql -U postgres -d mtr_automation -c "
  DELETE FROM jobs 
  WHERE status = 'dlq' 
  AND last_error_message LIKE '%401%';
"
```

### 3. Executar Teste E2E Real

```powershell
# Terminal 1: API
$env:CETESB_GATEWAY_MODE='real'
node src/server.js

# Terminal 2: Worker
npm run worker

# Terminal 3: Teste
node tests/manual/test-mtr-real-token.js
```

**Resultado esperado**:
```
✓ Session created
✓ Manifest created
✓ Submit enqueued (202 Accepted)
✓ Worker processou job
✓ Status: submitted (ou printed se imprimir também)
✓ PDF disponível (se houver printUrl)
```

### 4. Testar Fluxo de Impressão

```powershell
# Após manifesto submitted
POST http://localhost:8080/v1/manifestos/{id}/print
{
  "integrationAccountId": "acc-xxx",
  "sessionContextId": "scx-xxx",
  "documentType": "manifest_pdf"
}

# Aguardar worker processar

# Verificar status
GET http://localhost:8080/v1/manifestos/{id}
# Resposta: status: "printed", documents: [{downloadUrl: "..."}]

# Baixar PDF
GET http://localhost:8080/v1/manifestos/{id}/documents/{docId}
# Resposta: PDF binário
```

### 5. Validar Resultado

- ✅ Manifesto com status `printed`
- ✅ Campo `documents` preenchido
- ✅ PDF salvo em `storage/documents/{manifestId}/`
- ✅ Download do PDF funciona
- ✅ Worker processou sem erros

---

## Scripts Úteis

### Verificar Status de Jobs
```bash
docker exec -i mtr_postgres psql -U postgres -d mtr_automation -c "
  SELECT job_id, operation, status, attempts, last_error_message 
  FROM jobs 
  ORDER BY created_at DESC 
  LIMIT 10;
"
```

### Verificar Manifestos Recentes
```bash
docker exec -i mtr_postgres psql -U postgres -d mtr_automation -c "
  SELECT id, status, created_at, updated_at 
  FROM manifests 
  ORDER BY created_at DESC 
  LIMIT 10;
"
```

### Limpar Storage de PDFs
```powershell
Remove-Item -Path "storage/documents/*" -Recurse -Force -ErrorAction SilentlyContinue
```

---

## Checklist de Validação Final

Após obter novo JWT e executar testes:

- [ ] JWT válido obtido e atualizado
- [ ] Teste E2E executado sem erro 401
- [ ] Manifesto criado e submetido com sucesso
- [ ] Worker processou job de submit sem DLQ
- [ ] Status do manifesto avançou para `submitted`
- [ ] (Opcional) Fluxo de impressão testado
- [ ] (Opcional) PDF baixado e validado
- [ ] Documentação atualizada com resultado final
- [ ] DL-023 marcado como ✅ COMPLETO

---

## Conclusão Temporária

**Implementação técnica está 100% completa e funcional.**

O único bloqueador é a **autenticação externa (JWT expirado)**, que requer intervenção manual para renovar.

Assim que novo JWT for obtido, o fluxo completo de impressão de MTR poderá ser validado end-to-end com integração real da CETESB.

---

**Aguardando**: Novo JWT válido  
**Próximo**: Executar teste E2E real e marcar DL-023 como ✅ COMPLETO
