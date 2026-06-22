# TeamFlow — Operação de Equipes — gerado pela Forge (gymops-style)

Fastify + Postgres + Redis/BullMQ + RBAC multi-tenant. Blocos: observabilidade, camadas-rigidas, migrations-versionadas, redis-bullmq, rbac-multitenant, oidc-sessao.

> RBAC por header X-Tenant-Id/X-Role (stand-in da sessão OIDC; login real = client no Keycloak realm nvit).

Verificar: `BASE_URL=http://nvit.localhost/teamflow/api node apps/teamflow/test/integration.mjs`
