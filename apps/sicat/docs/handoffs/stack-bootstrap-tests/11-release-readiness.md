# 11 - Release Readiness

## Objective

Subir a stack completa do SICAT para testes usando as tasks e workflows oficiais do workspace, validar que API, worker, frontend e Postgres ficaram operacionais, e registrar o estado final do ambiente.

## Tasks And Workflows Used

- `workflow: dev (real)`
  - tentativa inicial via task composta; nao retornou terminal utilizavel para acompanhamento.
- `stack: restart (real + frontend)`
  - tentativa oficial de restart completo; executou a fase de stop/prepare, mas nao entregou evidencias confiaveis da subida completa.
- `stack: prepare quick`
  - `infra: postgres up`
  - `db: migrate`
  - `openapi: validate`
- `stack: run (real + frontend)`
  - `api: start (real)`
  - `worker: run (real)`
  - `frontend: dev (5174)`
- `npm: smoke: health`
- `npm: smoke: openapi`
- `shell: stack: stop processes`
  - usada para medir a efetividade do cleanup oficial antes do relaunch.

## What Is Running

- Postgres em container Docker `mtr_postgres`, exposto na porta `5432`.
- API backend SICAT em `http://127.0.0.1:8080`.
- Worker SICAT em execucao como processo Node/tsx, sem porta HTTP propria.
- Frontend Vite em `http://127.0.0.1:5174`.

Estado final observado apos cleanup e relaunch:

- listener ativo em `8080` para a API;
- listener ativo em `5174` para o frontend;
- um conjunto consistente de processos runtime para API, worker e frontend;
- health final da API em estado `healthy`;
- frontend respondendo `200`.

## Relevant Ports And URLs

- Postgres: `localhost:5432`
- API base: `http://127.0.0.1:8080`
- API ping: `http://127.0.0.1:8080/v1/ping`
- API health: `http://127.0.0.1:8080/v1/health/system`
- Workers health: `http://127.0.0.1:8080/v1/health/workers`
- OpenAPI YAML: `http://127.0.0.1:8080/openapi.yaml`
- OpenAPI JSON: `http://127.0.0.1:8080/openapi.json`
- Frontend: `http://127.0.0.1:5174/`

## Validation Performed

- `stack: prepare quick` concluiu com sucesso:
  - Postgres em execucao;
  - migracoes concluidas (`[migrate] concluido`);
  - OpenAPI validado com sucesso.
- `npm: smoke: health` passou com `7/7` checks:
  - `GET /v1/ping -> 200`
  - `GET /v1/health/system -> 200`
  - `GET /v1/health/workers -> 200`
  - `GET /v1/health/jobs/active -> 200`
  - `GET /v1/health/jobs/dlq -> 200`
  - `GET /v1/health/metrics/performance -> 200`
  - `POST /v1/maintenance/cleanup -> 202`
- `npm: smoke: openapi` passou:
  - `GET /openapi.yaml -> 200`
  - `GET /openapi.json -> 200`
- Validacao direta final:
  - `GET http://127.0.0.1:5174/ -> 200`
  - `GET http://127.0.0.1:8080/v1/ping -> ok`
  - `GET http://127.0.0.1:8080/v1/health/system -> healthy`
  - listeners confirmados em `8080` e `5174`
  - container `mtr_postgres` confirmado em `Up`

## Blockers And Caveats

- O script oficial acionado por `shell: stack: stop processes` e pelo restart atual filtra processos por `src\\server.js` e `src\\worker.js`. Como o runtime atual usa `tsx` com `src/server.ts` e `src/worker.ts`, processos antigos puderam permanecer vivos apos o stop oficial.
- Para deixar o ambiente realmente pronto para testes, foi necessario cleanup operacional manual dos processos Node/tsx orfaos antes de relancar `stack: run (real + frontend)`.
- Foram observados erros de jobs antigos na fila (por exemplo `qa.stream.notify` nao suportado e retries/DLQ de chamadas CETESB antigas). Esses eventos vieram de carga preexistente e nao impediram a prontidao operacional da stack nem a aprovacao das health checks.

## Final Status

Stack efetivamente no ar e pronta para testes locais no momento do registro, com Postgres, API, worker e frontend respondendo apos relaunch limpo.

## Delta - 2026-04-19 Frontend Recovery Round

### Objective

Restaurar a disponibilidade do frontend em `http://127.0.0.1:5174/` sem editar codigo de produto, tratando a indisponibilidade como regressao operacional da stack local.

### Facts Observed

- No inicio desta rodada, `GET http://127.0.0.1:5174/` falhava com `connection refused` e nao havia listener ativo em `5174`.
- A tentativa pelo task oficial `stack: restart (real + frontend)` executou repetidamente apenas a fase de stop/cleanup, deixando a stack sem listener em `8080` e `5174` ao final dessa tentativa.
- O fluxo suportado em duas etapas funcionou nesta sessao:
  - `stack: prepare quick`
  - `stack: run (real + frontend)`
- Apos o relaunch, houve listener ativo em `127.0.0.1:5174` e a resposta HTTP do frontend voltou com `200` contendo cabecalho/HTML do Vite.
- A API permaneceu acessivel apos o relaunch com `GET /v1/health/system -> 200`.
- A validacao oficial `npm: smoke: health` passou com `7/7` checks depois desta rodada.

### Concrete Cause

- Causa operacional confirmada nesta rodada: o caminho oficial `stack: restart (real + frontend)` mostrou comportamento nao confiavel no ambiente atual, repetindo a fase `stack: stop processes` sem evidenciar o relaunch completo de `stack: run (real + frontend)`.
- O script acionado por `stack: stop processes` termina com a instrucao `now run the VS Code task: stack: restart (real + frontend)`, e a execucao observada pelo runtime desta sessao entrou em ciclo de stop/reuso de terminal em vez de estabilizar a subida da stack.

### Decisions

- Para recuperar o frontend sem alterar codigo, foi adotado o caminho suportado separado: primeiro `stack: prepare quick`, depois `stack: run (real + frontend)`.
- Nao foram feitas alteracoes em `src/`, `frontend/`, `openapi/` ou scripts de produto; a recuperacao foi exclusivamente operacional.

### Current State After Recovery

- Frontend respondendo em `http://127.0.0.1:5174/` com `200`.
- API respondendo em `http://127.0.0.1:8080/v1/health/system` com `200` e status `healthy`.
- Listeners confirmados:
  - `127.0.0.1:5174`
  - `:8080`

### Remaining Caveats

- O task composto `stack: restart (real + frontend)` continua suspeito para uso como relaunch unico nesta estacao; nesta rodada, o caminho confiavel foi `stack: prepare quick` seguido de `stack: run (real + frontend)`.
- Permanecem varios processos Node.js ligados ao workspace por tentativas anteriores de execucao; eles nao impediram a restauracao do frontend nesta rodada, mas valem monitoramento caso o restart volte a ficar instavel.