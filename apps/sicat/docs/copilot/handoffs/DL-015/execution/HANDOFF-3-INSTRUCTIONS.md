# HANDOFF 3 Instructions for integrador-cetesb-mtr

**Fase:** HANDOFF 3/6  
**Feature:** DL-015 - Cancelamento de manifesto com auditoria de logs  
**Especialista:** integrador-cetesb-mtr  
**Data:** 2026-03-08  
**Tempo:** 30 minutos

---

## Contexto (dos HANDOFF 1 e 2)

### ✅ HANDOFF 1: Contrato OpenAPI
Você pode revisar em: docs/copilot/13-decision-log.md (seção HANDOFF 1)

**Entregáveis:**
- Schema `AuditLogEntry` adicionado ao OpenAPI
- Campo `auditLog` adicionado a `ManifestResource`
- Endpoint POST /v1/manifestos/{id}/cancel mantém 202 (padrão interno)
- Examples criados com auditoria
- OpenAPI validado ✅

### ✅ HANDOFF 2: Validação CETESB
Você pode revisar em: docs/copilot/13-decision-log.md (seção HANDOFF 2)

**Achados:**
- Endpoint real CETESB: POST /api/mtr/manifesto/cancelaManifesto
- Request: { manCodigo, manNumero, manJustificativaCancelamento }
- Response: { erro: false, mensagem: "Manifesto cancelado com sucesso." }
- **Achado crítico**: CETESB **NÃO retorna audit logs**
- Decisão: Auditoria será **LOCAL em `audit_logs`** (banco, HANDOFF 4)
- 0 divergências críticas

---

## Sua Responsabilidade (HANDOFF 3)

### 🎯 Objetivo
Implementar integração real do gateway CETESB para capturar cancelamentos e preparar dados para auditoria local.

### 📋 Tarefas Específicas

#### 1. Revisar/Melhorar `RealCetesbGateway.cancelManifest()`
**Arquivo:** `src/gateways/cetesb-gateway.js` (linhas 584-596)

**Verificações obrigatórias:**

```javascript
✅ async cancelManifest(manifest, payload) {
  // 1. Validar precondições
  const { externalReference } = manifest;
  if (!externalReference?.manCodigo || !externalReference?.manNumero) {
    throw new AppError(400, 'Bad Request', 'manCodigo/manNumero obrigatórios');
  }
  
  // 2. Validar reason (3-500 chars, confirmado no HAR)
  const reason = payload?.reason || '';
  if (!reason || reason.length < 3 || reason.length > 500) {
    throw new AppError(400, 'Bad Request', 'reason: 3-500 caracteres');
  }
  
  // 3. Chamar CETESB com campo CORRETO
  // ⚠️ IMPORTANTE: usar manJustificativaCancelamento (não 'motivo')
  const exchange = await this.requestJson({
    method: 'POST',
    path: '/api/mtr/manifesto/cancelaManifesto',
    body: {
      manCodigo: externalReference.manCodigo,
      manNumero: externalReference.manNumero,
      manJustificativaCancelamento: reason  // Campo correto!
    },
    auth: true,
    token: sessionContext?.jwtToken
  });
  
  // 4. Processar resposta (lança AppError se erro: true)
  unwrapApiBody(exchange.response.data);
  
  // 5. Preparar extraAudits para HANDOFF 4 (banco)
  const extraAudits = [{
    action: 'CANCEL',
    details: {
      reason: reason,
      cetesbResponse: {
        manCodigo: externalReference.manCodigo,
        manNumero: externalReference.manNumero,
        mensagem: exchange.response.data?.mensagem
      }
    }
  }];
  
  return {
    ...exchange,
    response: {
      ...exchange.response,
      data: {
        manCodigo: externalReference.manCodigo,
        manNumero: externalReference.manNumero,
        mensagem: exchange.response.data?.mensagem || 'Manifesto cancelado'
      }
    },
    extraAudits
  };
}
```

#### 2. Mapeamento de Campos (Confirmado em HANDOFF 2)

| Origem | Campo | Destino | Valor Ex. | Validação |
|--------|-------|---------|----------|-----------|
| OpenAPI | reason | CETESB manJustificativaCancelamento | "Operação indevida" | 3-500 chars, obrigatório |
| manifest | externalReference.manCodigo | CETESB manCodigo | "102023001" | Formato externo |
| manifest | externalReference.manNumero | CETESB manNumero | "000000001" | Formato externo |
| CETESB | resposta | DB audit | "Manifesto cancelado..." | Registro local |

#### 3. Tratamento de Erros
**Cenários a tratar:**

```javascript
// Erro 1: Campos faltantes
if (!manifest.externalReference?.manCodigo) {
  throw new AppError(400, 'Bad Request', 'Manifesto não tem referência externa');
}

// Erro 2: Reason inválido
if (!payload?.reason || payload.reason.length < 3) {
  throw new AppError(400, 'Bad Request', 'Campo reason obrigatório (mín. 3 chars)');
}

// Erro 3: CETESB retorna erro
// Já tratado por unwrapApiBody() que lança AppError(502) se erro: true

// Erro 4: Network/timeout
// Já tratado pelo requestJson() com timeout e retry
```

#### 4. Resposta com ExtraAudits
**Preparar dados para HANDOFF 4 (banco):**

```javascript
return {
  // ... exchange normal (request, response, etc)
  extraAudits: [{
    action: 'CANCEL',
    status: 'SUCCESS',  // ou FAILED se houve erro
    details: {
      reason: payload.reason,
      cetesbResponse: {
        manCodigo: externalReference.manCodigo,
        manNumero: externalReference.manNumero,
        mensagem: exchange.response.data?.mensagem
      },
      // Opcional: incluir requestedBy se estiver em sessionContext
      requestedBy: sessionContext?.userId
    }
  }]
};
```

#### 5. Testes Mínimos
**Unit tests (em `tests/unit/gateways/` ou similar):**

```javascript
describe('RealCetesbGateway.cancelManifest()', () => {
  
  // ✅ Teste 1: Cancelamento bem-sucedido
  it('deve cancelar manifesto com reason válido', async () => {
    const manifest = { 
      externalReference: { manCodigo: '102023001', manNumero: '000000001' }
    };
    const payload = { reason: 'Operação indevida' };
    
    const result = await gateway.cancelManifest(manifest, payload);
    
    expect(result.response.data).toEqual({
      manCodigo: '102023001',
      manNumero: '000000001',
      mensagem: expect.any(String)
    });
    expect(result.extraAudits).toHaveLength(1);
    expect(result.extraAudits[0].action).toBe('CANCEL');
  });
  
  // ✅ Teste 2: Validação - reason ausente
  it('deve rejeitar reason ausente', async () => {
    const manifest = { externalReference: { manCodigo: '102023001', manNumero: '000000001' } };
    const payload = { reason: '' };
    
    expect(() => gateway.cancelManifest(manifest, payload))
      .toThrow(/reason.*obrigatório/i);
  });
  
  // ✅ Teste 3: Validação - manCodigo ausente
  it('deve rejeitar manifesto sem referência externa', async () => {
    const manifest = { externalReference: {} };
    const payload = { reason: 'Válido' };
    
    expect(() => gateway.cancelManifest(manifest, payload))
      .toThrow(/manCodigo|referência externa/i);
  });
  
  // ✅ Teste 4: Erro CETESB
  it('deve lançar AppError se CETESB retorna erro', async () => {
    // Mock CETESB retornando { erro: true, mensagem: '...' }
    const manifest = { ... };
    const payload = { reason: 'Válido' };
    
    expect(() => gateway.cancelManifest(manifest, payload))
      .toThrow(AppError);
  });
});
```

**Integration test (em `tests/integration/`):**

```javascript
describe('Cancelamento de Manifesto (E2E)', () => {
  
  // ✅ Teste 5: Fluxo completo
  it('deve cancelar manifesto e criar entry de auditoria', async () => {
    // 1. Setup: criar manifesto com estado válido
    const manifest = await createTestManifesto({ status: 'AWAITING_RECEIPT' });
    const sessionContext = await createTestSessionContext();
    
    // 2. Chamar POST /v1/manifestos/{id}/cancel
    const response = await request(app)
      .post(`/v1/manifestos/${manifest.id}/cancel`)
      .set('authorization', `Bearer ${sessionContext.jwtToken}`)
      .send({ reason: 'Cancelamento solicitado' });
    
    // 3. Validar resposta
    expect(response.status).toBe(202);  // CommandAccepted
    expect(response.body.commandId).toBeDefined();
    
    // 4. Validar que job foi criado na fila
    const job = await findJobByCommandId(response.body.commandId);
    expect(job).toBeDefined();
    expect(job.type).toBe('cancel-manifesto');
  });
});
```

---

## Checklist de Conclusão

### Código
- [ ] `RealCetesbGateway.cancelManifest()` revisado em cetesb-gateway.js
- [ ] Campo correto: `manJustificativaCancelamento` (não `motivo`)
- [ ] Validações: manCodigo, manNumero, reason (3-500 chars)
- [ ] Tratamento de erro: AppError com mensagens claras
- [ ] `extraAudits` preparado com action='CANCEL' e details estruturados
- [ ] Comments explicando validações críticas

### Testes
- [ ] Unit test: cancelamento bem-sucedido
- [ ] Unit test: reason ausente/inválido
- [ ] Unit test: manCodigo/manNumero ausentes
- [ ] Unit test: CETESB retorna erro
- [ ] Integration test: fluxo completo POST /v1/manifestos/{id}/cancel
- [ ] Todos os testes passando ✅

### Documentação
- [ ] Comentários no código explicando cada validação
- [ ] Nenhum erro/warning novo
- [ ] extraAudits bem documentados para HANDOFF 4

### Validações
- [ ] `npm run validate:openapi` ✅
- [ ] `npm run test:integration` (cancelamento) ✅
- [ ] `npm run test` (suíte completa) ✅

---

## Próximas Etapas (Você não faz, apenas prepare)

**HANDOFF 4:** postgres-queue-mtr
- Criar migration: `audit_logs` table
- Implementar `audit-log-repo.insert()`
- Integrar com service para persistir `extraAudits`

**HANDOFF 5:** tester-qa-mtr
- Cobertura completa de cancelamento + auditoria
- E2E com dados reais

**HANDOFF 6:** documentador-mtr
- Atualizar docs/copilot/ com fluxo de cancelamento
- Documentação final

---

## Referências Rápidas

### HAR Real (CETESB)
```
POST https://mtrr.cetesb.sp.gov.br/api/mtr/manifesto/cancelaManifesto
Content-Type: application/json
Authorization: Bearer [token]

{
  "manCodigo": 22169012,
  "manNumero": "260010679516",
  "manJustificativaCancelamento": "erro no cadastro"
}

Response: 200 OK
{
  "mensagem": "Manifesto cancelado com sucesso",
  "erro": false,
  "objetoResposta": null
}
```

### Files
- Gateway: `src/gateways/cetesb-gateway.js` (linhas 584-596)
- OpenAPI: `openapi/mtr_automacao_openapi_interna.yaml`
- Examples: `examples/post_v1_manifestos_id_cancel_*.json`
- DL-015: `docs/copilot/13-decision-log.md`
- Contexto H3: `docs/copilot/handoffs/DL-015/execution/handoff-3-context.md`

### Decisões Validadas
1. **Status code interno:** 202 (OpenAPI) vs 200 (CETESB) ✅ Abstracto
2. **Auditoria:** LOCAL em DB (CETESB não retorna) ✅ Correto
3. **Campo:** reason → manJustificativaCancelamento ✅ Confirmado

---

## Resultado Esperado ao Finalizar

**Arquivos alterados:**
- `src/gateways/cetesb-gateway.js`: cancelManifest() melhorado

**Testes adicionados:**
- `tests/unit/gateways/cetesb-gateway.test.js` (4+ casos)
- `tests/integration/manifestos.test.js` (cancel flow)

**Validações:**
- ✅ npm run validate:openapi
- ✅ npm run test:integration
- ✅ npm run test

**Decision-log atualizado:**
- DL-015: HANDOFF 3 ✅ COMPLETO (30 min)

---

**Status:** ⏳ PRONTO PARA EXECUÇÃO  
**Tempo:** 30 minutos  
**Data:** 2026-03-08  
**Próximo:** HANDOFF 4 (postgres-queue-mtr)
