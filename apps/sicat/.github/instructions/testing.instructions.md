---
applyTo: "tests/**/*.js,scripts/smoke-*.js"
excludeAgent:
  - documentador-mtr
---
## Instruções para testes e QA

- Prefira testes por comportamento e fluxo, não só por linha.
- Cubra principalmente:
  - bootstrap de sessão
  - submit de manifesto
  - print de manifesto
  - cancelamento
  - sync de catálogos
  - idempotência
  - retry de jobs
- Sempre que integração real não for viável, crie doubles controlados e um checklist de validação manual.
- Mantenha fixtures pequenas e legíveis.
- Cada teste novo deve indicar claramente cenário, entrada e resultado esperado.
