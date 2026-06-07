---
applyTo: "mtr_automacao_openapi_interna.yaml,openapi*.yaml,openapi*.yml,src/routes/**/*.ts,src/generated/**/*.ts,src/controllers/**/*.ts,src/schemas/**/*.ts,src/validators/**/*.ts"
excludeAgent:
  - documentador-mtr
---
## Instruções para contrato HTTP

- OpenAPI é a fonte de verdade do contrato público interno.
- `src/generated/operations.js` e `examples/` devem permanecer consistentes com o YAML.
- Endpoints de comando devem manter padrão de resposta assíncrona com `jobId`, `commandId` e `correlationId` quando aplicável.
- Padronize erros em `problem details`.
- Não quebre compatibilidade sem registrar decisão em `docs/copilot/13-decision-log.md`.
- Se houver divergência entre implementação e contrato, corrija ambos no mesmo pacote de mudança.
