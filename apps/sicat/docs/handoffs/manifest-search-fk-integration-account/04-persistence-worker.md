# 04 - Persistence Worker

## Objective

Investigar a causa raiz da violacao de foreign key em `manifests.integration_account_id` durante `GET /v1/manifestos` com `integrationAccountId` e `sessionContextId`, corrigir no ponto minimo correto do caminho backend/persistencia e devolver validacao focal.

## Files analyzed

- `docs/handoffs/manifest-search-fk-integration-account/00-orchestration.md`
- `src/services/manifest-service.ts`
- `src/repositories/manifest-repo.ts`
- `src/repositories/integration-account-repo.ts`
- `src/repositories/session-context-repo.ts`
- `src/sql/001_init.sql`
- `tests/integration/manifest-list-search.test.js`

## Root cause

`listManifests` aceitava `integrationAccountId` e `sessionContextId`, mas nao validava o contexto operacional antes do sync remoto.

Quando `sessionContextId` existia e a busca CETESB era executada com base nessa sessao, o `upsertManifestFromExternalSearch` persistia os manifests usando o `integrationAccountId` cru vindo da query string.

Se esse `integrationAccountId` nao existisse localmente ou nao correspondesse ao dono da sessao, o fluxo chegava ao insert em `manifests` e quebrava na FK `manifests_integration_account_id_fkey`, retornando `500` em vez de falhar cedo com erro de contexto invalido.

## Decisions

- Reutilizar `requireOperationalSessionContext`, que ja garante duas invariantes corretas para fluxos operacionais: materializacao da integration account e consistencia entre `sessionContextId` e `integrationAccountId`.
- Aplicar a validacao no inicio de `listManifests`, antes de qualquer leitura/sync remoto ou persistencia.
- Manter fallback para requests sem `sessionContextId`: nesses casos, garantir a linha pai com `ensureIntegrationAccount(integrationAccountId)` antes de qualquer possivel upsert.
- Nao alterar schema, migrations ou repository SQL: o erro era de precondicao ausente no service, nao de modelagem do banco.

## Files changed

- `src/services/manifest-service.ts`
- `tests/integration/manifest-list-search.test.js`

## Validations

- `npx tsx --test tests/integration/manifest-list-search.test.js`
  - 5 testes passando.
  - Cobertura focal da regressao adicionada: `listManifests` rejeita `sessionContextId` associado a outra conta com `400`, sem chamar CETESB e sem persistir manifests na conta invalida.
- `npm run typecheck`
  - concluido com sucesso (`__TYPECHECK_OK__`).
- `get_errors` nos arquivos alterados
  - sem erros em `src/services/manifest-service.ts`, `tests/integration/manifest-list-search.test.js` e neste checkpoint.

## Next handoff

Proximo owner: `tester-qa-mtr`.

Objetivo do proximo owner: validar o endpoint real/focal de `GET /v1/manifestos` para confirmar que o caminho reportado nao retorna mais `500` por FK e que o comportamento final e consistente para contexto valido e invalido.

## Delta - second round (forceSync real IDs)

### Second-round objective

Investigar a variante ainda reportada com `forceSync=true` e IDs reais para distinguir entre ramo ainda nao protegido, runtime stale e/ou outro ponto de persistencia aceitando `integrationAccountId` bruto e inconsistente.

### Additional files analyzed

- `package.json`
- `src/routes/api-routes.ts`
- `src/repositories/manifest-repo.ts`

### Second-round root cause delta

- Em processo limpo da API (`tsx src/server.ts` em porta dedicada), a request real reportada ja falha corretamente com `400`, antes de qualquer persistencia:
  - `integrationAccountId=acc_acc_1048c579b90c3e6d788c4812c5`
  - `sessionContextId=scx_ccac5739eb50ce2f480ae3c6cb`
  - detail observado: `sessionContextId ... does not belong to integrationAccountId ...`
- O banco local confirmou que o `sessionContextId` real pertence a outra conta:
  - `scx_ccac5739eb50ce2f480ae3c6cb -> acc_acc_41efad06dc4dd0cdd6c8505332`
- A instancia ja rodando em `8080` apresentou comportamento divergente e chegou a espelhar manifestos na conta errada, materializando `integration_accounts.id = acc_acc_1048c579b90c3e6d788c4812c5` e gravando manifests com:
  - `integration_account_id = acc_acc_1048c579b90c3e6d788c4812c5`
  - `session_context_id = scx_ccac5739eb50ce2f480ae3c6cb`
- Isso mostrou que a primeira correcao no service cobria o fluxo atual de `listManifests`, mas ainda faltava uma protecao de ownership no proprio caminho de persistencia remota. Sem essa guarda no repositorio, qualquer caller antigo, stale ou alternativo que invoque `upsertManifestFromExternalSearch` com par incoerente ainda consegue gravar estado logicamente invalido se a conta pai for criada antes.

### Second-round decisions

- Manter a validacao de precondicao no service como primeira linha de defesa.
- Adicionar uma segunda linha de defesa no repositorio `upsertManifestFromExternalSearch`, validando que `sessionContextId`, quando informado, pertence ao `integrationAccountId` recebido antes de qualquer `select/update/insert` em `manifests`.
- Nao alterar schema/migration nesta rodada: a protecao minima e suficiente para o caminho remoto investigado e reduz risco de regressao ampla.

### Second-round files changed

- `src/repositories/manifest-repo.ts`
- `tests/integration/manifest-list-search.test.js`

### Second-round validations

- Consulta SQL no Postgres local com os IDs reais reportados
  - confirmou ownership real: `scx_ccac5739eb50ce2f480ae3c6cb` pertence a `acc_acc_41efad06dc4dd0cdd6c8505332`
- Replay HTTP em processo limpo da API na porta `8083`
  - request: `GET /v1/manifestos?...forceSync=true...`
  - resultado: `400 application/problem+json`
  - detail: `sessionContextId scx_ccac5739eb50ce2f480ae3c6cb does not belong to integrationAccountId acc_acc_1048c579b90c3e6d788c4812c5.`
- `npx tsx --test tests/integration/manifest-list-search.test.js`
  - `6/6` testes passando
  - nova cobertura: `upsertManifestFromExternalSearch` rejeita contexto remoto inconsistente e nao persiste manifesto
- `npm run typecheck`
  - concluido sem erros observados
- Limpeza de artefatos locais criados durante a investigacao
  - removidos `2` manifests espelhados indevidamente e `1` integration account sintetica criada pela reproducao em `8080`

### Second-round conclusion

- O sintoma remanescente nao se reproduz no codigo atual em processo limpo.
- Havia, contudo, uma lacuna real no owner de persistencia: o repositorio ainda aceitava `sessionContextId` incoerente com `integrationAccountId` no upsert remoto.
- A rodada 2 fecha esse gap com uma guarda minima no repositorio e reduz a dependencia de a validacao ocorrer apenas no service.

### Second-round next handoff

Proximo owner: `tester-qa-mtr`.

Objetivo do proximo owner: revalidar o request real de `forceSync=true` em stack identificavel/limpa e confirmar duas propriedades:

- a resposta final e `400`, nao `500/23503`, para o par real inconsistente;
- nao ha nova gravacao de manifests sob `integrationAccountId` divergente da ownership real do `sessionContextId`.

## Delta - segunda rodada (forceSync com IDs reais)

### Objetivo desta rodada

Investigar a nova reproducao ainda reportada com `forceSync=true` e IDs reais para decidir entre tres hipoteses:

- a primeira correcao perdeu um branch do caminho remoto;
- o runtime em `8080` estava desatualizado;
- outra trilha de persistencia ainda propagava `integrationAccountId` invalido ate o upsert.

### Arquivos analisados nesta rodada

- `src/services/manifest-service.ts`
- `src/routes/api-routes.ts`
- `src/repositories/manifest-repo.ts`
- `src/repositories/integration-account-repo.ts`
- `src/repositories/session-context-repo.ts`

### Root cause delta

O novo par de IDs reais reportado nao representa um contexto operacional valido:

- `sessionContextId = scx_ccac5739eb50ce2f480ae3c6cb`
- pertence a `integrationAccountId = acc_acc_41efad06dc4dd0cdd6c8505332`
- e nao a `integrationAccountId = acc_acc_1048c579b90c3e6d788c4812c5`, enviado na query

Com o codigo atual, isso e barrado no inicio de `listManifests` por `requireOperationalSessionContext(...)`, antes de qualquer chamada remota, delete de mirror ou `upsertManifestFromExternalSearch(...)`.

Conclusao tecnica:

- a primeira correcao nao deixou um branch aberto no caminho `forceSync` deste endpoint;
- nesta revisao, nao foi encontrada outra trilha de persistencia em `GET /v1/manifestos` capaz de usar um `integrationAccountId` cru/invalido depois dessa guarda;
- a reproducao de `500`/`23503` com esses IDs aponta para runtime anterior/desatualizado ou instancia diferente da API, nao para o codigo atual de persistencia.

### Decisao

- Nenhuma alteracao de codigo adicional foi aplicada nesta fase.
- O comportamento correto ja estava implementado no owner de persistencia.
- O proximo passo ownership-safe e revalidar o ambiente/instancia efetivamente atendendo a request do usuario.

### Validacoes desta rodada

- Inspecao direta no Postgres local dos IDs reais reportados
  - resultado: `scx_ccac5739eb50ce2f480ae3c6cb` pertence a `acc_acc_41efad06dc4dd0cdd6c8505332`
  - resultado: nao existe vinculo com `acc_acc_1048c579b90c3e6d788c4812c5`
- Execucao direta do service com os IDs reais e `forceSync: 'true'`
  - comando: `npx tsx --input-type=module`
  - resultado: `AppError 400`
  - detalhe: `sessionContextId scx_ccac5739eb50ce2f480ae3c6cb does not belong to integrationAccountId acc_acc_1048c579b90c3e6d788c4812c5.`
- Validacao HTTP em processo limpo da API na porta `8083`
  - request: `GET /v1/manifestos?...&forceSync=true&pageSize=20`
  - correlationId: `frontend_317ed8ca-e04d-42a9-98e6-cc3d17386003`
  - resultado: `400 application/problem+json`
  - detalhe: mesma mensagem de contexto inconsistente

### Arquivos alterados nesta rodada

- `docs/handoffs/manifest-search-fk-integration-account/04-persistence-worker.md`

### Handoff atualizado

Proximo owner: `tester-qa-mtr`.

Objetivo do proximo owner: confirmar que a instancia efetivamente usada no fluxo do usuario nao esta servindo codigo antigo e que a reproducao em runtime real agora retorna `400 application/problem+json` para esse par inconsistente de `sessionContextId` e `integrationAccountId`, sem qualquer `500`/`23503`.
