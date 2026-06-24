# Changelog — NeuroEvolui API

Mudanças significativas da API pública documentadas aqui.
Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não lançado]

## [1.0.0] — 2026-06-24

### Added
- Especificação OpenAPI 3.1.0 canônica em `api/src/openapi/openapi.yaml`
  (contract-first: toda rota deve existir no OpenAPI antes da implementação)
- Tipos TypeScript gerados de `api/src/generated/operations.ts` via `npm run gen:operations`
- Scripts de geração e validação: `gen:operations`, `validate:openapi`
- Endpoint `GET /openapi.yaml` — especificação em YAML
- Endpoint `GET /openapi.json` — especificação em JSON
- Endpoint `GET /docs` — Swagger UI interativo com spec embutida
- Documentação OpenAPI de todos os endpoints do domínio:
  - `GET /` — identificação da API
  - `GET /health` — saúde com banco de dados
  - `GET /v1/health/queue` — status da fila BullMQ
  - `GET /v1/records` — lista de registros (tenant-filtered)
  - `POST /v1/records` — criação de registro
  - `GET /v1/records/{id}` — detalhe de registro
  - `DELETE /v1/records/{id}` — remoção (role: admin)
  - `POST /v1/records/{id}/submit` — envio assíncrono (202 Accepted)
- Schemas componentes: `Record`, `RecordList`, `CreateRecordRequest`,
  `SubmitAccepted`, `DeleteResult`, `HealthStatus`, `QueueStatus`,
  `AppInfo`, `Problem`
- Exemplos de requisição e resposta em lockstep com a implementação
- Teste de contrato estrutural em `api/test/openapi-contract.test.mjs`

### Breaking Changes
_Nenhuma (versão inicial pública da API)._

---

_Histórico anterior à v1.0.0: geração pela Forge (bootstrap interno, sem API pública estável)._
