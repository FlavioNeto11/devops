# Testes de /v1/manifestos/:id/submit - Resumo

## Status: ✅ 27 testes implementados (70% funcional)

### Cobertura Implementada

**Testes de API** (`tests/api/manifest-submit.test.js`) - 9 testes
- Submit básico com sessionContextId no body
- Reaproveitamento de sessionContextId do manifesto
- Idempotência via idempotency-key (2 requests retornam mesmo jobId)
- Manifesto inexistente (404)
- SessionContextId inexistente (400)
- SessionContextId ausente (400)
- Propagação de correlationId para job
- validateOnly=true no payload
- printAfterSubmit=true no payload

**Testes de Integração** (`tests/integration/manifest-submit-service.test.js`) - 10 testes (7✅ 3⚠️)
- ✅ Criação de job e atualização de status do manifesto
- ✅ Uso de sessionContextId do manifesto quando não fornecido
- ✅ Idempotência de serviço (mesma idempotency-key)
- ⚠️ Erro 404 para manifesto inexistente (assertion precisa ajuste)
- ⚠️ Erro 400 para sessionContextId inexistente (assertion precisa ajuste)
- ⚠️ Erro 400 para sessionContextId ausente (assertion precisa ajuste)
- ✅ Persistência de validateOnly no payload
- ✅ Persistência de printAfterSubmit no payload
- ✅ Propagação de correlationId
- ✅ Links corretos na resposta

**Testes de Worker** (`tests/worker/manifest-submit-handler.test.js`) - 8 testes
- Processamento bem-sucedido (draft → submitted)
- validateOnly sem persistir externalReference
- printAfterSubmit criando job adicional
- Falha de gateway permitindo retry
- Status intermediário (submitting)
- Preservação de correlationId na auditoria
- Registro completo de exchange
- Atualização de externalReference e externalHashCode

### Fixtures Criadas

**`tests/fixtures/manifests.js`**
- `validManifestDraft` - manifesto pronto para submit
- `validManifestWithoutSessionContext` - sem sessionContextId
- `submittedManifest` - já submetido com dados externos

**`tests/fixtures/session-contexts.js`**
- `validSessionContext` - contexto ativo
- `expiredSessionContext` - contexto expirado

**`tests/fixtures/jobs.js`**
- Jobs em diferentes estados: queued, running, succeeded, failed

### Executando os Testes

```powershell
# Setup inicial (uma vez)
docker-compose up -d postgres
npm install
npm run migrate

# Todos os testes de submit
npm run test:manifest:submit

# Por categoria
npm run test:integration  # 7/10 passando ✅
npm run test:worker       # Requer doubles de gateway alinhados ao fluxo atual
npm run test:api          # Requer API rodando (npm run dev)

# Script automatizado
pwsh scripts/test-manifest-submit.ps1
```

### Próximos Passos

1. **Ajustar assertions de erro** nos 3 testes de integração falhando
2. **Alinhar doubles do gateway** aos cenários atuais dos testes de worker
3. **Expandir para outros endpoints**: print, cancel, catalog-sync
4. **Adicionar testes unitários** (sem dependências de infraestrutura)
5. **CI/CD**: integrar testes no pipeline

### Documentação Relacionada

- `tests/README.md` - Guia completo da estrutura de testes
- `tests/manifest-submit.md` - Comandos e validação manual detalhada
- `tests/FIXES-APPLIED.md` - Log de correções aplicadas
- `docs/copilot/11-checklist-qa.md` - Checklist de QA atualizado
