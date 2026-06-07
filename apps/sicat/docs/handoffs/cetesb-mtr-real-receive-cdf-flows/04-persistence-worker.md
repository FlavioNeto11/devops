# 04 - Persistence Worker

## Objetivo da fase

Consolidar a persistencia e a execucao assicrona dos fluxos reais `manifest.receive`, `cdf.generate` e `cdf.download`, materializando estado de operacao, armazenamento local de PDFs e efeitos de worker com retry/DLQ sem ampliar o contrato HTTP interno definido na fase 03.

## Arquivos alterados confirmados

- `src/workers/job-runner.ts`
- `src/workers/operation-handlers.ts`
- `src/repositories/async-operation-repo.ts`
- `src/sql/010_async_operation_entities.sql`

## Arquivos relacionados confirmados na integracao da fase

- `src/services/manifest-service.ts`
  - cria `async_operation_entities` no enqueue dos comandos assincros
  - persiste PDFs em storage local via `storeAsyncOperationPdf(...)`
  - consulta documento CDF persistido localmente antes de fazer proxy remoto via `getCdfDocumentBuffer(...)`

## Decisoes de persistencia

- Foi adotada uma persistencia generica por operacao assincrona em `async_operation_entities`, com chave primaria composta `(entity_type, entity_id)`.
- Cada entidade assincrona persiste `operation`, `integration_account_id`, `session_context_id`, `status`, `payload`, `result`, `requested_by`, `correlation_id` e `last_sync_at`.
- PDFs gerados pelos fluxos reais sao persistidos em `async_operation_documents`, vinculados a `async_operation_entities` por foreign key composta e com trilha de `type`, `status`, `mime_type`, `file_name`, `hash`, `storage_path` e `metadata`.
- O lookup local de documento prioriza `owner_entity_type + hash`, com filtro opcional por `integration_account_id`, permitindo servir CDF ja persistido sem novo roundtrip remoto.
- A semantica implementada segue a regra de worker: o PDF e salvo antes da marcacao de sucesso do job.
- Para evitar historico ambiguo de arquivo ativo, o upsert de documento reutiliza o documento ativo atual por `(owner_entity_type, owner_entity_id, type)`.
- O worker passa a sincronizar explicitamente `status`, `result`, `payload.jobResults` e `lastSyncAt` da entidade assincrona em transicoes de execucao e falha terminal.
- Em `manifest.receive`, alem do documento, o manifesto recebido e espelhado localmente por `upsertManifestFromExternalSearch(...)`, preservando referencia externa e snapshot de recebimento.
- A resolucao de sessao privilegia `sessionContextId` solicitado quando valido; caso contrario, usa a ultima sessao ativa da conta de integracao.

## Handlers e outcomes implementados

### `processJob(...)`

- Novo roteamento para:
  - `manifest.receive`
  - `cdf.generate`
  - `cdf.download`

### `handleManifestReceive(...)`

- Resolve entidade assincrona e sessao operacional.
- Busca responsavel de recebimento (`rrmCodigo`) no parceiro efetivo.
- Pesquisa manifestos recebiveis e localiza o manifesto por codigo, numero ou hash.
- Reconsulta o manifesto remoto detalhado antes do `POST /recebimento`.
- Executa o recebimento remoto.
- Baixa o comprovante PDF de recebimento por `manHashCode`.
- Persiste o PDF como `manifest_receipt_pdf`.
- Espelha o manifesto recebido localmente.
- Registra resultado em `payload.jobResults` e `result.jobResults`.
- Outcome de sucesso implementado: `manifest_received`.
- Outcome de falha terminal refletido pela side effect generica: `manifest_receive_failed`.

### `handleCdfGenerate(...)`

- Resolve entidade assincrona e sessao operacional.
- Busca responsavel de CDF.
- Resolve parceiros geradores explicitamente informados ou por documentos derivados do payload/lista de manifestos.
- Pesquisa manifestos recebidos aptos a certificado.
- Executa a geracao remota do CDF.
- Reconsulta a listagem de certificados para localizar o certificado gerado.
- Baixa o PDF do certificado por `cerHashCode`.
- Persiste o PDF como `cdf_pdf`.
- Registra resultado em `payload.jobResults` e `result.jobResults`.
- Outcome de sucesso implementado: `cdf_generated`.
- Outcome de falha terminal refletido pela side effect generica: `cdf_generate_failed`.

### `handleCdfDownload(...)`

- Resolve entidade assincrona e sessao operacional.
- Reconsulta a listagem de certificados usando o contexto da sessao.
- Seleciona o certificado por hash/codigo/identificadores disponiveis.
- Baixa o PDF remoto do certificado.
- Persiste o PDF como `cdf_pdf`.
- Registra resultado em `payload.jobResults` e `result.jobResults`.
- Outcome de sucesso implementado: `cdf_downloaded`.
- Outcome de falha terminal refletido pela side effect generica: `cdf_download_failed`.

### `job-runner` e falhas terminais

- `job-runner.ts` passou a aplicar `applyAsyncOperationTerminalFailureSideEffect(...)` nas transicoes `failed` e `dlq`.
- A side effect atualiza a entidade assincrona para `failed`/`cancelled`, registra `lastErrorCode`, `lastErrorMessage`, `terminalAction`, `retriable` e outcome derivado da operacao.
- O comportamento existente para `manifest.submit` e `manifest.cancel` foi preservado e executado em paralelo ao novo efeito generico.

## Migracoes

- `src/sql/010_async_operation_entities.sql`
  - cria `async_operation_entities`
  - cria indice `idx_async_operation_entities_filters`
  - cria `async_operation_documents`
  - cria indice `idx_async_operation_documents_owner`
  - cria indice parcial `idx_async_operation_documents_hash`

## Validacoes executadas

- Inspecao de estado com `git status --short` e `git diff` dos arquivos de worker para confirmar o escopo da fase 04.
- Leitura dos checkpoints `00-orchestration`, `01-source-validation`, `02-integration` e `03-backend-contracts` para manter continuidade da demanda.
- `get_errors` em:
  - `src/repositories/async-operation-repo.ts`
  - `src/workers/job-runner.ts`
  - `src/workers/operation-handlers.ts`
  - Resultado: sem erros de editor nesses arquivos.
- `npm run typecheck`
  - Resultado: falhou.
  - Erros confirmados concentrados em `src/workers/operation-handlers.ts`.
  - Principais causas observadas:
    - uso de `toRecord(...)` sem simbolo disponivel no arquivo
    - tipagem de `GatewayResponseData` incompleta para campos como `items`, `item` e `message`
    - possivel `undefined` em documentos retornados por persistencia de PDF

## Handoff para 05-domain-rules

- Proximo agente recomendado: `manifestos-operacional-mtr`
- Objetivo da proxima fase:
  - validar e refinar as regras operacionais de selecao de manifesto, responsavel e certificado
  - revisar defaults e obrigatoriedades de `paaCodigo`, `rrmCodigo`, parceiros geradores e janela de datas
  - confirmar se o espelhamento local de manifesto recebido e os outcomes persistidos atendem ao comportamento esperado do modulo operacional
- Entradas minimas:
  - `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/01-source-validation.md`
  - `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/02-integration.md`
  - `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/03-backend-contracts.md`
  - `docs/handoffs/cetesb-mtr-real-receive-cdf-flows/04-persistence-worker.md`
  - `src/workers/operation-handlers.ts`
  - `src/repositories/async-operation-repo.ts`
  - `src/sql/010_async_operation_entities.sql`