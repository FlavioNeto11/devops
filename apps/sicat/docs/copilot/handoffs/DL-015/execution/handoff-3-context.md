# HANDOFF 3: Contexto para Integrador CETESB

**Predecessor:** HANDOFF 2 (Validação CETESB) ✅ COMPLETO  
**Próximo Agente:** integrador-cetesb-mtr  
**Tempo Estimado:** 30 minutos  

---

## Contexto Carregado de HANDOFF 2

### O Que Já Foi Feito

1. **HANDOFF 1:** Schema OpenAPI `AuditLogEntry` criado + endpoint documentado
2. **HANDOFF 2:** Validação contra HAR real → nenhuma divergência crítica

### O Que Você Precisa Implementar Agora

Integração da gateway CETESB com mapeamento de campos e rastreamento de auditoria.

---

## Interface Esperada

### Gateway Method Signature

```javascript
/**
 * Cancela um manifesto na CETESB com rastreamento de auditoria
 * @param {Object} params
 * @param {number} params.externalCode - manCodigo (CETESB manifest ID)
 * @param {string} params.manifestNumber - manNumero (sequencial)
 * @param {string} params.reason - motivo do cancelamento (3-500 chars)
 * @param {string} params.sessionContext - contexto de autenticação
 * @returns {Promise<Object>} { success: boolean, cenesResponse: Object, timestamp: ISO }
 * @throws {AppError} 400, 404, 500 conforme caso
 */
async cancelManifesto({ externalCode, manifestNumber, reason, sessionContext })
```

### Request para CETESB

```json
{
  "manCodigo": 22169012,
  "manNumero": "260010679516",
  "manJustificativaCancelamento": "erro no cadastro"
}
```

### Response de CETESB

```json
{
  "mensagem": "Manifesto cancelado com sucesso",
  "objetoResposta": null,
  "erro": false
}
```

---

## Mapeamento de Campos

| OpenAPI | CETESB | Tipo | Origem |
|---------|--------|------|--------|
| `id` (path) | — | string | Nosso banco (manifestId) |
| `reason` | `manJustificativaCancelamento` | string | Request body |
| `requestedBy` | — | string (implícito) | sessionContext.userId |
| — | `manCodigo` | number | manifestos.external_code |
| — | `manNumero` | string | manifestos.manifest_number |

### Exemplo Prático

**Entrada HANDOFF 3:**
```javascript
await manifestCancelService.cancelManifesto({
  manifestId: 'man_01JQW5M6YY9M7K7B5N63GQ6E9S',
  reason: 'erro no cadastro',
  requestedBy: 'flavio.padilha',
  sessionContext: { ... }
})
```

**O que você faz:**
1. Buscar manifesto no DB → obter `external_code` + `manifest_number`
2. Validar que manifesto existe e está em estado permitido (não-CANCELLED)
3. Chamar RealCetesbGateway.cancelManifesto():
   ```javascript
   const result = await cetesbGateway.cancelManifesto({
     externalCode: 22169012,
     manifestNumber: "260010679516",
     reason: "erro no cadastro",
     sessionContext
   });
   ```
4. Validar `result.cenesResponse.erro === false`
5. Registrar no job.details para auditoria posterior

---

## Validações Esperadas

### Input Validation

- [x] `reason`: obrigatório, string, 3-500 chars (já em OpenAPI)
- [x] `manifestId`: deve resolver para manifesto válido
- [x] Manifesto não deve estar em status final (CANCELLED, FAILED)
- [x] sessionContext válido (autenticação)

### CETESB Response Validation

- [x] `erro === false` (sucesso)
- [x] `mensagem` present (confirmação textual)
- [x] `objetoResposta === null` (normal para cancel)
- [x] Status HTTP === 200

### Error Scenarios

| Cenário | Handler |
|---------|---------|
| Manifesto não encontrado no DB | 404 AppError |
| Manifesto já cancelado | 400 AppError ("already cancelled") |
| CETESB retorna erro | 500 AppError com msg CETESB |
| Timeout | Retry com backoff (DL-010) |
| Rede indisponível | Retry com backoff (DL-010) |

---

## Estrutura de Dados Esperada em Job

**job.details após sucesso:**
```json
{
  "manifestId": "man_01JQW5M6YY9M7K7B5N63GQ6E9S",
  "externalCode": 22169012,
  "manifestNumber": "260010679516",
  "reason": "erro no cadastro",
  "cenesResponse": {
    "mensagem": "Manifesto cancelado com sucesso",
    "erro": false,
    "objetoResposta": null
  },
  "cenesCanceledAt": "2026-03-08T20:33:09Z",
  "userId": "flavio.padilha"
}
```

Isto será usado em HANDOFF 4 para criar AuditLogEntry.

---

## Testes Mínimos Esperados

### Unit Tests
- [ ] Mapeamento: OpenAPI → CETESB ✅
- [ ] Parsing de response ✅
- [ ] Validação de erro CETESB ✅
- [ ] Timestamp capturado corretamente ✅

### Integration Tests
- [ ] Mock CETESB retorna sucesso → job.details preenchido ✅
- [ ] Mock CETESB retorna erro → AppError lançado ✅
- [ ] Timeout → Retry agendado ✅

### E2E Tests (em HANDOFF 5)
- [ ] POST /v1/manifestos/{id}/cancel → 202
- [ ] Worker processa job
- [ ] GET /v1/manifestos/{id} → status=cancelled
- [ ] GET /v1/audit/{correlationId} → AuditLogEntry

---

## Referências

**Evidência HAR:**  
`docs/cetesb/mtr.cetesb.sp.gov.br_cancelar_mtr.har` (linhas 12300-12600)

**OpenAPI Contrato:**  
`openapi/mtr_automacao_openapi_interna.yaml` (path /v1/manifestos/{id}/cancel)

**Decision Log:**  
`docs/copilot/13-decision-log.md` (DL-015)

**Análise HANDOFF 2:**  
`docs/copilot/handoffs/DL-015/execution/handoff-2-cetesb-validation.md`

---

## Checklist de Saída HANDOFF 3

- [ ] `src/gateways/real-cetesb-gateway.js`: método `cancelManifesto()` implementado
- [ ] Mapeamento de campos: OpenAPI → CETESB
- [ ] Validação de response CETESB (erro flag)
- [ ] job.details preenchido com resposta CETESB
- [ ] Unit tests: mapeamento + validação (4+)
- [ ] Integration tests: mock CETESB + success/error (2+)
- [ ] npm run test ✅ PASSA
- [ ] Documentação: fluxo de cancelamento atualizado
- [ ] DL-015 atualizado com HANDOFF 3

**Bloqueadores:** Nenhum

---

**Status:** 🟢 PRONTO PARA COMEÇAR

Próximo: HANDOFF 4 (postgres-queue-mtr) - Criar tabela audit_logs + registrar entries
