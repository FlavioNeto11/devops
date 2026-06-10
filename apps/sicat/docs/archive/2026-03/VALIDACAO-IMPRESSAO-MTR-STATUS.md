# ✅ Validação de Impressão MTR - Status e Próximos Passos

**Data**: 2026-03-09  
**Contexto**: DL-023 - Implementação do fluxo de impressão de MTR  
**Status**: ⚠️ Implementação completa, aguardando validação E2E com JWT válido

---

## 📊 O Que Foi Feito

### ✅ Implementação Completa (5 HANDOFFs)

1. **HANDOFF 1** - OpenAPI Contract ✅
   - Endpoint `/v1/manifestos/{id}/print` validado
   - Status `printing`, `printed` adicionados
   - Contratos 100% aderentes ao HAR

2. **HANDOFF 2** - HAR Validation ✅
   - Gateway implementação confirmada correta
   - Request/response matching com HAR

3. **HANDOFF 3** - Gateway Check ✅
   - `cetesb-gateway.js` implementa corretamente
   - Headers, payload, response parsing OK

4. **HANDOFF 4** - Worker Persistence ✅
   - `handleManifestPrint` implementado
   - PDF salvo em `storage/documents/{manifestId}/`
   - `printUrl` gerado e retornado
   - Status `printed` atualizado

5. **HANDOFF 5** - Worker Graceful Shutdown ✅
   - Shutdown timeout (5s)
   - Signal handlers (SIGINT, SIGTERM)
   - Cleanup automático
   - Responde a Ctrl+C instantaneamente

### ✅ Scripts de Teste Criados

- ✅ `tests/manual/test-real-login-and-print.js` - Login automático CETESB (⚠️ blocked by recaptcha)
- ✅ `tests/manual/test-print-with-manual-jwt.js` - Teste com JWT fornecido manualmente
- ✅ `scripts/check-jwt.js` - Verificador de JWT (expiração, payload)
- ✅ `scripts/worker-manager.ps1` - Gerenciador robusto de worker

### ✅ Documentação Criada

- ✅ `docs/legado/autenticacao-cetesb/MANUAL-JWT-EXTRACTION.md` - Guia completo de extração de JWT do browser
- ✅ `docs/copilot/handoffs/DL-023/` - Documentação completa dos HANDOFFs
  - `README.md` - Overview
  - `handoff-summary.md` - Resumo dos 5 HANDOFFs
  - `technical-decisions.md` - Decisões técnicas
  - `validation-report.md` - Validações executadas

---

## ⚠️ Blockers Identificados

### 🔒 Login Automático CETESB Bloqueado

**Problema**: 
- CETESB exige reCAPTCHA no login
- Token de reCAPTCHA expira rapidamente
- Não pode ser reutilizado de HARs antigos
- Login retorna `401 Unauthorized`

**Solução Implementada**:
- Teste com JWT manual (`test-print-with-manual-jwt.js`)
- Guia completo de extração (`MANUAL-JWT-EXTRACTION.md`)

**Por Que Manual É OK**:
- JWT válido por algumas horas
- Pode ser reutilizado em múltiplos testes
- Workflow real de integração também usará JWT de autenticação manual

---

## 🚀 Como Executar Validação E2E

### Setup (uma vez)

```powershell
# 1. Infraestrutura
docker compose up -d postgres
npm run migrate

# 2. API (Terminal 1)
$env:CETESB_GATEWAY_MODE="real"
npm run dev

# 3. Worker (Terminal 2)
npm run worker
```

### Obter JWT do CETESB

1. Abrir browser em https://mtr.cetesb.sp.gov.br
2. Fazer login:
   - **CNPJ**: 31913781000139
   - **E-mail**: flavio_padilha_neto@msn.com
   - **Senha**: 2dlzft
3. DevTools (F12) → Application → Local Storage → `mtr.cetesb.sp.gov.br`
4. Copiar valor de `access_token`

### Executar Teste (Terminal 3)

```powershell
# Colar JWT entre aspas
node tests/manual/test-print-with-manual-jwt.js "eyJhbGc..."
```

### Resultado Esperado

```
╔═══════════════════════════════════════════════════════════╗
║  Teste: Impressão MTR com JWT Manual                    ║
╚═══════════════════════════════════════════════════════════╝

✓ JWT fornecido: eyJhbGc...
  Expira em: 2026-03-09T23:42:48.000Z
  ✓ Válido por mais 180 minutos

1️⃣  Criando session context...
✓ Session created: ctx_123

2️⃣  Buscando manifestos de hoje (09/03/2026)...
✓ Encontrados 3 manifestos

3️⃣  Imprimindo manifesto: mani_456
✓ Print enqueued (202 Accepted)

4️⃣  Aguardando worker processar print...
[1] Status: printing
[2] Status: printing
[3] Status: printed

✅ MTR impresso com sucesso!
   Documentos: 1
   - manifest_pdf: /v1/manifestos/mani_456/documents/doc_789/download

5️⃣  Baixando PDF do MTR...
✓ PDF baixado com sucesso!
  Tamanho: 45678 bytes
  Salvo em: storage/documents/mani_456/

╔═════════════════════════════════════════════════════════════╗
║  ✅ Teste de Impressão MTR - Sucesso!                      ║
╚═════════════════════════════════════════════════════════════╝
```

---

## 📋 Checklist de Validação

Quando executar o teste, verifique:

- [ ] JWT válido (não expirado)
- [ ] API respondendo (http://127.0.0.1:8080/health/system)
- [ ] Worker rodando e processando jobs
- [ ] Session context criada (201)
- [ ] Manifestos listados ou novo criado
- [ ] Print enfileirado (202 Accepted)
- [ ] Worker processou print (status → printed)
- [ ] PDF salvo em `storage/documents/{manifestId}/`
- [ ] Download URL funcional
- [ ] PDF válido (pode abrir no Adobe Reader)

---

## 🐛 Troubleshooting

### Worker Não Processa

```powershell
# Verificar se worker está rodando
Get-Process | Where-Object { $_.ProcessName -like "*node*" }

# Verificar logs do worker
# Procurar por erros no terminal do worker
```

### JWT Expirado

```powershell
# Verificar JWT
node scripts/check-jwt.js "eyJhbGc..."

# Se expirado, obter novo do browser
```

### PDF Não Salva

```powershell
# Verificar permissões da pasta
Test-Path storage/documents/
New-Item -ItemType Directory -Force -Path storage/documents/

# Verificar logs do worker para erro ao baixar PDF da CETESB
```

### Timeout na Requisição

- Aumentar timeout em `src/gateways/cetesb-gateway.js` (default: 30s)
- Verificar conectividade com CETESB

---

## 📖 Documentação de Referência

- **Guia de JWT**: `docs/legado/autenticacao-cetesb/MANUAL-JWT-EXTRACTION.md`
- **Decision Log**: `docs/copilot/13-decision-log.md` (DL-023)
- **HANDOFFs**: `docs/copilot/handoffs/DL-023/`
- **HAR Login**: `docs/cetesb/mtr.cetesb.sp.gov.br_login.har`
- **HAR Print**: `docs/cetesb/mtr.cetesb.sp.gov.br_imprimir_mtr.har`

---

## ✅ Critérios de Pronto

Feature "Impressão MTR" está **pronta para merge** quando:

1. ✅ OpenAPI validado (`npm run validate:openapi`)
2. ✅ Testes passando (`npm run test` > 95%)
3. ✅ Gateway implementado e validado contra HAR
4. ✅ Worker processa print e salva PDF
5. ✅ Worker graceful shutdown funcional
6. ⏳ **E2E validation com JWT válido executada com sucesso**
7. ✅ Documentação completa

**Status atual**: 6/7 completados (85%)  
**Blocker**: Requer JWT válido do CETESB para validação E2E final

---

## 🎯 Próximos Passos (Para Você)

### Passo 1: Obter JWT Válido
1. Abrir browser em https://mtr.cetesb.sp.gov.br
2. Fazer login com credenciais
3. DevTools → Application → Local Storage
4. Copiar `access_token`

### Passo 2: Executar Teste E2E
```powershell
# Terminal 1: API
$env:CETESB_GATEWAY_MODE="real"; npm run dev

# Terminal 2: Worker
npm run worker

# Terminal 3: Teste
node tests/manual/test-print-with-manual-jwt.js "SEU_JWT_AQUI"
```

### Passo 3: Validar Resultado
- [ ] Teste executou sem erros?
- [ ] PDF foi salvo corretamente?
- [ ] Download URL funcional?
- [ ] PDF pode ser aberto?

### Passo 4: Marcar Como Completo
Se tudo funcionou:
- Atualizar `docs/copilot/13-decision-log.md` (DL-023 → ✅ COMPLETO)
- Atualizar este arquivo com resultado da validação
- Feature pronta para merge! 🎉

---

## 📝 Notas Adicionais

### Por Que Não Implementamos Bypass de reCAPTCHA?

1. **Complexidade**: Requer Puppeteer + serviços de bypass (2Captcha, etc.)
2. **Custo**: Serviços de bypass são pagos
3. **Fragilidade**: CETESB pode detectar e bloquear
4. **Desnecessário**: Workflow real também usa JWT de autenticação manual

### Alternativas Futuras

Se login automático for crítico:
1. Implementar OAuth 2.0 flow com CETESB (se disponível)
2. Usar serviço de bypass de reCAPTCHA (2Captcha, AntiCaptcha)
3. CETESB pode fornecer API key para integrações

---

**Última atualização**: 2026-03-09  
**Responsável**: executor-handoffs  
**Decision Log**: DL-023
