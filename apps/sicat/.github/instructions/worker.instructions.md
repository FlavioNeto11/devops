---
applyTo: "src/worker.ts,src/workers/**/*.ts,src/jobs/**/*.ts"
excludeAgent:
  - documentador-mtr
---
## Instruções para worker e jobs

- Operações assíncronas precisam ser reexecutáveis.
- Cada handler deve deixar claro:
  - entrada esperada
  - dependências
  - efeitos colaterais
  - critérios de sucesso
  - critérios de retry
- Não misture polling de fila com regra de negócio.
- Atualize status do job de forma explícita.
- Falhas transitórias e falhas definitivas devem ser distinguíveis.
- Em operações de documento, persista o artefato antes de marcar sucesso.
- Em operações com a CETESB, audite request lógico e response lógico sem vazar segredos.
