# 03 - Backend Contracts

## Objective

Eliminar o bloqueio de `partnerCode` no fluxo normal do frontend para `GET /v1/cdf/certificates`, preservando o contrato HTTP existente e a regra de gateway único CETESB.

## Files Analyzed

- `docs/handoffs/frontend-cetesb-flows-hardening/00-orchestration.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/09-qa-validation.md`
- `docs/handoffs/frontend-cetesb-flows-hardening/02-integration.md`
- `docs/handoffs/frontend-cetesb-receive-cdf-flows/10-documentation-final.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/10-documentation-final.md`
- `src/services/manifest-service.ts`
- `src/gateways/cetesb-gateway.js`
- `src/repositories/session-context-repo.ts`
- `src/repositories/integration-account-repo.ts`
- `src/services/sicat-account-service.ts`
- `tests/api/sicat-dual-auth.test.js`

## Decisions

- O bloqueio não exigia mudança de contrato. O endpoint, query params e shape de resposta de `GET /v1/cdf/certificates` já estavam corretos.
- A causa raiz estava no service: quando havia `sessionContextId`, o código ainda enviava `partnerCode: null` ao gateway.
- No gateway CETESB, `firstDefined()` trata `null` como valor presente; isso anulava o fallback já implementado para `sessionContext.partnerCode` e `integrationAccount.partner_code`.
- A correção mínima e correta foi parar de enviar override de `partnerCode` derivado do JWT do request quando a operação já está ancorada em `sessionContextId`.
- O mesmo ajuste foi aplicado aos outros pontos do mesmo padrão em `manifest-service.ts` para manter consistência do caminho autenticado por contexto operacional.

## Files Changed

- `src/services/manifest-service.ts`
- `tests/api/sicat-dual-auth.test.js`
- `docs/handoffs/frontend-cetesb-flows-hardening/03-backend-contracts.md`

## Implementation Summary

- `listCdfCertificates()` agora só deriva `partnerCode` do JWT do request quando realmente usa o JWT do request como contexto autenticado, isto é, quando não existe `sessionContextId`.
- Com `sessionContextId` presente, o service deixa o gateway resolver `partnerCode` a partir de `sessionContext.partnerCode` ou `integrationAccount.partner_code`, comportamento que o gateway já suportava.
- O mesmo critério foi aplicado em `fetchRemoteManifestSearch()` e `getCdfDocumentBuffer()` para não repetir o mesmo bug de override nulo em fluxos equivalentes.
- Foi adicionado um override de gateway restrito a testes em `manifest-service.ts` para permitir validação focada do path de API sem chamar CETESB real.

## Contract Change Assessment

- Nenhuma alteração de OpenAPI, examples ou operations geradas foi necessária.
- Motivo: não houve mudança de endpoint, parâmetros aceitos, códigos de resposta, payloads nem semântica pública suportada; a correção é apenas de resolução interna de contexto operacional.

## Validations

- `tests/api/sicat-dual-auth.test.js`
  - objetivo: comprovar que `GET /v1/cdf/certificates` no fluxo SICAT com `sessionContextId` não envia `partnerCode: null` para o gateway e mantém sucesso HTTP.
- `npm run typecheck`
  - objetivo: validar integridade de tipagem após a alteração do service e do teste.

## Next Handoff

- Próximo owner explícito para revalidação: `tester-qa-mtr`
- Motivo: a correção de backend foi aplicada no ponto causal mínimo; agora a prioridade é revalidar o fluxo autenticado normal do frontend e confirmar o fechamento do blocker evidenciado na fase 02.

## Delta - Audit Trail Recovery For Certificates Search

### Delta Objective

Fechar a lacuna residual de audit trail recuperável por `correlationId` em `GET /v1/cdf/certificates`, sem alterar o comportamento funcional do endpoint nem o shape já consumido internamente pelos workers.

### Additional Files Analyzed

- `src/services/manifest-service.ts`
- `src/gateways/cetesb-gateway.js`
- `src/services/audit-service.ts`
- `src/repositories/audit-repo.ts`
- `tests/api/sicat-dual-auth.test.js`

### Root Cause Confirmed

- A persistência em `persistRemoteSearchAudit()` aceitava apenas o shape `{ items, audit }` retornado pelo caminho de busca de manifestos.
- `gateway.searchCdfCertificates()` retorna um exchange síncrono no formato `{ request, response }`, com os dados úteis em `response.data.items` e metadados HTTP em `response.*`.
- Como consequência, o service de certificados não extraía nem `audit`, nem `message`, nem `items` quando a resposta seguia o shape real do gateway; com `items = []` isso passava despercebido funcionalmente, mas a trilha em `/v1/audit/{correlationId}` ficava ausente.

### Minimal Fix Applied

- O ajuste ficou restrito a `src/services/manifest-service.ts`.
- O service agora normaliza respostas de busca remota em ambos os formatos suportados:
  - formato já existente `{ items, audit, message }`
  - formato de exchange `{ request, response }` retornado pela busca síncrona de certificados
- `persistRemoteSearchAudit()` passou a derivar a auditoria também do exchange, preservando endpoint, método, status, latência e payload sanitizado.
- `listCdfCertificates()` passou a ler `items` e `message` também de `response.data`, evitando perda silenciosa caso a CETESB retorne certificados nessa rota.
- A auditoria persistida para essa leitura foi classificada como `cdf.certificate.search`, mantendo separação semântica em relação a `manifest.search`.

### Contract Assessment

- Nenhuma mudança de OpenAPI, examples ou operations geradas foi necessária.
- O contrato HTTP público permaneceu intacto; a correção é apenas de normalização interna do retorno do gateway e persistência de auditoria.

### Focused Validations

- `tests/api/sicat-dual-auth.test.js`
  - cenário novo: comprova que `GET /v1/cdf/certificates` aceita o shape real do gateway, devolve os certificados mapeados e persiste trilha recuperável em `GET /v1/audit/{correlationId}`.
- validação manual/dirigida do código:
  - comparação entre o shape de `searchManifests()` e `searchCdfCertificates()` no gateway para confirmar a divergência causal e limitar a correção ao service.

### Next Handoff After This Delta

- Próximo owner explícito para revalidação: `tester-qa-mtr`
- Motivo: a correção backend foi isolada e precisa ser revalidada com smoke focado em `GET /v1/cdf/certificates` seguido de `GET /v1/audit/{correlationId}` na stack executável do workspace.
