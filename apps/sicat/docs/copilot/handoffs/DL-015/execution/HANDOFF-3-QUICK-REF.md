# ⚡ HANDOFF 3 Quick Reference

**Tempo total:** 30 minutos  
**Complexidade:** Média  
**Bloqueadores:** 0  

---

## 🎯 Em Uma Frase
Melhorar `RealCetesbGateway.cancelManifest()` com validações e preparar `extraAudits` para auditoria local.

---

## 📍 Arquivo Principal
```
src/gateways/cetesb-gateway.js
├─ Função: async cancelManifest(manifest, payload)
├─ Linhas atuais: 584-596 (mock)
└─ Status: Precisa validações + extraAudits
```

---

## ✅ Checklist Rápido

### Validações
- [ ] manifest.externalReference.manCodigo (obrigatório)
- [ ] manifest.externalReference.manNumero (obrigatório)
- [ ] payload.reason (obrigatório, 3-500 chars) ← CONFIRMADO NO HAR
- [ ] Campo correto: `manJustificativaCancelamento` (não `motivo`) ← CONFIRMADO

### Implementação
- [ ] Chamar CETESB com manJustificativaCancelamento
- [ ] Tratamento erro: AppError se erro: true
- [ ] Preparar extraAudits: {action: 'CANCEL', details: {...}}

### Testes
- [ ] Unit: cancelamento válido
- [ ] Unit: validações falham corretamente
- [ ] Unit: CETESB retorna erro
- [ ] Integration: fluxo completo

### Finalização
- [ ] npm run validate:openapi ✅
- [ ] npm run test:integration ✅
- [ ] Atualizar DL-015 (HANDOFF 3 ✅ COMPLETO)

---

## 🔍 Mapeamento de Campos

| OpenAPI | Gateway | CETESB |
|---------|---------|--------|
| reason | → | manJustificativaCancelamento |
| (manifest) | manCodigo | manCodigo |
| (manifest) | manNumero | manNumero |

**Todas as mapeagens ✅ confirmadas no HAR (HANDOFF 2)**

---

## 💾 ExtraAudits Structure

```javascript
{
  action: 'CANCEL',
  details: {
    reason: 'Operação indevida',
    cetesbResponse: {
      manCodigo: '102023001',
      manNumero: '000000001',
      mensagem: 'Manifesto cancelado com sucesso'
    },
    requestedBy: sessionContext.userId  // opcional
  }
}
```

---

## 🧪 Testes Mínimos

```javascript
// Teste 1: Sucesso
const result = await gateway.cancelManifest(
  { externalReference: { manCodigo: '...', manNumero: '...' } },
  { reason: 'Operação indevida' }
);
expect(result.extraAudits[0].action).toBe('CANCEL');

// Teste 2: Validação falha
expect(() => gateway.cancelManifest(
  { externalReference: {} },
  { reason: 'ok' }
)).toThrow(AppError);

// Teste 3: CETESB erro
// Mock CETESB retornando { erro: true, mensagem: '...' }
expect(() => gateway.cancelManifest(...)).toThrow(AppError);

// Teste 4: Integration (POST /v1/manifestos/{id}/cancel)
const response = await request(app)
  .post(`/v1/manifestos/${id}/cancel`)
  .send({ reason: 'Operação indevida' });
expect(response.status).toBe(202);
```

---

## 🚀 Workflow de 30 Minutos

| Tempo | Tarefa | Tempo Acumulado |
|-------|--------|-----------------|
| 5 min | Ler documentação | 5 min |
| 5 min | Revisar código atual | 10 min |
| 10 min | Implementar melhorias | 20 min |
| 5 min | Escrever testes | 25 min |
| 3 min | Validar (npm run) | 28 min |
| 2 min | Atualizar DL-015 | 30 min |

---

## 📚 Documentação (em Ordem)

1. **ESTE ARQUIVO:** Quick reference (5 min)
2. **HANDOFF-3-READY.md:** Status e overview (5 min)
3. **HANDOFF-3-INSTRUCTIONS.md:** Detalhes técnicos (15 min)

---

## 🔗 Referências Rápidas

**HAR Real (CETESB):**
```
POST /api/mtr/manifesto/cancelaManifesto
{
  "manCodigo": 22169012,
  "manNumero": "260010679516",
  "manJustificativaCancelamento": "erro no cadastro"
}
→ 200 OK { erro: false, mensagem: "...", objetoResposta: null }
```

**Arquivo:** docs/cetesb/mtr.cetesb.sp.gov.br_cancelar_mtr.har

**Decisões Já Validadas:**
- ✅ Field mapping: reason → manJustificativaCancelamento
- ✅ Auditoria: LOCAL (CETESB não retorna)
- ✅ Validação: reason 3-500 chars

---

## ❓ FAQs Rápidas

**P: Qual é o campo certo?**  
R: `manJustificativaCancelamento` (confirmado no HAR)

**P: Que validações adicionar?**  
R: manCodigo, manNumero, reason (3-500 chars)

**P: CETESB retorna audit logs?**  
R: Não. Auditoria será local (HANDOFF 4)

**P: Preciso de testes?**  
R: Sim, mínimo 4 (1 sucesso, 3 erros)

---

## ✨ Resultado Final Esperado

```
RealCetesbGateway.cancelManifest()
├─ ✅ Validações: manCodigo, manNumero, reason
├─ ✅ Field mapping correto: manJustificativaCancelamento
├─ ✅ Tratamento erro: AppError
├─ ✅ ExtraAudits preparado
├─ ✅ Testes: 4+ cases
└─ ✅ npm run validate/test PASSOU
```

---

## 🎯 Próximo Após HANDOFF 3

HANDOFF 4 (postgres-queue-mtr):
- Criar tabela `audit_logs`
- Persistir extraAudits em DB
- Integrar com service

---

**Tempo:** 30 minutos  
**Complexidade:** Média  
**Bloqueadores:** 0  
**Status:** ✅ PRONTO
