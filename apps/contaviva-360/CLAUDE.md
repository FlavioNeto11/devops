---
title: "ContaViva 360 — Manual para Claude Code"
status: canonical
applies_to: [contaviva-360]
updated: 2026-06-25
language: pt-BR
---

# ContaViva 360 — gerado pela Forge (gymops-style)

Fastify + Postgres + Redis/BullMQ + RBAC multi-tenant. Blocos: observabilidade, camadas-rigidas, oidc-sessao, rbac-multitenant, migrations-versionadas, redis-bullmq, idempotencia, notificacoes-multicanal, ia-grafo, control-ai-por-app, rag-pgvector, structured-outputs, design-system.

> RBAC por header X-Tenant-Id/X-Role (stand-in da sessão OIDC; login real = client no Keycloak realm nvit).

Verificar: `BASE_URL=http://nvit.localhost/contaviva-360/api node apps/contaviva-360/test/integration.mjs`
