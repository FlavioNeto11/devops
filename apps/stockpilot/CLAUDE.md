# StockPilot — Reposicao de Estoque — gerado pela Forge

App SICAT-style com blocos: observabilidade, camadas-rigidas, migrations-versionadas, oidc-sessao, worker-queue-transacional, idempotencia, gateway-externo, contract-openapi, design-system, ia-grafo, rag-pgvector, structured-outputs.
Ver apps/stockpilot/.forge/applied-capabilities.json.

Verificar: `BASE_URL=http://nvit.localhost/stockpilot/api node apps/stockpilot/test/integration.mjs`

## Auth + multi-tenant (REQ-STOCKPILOT-0002)

A API é protegida por **SSO de borda** (Traefik `console-auth-401`/`console-auth-redirect` → oauth2-proxy/Keycloak realm `nvit`, ns `devops-system`): XHR sem sessão → 401, navegação → 302 p/ login. O app deriva identidade/tenant SÓ dos headers de borda `X-Auth-Request-*` (`lib/auth-context.js` — o cliente não os forja; a borda sobrescreve). Tenant = grupo Keycloak `tenant:<key>` (senão `default`). As rotas `/v1/products|orders|alerts` usam `requireAuth` e escopam toda query por `tenant_id` (deny-by-default; cross-tenant → 404). `/health` interno fica aberto (readiness do pod, fora da borda).

- Local sem a borda: `AUTH_REQUIRED=false` libera (tenant via `X-Tenant-Id` p/ testes).
- Testes unitários (sem Postgres): `npm test` em `api/` (`test/auth-tenant.test.mjs`).
