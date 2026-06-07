# 02 - Integration

## Objetivo da fase

Implementar no gateway real CETESB os métodos públicos necessários para os fluxos de recebimento de MTR, geração de CDF e download de CDF, reaproveitando a infraestrutura existente de sessão, request, parsing, auditoria e sanitização sem alterar contrato HTTP interno nesta fase.

## Arquivos alterados

- `src/gateways/cetesb-gateway.js`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/02-integration.md`

## Endpoints remotos mapeados por método

- `listReceiptResponsibles(options)` -> `GET /api/mtr/manifesto/listaResponsavelRecebimento/{parCodigo}`
- `searchReceivableManifests(options)` -> `GET /api/mtr/pesquisaManifesto/{partnerCode}/{stateCode}/9/{dataInicial_dd-MM-yyyy}/{dataFinal_dd-MM-yyyy}/0/all`
- `getRemoteManifest(manCodigo, options)` -> `GET /api/mtr/manifesto/{manCodigo}`
- `receiveManifest(options)` -> `POST /api/mtr/manifesto/recebimento/`
- `printManifestReceipt(manHashCode, options)` -> `GET /api/mtr/imprimir/imprimeRecebimentoManifesto/{manHashCode}`
- `listCdfResponsibles(options)` -> `GET /api/mtr/responsavel/{parCodigo}`
- `searchCdfGeneratorPartner(options)` -> `GET /api/mtr/pesquisaParceiro/8/{documento}`
- `searchReceivedManifestsForCdf(options)` -> `POST /api/mtr/pesquisaManifestoRecebidoCertificado/{partnerCode}/9/{dataInicial_dd-MM-yyyy}/{dataFinal_dd-MM-yyyy}/0`
- `generateCdf(options)` -> `POST /api/mtr/certificadoDestinacao/`
- `searchCdfCertificates(options)` -> `GET /api/mtr/certificadoDestinacao/9/{partnerCode}/0/all/{dataInicial_dd-MM-yyyy}/{dataFinal_dd-MM-yyyy}`
- `printCdfCertificate(cerHashCode, options)` -> `GET /api/mtr/imprimir/imprimeCertificado/{cerHashCode}`

## Decisões técnicas

- Todos os novos fluxos foram centralizados em `src/gateways/cetesb-gateway.js`, sem adicionar chamada remota em route, service ou worker.
- Os métodos reaproveitam `resolveSession`, `runWithSessionRefresh`, `requestJson`, `requestBuffer`, `unwrapApiBody` e `formatDateBr` indireta ou diretamente via `normalizeDateForCetesb`.
- Os segmentos posicionais ambíguos observados nos HARs foram preservados literalmente em constantes internas (`9`, `0`, `all`, `8`) sem atribuir semântica nova no código.
- Operações PDF retornam sempre `Buffer` em `response.data.pdfBuffer`.
- Foi adicionada sanitização específica para esses fluxos no objeto de exchange retornado pelo gateway para reduzir exposição de hash, assinatura, e-mail, CPF/CNPJ, nomes e endereço em auditorias futuras.
- Os endpoints armazenados no exchange retornado foram mascarados com placeholders nos segmentos sensíveis (`{manHashCode}`, `{cerHashCode}`, `{parCodigo}`, `{documento}`, `{manCodigo}`) para evitar persistir identificadores completos em log técnico.

## Validações executadas

- `npm run typecheck`
- validação de erros de arquivo após patch no gateway

## Handoff para 03-backend-contracts

- Próximo agente recomendado: `programador-backend-mtr`
- Objetivo da próxima fase: expor esses métodos do gateway nas camadas de serviço/worker/rotas e alinhar OpenAPI, operações geradas, payloads internos e comandos assíncronos sem alterar os endpoints CETESB já mapeados aqui.
- Entradas mínimas:
  - `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/00-orchestration.md`
  - `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/01-source-validation.md`
  - `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/02-integration.md`
  - `src/gateways/cetesb-gateway.js`
