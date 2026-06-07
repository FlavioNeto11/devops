# 09 - CI Validation

## Objective

Atualizar a stack que atende em `:8080`, eliminar a duvida sobre runtime stale/orfao e registrar prova HTTP do comportamento atual da porta padrao para a request exata reportada pelo usuario.

## Files analyzed

- `docs/handoffs/manifest-search-fk-integration-account/00-orchestration.md`
- `docs/handoffs/manifest-search-fk-integration-account/04-persistence-worker.md`
- `docs/handoffs/manifest-search-fk-integration-account/09-qa-validation.md`
- `.vscode/tasks.json`
- `scripts/restart-stack-vscode.ps1`
- `README.md`

## Operational actions

- Reinicio executado com tasks suportadas do workspace:
  - `shell: stack: stop processes`
  - `stack: run (real)`
- A task de stop limpou explicitamente o listener anterior de `:8080`.
- Validacao logo apos o stop confirmou `NO_LISTENER_8080`.
- Validacao de processo no momento da prova confirmou novo listener em `:8080`:
  - `PID 46004`
  - command line: `tsx src/server.ts`
  - `CreationDate: 2026-04-18 22:40:28`

## Findings

### 1. Runtime stale anterior nao permaneceu servindo `:8080`

- Antes da subida nova, o stop suportado limpou o listener antigo em `:8080`.
- A porta ficou livre antes da nova subida.
- No momento da prova final, `:8080` estava atendido por um novo processo `src/server.ts` identificado acima.

### 2. Ainda existiam processos Node do workspace apos o stop

- Foram observados processos `tsx watch src/server.ts` e `tsx src/worker.ts` ainda presentes no workspace.
- Porem, apos o stop, nenhum deles estava ouvindo `:8080`.
- Para este checkpoint, a garantia exigida foi satisfeita: o runtime stale/orfao nao era o processo servindo a porta `:8080` no momento da prova.

### 3. Health proof em `:8080`

- Request: `GET /health/system`
- Resultado:
  - status `503 Service Unavailable`
  - content-type `application/json; charset=utf-8`
  - body relevante: `{"status":"degraded", ... "workers":{"healthy":10,"degraded":0,"active5m":1,"total":24,...}}`
- Leitura:
  - a stack padrao em `:8080` respondeu no runtime novo;
  - entretanto, o estado agregado continuou `degraded`, portanto a porta nao pode ser tratada como runtime plenamente saudavel.

### 4. Request exata reportada, apos refresh da stack em `:8080`

- Request:
  - `GET /v1/manifestos?integrationAccountId=acc_acc_1048c579b90c3e6d788c4812c5&sessionContextId=scx_ccac5739eb50ce2f480ae3c6cb&dateFrom=2026-04-17&dateTo=2026-04-18&forceSync=true&pageSize=20`
  - header `X-Correlation-Id: frontend_317ed8ca-e04d-42a9-98e6-cc3d17386003`
- Resultado:
  - status `400 Bad Request`
  - content-type `application/problem+json; charset=utf-8`
  - detail: `sessionContextId scx_ccac5739eb50ce2f480ae3c6cb does not belong to integrationAccountId acc_acc_1048c579b90c3e6d788c4812c5.`
- Leitura:
  - apos refresh do runtime em `:8080`, a request exata passou a refletir o comportamento esperado pela fase de persistencia;
  - a resposta final deixou de ser `200` com manifests e passou a falhar cedo com `400 problem+json`.

## Decision

- A porta `:8080` ficou alinhada com o comportamento funcional esperado para a request focal.
- Porem, como `GET /health/system` continua `503 degraded`, a stack padrao nao deve ser classificada como plenamente confiavel para validacoes gerais de sanidade do ambiente.
- Para este defeito especifico, a prova funcional em `:8080` ficou confiavel apos o refresh.

## Validation summary

- `shell: stack: stop processes`
  - listener antigo de `:8080` removido
- checagem de porta apos stop
  - `NO_LISTENER_8080`
- `stack: run (real)`
  - novo runtime assumiu `:8080`
- inspeccao de processo em `:8080`
  - `PID 46004`, `tsx src/server.ts`
- `curl http://127.0.0.1:8080/health/system`
  - `503 degraded`
- `curl http://127.0.0.1:8080/v1/manifestos?...forceSync=true...`
  - `400 application/problem+json`

## Next handoff

Proximo owner: `documentador-mtr`.

Objetivo do proximo owner: consolidar no fechamento da demanda que houve divergencia entre runtime stale e runtime refreshed em `:8080`, registrar que o endpoint focal ficou correto apos refresh, e explicitar que a stack padrao ainda permaneceu `degraded` no health durante esta rodada operacional.
