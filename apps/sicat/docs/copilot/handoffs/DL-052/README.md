# DL-052 - Sincronização terminal job → manifesto

## Contexto
Foram observados casos reais em que o job de submit terminava com falha (`failed`/`dlq`), mas o manifesto permanecia em estado transitório (`submitting`/`processing`) por tempo indefinido.

## Objetivo
Garantir convergência automática entre estado terminal do job e estado do manifesto, incluindo cenários de órfão e perda de evento de notificação.

## Entregas
- Side-effect terminal no worker para `manifest.submit` quando o job termina com falha.
- Reconciliação em `getManifest` para manifesto órfão ou com job terminal de erro.
- Fallback do stream de eventos por heartbeat para detectar drift sem `NOTIFY`.
- Cobertura automatizada para cenários de reconciliação.

## Arquivos alterados (escopo DL-052)
- `src/workers/operation-handlers.js`
- `src/workers/job-runner.js`
- `src/services/manifest-service.js`
- `src/routes/api-routes.js`
- `tests/worker/manifest-submit-handler.test.js`
- `tests/integration/manifest-get-reconciliation.test.js`

## Resultado esperado
- Manifesto não permanece eternamente em envio após terminalização do job.
- Em falha terminal, manifesto fica em estado de erro com mensagem operacional para revisão/reenvio.
