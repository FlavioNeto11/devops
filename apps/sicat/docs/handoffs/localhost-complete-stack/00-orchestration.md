# 00 - Orchestration

## Objetivo da fase

Subir a stack local completa para validacao manual, incluindo API, worker, frontend e banco, priorizando tasks existentes do workspace e usando fallback manual quando necessario para manter os servicos acessiveis.

## Arquivos analisados

- `.vscode/tasks.json`
- `docs/handoffs/localhost-validation-default/00-orchestration.md`
- `docs/handoffs/localhost-validation-default/09-qa-validation.md`

## Tarefas e comandos executados

- `npm: localhost: up`
- `shell: stack: stop processes`
- `stack: prepare quick`
- `stack: run (real-dev + frontend)`
- fallback manual em terminais dedicados:
  - `$env:CETESB_GATEWAY_MODE='real'; npm run dev`
  - `$env:CETESB_GATEWAY_MODE='real'; npm run worker`
  - `Set-Location frontend; $env:VITE_API_BASE_URL='http://127.0.0.1:8080'; npm run dev -- --host 127.0.0.1 --port 5174`
- validacoes:
  - `npm run smoke:health`
  - `npm run smoke:openapi`
  - `docker compose ps postgres`
  - verificacao de portas 8080 e 5174 e respostas HTTP locais

## Status final

- task dedicada `localhost:up` executada com sucesso, incluindo `postgres up`, `migrate`, `validate:openapi` e bootstrap automatizado de API, worker e frontend
- API acessivel em `http://127.0.0.1:8080` com `GET /v1/ping -> 200` e `GET /openapi.json -> 200`
- Frontend acessivel em `http://127.0.0.1:5174/ -> 200`
- Worker iniciado e presente em processo dedicado `src/worker.ts`; health endpoints responderam `200`
- Postgres disponivel via container `mtr_postgres` em `5432`

## Observacoes residuais

- As tasks compostas do workspace e a task do frontend reaproveitaram terminais antigos e produziram saidas misturadas; para manter a stack estavel foi necessario fallback manual para API, worker e frontend.
- Ha residuos de processos antigos de `npm run dev` e `npm run worker` no host Windows; apesar disso, a API esta bindada e respondendo em `8080`, o frontend em `5174` e a navegacao manual pode prosseguir. Se houver comportamento inesperado, executar `shell: stack: stop processes` antes de novo bootstrap.
- Nenhuma alteracao de codigo de produto foi realizada.

## Handoff sugerido

`next_agent_required`

```text
agent: tester-qa-mtr
work_id: localhost-complete-stack
prompt: CONTINUE_CHAIN. Validar manualmente a stack local completa ja disponibilizada, usando API em http://127.0.0.1:8080, frontend em http://127.0.0.1:5174 e Postgres local ativo no container mtr_postgres.
```