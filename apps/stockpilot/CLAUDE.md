# StockPilot — Reposicao de Estoque — gerado pela Forge

App SICAT-style com blocos: observabilidade, camadas-rigidas, migrations-versionadas, oidc-sessao, worker-queue-transacional, idempotencia, gateway-externo, contract-openapi, design-system, ia-grafo, rag-pgvector, structured-outputs.
Ver apps/stockpilot/.forge/applied-capabilities.json.

Verificar: `BASE_URL=http://nvit.localhost/stockpilot/api node apps/stockpilot/test/integration.mjs`

## Auth + multi-tenant (REQ-STOCKPILOT-0002)

A API é protegida por **SSO de borda** (Traefik `console-auth-401`/`console-auth-redirect` → oauth2-proxy/Keycloak realm `nvit`, ns `devops-system`): XHR sem sessão → 401, navegação → 302 p/ login. O app deriva identidade/tenant SÓ dos headers de borda `X-Auth-Request-*` (`lib/auth-context.js` — o cliente não os forja; a borda sobrescreve). Tenant = grupo Keycloak `tenant:<key>` (senão `default`). As rotas `/v1/products|orders|alerts` usam `requireAuth` e escopam toda query por `tenant_id` (deny-by-default; cross-tenant → 404). `/health` interno fica aberto (readiness do pod, fora da borda).

- Local sem a borda: `AUTH_REQUIRED=false` libera (tenant via `X-Tenant-Id` p/ testes).
- Testes unitários (sem Postgres): `npm test` em `api/` (`test/auth-tenant.test.mjs`).

## Reposição assíncrona (REQ-STOCKPILOT-0003)

Quando um produto cai **abaixo do estoque mínimo** (sem pedido aberto), o sistema cria um
`product_order` (status `pending`) e **enfileira um job idempotente** na MESMA fila transacional
(`jobs`, FOR UPDATE SKIP LOCKED, retry/backoff/DLQ). O **worker** consome o job, marca o pedido
`processing`, chama o **gateway externo** (`gateways/gateway.js`, com retry/timeout próprios) e marca
`delivered`; ao esgotar tentativas (DLQ) o pedido vira `failed` com `last_error`.

- **Decisão + enqueue ficam no service** (`services/reorder-service.js`), não na rota (rotas finas).
- **Disparo automático**: o worker varre periodicamente (`autoReorderScan`, a cada `REORDER_SCAN_EVERY`
  ciclos ociosos) produtos abaixo do mínimo e dispara reposição. **Manual**: `POST /v1/products/:id/reorder`.
- **Idempotência (dois níveis)**: (1) só existe UM pedido aberto (`pending|processing`) por produto/tenant
  — repetir o POST devolve o MESMO recurso (`200 deduped`) sem criar outro; (2) `job_key` UNIQUE
  (`reorder:<tenant>:<produto>:<pedido>`) — reenfileirar é no-op (`ON CONFLICT DO NOTHING`).
- Tudo escopado por `tenant_id` (REQ-STOCKPILOT-0002): nunca cruza tenant.
- Testes sem Postgres: `api/test/reorder.test.mjs` (decisão + chave + dedup + processamento do job).

## Contrato contract-first (REQ-STOCKPILOT-0006)

A superfície HTTP é definida num **OpenAPI 3.1 canônico** em `api/openapi/openapi.yaml` (paths na
raiz, como o app as vê após o StripPrefix do Traefik). Schemas principais: `Product` (status derivado
`OK`/`ALERTA`/`RUPTURA`), `Order`, `Alert`, `AuditEntry`, `Error`.

- **Validação sem dependências novas**: `npm run validate:openapi` (`api/openapi/validate.mjs`) faz
  parse do YAML (parser de subconjunto próprio, zero deps) e checa **drift bidirecional** — toda rota
  `app.get/post(...)` do `server.js` precisa estar documentada e vice-versa. Reprova (exit 1) em
  qualquer divergência.
- **Regra de ouro**: NUNCA crie/altere uma rota sem atualizar o `openapi.yaml` no MESMO PR.
- Teste sem Postgres: `api/test/openapi-contract.test.mjs` (contrato real sincronizado + falha em drift
  nos dois sentidos).
