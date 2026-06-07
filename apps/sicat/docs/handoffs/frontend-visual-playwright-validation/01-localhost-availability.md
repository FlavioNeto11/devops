# 01 - Localhost Availability

## Objetivo da fase
Garantir stack local para validacao visual com Playwright (Postgres + API backend + frontend), sem alterar codigo de produto.

## Tarefas/comandos executados
1. Task `stack: prepare local`
- Resultado: executada (install/migrate/openapi validate observados no terminal).

2. Task `stack: restart (real-dev + frontend)`
- Resultado: executada com saida de terminais reutilizados.

3. Task `stack: run (real-dev + frontend)`
- Resultado: API iniciou em log (`[mtr-api] listening on port 8080`), frontend iniciou (`VITE ready`), porem houve encerramentos com `exit code: 1` no frontend em algumas tentativas.

4. Task `stack: run (real-dev)`
- Resultado: tentativa para estabilizar backend/worker.

5. Task `npm: api: dev (real)`
- Resultado: logs indicaram subida da API, mas o processo nao permaneceu estavel via runner de task.

6. Fallback operacional (mesmo comando da task da API) em terminal de fundo
- Comando: `CETESB_GATEWAY_MODE=real; npm run dev`
- Resultado: API ficou escutando em `:8080`.

7. Validacoes de disponibilidade
- Verificacao de portas: `5432`, `8080`, `5174`.
- Verificacao HTTP: `/health/system`, `/health/workers`, `/openapi.json`, `/` (frontend).

## Evidencias objetivas (snapshot)
Timestamp: `2026-04-21 22:19:18-03:00`

- Postgres:
  - container `mtr_postgres`: `Up`
  - porta: `5432` publicada

- API backend:
  - porta escutando: `8080`
  - `GET /openapi.json` -> `200`
  - `GET /health/workers` -> `200`
  - `GET /health/system` -> `503` com payload `status: degraded` e `jobs.dlqTotal: 1`

- Frontend:
  - porta escutando: `5174`
  - `GET http://127.0.0.1:5174/` -> `200`

## Status por servico
- Postgres: `UP`
- API: `UP (degraded health/system)`
- Frontend: `UP (HTTP 200)`

## Bloqueios
1. `health/system` responde `503` (degraded), apesar da API responder em endpoints essenciais.
2. Logs do frontend durante as tasks mostraram erros de compilacao Vue em arquivos de produto (ex.: `Element is missing end tag`, `Single file component can contain only one <script setup>`) e terminacoes `exit code: 1` em tentativas de subida via task.

## Decisao da fase
`blocked`

Motivo: embora Postgres/API/frontend estejam acessiveis por porta/URL no momento do snapshot, a saude sistemica esta degradada (`503`) e houve falhas de compilacao frontend durante o fluxo padrao de tasks, o que compromete confianca para validacao visual completa e estavel com Playwright.

## Handoff para proxima fase (tester-qa-mtr)
`next_agent_required`

Prompt sugerido ao `tester-qa-mtr`:

- Contexto: stack local parcialmente operacional em `frontend-visual-playwright-validation`, com endpoints base ativos, mas com degradacao em `health/system` e historico recente de erros de compilacao Vue no frontend.
- Objetivo: validar se o baseline atual permite execucao util de Playwright (smoke visual inicial) e identificar bloqueios reproduziveis para encaminhamento ao frontend-vue-ux-mtr.
- URLs:
  - Frontend: `http://127.0.0.1:5174/`
  - API OpenAPI: `http://127.0.0.1:8080/openapi.json`
  - API health system: `http://127.0.0.1:8080/health/system`
  - API health workers: `http://127.0.0.1:8080/health/workers`
- Entrega esperada: checkpoint `09-qa-validation.md` com evidencias Playwright (pass/fail, telas afetadas, erros de compilacao/runtime observados).