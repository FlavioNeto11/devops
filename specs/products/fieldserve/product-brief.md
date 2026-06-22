# FieldServe — brief

Plataforma de **gestão de ordens de serviço de campo** (field-service ops), gerada pela **Forge 2.0**
como prova de que a esteira gera **sistemas robustos**, não só CRUD.

## O que faz
- **Multi-empresa**: cada empresa (tenant) vê só seus ativos, técnicos e ordens (`tenant_id`).
- **CRUD** de ativos, técnicos e ordens de serviço (estados: aberta → atribuída → submetida → concluída).
- **Submissão assíncrona à central externa**: ao submeter uma ordem, o sistema enfileira um job numa
  **fila transacional Postgres** (`FOR UPDATE SKIP LOCKED`); um **worker** consome o job e chama o
  **gateway** da central externa (mock "CentralDispatch") com **timeout + retry/backoff + DLQ**.
  **Idempotente** por `job_key` (reenfileirar não duplica).
- **Assistente de IA** (Claude, via `@flavioneto11/ai-core`): triagem/priorização de chamados
  (saída estruturada; dry-run → confirmação).
- **Observabilidade por padrão**: `/health` + `/v1/health/{jobs}`, métricas Prometheus na `:9464`,
  ServiceMonitor, e alertas de SLO (PrometheusRule).

## Por que prova a Forge
O piloto CRM era 100% CRUD. FieldServe exercita os blocos **worker-queue-transacional**,
**gateway-externo**, **idempotencia**, **ia-grafo**, **observabilidade** — capacidades de nível
SICAT que a Forge 1.0 não sabia propor nem scaffoldar.
