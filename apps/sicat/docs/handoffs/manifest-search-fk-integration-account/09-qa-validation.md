# 09 - QA Validation

## Objective

Validar a correcao do erro `500`/`23503` em `GET /v1/manifestos` quando a busca recebe `integrationAccountId` e `sessionContextId` inconsistentes, confirmando que o fluxo falha cedo com erro controlado e sem tentativa de persistencia invalida.

## Validations run

### 1. Regressao focal por teste de integracao

- Comando: `npx tsx --test tests/integration/manifest-list-search.test.js`
- Resultado: `5/5` testes passando.
- Evidencia relevante da regressao:
  - `deve rejeitar sessionContextId que nao pertence ao integrationAccountId informado`
  - valida `400`
  - valida ausencia de chamada CETESB
  - valida `0` manifests persistidos para a conta invalida

### 2. Runtime local controlado do endpoint

- Ambiente preparado com Postgres local, migrations e API limpa em porta dedicada `8082`.
- Seed controlado inserido no Postgres para dois cenarios:
  - contexto invalido: `sessionContextId` ligado a outra conta
  - contexto valido: manifesto local em cache com `last_sync_at` recente para evitar sync remoto

#### 2.1 Cenario invalido reproduzindo a classe do bug

- Request validado:
  - `GET /v1/manifestos?integrationAccountId=acc_qa_manifest_search_http4&sessionContextId=scx_qa_manifest_search_http4&dateFrom=2026-04-17&dateTo=2026-04-18&page=1&pageSize=20`
- Response observada:
  - status `400`
  - content-type `application/problem+json`
  - detail: `sessionContextId scx_qa_manifest_search_http4 does not belong to integrationAccountId acc_qa_manifest_search_http4.`
- Verificacao de persistencia apos a chamada:
  - `COUNT(*) FROM manifests WHERE integration_account_id = 'acc_qa_manifest_search_http4'` = `0`
- Conclusao:
  - nao houve `500`
  - nao houve `23503`
  - nao houve insert invalido em `manifests`

#### 2.2 Cenario valido sem regressao funcional

- Request validado:
  - `GET /v1/manifestos?integrationAccountId=acc_qa_manifest_search_ok4&sessionContextId=scx_qa_manifest_search_ok4&dateFrom=2026-04-17&dateTo=2026-04-18&page=1&pageSize=20`
- Response observada:
  - status `200`
  - payload paginado com `1` manifesto retornado
  - manifesto retornado com `manifestNumber 260010679519`
- Conclusao:
  - o endpoint continua operacional para contexto valido

## Results

- Correcao validada com sucesso para a classe de erro reportada.
- Em processo limpo da API, o endpoint agora responde `400` para contexto operacional inconsistente, em vez de atingir persistencia e falhar por foreign key.
- O caminho valido da listagem continua respondendo `200` com dados locais em cache.

## Findings

- `GET /v1/manifestos` nao reproduziu mais o `500` por `manifests_integration_account_id_fkey` no cenario controlado que antes levava a persistencia invalida.
- O comportamento observado no runtime fresco ficou alinhado com a protecao adicionada em `listManifests`: validacao antecipada de coerencia entre `sessionContextId` e `integrationAccountId`.
- A evidencia de runtime so foi considerada conclusiva na instancia limpa em `8082`; havia um processo previo em `8080` com comportamento nao confiavel para esta validacao.

## Residual risks

- A validacao de runtime foi feita com seed local controlado, nao com os IDs reais reportados pelo usuario; portanto, confirma a correcao da classe do defeito, nao a disponibilidade dos registros reais daquele ambiente.
- Nao houve validacao contra CETESB real nesse checkpoint, porque o objetivo era comprovar a falha cedo antes de qualquer sync remoto/persistencia.

## Next handoff

Proximo owner: `documentador-mtr`.

Objetivo do proximo owner: consolidar causa raiz, correcoes, evidencias de QA e observacao sobre a necessidade de validar sempre em processo limpo da API quando houver stack local preexistente.

## Delta - validacao do runtime ativo em 8080

### Objective desta rodada

Fechar a lacuna de prova sobre o que a instancia efetivamente ativa em `:8080` retorna hoje para a request exata reportada pelo usuario, sem usar runtime controlado em porta alternativa.

### Validations run desta rodada

### 1. Health do runtime ativo em `:8080`

- Request validado:
  - `GET /health/system`
- Response observada:
  - status `503`
  - content-type `application/json; charset=utf-8`
  - body com `status: degraded`
- Leitura:
  - havia processo ativo respondendo em `:8080`, mas ja sinalizando estado degradado.

### 2. Request exata reportada no runtime ativo em `:8080`

- Request validado:
  - `GET /v1/manifestos?integrationAccountId=acc_acc_1048c579b90c3e6d788c4812c5&sessionContextId=scx_ccac5739eb50ce2f480ae3c6cb&dateFrom=2026-04-17&dateTo=2026-04-18&forceSync=true&pageSize=20`
  - header `X-Correlation-Id: frontend_317ed8ca-e04d-42a9-98e6-cc3d17386003`
- Response observada:
  - status `200`
  - content-type `application/json; charset=utf-8`
  - payload paginado com `2` manifests retornados
  - ambos vinculados ao `sessionContextId scx_ccac5739eb50ce2f480ae3c6cb`
- Leitura:
  - o runtime ativo em `:8080` nao reproduziu mais o `500/23503` reportado pelo usuario;
  - porem tambem nao exibiu o comportamento corrigido esperado (`400 application/problem+json`) para o par inconsistente de `integrationAccountId` e `sessionContextId` ja comprovado na fase de persistencia;
  - isso deixa a instancia ativa em `:8080` inconsistente com a evidência do service e com a validacao HTTP em processo limpo na `:8083`.

### Findings desta rodada

- O runtime ativo em `:8080` respondeu `200` para a request exata reportada, retornando `2` manifests.
- O mesmo runtime respondeu `503 degraded` em `GET /health/system`.
- Portanto, a instancia ativa em `:8080` nao fecha a prova de comportamento corrigido e deve ser tratada como runtime nao confiavel para validacao final.

### Decision desta rodada

- A lacuna de QA para o runtime ativo nao foi fechada por `:8080`.
- Como o comportamento observado em `:8080` diverge do comportamento corrigido esperado, o encaminhamento operacional correto e refresh da stack/instancia com ownership de `ci-cd-github-mtr` antes de usar `:8080` como evidencia final.

### Next handoff desta rodada

Proximo owner: `ci-cd-github-mtr`.

Objetivo do proximo owner: atualizar ou reiniciar a stack que atende em `:8080`, eliminar runtime stale/inconsistente e devolver uma nova prova HTTP nessa mesma porta para a request exata do usuario.
