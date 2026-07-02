---
title: "ContaViva Pro — Manual para Claude Code"
status: canonical
applies_to: [contaviva-pro]
updated: 2026-07-02
language: pt-BR
---

# ContaViva Pro — gerado pela Forge (gymops-style)

Fastify + Postgres + Redis/BullMQ + Auth própria (contas-acesso). Blocos: observabilidade, contas-acesso, migrations-versionadas, redis-bullmq, control-ai-por-app, design-system, ia-grafo, structured-outputs.

> Auth própria (bloco contas-acesso): POST /auth/register|login|refresh|logout, GET/PATCH /me, /v1/users/* (admin), /auth/sso/* (Keycloak ADITIVO/opcional via OIDC_ISSUER). Senha bcrypt; refresh hash sha256; JWT HS256 (JWT_SECRET — FAIL-CLOSED em produção). Registro público SEMPRE cria member; o admin vem só do seed de bootstrap (BOOTSTRAP_ADMIN_EMAIL/PASSWORD obrigatórios — sem senha default). Troca de senha exige currentPassword e revoga sessões; desativar/rebaixar usuário revoga as sessões dele; gerência escopada ao tenant do admin. Rotas de auth com rate-limit. SSO exige email_verified.

Verificar: `BASE_URL=http://nvit.localhost/contaviva-pro/api node apps/contaviva-pro/test/integration.mjs`

> ✅ **CONVERTIDO ao contrato v2 (Forja 4.0 — convergência, 2026-07):** o chart
> `templates/app-template` adotou a convenção viva (selector
> `{app.kubernetes.io/name: contaviva-pro-<svc>}`, PVC `contaviva-pro-postgres` sem sufixo,
> Middleware `contaviva-pro-api-strip`, IngressRoutes `contaviva-pro` + `contaviva-pro-frontend`)
> e o diff-gate passou (nenhum immutable/rename/replace). Fonte declarativa: `devops.yaml` v2;
> `k8s/contaviva-pro.yaml` é COMPILADO (`node specs/tools/devops-compile.mjs
> apps/contaviva-pro/devops.yaml` — não edite à mão); `k8s/contaviva-pro-observability.yaml` é
> suplemento (gap do chart, §11.5). Checklist da conversão: `docs/new-project-contract.md` §11.5.
