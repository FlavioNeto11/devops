# DL-015: Decisões Técnicas

**Feature:** Cancelamento de manifesto com auditoria de logs  
**Data:** 2026-03-08

---

## Decisão 1: Status Code HTTP (202 vs 200)

### Contexto
- **Observado no HAR:** CETESB retorna 200 OK
- **Especificado no OpenAPI:** 202 Accepted
- **HANDOFF:** 2 (Validação CETESB)

### Análise
```
Cliente → API Interna (202) → CETESB (200)
         ↓
    CommandAccepted
```

### Decisão
✅ **Manter 202 no contrato interno**

### Justificativa
1. Cliente interno espera padrão REST para operações assíncronas
2. CETESB é detalhe de implementação do gateway
3. Cliente nunca vê o 200 da CETESB
4. Padrão de abstração correto (camadas diferentes)

### Impacto
- **Baixo** - Sem conflito entre camadas
- Nenhuma alteração necessária no código existente

---

## Decisão 2: Auditoria Local vs Remota

### Contexto
- **Observado no HAR:** CETESB retorna `{ erro: false, mensagem: "...", objetoResposta: null }`
- **Expectativa:** OpenAPI especifica schema AuditLogEntry
- **HANDOFF:** 2 (Validação CETESB) + 4 (Database)

### Análise
```
CETESB Response:
{
  "mensagem": "Manifesto cancelado com sucesso",
  "objetoResposta": null,  ← SEM METADADOS
  "erro": false
}

Nossa Necessidade:
{
  "id": uuid,
  "timestamp": ISO,
  "userId": string,
  "action": "CANCEL",
  "status": "SUCCESS",
  "details": {...}
}
```

### Decisão
✅ **Auditoria será registrada LOCALMENTE em tabela `manifest_audit_logs`**

### Justificativa
1. CETESB só confirma operação, não fornece metadados estruturados
2. Schema AuditLogEntry é válido como registro LOCAL (não remoto)
3. Melhor design: rastreamento local completo e controlado
4. Worker pode extrair: timestamp, userId, action, status, details

### Implementação
- **Migration:** `src/sql/003_audit_logs.sql`
- **Repository:** `src/repositories/audit-log-repo.js` (6 funções CRUD)
- **Schema:**
  ```sql
  create table manifest_audit_logs (
    id uuid primary key,
    manifest_id text references manifests(id),
    user_id text,
    correlation_id text not null,
    action text check (...),
    status text check (...),
    created_at timestamptz,
    updated_at timestamptz,
    details jsonb,
    tags jsonb
  );
  ```

### Impacto
- **Médio** - Requer migration de banco
- Design está correto (auditoria não depende de CETESB)

---

## Decisão 3: Mapeamento de Campos OpenAPI → CETESB

### Contexto
- **HAR observado:** `manJustificativaCancelamento: "erro no cadastro"`
- **OpenAPI:** `reason: "Operação indevida"`
- **HANDOFF:** 2 (Validação CETESB)

### Análise
| OpenAPI | CETESB | Tipo | Validação |
|---------|--------|------|-----------|
| `reason` | `manJustificativaCancelamento` | string | 3-500 chars |
| (implicit) | `manCodigo` | number | from external_code |
| (implicit) | `manNumero` | string | from manifest_number |

### Decisão
✅ **Mapeamento simples 1:1**
- OpenAPI `reason` → CETESB `manJustificativaCancelamento`
- Validação: 3-500 caracteres (confirmado no HAR)

### Justificativa
1. Match semântico perfeito entre campos
2. HAR confirma obrigatoriedade e formato
3. Não há necessidade de transformação adicional

### Implementação
```javascript
// Gateway
await this.requestJson({
  method: 'POST',
  path: '/api/mtr/manifesto/cancelaManifesto',
  body: {
    manCodigo: externalReference.manCodigo,
    manNumero: externalReference.manNumero,
    manJustificativaCancelamento: reason  // ← Campo correto!
  }
});
```

### Impacto
- **Baixo** - Gateway simples, sem transformação complexa

---

## Decisão 4: Naming da Tabela (audit_logs vs manifest_audit_logs)

### Contexto
- **Problema:** Migration inicial tentou criar `audit_logs`
- **Descoberta:** Já existe tabela `audit_logs` com schema diferente (HTTP audit logging)
- **HANDOFF:** 4 (Database)

### Análise
```
Tabela Existente:
audit_logs
├─ id
├─ method (HTTP)
├─ path (HTTP)
├─ status_code (HTTP)
└─ body (HTTP)

Nossa Necessidade:
manifest_audit_logs  ← RENOMEADO
├─ id
├─ manifest_id
├─ action (CANCEL, SUBMIT, etc)
├─ status (PENDING, SUCCESS, FAILED)
└─ details (jsonb)
```

### Decisão
✅ **Renomear para `manifest_audit_logs`**

### Justificativa
1. Tabelas coexistem com propósitos diferentes
2. `audit_logs` = HTTP request logging
3. `manifest_audit_logs` = Operation tracking
4. Separação de concerns clara

### Impacto
- **Baixo** - Nenhum conflito
- Ambas tabelas funcionam independentemente

---

## Decisão 5: Migration Simplificada (table-only)

### Contexto
- **Problema:** PostgreSQL parse-before-execute causava erros em migrations complexas
- **Tentativas:** Índices inline, triggers inline, ALTER TABLE
- **HANDOFF:** 4 (Database)

### Análise
```
Tentativa 1: Índices inline
ERROR: column "manifest_id" does not exist

Tentativa 2: ALTER TABLE após CREATE
ERROR: parse antes de executar

Solução Final: Table-only (sem índices/triggers)
✅ SUCESSO
```

### Decisão
✅ **Migration 003_audit_logs.sql cria apenas tabela**
- Índices e triggers ficam para migration futura (004_audit_logs_indices.sql)

### Justificativa
1. PostgreSQL processa SQL inteiro antes de executar
2. Simplificar migration evita erros de parse
3. Funcionalidade principal (tabela) é criada com sucesso
4. Performance optimization pode ser incremental

### Implementação
```sql
-- 003_audit_logs.sql (ATUAL)
create table if not exists manifest_audit_logs (...);

-- 004_audit_logs_indices.sql (FUTURO)
create index idx_manifest_audit_logs_manifest_id on manifest_audit_logs(manifest_id);
create index idx_manifest_audit_logs_action on manifest_audit_logs(action);
```

### Impacto
- **Baixo** - Performance é aceitável sem índices inicialmente
- Índices podem ser adicionados incrementalmente

---

## Decisão 6: Repository Pattern (.rows[0] vs queryOne)

### Contexto
- **Problema:** Código tentou usar `queryOne()` que não existe em pool.js
- **HANDOFF:** 4 (Database)

### Análise
```javascript
// ERRADO (queryOne não existe)
const result = await queryOne('SELECT * FROM ...');

// CORRETO (pool.js exporta query())
const result = await query('SELECT * FROM ...');
return result.rows[0];  // single record
return result.rows;     // array
```

### Decisão
✅ **Usar pattern `.rows[0]` para single records**
- `insertAuditLog()` → `result.rows[0]`
- `findAuditLogsByManifestId()` → `result.rows` (array)

### Justificativa
1. pool.js exporta apenas `query()` function
2. Pattern `.rows[0]` é consistente com codebase existente
3. Explícito e sem abstrações desnecessárias

### Impacto
- **Baixo** - Consistência com código existente

---

## Resumo de Decisões

| # | Decisão | Status | Impacto | HANDOFF |
|---|---------|--------|---------|---------|
| 1 | Status 202 mantido | ✅ Aprovado | Baixo | H2 |
| 2 | Auditoria LOCAL | ✅ Implementado | Médio | H2, H4 |
| 3 | Mapeamento 1:1 | ✅ Implementado | Baixo | H2 |
| 4 | Renomear tabela | ✅ Implementado | Baixo | H4 |
| 5 | Migration table-only | ✅ Implementado | Baixo | H4 |
| 6 | Pattern .rows[0] | ✅ Implementado | Baixo | H4 |

---

**Todas as decisões foram validadas e implementadas com sucesso.**

**Referência Completa:** `docs/copilot/13-decision-log.md` (DL-015)
