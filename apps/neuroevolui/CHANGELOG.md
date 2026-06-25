# Changelog — NeuroEvolui API

Histórico de breaking changes e mudanças significativas de contrato.
Segue [Semantic Versioning](https://semver.org/) e o formato [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [1.0.0] — 2026-06-24

### Added (REQ-NEUROEVOLUI-0008)
- Especificação OpenAPI canônica em `api/src/openapi/openapi.yaml` (contract-first).
- Script `gen:operations` — gera `src/generated/operations.js` com todas as operações.
- Script `validate:openapi` — valida que todos os paths do server.js estão no OpenAPI (bloqueia CI em divergência).
- Rota `GET /docs` servindo documentação ReDoc interativa.
- Rota `GET /docs/openapi.yaml` servindo a especificação canônica.
- CHANGELOG.md (este arquivo) com histórico de breaking changes.

### Added (REQ-NEUROEVOLUI-0007)
- Notificações multi-canal: e-mail, push e WhatsApp.
- `GET /v1/notifications/vapid-public-key` — chave pública VAPID.
- `POST /v1/notifications/subscriptions` — registrar subscrição push.
- `DELETE /v1/notifications/subscriptions` — remover subscrição push.
- `GET /v1/notifications/preferences` — listar preferências.
- `PUT /v1/notifications/preferences` — atualizar canal (`email | push | whatsapp`).

### Added (REQ-NEUROEVOLUI-0006)
- Assistente IA: `POST /v1/assistant` (suporta JSON e multipart/form-data; fail-closed sem chave de IA).
- Integração com `@flavioneto11/ai-core` via grafo ReAct + tools.

### Added (REQ-NEUROEVOLUI-0004)
- Notas evolutivas: CRUD em `/v1/patients/{patientId}/evolution-notes`.
- Histórico de versões: `GET /v1/patients/{patientId}/evolution-notes/history`.
- Relatórios de paciente (async): `/v1/patients/{patientId}/reports`.

### Added (baseline — gymops-style scaffold)
- `GET /`, `GET /health`, `GET /v1/health/queue` — saúde e status.
- Records: `GET|POST /v1/records`, `GET|DELETE /v1/records/{id}`, `POST /v1/records/{id}/submit`.
- Consultations: `POST /v1/consultations/schedule`, `GET /v1/consultations`.
- Payments webhook: `POST /v1/payments/webhook`.
- Dashboard: `GET /v1/dashboard/revenue`.
- Async jobs: `POST /v1/consultation-notes|patient-imports|notifications|summaries-ai`, `GET /v1/jobs/{queueName}/{jobKey}`.
- Audit: `GET /v1/audit`.
- RBAC multi-tenant via headers `X-Tenant-Id` / `X-Role`.
- Idempotência via header `Idempotency-Key`.
- Observabilidade Prometheus em `:9464/metrics`.

---
_Manter este arquivo atualizado a cada PR que altere contrato de API (rota, método, schema de request/response)._
