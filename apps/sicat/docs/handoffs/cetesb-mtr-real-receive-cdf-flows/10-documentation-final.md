# 10 - Documentation Final

## Objetivo da fase

Consolidar o handoff final da demanda `cetesb-mtr-real-receive-cdf-flows`, registrando o estado implementado para os fluxos reais `manifest.receive`, `cdf.generate` e `cdf.download`, com base nos checkpoints anteriores, no codigo presente no workspace e nos resultados reais de validacao executados.

## Resumo executivo

- Os tres fluxos reais foram materializados ponta a ponta no backend interno: contrato OpenAPI, operacoes geradas, rotas HTTP, services, gateway CETESB, worker, persistencia assicrona e armazenamento local de PDFs.
- A fonte de verdade da integracao continua sendo exclusivamente os tres HARs observados em `docs/cetesb/`, sem introducao de endpoint remoto por suposicao.
- O estado atual compila em TypeScript, valida contrato/OpenAPI e agora possui cobertura automatizada dedicada para `manifest.receive`, `cdf.generate` e `cdf.download` em enqueue e worker.
- A suite automatizada completa do repositorio ainda nao fica integralmente verde por falhas preexistentes fora do escopo principal da demanda, concentradas em suites antigas de autenticacao mock, batch e reconciliacao.
- O download interno de CDF ja prioriza documento persistido localmente e cai para proxy remoto somente quando o PDF ainda nao foi armazenado.

## Source of truth CETESB

Os tres HARs abaixo foram tratados explicitamente como fonte de verdade desta entrega:

- `docs/cetesb/mtr.cetesb.sp.gov.br_recebimento_mtr.har`
- `docs/cetesb/mtr.cetesb.sp.gov.br_gerar_cdf_mtr.har`
- `docs/cetesb/mtr.cetesb.sp.gov.br_baixar_cdf_mtr.har`

Regras seguidas nesta consolidacao:

- nenhum endpoint remoto foi documentado sem evidencia nesses HARs;
- segmentos posicionais ambiguos observados nos caminhos CETESB foram preservados literalmente;
- tokens, cookies, hashes completos, assinaturas, documentos pessoais e demais credenciais sensiveis nao sao reproduzidos neste handoff.

## Arquivos impactados

### Backend, contrato e integracao

- `package.json`
- `openapi/mtr_automacao_openapi_interna.yaml`
- `src/generated/operations.ts`
- `src/routes/api-routes.ts`
- `src/services/manifest-service.ts`
- `src/gateways/cetesb-gateway.js`
- `src/lib/retry.ts`
- `src/lib/cetesb-source-of-truth.ts`
- `src/workers/job-runner.ts`
- `src/workers/operation-handlers.ts`
- `src/repositories/async-operation-repo.ts`
- `src/sql/010_async_operation_entities.sql`

### Exemplos e artefatos de contrato

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

### Testes dedicados dos fluxos novos

- `tests/integration/async-operations-enqueue.test.js`
- `tests/worker/async-operations-handler.test.js`

### Documentacao de handoff criada na cadeia

- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/00-orchestration.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/01-source-validation.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/02-integration.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/03-backend-contracts.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/04-persistence-worker.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/05-domain-rules.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/09-qa-validation.md`
- `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/10-documentation-final.md`

### Observacao sobre o estado atual do workspace

- `src/generated/operations.js` aparece como artefato gerado adicional no workspace atual.
- `docs/copilot/15-autenticacao-cetesb.md` e `docs/copilot/auditoria-links-quebrados.md` aparecem modificados no `git status`, mas nao foram tratados como parte confirmada desta demanda nos checkpoints analisados.

## Endpoints CETESB mapeados

### Fluxo real de recebimento de MTR

- `GET /api/mtr/manifesto/listaResponsavelRecebimento/{parCodigo}`
- `GET /api/mtr/pesquisaManifesto/{partnerCode}/{stateCode}/9/{dataInicial_dd-MM-yyyy}/{dataFinal_dd-MM-yyyy}/0/all`
- `GET /api/mtr/manifesto/{manCodigo}`
- `POST /api/mtr/manifesto/recebimento/`
- `GET /api/mtr/imprimir/imprimeRecebimentoManifesto/{manHashCode}`

Catalogos auxiliares comprovados no HAR de recebimento:

- `GET /api/residuo/tratamento`
- `GET /api/classes`
- `GET /api/unidades`
- `GET /api/residuo/tipoEstado`
- `GET /api/residuo/grupoEmbalagem`
- `GET /api/residuo/residuoClasse`
- `GET /api/residuo/pesquisaAbntGerador/{parCodigo}`
- `GET /api/residuo/abnt`

### Fluxo real de geracao de CDF

- `GET /api/mtr/responsavel/{parCodigo}`
- `GET /api/mtr/pesquisaParceiro/8/{documento}`
- `POST /api/mtr/pesquisaManifestoRecebidoCertificado/{partnerCode}/9/{dataInicial_dd-MM-yyyy}/{dataFinal_dd-MM-yyyy}/0`
- `POST /api/mtr/certificadoDestinacao/`

### Fluxo real de download de CDF

- `GET /api/mtr/certificadoDestinacao/9/{partnerCode}/0/all/{dataInicial_dd-MM-yyyy}/{dataFinal_dd-MM-yyyy}`
- `GET /api/mtr/imprimir/imprimeCertificado/{cerHashCode}`

## Endpoints internos criados

- `POST /v1/manifestos/receive`
  - comando assincrono `manifest.receive`
  - resposta `202 Accepted`
  - requer `integrationAccountId`, `sessionContextId` e `receiptPayload`
- `POST /v1/cdf/generate`
  - comando assincrono `cdf.generate`
  - resposta `202 Accepted`
  - requer `integrationAccountId`, `sessionContextId` e `cdfPayload`
- `POST /v1/cdf/download`
  - comando assincrono `cdf.download`
  - resposta `202 Accepted`
  - requer `integrationAccountId`, `sessionContextId` e `documentId`
- `GET /v1/cdf/certificates`
  - leitura sincrona via gateway CETESB
  - aceita `integrationAccountId`, `sessionContextId`, `dateFrom` e `dateTo`
- `GET /v1/cdf/documents/{documentId}`
  - retorna PDF `application/pdf`
  - prioriza documento local persistido e usa proxy CETESB apenas quando necessario

## Metodos de gateway adicionados

- `listReceiptResponsibles(options)`
- `searchReceivableManifests(options)`
- `getRemoteManifest(manCodigo, options)`
- `receiveManifest(options)`
- `printManifestReceipt(manHashCode, options)`
- `listCdfResponsibles(options)`
- `searchCdfGeneratorPartner(options)`
- `searchReceivedManifestsForCdf(options)`
- `generateCdf(options)`
- `searchCdfCertificates(options)`
- `printCdfCertificate(cerHashCode, options)`

## Operacoes e job outcomes novos

### Operacoes internas reconhecidas pelo backend

- `manifest.receive`
- `cdf.generate`
- `cdf.download`

Essas operacoes passaram a existir em:

- contratos OpenAPI e operacoes geradas;
- servico de enqueue com `CommandAccepted` e idempotencia;
- politica de retry/prioridade em `src/lib/retry.ts`;
- mapeamento de source of truth em `src/lib/cetesb-source-of-truth.ts`;
- roteamento de worker em `src/workers/operation-handlers.ts`.

### Outcomes de sucesso implementados

- `manifest_received`
- `cdf_generated`
- `cdf_downloaded`

### Outcomes de falha terminal derivados

- `manifest_receive_failed`
- `cdf_generate_failed`
- `cdf_download_failed`

## Persistencia e documentos

### Tabelas e repositorio

- `async_operation_entities`
  - guarda `entity_type`, `entity_id`, `operation`, `integration_account_id`, `session_context_id`, `status`, `payload`, `result`, `requested_by`, `correlation_id` e `last_sync_at`
- `async_operation_documents`
  - guarda documentos PDF vinculados a uma entidade assincrona, com `type`, `status`, `mime_type`, `file_name`, `hash`, `storage_path`, `metadata` e `active`
- `src/repositories/async-operation-repo.ts`
  - implementa insert, update, busca de entidade assincrona, upsert de documento e lookup por hash

### Persistencia operacional por fluxo

- `manifest.receive`
  - persiste a entidade assincrona `manifestReceipt`
  - baixa e armazena o comprovante PDF de recebimento como `manifest_receipt_pdf`
  - espelha o manifesto recebido localmente
- `cdf.generate`
  - persiste a entidade assincrona `cdf`
  - baixa e armazena o PDF do certificado como `cdf_pdf`
  - registra no resultado do job o certificado localizado apos a geracao
- `cdf.download`
  - persiste a entidade assincrona `cdf`
  - armazena o PDF do certificado baixado como `cdf_pdf`
  - usa criterios opcionais de selecao no payload do job antes do download remoto

### Armazenamento local de PDF

- os arquivos sao salvos em `STORAGE_DIR`, que por padrao e `./storage`
- os PDFs de operacao assincrona sao gravados em `storage/documents/{entityType}/{entityId}/{fileName}`
- o endpoint interno `GET /v1/cdf/documents/{documentId}` tenta primeiro `findAsyncOperationDocumentByHash('cdf', documentId, integrationAccountId)`; se nao encontrar, faz proxy do PDF remoto no gateway CETESB

## Decisoes consolidadas

- O gateway CETESB continua sendo o unico ponto autorizado para chamadas remotas.
- Os segmentos literais observados nos HARs, como `9`, `0`, `all` e `8`, foram mantidos como padrao tecnico sem semantica inventada.
- O worker prioriza fidelidade ao snapshot remoto CETESB: filtra, complementa e reusa payload remoto em vez de remontar objetos complexos do zero.
- Em `cdf.generate`, manifestos explicitamente selecionados pelo usuario sao tratados como filtro sobre a listagem remota CETESB.
- A falta temporaria de manifesto selecionado na listagem de CDF foi tratada como condicao retryable.
- O download interno de CDF foi desenhado para servir documento persistido localmente antes de consumir novamente o endpoint remoto.

## Comandos executados e resultados reais

- `npm run typecheck`
  - resultado final registrado na fase 09: PASS
- `npm test`
  - FAIL
  - causa principal observada: imports legados apontando para modulos `.js` inexistentes apos migracao de `src/**` para `.ts`
- `npm run validate:cetesb-source`
  - FAIL
  - causa principal observada: validacao estrutural legada cobrando padrao obrigatorio para `manifestCancel`, fora do escopo destes fluxos
- `npm run validate:har-gateway`
  - FAIL
  - mesma falha estrutural legada de `manifestCancel`
- `npm run validate:openapi`
  - PASS
- `npm run test:api`
  - FAIL
  - falha imediata por imports legados para `src/db/pool.js`
- `npm run test:worker`
  - script migrado para `tsx --test`
  - validacao dedicada: PASS com `npm run test:worker -- --test-name-pattern="Detached async operations worker"`
- `npm run test:contract`
  - PASS
- `npm run test:source-of-truth`
  - PASS apos migracao do script para `tsx --test`
- `npx tsx --test tests/integration/async-operations-enqueue.test.js`
  - PASS (`4/4`)
- `npx tsx --test tests/worker/async-operations-handler.test.js`
  - PASS (`3/3`)
- `npm run test:integration -- --test-name-pattern="Detached async operations enqueue"`
  - a cobertura dedicada dos fluxos novos passa, mas o comando ainda expõe falhas preexistentes em outras suites de integracao fora do escopo da demanda

## Status final da demanda

- `manifest.receive`, `cdf.generate` e `cdf.download` estao implementados ponta a ponta e agora contam com evidencia automatizada especifica de enqueue e worker.
- `typecheck`, `validate:openapi`, `test:contract` e `test:source-of-truth` estao aprovados no estado atual do workspace.
- O work_id pode ser considerado finalizado do ponto de vista de implementacao e QA especifica da demanda.
- Falhas remanescentes em suites antigas do repositorio nao invalidam esta entrega, mas seguem como debito tecnico separado do work_id.

## Como testar manualmente

### Pre-requisitos

- subir Postgres e aplicar migracoes do projeto
- iniciar API e worker em modo real ou real-dev
- possuir `integrationAccountId` e `sessionContextId` validos para uma conta integrada CETESB
- nao reutilizar credenciais sensiveis em arquivos versionados; usar ambiente local ja configurado

### Comandos operacionais sugeridos

- `docker compose up -d postgres`
- `npm run migrate`
- `npm run dev`
- `npm run worker`

Se preferir o fluxo guiado do workspace, usar as tasks ja existentes de stack local em vez dos comandos manuais.

### Teste manual de recebimento de MTR

1. Usar como base `examples/post_v1_manifestos_receive_request.json`.
2. Enviar `POST /v1/manifestos/receive` com `X-Correlation-Id` e payload valido.
3. Guardar `jobId` e `commandId` retornados no `202`.
4. Consultar `GET /v1/jobs/{jobId}` ate status terminal.
5. Confirmar no resultado do job o outcome `manifest_received`.
6. Confirmar persistencia em `async_operation_entities` e documento `manifest_receipt_pdf` em `async_operation_documents`.
7. Confirmar que o PDF foi gravado em `storage/documents/manifestReceipt/{entityId}/`.

### Teste manual de geracao de CDF

1. Usar como base `examples/post_v1_cdf_generate_request.json`.
2. Enviar `POST /v1/cdf/generate` com `X-Correlation-Id` e payload valido.
3. Consultar `GET /v1/jobs/{jobId}` ate status terminal.
4. Confirmar outcome `cdf_generated` e presenca do documento persistido `cdf_pdf`.
5. Consultar `GET /v1/cdf/certificates?integrationAccountId=...&sessionContextId=...&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`.
6. Validar que a resposta lista `documentId`, `certificateCode`, `responsibleName` e `downloadUrl` coerentes com o certificado recem gerado.
7. Abrir `GET /v1/cdf/documents/{documentId}?integrationAccountId=...&sessionContextId=...` e validar retorno `application/pdf`.

### Teste manual de download de CDF

1. Obter um `documentId` valido pela listagem de certificados ou usar como base `examples/post_v1_cdf_download_request.json`.
2. Enviar `POST /v1/cdf/download`.
3. Consultar `GET /v1/jobs/{jobId}` ate status terminal.
4. Confirmar outcome `cdf_downloaded`.
5. Validar persistencia do PDF em `async_operation_documents` e no filesystem.
6. Requisitar `GET /v1/cdf/documents/{documentId}?integrationAccountId=...&sessionContextId=...` e confirmar que o endpoint consegue servir o PDF armazenado.

### Exemplos auxiliares para consulta

- `examples/get_v1_cdf_certificates_request.json`
- `examples/get_v1_cdf_certificates_response.json`
- `examples/get_v1_cdf_documents_documentId_request.json`
- `examples/get_v1_cdf_documents_documentId_response.json`

## Riscos, pendencias e gaps conhecidos

- A suite automatizada dedicada aos tres fluxos novos ainda nao existe em `tests/**`; o estado atual depende de validacao manual e da seguranca oferecida por `typecheck` mais contrato OpenAPI.
- `npm test`, `npm run test:api` e `npm run test:worker` continuam quebrando por imports legados `.js` fora do escopo principal desta entrega.
- `npm run validate:cetesb-source`, `npm run validate:har-gateway` e parte de `npm run test:source-of-truth` continuam reprovando por regra estrutural preexistente de `manifestCancel`, tambem fora do escopo dos fluxos implementados aqui.
- `tests/unit/agent-architecture-validation.test.js` ainda falha por problema de prompt/arquitetura de agentes do workspace, sem relacao direta com o backend CETESB desta demanda.
- O fluxo de comprovante de recebimento de MTR ja persiste PDF localmente, mas esta entrega nao adicionou um endpoint interno dedicado para download desse comprovante equivalente ao endpoint interno de CDF.

## Conclusao

- Fase 10 concluida com consolidacao fiel dos checkpoints anteriores, do codigo atualmente presente no workspace e dos resultados reais de QA registrados.
- A entrega fica documentada como funcional no eixo contrato + compilacao + persistencia + integracao implementada, com riscos conhecidos explicitados para suites legadas fora do escopo e ausencia de testes automatizados dedicados aos novos fluxos.
