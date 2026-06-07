# DL-051 - Binding assíncrono jobs → manifesto (sem polling)

## Contexto
Foi reportado que a tela de detalhe de manifesto ficava em atualização contínua por polling e nem sempre refletia rapidamente o resultado oficial retornado pela CETESB após conclusão do job.

## Objetivo
Substituir polling por binding assíncrono orientado a eventos da fila de jobs, com atualização reativa do detalhe de manifesto.

## Entregas
- Emissão de eventos de job via Postgres `NOTIFY`.
- Endpoint de stream NDJSON: `GET /v1/jobs/{jobId}/events`.
- Frontend com assinatura de stream (`fetch` + NDJSON), sem timer de polling no detalhe.
- Propagação de `jobId` após submit para binding imediato no redirect.

## Arquivos alterados
- `src/repositories/job-repo.js`
- `src/routes/api-routes.js`
- `frontend/src/services/api.js`
- `frontend/src/views/ManifestDetailView.vue`
- `frontend/src/views/ManifestCreateView.vue`
- `openapi/mtr_automacao_openapi_interna.yaml`
- `src/generated/operations.js`
- `examples/get_v1_jobs_jobId_events_request.json`
- `examples/get_v1_jobs_jobId_events_response.json`

## Resultado esperado
- Atualização assíncrona real do status do job e recarga pontual do manifesto.
- Menos requisições desnecessárias e sem piscar de tela causado por polling periódico.
