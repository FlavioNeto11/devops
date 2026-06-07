# Technical Decisions — DL-017

## Decisões principais
- **Retry na borda CETESB:** aplicar retry somente para falhas transitórias; evitar retry em falhas definitivas para reduzir ruído e latência desnecessária.
- **Rastreabilidade de tentativa:** incluir `attempt`/`maxAttempts` nos exchanges sanitizados para diagnóstico operacional.
- **Correlação ponta a ponta:** suportar `X-Correlation-Id` no gateway quando disponível.
- **Catálogo resiliente:** falha de um catálogo não deve invalidar todo sync; retornar erro sanitizado por catálogo.
- **Consistência de worker:** separar claramente transições `failed` (definitivo) e `retry_wait`/`dlq` (transitório).
- **Requeue de stale claim:** tratar jobs `running` órfãos por crash/queda de worker via timeout de claim.
- **Contrato interno vs protocolo externo:** manter API interna assíncrona (`202`) e encapsular diferenças para CETESB síncrona, com evidência HAR documentada.

## Trade-offs
- **Maior complexidade no gateway e runner** em troca de previsibilidade operacional e redução de retries indevidos.
- **Smoke OpenAPI em porta alternativa (`8081`)** quando `8080` estiver ocupada por processo do host.
