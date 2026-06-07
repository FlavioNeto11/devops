# 10 - Documentation Final

## Scope

Consolidacao final da demanda `manifest-search-fk-integration-account`, cobrindo causa raiz, correcao aplicada, arquivos alterados, validacoes executadas e riscos remanescentes.

## Root cause

O endpoint `GET /v1/manifestos` aceitava `integrationAccountId` e `sessionContextId`, mas nao validava cedo a coerencia entre esses dois identificadores antes do caminho de sync remoto e persistencia.

Quando a busca era executada com `sessionContextId` valido, porem associado a outra conta, o fluxo seguia ate `upsertManifestFromExternalSearch` e tentava persistir manifests usando o `integrationAccountId` cru vindo da query string. Nessa situacao, o insert podia referenciar uma conta inexistente ou incoerente com a sessao operacional e terminava em `500` com `23503` na foreign key `manifests_integration_account_id_fkey`.

## Fix applied

- `src/services/manifest-service.ts`
  - `listManifests` passou a validar o contexto operacional no inicio do fluxo.
  - A validacao reutiliza `requireOperationalSessionContext` quando `sessionContextId` e informado, garantindo materializacao da conta e coerencia entre sessao e conta antes de qualquer sync ou persistencia.
  - Para requests sem `sessionContextId`, o fluxo preserva o fallback correto com `ensureIntegrationAccount(integrationAccountId)` antes de qualquer possivel upsert.
- `tests/integration/manifest-list-search.test.js`
  - Foi adicionada cobertura de regressao para o caso em que `sessionContextId` nao pertence ao `integrationAccountId`, exigindo resposta `400`, sem chamada ao CETESB e sem persistencia invalida.

## Files changed

- `src/services/manifest-service.ts`
- `tests/integration/manifest-list-search.test.js`
- `src/repositories/manifest-repo.ts`
- `docs/handoffs/manifest-search-fk-integration-account/10-documentation-final.md`

## Endpoints and contracts

- Endpoint impactado: `GET /v1/manifestos`
- Contrato funcional apos a correcao:
  - contexto inconsistente entre `sessionContextId` e `integrationAccountId` retorna `400` com `application/problem+json`
  - contexto valido continua retornando `200`
- Nao houve alteracao de OpenAPI, examples ou contrato publico; a correcao foi de precondicao no service.

## Decisions

- Corrigir a causa no service, antes do acesso a persistencia, em vez de mascarar a falha na camada SQL.
- Reutilizar a validacao operacional ja existente para manter invariantes consistentes entre fluxos.
- Adicionar defesa em profundidade no repositorio para impedir persistencia remota com `sessionContextId` e `integrationAccountId` incoerentes, mesmo se algum caller stale ou alternativo contornar a guarda do service.
- Nao alterar schema, migration ou foreign key, porque o banco estava protegendo corretamente um estado invalido gerado acima.

## Commands and validations run

- `npx tsx --test tests/integration/manifest-list-search.test.js`
  - resultado final da rodada: `6/6` testes passando
- `npm run typecheck`
  - resultado: sucesso
- Validacao de runtime do endpoint em processo limpo da API na porta `8082`
  - cenario invalido: `400 application/problem+json`
  - verificacao de persistencia: `0` manifests gravados para a conta invalida
  - cenario valido: `200` com payload paginado e `1` manifesto retornado
- Prova operacional apos refresh da stack padrao em `:8080`
  - `shell: stack: stop processes`
  - checagem de porta apos stop: `NO_LISTENER_8080`
  - `stack: run (real)`
  - `GET /v1/manifestos?integrationAccountId=acc_acc_1048c579b90c3e6d788c4812c5&sessionContextId=scx_ccac5739eb50ce2f480ae3c6cb&dateFrom=2026-04-17&dateTo=2026-04-18&forceSync=true&pageSize=20`
    - resultado: `400 Bad Request`
    - content-type: `application/problem+json`
    - detail: `sessionContextId scx_ccac5739eb50ce2f480ae3c6cb does not belong to integrationAccountId acc_acc_1048c579b90c3e6d788c4812c5.`
- Health da stack padrao durante a mesma prova operacional
  - `GET /health/system`
  - resultado: `503 Service Unavailable`
  - body relevante: `status: degraded`

## Runtime proof note

Houve duas evidencias complementares de runtime nesta demanda:

- Em processo limpo da API na porta `8082`, a correcao ja havia sido comprovada em ambiente controlado.
- Na porta padrao `:8080`, a primeira evidencia era inconsistente: havia um runtime antigo/stale que nao servia como prova final confiavel.

Depois do refresh suportado da stack, a prova operacional em `:8080` passou a refletir o comportamento corrigido esperado para a request exata do usuario: `400 application/problem+json` com detalhe explicito de mismatch entre `sessionContextId` e `integrationAccountId`.

Ao mesmo tempo, `GET /health/system` continuou retornando `503 degraded` nessa mesma stack refreshed. Portanto:

- a correcao deste defeito especifico fica validada tambem na porta padrao `:8080`;
- a saude geral da stack padrao nao ficou validada por esta rodada e exige follow-up separado se houver interesse operacional.

## Tests summary

- Regressao automatizada focal cobrindo a classe do defeito
- Typecheck sem erros
- Validacao HTTP local controlada comprovando:
  - ausencia do `500`
  - ausencia do `23503`
  - ausencia de insert invalido em `manifests`
  - preservacao do caminho valido de listagem
- Prova operacional em `:8080` apos refresh da stack, confirmando a request exata do usuario com `400 application/problem+json`
- Health da stack padrao ainda `503 degraded` durante a mesma prova

## Residual risks

- A saude geral da stack padrao continua pendente: durante a prova operacional final, `GET /health/system` ainda respondeu `503 degraded`.
- O defeito desta demanda foi validado na request focal, mas problemas mais amplos de runtime, workers ou observabilidade em `:8080` nao fazem parte desta correcao e podem afetar outras validacoes operacionais.
- Se houver novas rodadas de QA em ambiente local compartilhado, ainda vale garantir runtime identificavel para evitar leitura de processos stale fora da porta validada.

## Final status

- Causa raiz identificada e corrigida no ponto correto.
- Regressao coberta por teste automatizado e defesa adicional aplicada no caminho de persistencia remota.
- Runtime antigo em `:8080` foi confirmado como stale/inconsistente; apos refresh da stack, a request exata do usuario passou a retornar `400 application/problem+json` com detail de mismatch, em vez de seguir para persistencia incorreta.
- A correcao funcional deste defeito esta validada, mas a stack padrao permaneceu `503 degraded` em `GET /health/system`, exigindo follow-up separado caso se queira sanidade geral do ambiente.
