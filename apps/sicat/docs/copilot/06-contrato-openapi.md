# Contrato OpenAPI

## Fonte de verdade

`openapi/mtr_automacao_openapi_interna.yaml`

## Arquivos derivados ou relacionados

- `examples/*.json`
- `src/generated/operations.js`
- `src/routes/api-routes.js`

## Regra operacional

Qualquer mudança em request/response deve atualizar os quatro grupos acima.

## Endpoints internos principais

- `POST /v1/auth/login`
- `GET /v1/auth/partner-info`
- `POST /v1/session-contexts`
- `GET /v1/session-contexts/{id}`
- `POST /v1/manifestos`
- `POST /v1/manifestos/batch-create`
- `POST /v1/manifestos/batch-submit`
- `GET /v1/manifestos`
- `GET /v1/manifestos/{id}`
- `POST /v1/manifestos/{id}/replicate`
- `POST /v1/manifestos/{id}/submit`
- `POST /v1/manifestos/{id}/print`
- `POST /v1/manifestos/{id}/cancel`
- `POST /v1/manifestos/batch-cancel`
- `GET /v1/manifestos/{id}/documents/{documentId}`
- `POST /v1/catalog-sync`
- `GET /v1/catalogs/{catalogName}`
- `POST /v1/cadastros`
- `GET /v1/cadastros/{id}`
- `GET /v1/jobs/{jobId}`
- `GET /v1/partners/search`
- `GET /v1/audit/{correlationId}`

## Padrões

- `Idempotency-Key`
- `X-Correlation-Id`
- `application/problem+json`
- respostas assíncronas com `jobId`, `commandId` e `correlationId`
