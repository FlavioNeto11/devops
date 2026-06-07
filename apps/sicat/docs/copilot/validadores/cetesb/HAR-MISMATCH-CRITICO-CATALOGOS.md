# HAR Mismatch Crítico: Catálogos Incompletos

**Data**: 2026-03-09  
**Autor**: orquestrador-mtr (Copilot Agent)  
**Severidade**: 🔴 BLOQUEADOR  
**Escalonamento**: → **`integrador-cetesb-mtr`** + **`validador-cetesb-mtr`**

---

## Resumo Executivo

CETESB retorna **400 Bad Request (HTML)** ao receber payloads de manifesto com códigos de catálogo em formato STRING ao invés de objetos COMPLETOS com IDs NUMÉRICOS.

---

## Evidência: HAR vs Implementação Atual

### Nosso Payload (REJEITADO)

```json
{
  "listaManifestoResiduo": [{
    "marQuantidade": 18,
    "marPesoTonelada": 18,
    "residuo": {
      "resCodigo": 731,
      "resCodigoIbama": null,
      "resDescricao": null,
      "grrDescricao": null,
      "grrRepresentacao": null
    },
    "unidade": {
      "uniCodigo": "TON",         // ❌ STRING ao invés de NUMBER
      "uniDescricao": null,
      "uniSigla": null
    },
    "tratamento": {
      "traCodigo": "D1",           // ❌ STRING ao invés de NUMBER
      "traDescricao": null
    },
    "classe": {
      "claCodigo": "I",            // ❌ STRING ao invés de NUMBER
      "claDescricao": null
    },
    "tipoEstado": null,            // ❌ FALTANDO
    "tipoAcondicionamento": null   // ❌ FALTANDO
  }]
}
```

### HAR Payload (ACEITO - Linha 16745)

```json
{
  "listaManifestoResiduo": [{
    "marQuantidade": 18,
    "marPesoTonelada": 18,
    "residuo": {
      "resCodigo": 731,
      "resCodigoIbama": "Classe A",
      "resDescricao": "Resíduos reutilizáveis ou recicláveis como agregados...",
      "grrDescricao": "Resíduos de Construção Civil",
      "grrRepresentacao": "1710"
    },
    "unidade": {
      "uniCodigo": 3,              // ✅ NUMBER
      "uniDescricao": "Tonelada",
      "uniSigla": "TON"
    },
    "tratamento": {
      "traCodigo": 51,             // ✅ NUMBER
      "traDescricao": "Aterro de Reservação - RCC"
    },
    "classe": {
      "claCodigo": 11,             // ✅ NUMBER
      "claDescricao": "CLASSE A (RCC)"
    },
    "tipoEstado": {
      "tieCodigo": 4,
      "tieDescricao": "SOLIDO",
      "tieCodigoReferencia": 1
    },
    "tipoAcondicionamento": {
      "tiaCodigo": 4,
      "tiaDescricao": "CAÇAMBA ABERTA",
      "tiaCodigoReferencia": 2
    }
  }]
}
```

---

## Análise de Diferenças

| Campo | Nosso Código | HAR (Aceito) | Status |
|-------|--------------|--------------|--------|
| `marQuantidade` | 18 | 18 | ✅ |
| `marPesoTonelada` | 18 | 18 | ✅ |
| `residuo.resCodigo` | 731 | 731 | ✅ |
| `residuo.resCodigoIbama` | null | "Classe A" | ⚠️ |
| `residuo.resDescricao` | null | "Resíduos reutilizáveis..." | ⚠️ |
| `residuo.grrDescricao` | null | "Resíduos de Construção Civil" | ⚠️ |
| `residuo.grrRepresentacao` | null | "1710" | ⚠️ |
| `unidade.uniCodigo` | "TON" (STRING) | 3 (NUMBER) | ❌ CRÍTICO |
| `unidade.uniDescricao` | null | "Tonelada" | ⚠️ |
| `unidade.uniSigla` | null | "TON" | ⚠️ |
| `tratamento.traCodigo` | "D1" (STRING) | 51 (NUMBER) | ❌ CRÍTICO |
| `tratamento.traDescricao` | null | "Aterro de Reservação - RCC" | ⚠️ |
| `classe.claCodigo` | "I" (STRING) | 11 (NUMBER) | ❌ CRÍTICO |
| `classe.claDescricao` | null | "CLASSE A (RCC)" | ⚠️ |
| `tipoEstado` | null | `{tieCodigo: 4, ...}` | ❌ CRÍTICO |
| `tipoAcondicionamento` | null | `{tiaCodigo: 4, ...}` | ❌ CRÍTICO |

---

## Descoberta: Padrão de Enriquecimento Necessário

Assim como implementamos `enrichPartnerData()` que busca dados completos de `/api/mtr/pesquisaParceiroByCodigo`, precisamos implementar **`enrichResidueData()`** que:

### 1. Busca catálogos de referência

- **`GET /api/mtr/unidade`** → mapear "TON" → `{uniCodigo: 3, uniDescricao: "Tonelada", uniSigla: "TON"}`
- **`GET /api/mtr/tratamento`** → mapear "D1" → `{traCodigo: 51, traDescricao: "Aterro de Reservação - RCC"}`
- **`GET /api/mtr/classe`** → mapear "I" → `{claCodigo: 11, claDescricao: "CLASSE A (RCC)"}`
- **`GET /api/mtr/tipoEstado`** → buscar tipoEstado (ex: SOLIDO = 4)
- **`GET /api/mtr/tipoAcondicionamento`** → buscar tipoAcondicionamento (ex: CAÇAMBA ABERTA = 4)
- **`GET /api/mtr/residuo/{codigo}`** → enriquecer resCodigoIbama, resDescricao, grrDescricao, grrRepresentacao

### 2. Aplica mapeamento antes de `submitManifest`

```javascript
async submitManifest(manifest, payload) {
  const { sessionContext } = await this.resolveSession({ ... });
  
  // ✅ JÁ IMPLEMENTADO
  const enrichedPartners = await this.enrichPartnerData(manifest.payload, sessionContext);
  
  // ❌ FALTANDO
  const enrichedResidues = await this.enrichResidueData(enrichedPartners, sessionContext);
  
  const cetesbPayload = mapManifestToCetesb(enrichedResidues, sessionContext);
  // ...
}
```

---

## Tabela de Mapeamento Necessária

### Unidades

| Código String | Código Numérico | Descrição | Sigla |
|---------------|-----------------|-----------|-------|
| "TON" | 3 | "Tonelada" | "TON" |
| "KG" | ? | "Quilograma" | "KG" |
| "M3" | ? | "Metro Cúbico" | "M3" |

### Tratamentos

| Código String | Código Numérico | Descrição |
|---------------|-----------------|-----------|
| "D1" | 51 | "Aterro de Reservação - RCC" |

### Classes

| Código String | Código Numérico | Descrição |
|---------------|-----------------|-----------|
| "I" | 11 | "CLASSE A (RCC)" |

### Tipos de Estado

| tieCodigo | tieDescricao | tieCodigoReferencia |
|-----------|--------------|---------------------|
| 4 | "SOLIDO" | 1 |

### Tipos de Acondicionamento

| tiaCodigo | tiaDescricao | tiaCodigoReferencia |
|-----------|--------------|---------------------|
| 4 | "CAÇAMBA ABERTA" | 2 |

---

## Arquivos Impactados

### Modificações necessárias

1. **`src/gateways/cetesb-gateway.js`**:
   - Adicionar método `enrichResidueData()`
   - Buscar catálogos: unidades, tratamentos, classes, tipoEstado, tipoAcondicionamento, residuos
   - Mapear códigos STRING → objetos NUMBER completos

2. **`src/lib/validators/manifest-validator.js`** (opcional):
   - Validar que códigos STRING fornecidos existem nos catálogos

3. **`test-mtr-fixed.js`**:
   - Manter códigos STRING (TON, D1, I) → enriquecimento faz conversão automática

---

## Prioridade de Implementação

### Alta (Bloqueador)

✅ `unidade.uniCodigo`: STRING "TON" → NUMBER 3  
✅ `tratamento.traCodigo`: STRING "D1" → NUMBER 51  
✅ `classe.claCodigo`: STRING "I" → NUMBER 11  

### Média (Recomendado)

⚠️ `tipoEstado`: null → `{tieCodigo: 4, tieDescricao: "SOLIDO", tieCodigoReferencia: 1}`  
⚠️ `tipoAcondicionamento`: null → `{tiaCodigo: 4, tiaDescricao: "CAÇAMBA ABERTA", tiaCodigoReferencia: 2}`  

### Baixa (Opcional - melhora debugging)

ℹ️ `residuo.resCodigoIbama`: null → "Classe A"  
ℹ️ `residuo.resDescricao`: null → "Resíduos reutilizáveis..."  
ℹ️ `residuo.grrDescricao`: null → "Resíduos de Construção Civil"  
ℹ️ `residuo.grrRepresentacao`: null → "1710"  

---

## Próximos Passos

1. **Escalar para `validador-cetesb-mtr`**:
   - Validar se existem outros endpoints de catálogo necessários
   - Confirmar estrutura de resposta de `/api/mtr/unidade`, `/api/mtr/tratamento`, etc.

2. **Escalar para `integrador-cetesb-mtr`**:
   - Implementar `enrichResidueData()` similar a `enrichPartnerData()`
   - Criar cache de catálogos (opcional: persistir em `catalogs` table)
   - Aplicar enriquecimento antes de `mapManifestToCetesb()`

3. **Teste de regressão**:
   - Após implementação, executar `node test-mtr-fixed.js`
   - Validar que payload enviado match HAR linha 16745
   - Confirmar resposta 200 OK da CETESB

---

## Referências

- **HAR Original**: `docs/cetesb/mtr.cetesb.sp.gov.br_gerar_mtr.har`, linha 16745
- **Payload Aceito**: POST `/api/mtr/manifesto` retornou 200 OK com `{"mensagem":"0Ydw6T0Mu8eQWMfqXmMzUaaj8XiPJh", "erro": false}`
- **Decision Log**: DL-XXX (criar após implementação)

---

## Notas de Contexto

- `parCadastroCetesb: "null-null"` **NÃO é bug** → é o dado real cadastrado na CETESB para parceiro 176163
- `marPesoTonelada: 18` ✅ corrigido (era 18000)
- `quantity: 18` ✅ corrigido (era 18000)
- `manNomeMotorista`, `manPlacaVeiculo` ✅ populados do HAR

**Status**: 🔴 BLOQUEADO aguardando implementação de enriquecimento de catálogos
