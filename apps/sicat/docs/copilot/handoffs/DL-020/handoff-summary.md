# DL-020: Handoff Summary

## Handoffs Planejados vs Executados

| # | Handoff | Especialista | Status | Duração | Resultado |
|---|---------|--------------|--------|---------|-----------|
| 1 | Worker Submit Validation | postgres-queue-mtr (manual) | ✅ | 15 min | Worker correto - CETESB retorna apenas hash |
| 2 | Gateway Cancel Validation | integrador-cetesb-mtr (manual) | ✅ | 20 min | Gateway já implementado (lookup + retry) |
| 3 | Batch Cleanup | postgres-queue-mtr (manual) | ✅ | 25 min | 19 requeued, 1 erro |
| 4 | Teste E2E Cancel | tester-qa-mtr (manual) | ⏸️ | 30 min | Bloqueado (lookup 404 persistente) |
| **Total** | | | **75% concluído** | **1h30** | **3/4 handoffs** |

---

## HANDOFF 1: Worker Submit Validation

**Objetivo:** Diagnosticar por que manifestos ficam sem `manCodigo/manNumero`

**Ações:**
1. Verificar jobs DLQ de submit → 10 jobs com erro 400 CETESB
2. Analisar `handleManifestSubmit()` → Código correto (linhas 75-110)
3. Verificar HAR `mtr.cetesb.sp.gov.br_gerar_mtr.har` → CETESB retorna apenas `manHashCode`!

**Descoberta Crítica:**
```json
// Response CETESB submit (HAR linha 16795)
{
  "mensagem": "0Ydw6T0Mu8eQWMfqXmMzUaaj8XiPJh",  // ← manHashCode
  "objetoResposta": null,
  "erro": false
}
```

**manCodigo e manNumero NÃO são retornados no submit!** Esses dados só são obtidos via **lookup** posterior.

**Evidências:**
- Worker: `src/workers/operation-handlers.js:98-101`
- HAR submit: `docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har:16795`

**Resultado:** ✅ Worker está correto - problema é dependência de lookup

---

## HANDOFF 2: Gateway Cancel Validation

**Objetivo:** Validar que gateway faz lookup e enriquece payload cancelamento

**Ações:**
1. Verificar `cancelManifest()` → Lookup com retry já implementado! (linhas 1113-1145)
2. Confirmar payload HAR: `{manCodigo, manNumero, manJustificativaCancelamento}` ✅
3. Validar retry strategy: 5 tentativas, delays crescentes (2s→20s) ✅

**Código Validado:**
```javascript
// src/gateways/cetesb-gateway.js:1113-1145
if ((!externalReference?.manCodigo || !externalReference?.manNumero) && manifest.externalHashCode) {
  let lookup = null;
  let attempts = 0;
  const maxAttempts = 5;
  const delays = [2000, 5000, 10000, 15000, 20000];
  
  while (attempts < maxAttempts) {
    try {
      lookup = await this.lookupManifestByHash(manifest, sessionContext);
      if (lookup.item) {
        externalReference = { manCodigo: lookup.item.manCodigo, manNumero: lookup.item.manNumero };
        extraAudits = [lookup.exchange];
        break; // Sucesso
      }
    } catch (error) {
      const is404 = error instanceof AppError && error.code === 'CETESB_HTTP_ERROR' && error.remoteStatus === 404;
      if (!is404) throw error;
      
      attempts++;
      if (attempts < maxAttempts) {
        console.warn(`Lookup retornou 404 (tentativa ${attempts}/${maxAttempts}), aguardando ${delays[attempts-1]}ms...`);
        await new Promise(resolve => setTimeout(resolve, delays[attempts-1]));
      }
    }
  }
}
```

**Payload CETESB (HAR):**
```json
POST /api/mtr/manifesto/cancelaManifesto
{
  "manCodigo": 22169012,
  "manNumero": "260010679516",
  "manJustificativaCancelamento": "erro no cadastro"
}
```

**Evidências:**
- Gateway: `src/gateways/cetesb-gateway.js:1103-1195`
- HAR cancel: `docs/cetesb/mtr.cetesb.sp.gov.br_cancelar_mtr.har:12454`

**Resultado:** ✅ Gateway implementado corretamente - lookup + retry presentes

---

## HANDOFF 3: Batch Cleanup

**Objetivo:** Corrigir 19 manifestos travados em `submitting`

**Ações:**
1. Criar script `fix-stuck-manifests.js` com dry-run + real mode
2. Identificar manifestos: 19 recuperáveis, 1 irrecuperável
3. Executar cleanup:
   - Irrecuperável: `status='error'` (erro negócio CETESB)
   - Recuperáveis: requeue jobs (`status='queued', attempts=0`)

**Script Criado:**
```bash
node scripts/fix-stuck-manifests.js --dry-run  # Preview
node scripts/fix-stuck-manifests.js            # Executar
```

**Resultado Execução:**
```
Total processados: 20
Marcados como erro: 1
  → man_a5f9f6663700f38cf0c399f99b
  → Motivo: "O Destinador Informado não possui o perfil"

Requeued para retry: 19
  → 19 jobs status='queued', attempts=0
  → 19 manifestos status='draft'
```

**SQL Executado:**
```sql
-- Irrecuperável
UPDATE manifests SET status='error', external_status='erro_submit' 
WHERE id='man_a5f9f6663700f38cf0c399f99b';

-- Recuperáveis (exemplo)
UPDATE jobs 
SET status='queued', attempts=0, next_retry_at=NOW(),
    started_at=NULL, finished_at=NULL, dlq_moved_at=NULL, dlq_reason=NULL
WHERE job_id='job_8388eb37ca0e932d6f2be34bb1';

UPDATE manifests SET status='draft' 
WHERE id='man_389ae77e4d3788e6bb5751c9dd';
```

**Evidências:**
- Script: `scripts/fix-stuck-manifests.js`
- Query DB: `SELECT * FROM manifests WHERE created_at::date='2026-03-09' AND status='submitting'`

**Resultado:** ✅ Cleanup concluído - 19 jobs requeued com sucesso

---

## HANDOFF 4: Teste E2E Cancelamento (Bloqueado)

**Objetivo:** Validar fluxo completo session → manifest → cancel → validate

**Ações:**
1. Criar teste simplificado (cancelar manifesto existente)
2. Iniciar API + worker em background
3. Executar teste → **BLOQUEADO**

**Bloqueio:**
```
→ POST /v1/manifestos/{id}/cancel
✓ Cancel enqueued (202)

[Polling...]
[1-30] Status: cancelling (não muda)

Job status: running
Attempts: 2
Error: "Não foi possível resolver manCodigo/manNumero para cancelar o manifesto. 
       O MTR pode ainda não estar disponível na pesquisa CETESB - 
       tente novamente em alguns segundos."
```

**Root cause:** Lookup CETESB retorna 404 mesmo após 5 tentativas (total ~50s delay)

**Possíveis causas:**
1. MTRs recém-criados não indexados rapidamente pela CETESB
2. Endpoint de lookup incorreto ou parâmetros faltantes
3. CETESB pode ter delay significativo entre submit e indexação

**Script Teste:**
- `test-cancel-existing.js` (manifesto `man_4c68344b9b8b0f1bb9d1e048f3`)

**Evidências:**
- Job: `job_87c8b4fd9705fdbe758b52989b` (status: running, attempts: 2)
- Erro: lookup 404 persistente após retry strategy completa

**Resultado:** ⏸️ Bloqueado - necessária investigação lookup CETESB ou aguardar indexação

---

## Resumo de Descobertas Técnicas

### 1. CETESB Submit Response (Crítico)
```json
PUT /api/mtr/manifesto
Response: { "mensagem": "<manHashCode>", "objetoResposta": null, "erro": false }
```

**manCodigo e manNumero NÃO retornados!** Apenas `manHashCode`.

### 2. Lookup Obrigatório para Cancel
Cancelamento **DEPENDE** de lookup para obter `manCodigo/manNumero`:

```
POST /api/mtr/manifesto/pesquisaManifestoParaListagem
Body: { "manHashCode": "..." }
Response: { "objetoResposta": [ { "manCodigo": 22169012, "manNumero": "260010679516", ... } ] }
```

### 3. Gateway Já Implementa Retry
Lookup com 5 tentativas e delays crescentes (2s, 5s, 10s, 15s, 20s) já implementado desde DL-019.

### 4. Timing Issue CETESB
MTRs recém-criados podem não aparecer imediatamente na pesquisa → necessário aguardar indexação.

---

## Métricas

- **Tempo total:** 1h30
- **Handoffs planejados:** 4
- **Handoffs concluídos:** 3 (75%)
- **Handoffs bloqueados:** 1 (25%)
- **Manifestos corrigidos:** 20 (19 requeued, 1 erro)
- **Scripts criados:** 1 (`fix-stuck-manifests.js`)
- **Validações automáticas:** 0 (bloqueadas)

---

## Lições Aprendidas

1. **CETESB não retorna dados completos no submit** → lookup é obrigatório
2. **Timing matters** → MTRs podem não aparecer imediatamente na pesquisa
3. **Gateway retry strategy é essencial** → já implementado corretamente
4. **Batch cleanup eficiente** → script reutilizável para futuros problemas

---

## Recomendações

### Imediato
- Aguardar algumas horas e testar cancelamento em manifestos já indexados
- Ou usar manifesto mais antigo (dias atrás) para validar fluxo

### Curto Prazo
- Investigar endpoint lookup CETESB (pode ter parâmetros adicionais)
- Aumentar delays no retry (ex: 5s, 10s, 20s, 30s, 60s)
- Adicionar log de auditoria do lookup para debug

### Longo Prazo
- Implementar cache de `manCodigo/manNumero` após lookup bem-sucedido
- Criar job assíncrono separado para enriquecer manifestos via lookup periódico
- Implementar webhook/polling CETESB para detectar quando MTR está indexado
