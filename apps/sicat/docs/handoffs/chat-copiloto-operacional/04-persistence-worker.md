# 04-persistence-worker

## Objetivo da fase
Evoluir a persistencia e a camada de worker do backend conversacional para suportar memoria operacional, artifacts de download e montagem de ZIP auditavel no backend, preservando o fluxo route → service → repository → job → worker.

## Diagnostico inicial curto
1. A sessao conversacional ja persistia `conversation_sessions`, `conversation_messages` e `conversation_action_logs`, mas artifacts de resposta existiam apenas no payload do turno e morriam fora da resposta HTTP.
2. A tabela `conversation_memory` existia, mas nao era usada pelo backend conversacional para consolidar selecoes, referencias, jobs e artifacts.
3. O worker ja persistia PDFs de manifesto/CDF, porem sem uma camada de artifact conversacional rastreavel nem fluxo backend para ZIP multiplo.
4. O frontend tinha ZIP no browser em outro fluxo, mas isso nao entregava escala, auditoria, progresso operacional ou correlacao forte com jobs do chat.

## Arquivos analisados
- src/services/conversation/conversation-service.ts
- src/services/conversation/conversation-tool-dispatcher.ts
- src/services/conversation/tools/tool-types.ts
- src/repositories/conversation-memory-repo.ts
- src/repositories/conversation-message-repo.ts
- src/repositories/conversation-action-log-repo.ts
- src/repositories/job-repo.ts
- src/repositories/manifest-repo.ts
- src/repositories/async-operation-repo.ts
- src/routes/conversation-routes.ts
- src/services/manifest-service.ts
- src/workers/operation-handlers.ts
- src/sql/011_conversation_persistence.sql
- docs/copilot/05-modelo-de-dados.md
- docs/handoffs/chat-copiloto-operacional/03-backend-contracts.md
- docs/handoffs/chat-copiloto-operacional/05-domain-rules.md

## Decisoes
1. **ZIP no backend**: adotado como estrategia principal para lote multiplo no chat.
   Justificativa: melhor escala operacional, rastreabilidade por `jobId`/`correlationId`, tratamento de falha parcial no worker, persistencia em disco e autorizacao/escopo validaveis no backend.
2. **Persistencia minima, mas real**:
   - memoria operacional continua em `conversation_memory`, agora efetivamente usada para `manifest_selection`, `manifest_refs`, `job_refs` e `artifacts`;
   - artifacts ganharam tabela dedicada `conversation_artifacts` para sair do payload efemero e virar recurso consultavel/downloadable.
3. **Sem bypass arquitetural**:
   - PDF unico continua sendo produzido pelo fluxo normal de `manifest.print`;
   - ZIP multiplo entra como novo job `conversation.bundle_documents`, executado no worker e alimentado por jobs de impressao ja existentes.
4. **Falha parcial tratada no backend**:
   - se parte dos jobs fonte falhar, o worker monta ZIP com os PDFs disponiveis, marca artifact como `partial` e persiste a lista de falhas em `metadata`;
   - se nenhum PDF ficar disponivel, o artifact vai para `failed` com erro nao retryable (`MISSING_DOCUMENT`).
5. **Isolamento de memoria por conta**:
   - o carregamento da memoria persistida agora valida `integrationAccountId` no `summary_payload` para impedir reaproveitamento indevido quando a mesma `conversationSessionId` e reutilizada por outra conta.

## Implementacao realizada

### Persistencia
- Nova migration `src/sql/012_conversation_artifacts.sql`:
  cria `conversation_artifacts` com status, progresso, caminho em storage, `job_id`, `correlation_id`, escopo operacional e indices de consulta.
- Novo repositório `src/repositories/conversation-artifact-repo.ts`:
  CRUD minimo para insert/find/update dos artifacts conversacionais.
- `docs/copilot/05-modelo-de-dados.md` atualizado com `conversation_artifacts` e escopo de `conversation_memory` por conta.

### Servico conversacional
- Novo servico `src/services/conversation/conversation-persistence-service.ts`:
  - carrega memoria operacional persistida;
  - persiste memoria resumida por turno;
  - registra artifacts de PDF/ZIP a partir do resultado das tools;
  - resolve status e download de artifacts conversacionais.
- `src/services/conversation/conversation-service.ts`:
  - passou a ler memoria persistida durante o planejamento;
  - persiste memoria operacional mesmo em turnos sem tool;
  - registra artifacts persistidos e os injeta no resultado final do turno.
- `src/services/conversation/tools/tool-types.ts`:
  artifacts agora suportam `document` e `zip_bundle`.

### Rotas
- `src/routes/conversation-routes.ts`:
  - `GET /v1/conversations/artifacts/:artifactId` para status/progresso;
  - `GET /v1/conversations/artifacts/:artifactId/content` para download do PDF/ZIP.

### Worker / jobs
- `src/workers/operation-handlers.ts`:
  - novo handler `conversation.bundle_documents`;
  - montagem de ZIP via backend com `yazl`;
  - atualizacao proativa de artifact de PDF unico quando `manifest.print` conclui;
  - atualizacao de progresso/falha parcial no artifact do ZIP.
- `src/lib/retry.ts`:
  - nova configuracao de retry/prioridade para `conversation.bundle_documents`.
- Dependencia adicionada:
  - `yazl` (+ `@types/yazl`) para gerar ZIP no backend com escrita em disco.

## Estrategia ZIP adotada
- **Backend** para lote multiplo originado no chat.
- Nome de arquivo: `chat-manifestos-<n>-itens-<timestamp>.zip`.
- Progresso/estado: persistido em `conversation_artifacts` (`collecting`, `available`, `partial`, `failed`).
- Falha parcial: ZIP e gerado com PDFs disponiveis quando houver ao menos um sucesso; falhas ficam em `metadata.failedItems`.
- Correlation: `correlation_id` do turno e propagado para o artifact e para o job de bundle.
- Autenticacao/autorizacao: o artifact carrega `integration_account_id` e `session_context_id`; as rotas validam escopo informado para evitar download fora do contexto esperado.

## Arquivos alterados
- src/sql/012_conversation_artifacts.sql
- src/repositories/conversation-artifact-repo.ts
- src/services/conversation/conversation-persistence-service.ts
- src/services/conversation/conversation-service.ts
- src/services/conversation/tools/tool-types.ts
- src/routes/conversation-routes.ts
- src/workers/operation-handlers.ts
- src/lib/retry.ts
- docs/copilot/05-modelo-de-dados.md
- package.json
- package-lock.json

## Validacoes executadas
- `npm install yazl @types/yazl` -> PASS
- `npm run typecheck` -> PASS
- `npx tsx --test tests/integration/conversation-composed-operations.test.js tests/integration/conversation-multiturn-memory.test.js` -> PASS (16 testes)
- `npm run test:worker` -> PASS (14 testes)
- `npm run migrate` -> PASS

## Riscos / observacoes residuais
1. O fluxo de ZIP backend foi implementado para lote de impressao de manifestos no chat; CDF/download conversacional pode reutilizar a mesma infraestrutura numa fase seguinte.
2. As rotas de artifact validam escopo operacional informado, mas a autorizacao final continua dependendo da camada global de autenticacao do backend SICAT.
3. Nao foi adicionada suite dedicada apenas ao novo handler `conversation.bundle_documents`; a cobertura atual veio de typecheck + regressao do worker/conversation backend.

## Resultado da fase
- Memoria operacional persistida e efetivamente utilizada pela camada conversacional.
- Artifacts de chat deixaram de ser efemeros e passaram a ser recursos rastreaveis com status/download.
- ZIP multiplo passou a ser montado no backend com worker dedicado, sem bypass da fila transacional.

## Proximo owner recomendado
`tester-qa-mtr`

## Prompt sugerido para o proximo owner
```text
WORK_ID: chat-copiloto-operacional
Fase atual concluida: 04-persistence-worker

Objetivo da proxima fase: validar o fluxo de memoria operacional e artifacts do chat com foco em regressao e cenarios de erro.

Escopo minimo:
1) Validar artifacts conversacionais:
   - PDF unico de manifest.print
   - ZIP multiplo de manifest.batch_print_selected
   - status `collecting`, `available`, `partial`, `failed`
2) Validar isolamento de memoria operacional:
   - mesma conversationSessionId em contas diferentes
   - reaproveitamento correto na mesma conta
3) Validar worker/job flow:
   - bundle aguardando jobs fonte ainda pendentes
   - bundle com falha parcial
   - bundle sem nenhum PDF disponivel
4) Validar rotas:
   - GET /v1/conversations/artifacts/:artifactId
   - GET /v1/conversations/artifacts/:artifactId/content

Arquivos de entrada:
- docs/handoffs/chat-copiloto-operacional/04-persistence-worker.md
- src/services/conversation/conversation-persistence-service.ts
- src/services/conversation/conversation-service.ts
- src/routes/conversation-routes.ts
- src/workers/operation-handlers.ts

Entregaveis:
- checkpoint docs/handoffs/chat-copiloto-operacional/09-qa-validation.md
- evidencias dos testes executados e gaps residuais
```