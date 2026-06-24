# NeuroEvolui — gerado pela Forge (gymops-style)

Fastify + Postgres + Redis/BullMQ + RBAC multi-tenant. Blocos: observabilidade, camadas-rigidas, migrations-versionadas, oidc-sessao, rbac-multitenant, redis-bullmq, idempotencia, pagamentos-gateway, ia-grafo, rag-pgvector, control-ai-por-app, structured-outputs, notificacoes-multicanal, design-system.

> RBAC por header X-Tenant-Id/X-Role (stand-in da sessão OIDC; login real = client no Keycloak realm nvit).

Verificar: `BASE_URL=http://nvit.localhost/neuroevolui/api node apps/neuroevolui/test/integration.mjs`
