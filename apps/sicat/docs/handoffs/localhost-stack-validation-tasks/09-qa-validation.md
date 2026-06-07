# 09 - QA Validation

## Objetivo da fase

Consolidar a validacao operacional completa da stack local ja disponivel no workspace, com evidencias objetivas para Postgres, API, worker e frontend, incluindo checagens HTTP, health, OpenAPI, docs e smoke visual Playwright.

## Contexto utilizado

- Checkpoint lido: `docs/handoffs/localhost-stack-validation-tasks/01-localhost-availability.md`
- Premissa confirmada na fase anterior: ambiente local ativo com Postgres, API, worker e frontend disponiveis
- Artefatos recentes confirmados em `frontend/test-results/`

## Comandos executados

- `npm run smoke:health`
- `npm run smoke:openapi`
- `docker compose ps`
- `Get-NetTCPConnection -LocalPort 5432,8080,5174 -State Listen`
- `Invoke-WebRequest http://127.0.0.1:8080/v1/ping`
- `Invoke-WebRequest http://127.0.0.1:8080/v1/health/system`
- `Invoke-WebRequest http://127.0.0.1:8080/docs`
- `Invoke-WebRequest http://127.0.0.1:8080/openapi.yaml`
- `Invoke-WebRequest http://127.0.0.1:5174/`
- `Invoke-WebRequest http://127.0.0.1:5174/login`
- `Invoke-RestMethod http://127.0.0.1:8080/v1/health/system`
- `Invoke-RestMethod http://127.0.0.1:8080/v1/health/workers`
- `Get-CimInstance Win32_Process` com filtro para `src/server.ts`, `src/worker.ts` e `vite`
- `docker exec mtr_postgres pg_isready -U postgres`
- `npm run validate:openapi`
- `Push-Location frontend; npm run test:ui -- tests/ui/audit.spec.ts; Pop-Location`
- `Push-Location frontend; npx playwright screenshot --device="Desktop Chrome" http://127.0.0.1:5174/login test-results/qa-login-desktop.png; Pop-Location`
- `Get-ChildItem frontend/test-results | Select-Object Name, LastWriteTime, Length`

## Evidencias por componente

### Postgres

- `docker compose ps` confirmou o container `mtr_postgres` em estado `Up`, com bind em `0.0.0.0:5432->5432/tcp`
- Porta `5432` em escuta local
- `docker exec mtr_postgres pg_isready -U postgres` retornou `/var/run/postgresql:5432 - accepting connections`

### API

- Porta `8080` em escuta local
- `GET http://127.0.0.1:8080/v1/ping` retornou `200`
- `GET http://127.0.0.1:8080/v1/health/system` retornou `200`
- `GET http://127.0.0.1:8080/docs` retornou `200`
- `GET http://127.0.0.1:8080/openapi.yaml` retornou `200`
- Processo Node ativo para `tsx watch src/server.ts`
- `npm run smoke:health` passou `7/7`
- `npm run smoke:openapi` retornou `ok: true`
- `npm run validate:openapi` retornou:
  - `[ok] OpenAPI validado com sucesso`
  - `[ok] Politica de fonte da verdade CETESB validada com sucesso.`
  - `[ok] Nenhum problema de links/ancoras encontrado.`

### Worker

- `GET http://127.0.0.1:8080/v1/health/workers` retornou `200`
- Payload observado:
  - `healthy: 19`
  - `degraded: 0`
  - `unhealthy: 0`
  - `active_last_5m: 1`
- Processo Node ativo para `src/worker.ts`
- `npm run smoke:health` confirmou `GET /v1/health/workers -> 200`, `GET /v1/health/jobs/active -> 200`, `GET /v1/health/jobs/dlq -> 200` e `GET /v1/health/metrics/performance -> 200`

### Frontend

- Porta `5174` em escuta local
- `GET http://127.0.0.1:5174/` retornou `200`
- `GET http://127.0.0.1:5174/login` retornou `200`
- Processo Vite ativo para `frontend/node_modules/.../vite.js --host 127.0.0.1 --port 5174`
- Screenshot atual gerado com Playwright em `frontend/test-results/qa-login-desktop.png`
- Artefatos visuais positivos reaproveitaveis da execucao atual de `audit.spec.ts`:
  - `frontend/test-results/02-dark-login-desktop-1920x1080.png`
  - `frontend/test-results/03-light-dashboard-desktop-1920x1080.png`
  - `frontend/test-results/07-mobile-login-375x667.png`
  - `frontend/test-results/10-font-rendering.png`

## Validacoes HTTP, health, OpenAPI e docs

### HTTP basico

- `GET /v1/ping -> 200 (54 bytes)`
- `GET /v1/health/system -> 200 (346 bytes)`
- `GET /docs -> 200 (3047 bytes)`
- `GET /openapi.yaml -> 200 (214703 bytes)`
- `GET / -> 200 (760 bytes)` no frontend
- `GET /login -> 200 (760 bytes)` no frontend

### Health

- `npm run smoke:health` executado com sucesso: `7/7 testes passaram`
- `GET /v1/health/system` retornou payload com:
  - `status: healthy`
  - `environment: development`
  - `jobs_dlq_total: 1`
  - `workers_healthy: 19`
  - `workers_active_5m: 1`
- `POST /v1/maintenance/cleanup -> 202`

### OpenAPI

- `npm run smoke:openapi` retornou `ok: true`
- `GET /openapi.yaml -> 200`
- `GET /openapi.json -> 200`
- Checagem do smoke confirmou `jobStatusEnum` completo e `commandEndpointsChecked: 5`
- `npm run validate:openapi` passou sem erros

### Docs

- `GET /docs -> 200`
- `npm run validate:openapi` confirmou tambem a validacao de links markdown sem problemas

## Validacao Playwright e smoke visual

### Execucao reproduzida

- Comando executado: `npm run test:ui -- tests/ui/audit.spec.ts`
- Resultado observado: `6 passed`, `4 failed`
- Arquivo de controle atualizado: `frontend/test-results/.last-run.json`
- Status em `.last-run.json`: `failed`

### Artefatos visuais positivos

- `frontend/test-results/qa-login-desktop.png`
- `frontend/test-results/02-dark-login-desktop-1920x1080.png`
- `frontend/test-results/03-light-dashboard-desktop-1920x1080.png`
- `frontend/test-results/07-mobile-login-375x667.png`
- `frontend/test-results/10-font-rendering.png`

### Artefatos de falha reproduzidos

- `frontend/test-results/audit-Frontend-Vuexy-Audit-9da7b--01-Light-Mode---Login-Page/test-failed-1.png`
- `frontend/test-results/audit-Frontend-Vuexy-Audit-9da7b--01-Light-Mode---Login-Page/trace.zip`
- `frontend/test-results/audit-Frontend-Vuexy-Audit-9da7b--01-Light-Mode---Login-Page/video.webm`
- `frontend/test-results/audit-Frontend-Vuexy-Audit-80949-Navbar-Visibility-Structure/test-failed-1.png`
- `frontend/test-results/audit-Frontend-Vuexy-Audit-80949-Navbar-Visibility-Structure/trace.zip`
- `frontend/test-results/audit-Frontend-Vuexy-Audit-77027-8-No-Console-Errors-on-Load/test-failed-1.png`
- `frontend/test-results/audit-Frontend-Vuexy-Audit-77027-8-No-Console-Errors-on-Load/trace.zip`
- `frontend/test-results/audit-Frontend-Vuexy-Audit-31599-9-Vuetify-Components-Render/test-failed-1.png`
- `frontend/test-results/audit-Frontend-Vuexy-Audit-31599-9-Vuetify-Components-Render/trace.zip`

### Falhas objetivas observadas no audit Playwright

- `01-Light Mode - Login Page`: `expect(locator('body')).toBeVisible()` falhou, corpo reportado como `hidden`
- `04-Navbar Visibility & Structure`: `Found 0 nav/header elements`
- `08-No Console Errors on Load`: um erro de console por `500 Internal Server Error`
- `09-Vuetify Components Render`: `Found 0 Vuetify components`
- Execucao adicional de screenshot com device mobile via Playwright CLI nao foi aproveitada como evidencia final porque o ambiente local nao possui WebKit instalado; o screenshot desktop foi gerado com sucesso e os artefatos mobile vieram da propria suite `audit.spec.ts`

## Pass/fail final por componente

- Postgres: PASS
- API: PASS
- Worker: PASS
- Frontend: FAIL

## Riscos residuais

- O frontend responde por HTTP e gera screenshots, mas a suite `tests/ui/audit.spec.ts` ainda aponta regressao funcional/visual em elementos estruturais e em console.
- O payload de health continua registrando `jobs_dlq_total: 1`; isso nao bloqueou disponibilidade, mas indica historico de falha na fila.
- O endpoint de workers mostrou base historica com `total: 35` e `stopped: 16`; o processo ativo esta saudavel, mas o acumulado operacional merece contextualizacao documental para evitar leitura equivocada.
- O ambiente local nao possui WebKit instalado para o screenshot CLI com profile mobile; a cobertura visual mobile ficou sustentada pelos artefatos da suite Playwright executada.

## Status final da fase

- blocked_with_evidence

## Handoff para documentador-mtr

Resumo para documentacao final:

- O stack local esta operacional no momento da validacao para Postgres, API e worker.
- A validacao HTTP, health, OpenAPI e docs passou integralmente.
- O frontend esta disponivel em `http://127.0.0.1:5174` e ha artefatos visuais positivos em `frontend/test-results/`, mas a suite `tests/ui/audit.spec.ts` falhou em 4 de 10 testes, com evidencias reproduzidas em screenshots, traces e videos.
- O checkpoint deve ser documentado como pronto para continuidade com bloqueio localizado no frontend visual/audit, nao como indisponibilidade geral da stack.

`next_agent_required`

Prompt sugerido para `documentador-mtr`:

```text
work_id: localhost-stack-validation-tasks

Fase: 10-documentation-final

Basear a documentacao final nos checkpoints:
- docs/handoffs/localhost-stack-validation-tasks/01-localhost-availability.md
- docs/handoffs/localhost-stack-validation-tasks/09-qa-validation.md

Registrar de forma objetiva:
- stack local operacional para Postgres, API e worker
- validacoes HTTP/health/OpenAPI/docs aprovadas
- frontend disponivel, mas com bloqueio localizado na suite Playwright tests/ui/audit.spec.ts
- artefatos positivos e de falha em frontend/test-results/
- status final da cadeia: blocked_with_evidence

Produzir handoff final sem reexecutar validacoes.
```