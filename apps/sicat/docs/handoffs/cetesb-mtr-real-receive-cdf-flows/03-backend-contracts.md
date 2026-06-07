# 03 - Backend Contracts

## Objetivo da fase

Expor contratos internos e superfície HTTP para os fluxos reais de recebimento de MTR, geração de CDF e download de CDF, preservando o padrão assíncrono `202 Accepted` com `commandId`/`jobId`, correlação, idempotência e alinhamento em lockstep entre OpenAPI, operations geradas, rotas e services.

## Arquivos alterados

- `openapi/mtr_automacao_openapi_interna.yaml`
- `src/services/manifest-service.ts`
- `src/routes/api-routes.ts`
- `src/lib/retry.ts`
- `src/lib/cetesb-source-of-truth.ts`
- `src/generated/operations.ts`
- `examples/post_v1_manifestos_receive_request.json`
- `examples/post_v1_manifestos_receive_response.json`
- `examples/post_v1_cdf_generate_request.json`
- `examples/post_v1_cdf_generate_response.json`
- `examples/post_v1_cdf_download_request.json`
- `examples/post_v1_cdf_download_response.json`
- `examples/get_v1_cdf_certificates_request.json`
- `examples/get_v1_cdf_certificates_response.json`
- `examples/get_v1_cdf_documents_documentId_request.json`
- `examples/get_v1_cdf_documents_documentId_response.json`

## Endpoints internos criados/ajustados

- `POST /v1/manifestos/receive`
  - comando assíncrono `manifest.receive`
  - resposta `202` via `CommandAccepted`
  - requer `integrationAccountId`, `sessionContextId`, `receiptPayload`
- `POST /v1/cdf/generate`
  - comando assíncrono `cdf.generate`
  - resposta `202` via `CommandAccepted`
  - requer `integrationAccountId`, `sessionContextId`, `cdfPayload`
- `POST /v1/cdf/download`
  - comando assíncrono `cdf.download`
  - resposta `202` via `CommandAccepted`
  - requer `integrationAccountId`, `sessionContextId`, `documentId`
- `GET /v1/cdf/certificates`
  - consulta síncrona via gateway centralizado
  - normaliza `cerCodigo`, `cerHashCode`, período, responsável e `downloadUrl`
- `GET /v1/cdf/documents/:documentId`
  - proxy interno de PDF remoto por `cerHashCode`
  - requer `integrationAccountId` em query e aceita `sessionContextId`

## Mudanças de schema e operation IDs

- Novos contratos OpenAPI:
  - `ManifestReceiveRequest`
  - `CdfGenerateRequest`
  - `CdfDownloadRequest`
  - `CdfCertificateListItem`
  - `CdfCertificateListResponse`
- Novas operações geradas a partir dos paths:
  - `post_v1_manifestos_receive`
  - `post_v1_cdf_generate`
  - `post_v1_cdf_download`
  - `get_v1_cdf_certificates`
  - `get_v1_cdf_documents_documentId`
- Operações internas enfileiradas no job payload e `CommandAccepted`:
  - `manifest.receive`
  - `cdf.generate`
  - `cdf.download`

## Decisões técnicas

- Os três novos comandos assíncronos foram implementados sem criar nova persistência de domínio nesta fase; eles enfileiram jobs com `entityType` desacoplado (`manifestReceipt` e `cdf`) para serem materializados pela fase 04.
- `GET /v1/cdf/certificates` e `GET /v1/cdf/documents/:documentId` foram expostos como leitura síncrona via `service -> gateway`, mantendo a regra de não chamar CETESB fora do gateway.
- `sessionContextId` é validado contra `integrationAccountId` antes do enqueue para evitar jobs inconsistentes.
- `retry.ts` e `cetesb-source-of-truth.ts` foram atualizados para reconhecer `manifest.receive`, `cdf.generate` e `cdf.download` como operações de primeira classe.

## Validações executadas e resultado

- `openapi: sync` -> pendente de execução após edição
- `npm run typecheck` -> pendente de execução após edição

## Handoff para 04-persistence-worker

- Próximo agente obrigatório: `postgres-queue-mtr`
- Objetivo da próxima fase:
  - implementar handlers de worker para `manifest.receive`, `cdf.generate` e `cdf.download`
  - persistir artefatos/documentos CDF e metadados consultáveis localmente
  - decidir se `GET /v1/cdf/documents/:documentId` continuará como proxy remoto ou passará a servir documento persistido localmente mantendo o mesmo contrato HTTP
  - registrar outcomes/resultados dos jobs e storage de PDFs com trilha de auditoria sanitizada