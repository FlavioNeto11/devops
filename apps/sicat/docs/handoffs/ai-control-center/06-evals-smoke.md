# AI Control Center — 06 · Evals / Smoke

> Work ID: `ai-control-center` · Branch: `feature/ai-control-center-langfuse`
> FASE 4 · Depende de: `ai-eval-admin-repo`, SSE bus, script de smoke · Habilita: aba Evals

## 1. Objetivo

Disparar e historiar baterias de smoke/eval a partir da tela administrativa, **reaproveitando** o
runner existente `scripts/ai-smoke/run-sicat-ai-smoke.mjs` (nada de runner paralelo). Persiste em
`ai_eval_runs`/`ai_eval_cases` e emite eventos SSE. Serviço: `ai-eval-admin-service.ts`.

## 2. Baterias (`listEvalBatteries()`)

Catálogos: `SAMPLE_CATALOG = docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl`,
`FULL_CATALOG = docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl`. `totalScenarios` é a contagem
de linhas não-vazias do `.jsonl`.

| Bateria (`key`/`mode`) | Catálogo | `blockedByDefault` | Descrição |
|---|---|---|---|
| `dry-run` | sample | nunca | Valida o pipeline **sem chamar backend/LLM**; todos passam (score=1). Sempre liberado. |
| `sample` | sample | nunca | Bateria amostral contra `/v1/conversations/turns` + juiz LLM. |
| `category` | full | nunca | Filtra o catálogo completo por categoria. |
| `full` | full | `!allowFullSmoke` | Bateria completa. Custosa; **bloqueada por padrão**. |

## 3. Modos × pré-requisitos de ambiente

| Modo | Args do runner (`buildSmokeArgs`) | Precisa de | Notas |
|---|---|---|---|
| `dry-run` | `--catalog <sample> --dry-run` | nada | Seguro. Não toca backend nem OpenAI. |
| `sample` | `--catalog <sample> --no-fail-fast` | servidor up + token SICAT + OPENAI_API_KEY | Chama o backend real + juiz LLM. |
| `category` | `--catalog <full> --category <cat> --no-fail-fast` | idem `sample` + `category` (400 `CATEGORY_REQUIRED` se vazio) | — |
| `full` | `--catalog <full> --no-fail-fast` | idem + **`AI_CONTROL_ALLOW_FULL_SMOKE=true`** | 409 `FULL_SMOKE_BLOCKED` sem a flag; a rota também exige `confirmed:true`. |

`--max <n>` é anexado quando `input.max > 0`. **Mutações sempre desligadas**: o runner é executado com
`env: { ...process.env, SICAT_AI_SMOKE_ALLOW_MUTATIONS: 'false' }`. Timeout: 600 s (full) / 300 s (demais).

## 4. O que o dry-run faz (e não faz)

Exercita o pipeline de avaliação (parsing do catálogo, montagem dos cenários, escrita do relatório
JSON/MD em `artifacts/ai-smoke/`) **sem** rede: não chama `/v1/conversations/turns` nem a OpenAI.
Todos os casos passam com score sintético = 1. Serve para validar plumbing/CI sem credenciais — é a
única bateria executável neste ambiente (ver handoff 08).

## 5. Fluxo de `runEval(input)`

1. Valida bloqueios (`full` sem flag → 409; `category` sem categoria → 400).
2. `insertAiEvalRun({ runKey, mode, status:'running', requestedBy, startedAt })`.
   `runKey = <mode>-<timestamp>-<rand4>`.
3. Emite SSE **`eval.started`** `{ runId, mode, runKey }`.
4. `execFile(process.execPath, ['scripts/ai-smoke/run-sicat-ai-smoke.mjs', ...args], {...})`. O runner
   sai com código 1 quando há falhas, **mas ainda escreve o relatório** — por isso o `catch` também
   tenta `readLatestReport()`.
5. `readLatestReport()` pega o `sicat-ai-smoke-*.json` mais recente de `artifacts/ai-smoke/`
   (`SICAT_AI_SMOKE_OUTPUT_DIR` se setado) e `summarizeReport()` extrai
   `AiEvalSummary {total, passed, failed, passRate, avgScore, topReasonCodes[], failedCategories[]}`.
   `status` final = `failed` se `summary.failed > 0`, senão `passed` (ou `error` se não há relatório).
6. Persiste até 500 casos via `insertAiEvalCases` (caseId/category/prompt/expected/actual/score/status).
7. `updateAiEvalRun({ status, finishedAt, summary })`, emite SSE **`eval.done`** `{ runId, status }`.

Leitura: `listEvalRuns(limit=50)` e `getEvalRunDetail(runId)` (run + casos).

## 6. Superfície de rotas

`GET /v1/ai-control/evals` (baterias + últimas 50 runs), `POST /v1/ai-control/evals/run`
(202 Accepted; valida `mode ∈ {sample,full,category,dry-run}`; `full` exige `confirmed:true`),
`GET /v1/ai-control/evals/:runId` (detalhe). Eventos SSE `eval.started`/`eval.done` chegam pela
mesma stream do handoff 03.

## 7. Pendências conhecidas

- `runEval` roda o smoke de forma **síncrona** dentro do request (await no `execFile`); para sample/
  full longos a resposta 202 só retorna ao fim. Há histórico/SSE, mas não há cancelamento.
- `regressions`/`toolAccuracy`/`policyAccuracy`/`langfuseDatasetRunId` ficam `null` (não derivados do
  relatório atual). `traceId` por caso é `null` (sem correlação com `ai_trace_events`). Ver handoff 08.
