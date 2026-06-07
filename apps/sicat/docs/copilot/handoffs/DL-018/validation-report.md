# Validation Report — DL-018

## Execuções realizadas

### Verificação estática
- `get_errors` em `src/gateways/cetesb-gateway.js` ✅ sem erros
- `get_errors` em `test-mtr-fixed.js` ✅ sem erros

### Validação operacional
- Reprocessamento de job com `worker --once` ✅
- Job validado no banco:
  - `job_id`: `job_892d730b83b05ee507289955de`
  - `status`: `succeeded`
  - `attempts`: `1`

- Manifesto validado no banco:
  - `id`: `man_4c68344b9b8b0f1bb9d1e048f3`
  - `status`: `submitted`
  - `external_status`: `salvo`
  - `external_hash_code`: `xzWyy1zsJ5LVrbiiYN23W7QsY6WxS9`

## Evidências funcionais
- Payload final de submit com catálogos numéricos conforme HAR.
- `marPesoTonelada` consistente (`18`).
- Lookup pós-submit com `404` não interrompe mais o sucesso do submit.

## Observações
- Um job legado (`job_5913f77dda5a85d2a1ae144510`) foi para DLQ por regra de negócio de destinador sem perfil; não impacta a validação do fluxo corrigido em DL-018.
