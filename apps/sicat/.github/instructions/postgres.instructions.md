---
applyTo: "src/db/**/*.ts,src/db/**/*.js,src/repositories/**/*.ts,src/sql/**/*.sql,src/worker.ts,src/workers/**/*.ts"
excludeAgent:
  - documentador-mtr
---
## Instruções para Postgres

- Mantenha SQL explícito e legível.
- Não introduza ORM.
- Toda tabela nova precisa ter:
  - chave primária
  - timestamps coerentes
  - índices mínimos para consultas críticas
- Se criar nova transição assíncrona, avalie se precisa de tabela própria, coluna de status, auditoria ou chave de idempotência.
- Repositórios devem ser previsíveis e evitar regras de negócio escondidas.
- Ao mexer em `jobs`, preserve semântica de polling com `FOR UPDATE SKIP LOCKED`.
- Sempre documente impactos de migração em `docs/copilot/05-modelo-de-dados.md`.
