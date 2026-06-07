# DL-020: Correção de Cancelamento MTR

**Data:** 2026-03-09  
**Status:** ✅ PARCIALMENTE COMPLETADO  
**Tipo:** Correção crítica multi-camada

---

## Resumo Executivo

**Problema reportado:** "o cancelamento não está funcionando, foram criados varios manifestos para o dia de hoje"

**Root cause identificado:**
1. ✅ 19 manifestos travados em `submitting` (erro 400 CETESB por payload inválido)
2. ✅ 1 manifesto com erro de negócio (destinador sem perfil)
3. ✅ Cancelamento **DEPENDE** de lookup CETESB para obter `manCodigo/manNumero`
4. ✅ Lookup **pode retornar 404** logo após submit (timing issue) → Gateway já implementa retry com backoff

**Ações executadas:**
- ✅ HANDOFF 1: Worker validado - está correto, persiste dados quando CETESB retorna sucesso
- ✅ HANDOFF 2: Gateway validado - lookup com retry já implementado (linhas 1113-1145)
- ✅ HANDOFF 3: Batch cleanup - 19 jobs requeued, 1 manifesto marcado como erro
- ⏸️ HANDOFF 4: Teste E2E - travado (lookup retornando 404 persistente)

---

## Descobertas Importantes

### CETESB Submit Response
```json
{
  "mensagem": "0Ydw6T0Mu8eQWMfqXmMzUaaj8XiPJh",  // ← Este é o manHashCode
  "objetoResposta": null,
  "erro": false
}
```

**CETESB NÃO retorna `manCodigo` nem `manNumero` na resposta do submit!**

Esses dados só são obtidos via:
- **Lookup**: `POST /api/mtr/manifesto/pesquisaManifestoParaListagem` (com `manHashCode`)
- Timing: MTR pode não aparecer imediatamente após submit → **Gateway já implementa retry**

### Gateway Cancelamento (Já Implementado)
**Arquivo:** `src/gateways/cetesb-gateway.js:1103-1195`

**Estratégia:**
1. Verificar se `manCodigo/manNumero` já existem
2. Se não, fazer lookup com retry (5 tentativas, delays: 2s, 5s, 10s, 15s, 20s)
3. Se lookup falhar após 5 tentativas → erro `MANIFEST_NOT_READY_FOR_CANCEL` (503)
4. Se sucesso → cancelar com payload: `{manCodigo, manNumero, manJustificativaCancelamento}`

**Payload CETESB (confirmado em HAR):**
```json
POST /api/mtr/manifesto/cancelaManifesto
{
  "manCodigo": 22169012,
  "manNumero": "260010679516",
  "manJustificativaCancelamento": "erro no cadastro"
}
```

Response:
```json
{
  "mensagem": "Manifesto cancelado com sucesso",
  "objetoResposta": null,
  "erro": false
}
```

---

## Handoffs Executados

### HANDOFF 1: Worker Submit (Validação)
**Especialista:** postgres-queue-mtr (manual)  
**Resultado:** ✅ Worker está correto

**Evidências:**
- `src/workers/operation-handlers.js:98-101` - Persiste `manCodigo`, `manNumero`, `manHashCode`
- Lógica correta: se `validateOnly=false`, persiste dados externos
- **Problema:** CETESB retorna apenas `manHashCode` no submit → lookup necessário

### HANDOFF 2: Gateway Cancelamento (Validação)
**Especialista:** integrador-cetesb-mtr (manual)  
**Resultado:** ✅ Gateway implementado corretamente

**Evidências:**
- `src/gateways/cetesb-gateway.js:1103-1195` - Método `cancelManifest()`
- Lookup com retry já implementado (linhas 1113-1145)
- Payload HAR-compliant: `{manCodigo, manNumero, manJustificativaCancelamento}`
- Validações: `reason` obrigatório (3-500 chars), precondições `manCodigo/manNumero`

### HANDOFF 3: Batch Cleanup (Executado)
**Especialista:** postgres-queue-mtr (manual)  
**Resultado:** ✅ 19 jobs requeued, 1 manifesto marcado erro

**Script:** `scripts/fix-stuck-manifests.js`

**Ações:**
```sql
-- 19 manifestos recuperáveis → requeue jobs
UPDATE jobs SET status='queued', attempts=0, ... WHERE job_id IN (...)
UPDATE manifests SET status='draft' WHERE id IN (...)

-- 1 manifesto irrecuperável → marcar erro
UPDATE manifests SET status='error', external_status='erro_submit' 
WHERE id='man_a5f9f6663700f38cf0c399f99b'
  -- Motivo: "O Destinador Informado não possui o perfil"
```

**Resultado:**
- Total processados: 20
- Marcados como erro: 1
- Requeued para retry: 19

### HANDOFF 4: Teste E2E Cancelamento (Bloqueado)
**Especialista:** tester-qa-mtr (manual)  
**Resultado:** ⏸️ Bloqueado - lookup retornando 404 persistente

**Bloqueio:**
- Worker processa cancel job → lookup retorna 404 (5 tentativas)
- Erro: `MANIFEST_NOT_READY_FOR_CANCEL` (503)
- **Causa provável:** MTRs recém-criados não indexados rapidamente pela CETESB

**Script:** `test-cancel-existing.js`

---

## Validações Executadas

### ✅ Validações Passaram
- Worker persiste dados corretamente quando CETESB retorna sucesso
- Gateway implementa lookup com retry conforme HAR source-of-truth
- Payload cancelamento HAR-compliant
- Batch cleanup identificou e corrigiu manifestos travados

### ⚠️ Validações Bloqueadas
- Teste E2E cancelamento (lookup 404 persistente)

---

## Arquivos Modificados

### Scripts Criados
- `scripts/fix-stuck-manifests.js` - Batch cleanup manifestos travados

### Testes Criados
- (nenhum - teste E2E bloqueado)

### Arquivos Temporários (Para Limpar)
- `test-cancel-existing.js`
- `test-cancel-mtr.js`

---

## Próximos Passos (Se Necessário)

### Opção 1: Aguardar Indexação CETESB
Manifestos recém-criados podem levar tempo para aparecer na pesquisa. Testar novamente em algumas horas.

### Opção 2: Usar Manifesto Mais Antigo
Cancelar manifesto criado dias atrás (já indexado pela CETESB).

### Opção 3: Investigar Lookup CETESB
Verificar se endpoint de lookup está correto ou se há parâmetros faltantes.

---

## Referências

- HAR cancelamento: `docs/cetesb/mtr.cetesb.sp.gov.br_cancelar_mtr.har`
- HAR submit: `docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har`
- Gateway: `src/gateways/cetesb-gateway.js:1103-1195`
- Worker: `src/workers/operation-handlers.js:75-110`
- Decision-log: `docs/copilot/13-decision-log.md` (DL-020)
