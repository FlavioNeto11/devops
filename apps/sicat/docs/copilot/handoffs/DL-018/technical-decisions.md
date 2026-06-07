# Technical Decisions — DL-018

## 1) Enriquecimento de resíduos no gateway
**Decisão:** criar `enrichResidueData()` em `src/gateways/cetesb-gateway.js`.

**Motivo:** o HAR aceito exige estruturas de catálogo com códigos numéricos e metadados (não apenas strings simplificadas).

**Resultado:** payload passa a conter:
- `unidade.uniCodigo = 3`
- `tratamento.traCodigo = 51`
- `classe.claCodigo = 11`
- `tipoEstado.tieCodigo = 4`
- `tipoAcondicionamento.tiaCodigo = 4`

## 2) Conversão de peso para toneladas
**Decisão:** ajustar cálculo de `marPesoTonelada` para considerar código numérico e sigla da unidade.

**Motivo:** após enrichment, unidade pode vir como código numérico (ex.: `3`) e o cálculo anterior dependia de string (`TON`/`KG`).

## 3) Resiliência no lookup pós-submit
**Decisão:** tratar `404` de `lookupManifestByHash` como não-bloqueante quando já há `manHashCode` retornado no `PUT /api/mtr/manifesto`.

**Motivo:** a consulta de pesquisa pode falhar intermitentemente mesmo com submit já aceito.

**Resultado:** evita retries indevidos e DLQ por erro de lookup secundário.

## 4) Massa de teste alinhada ao HAR
**Decisão:** usar parceiros de transporte/destino do HAR no `test-mtr-fixed.js`.

**Motivo:** evitar rejeição de perfil no destinador e reproduzir cenário real aceito.
