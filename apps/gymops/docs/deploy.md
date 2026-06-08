# GymOps — Guia de Deploy

**Última atualização**: 2026-05-17  
**Donos**: devops-gymops (líder), backend-fastify.  
**Referências**: [`docs/runbook.md`](runbook.md), [`docs/qa-release-checklist.md`](qa-release-checklist.md), [`docs/integrations-ops.md`](integrations-ops.md).

> Este documento foca **deploy operacional**. O runbook cobre operação contínua e troubleshooting. Antes de cada deploy público, executar o checklist em [`docs/qa-release-checklist.md`](qa-release-checklist.md).

---

## Variantes de deploy

| Variante | Web base path | API base | Quando usar |
|---|---|---|---|
| **Dev local** (`pnpm dev`) | `/` | `http://localhost:3001` | Desenvolvimento |
| **Local Docker** (`docker-compose.yml`) | `/` | `http://localhost:3001` | Testar produção localmente |
| **Público `/gymops`** (`docker-compose.public.yml` + gateway Nginx) | `/gymops` | `/gymops/api` (atrás do Nginx) | Produção/staging |

---

## 1. Dev local (Pnpm direto)

```bash
# Setup inicial
pnpm install
docker compose up -d postgres redis
pnpm --filter @gymops/db migrate:deploy
pnpm --filter @gymops/db seed

# Subir API e Web em terminais separados
pnpm --filter @gymops/api dev          # http://localhost:3001
pnpm --filter @gymops/web dev          # http://localhost:3000
```

**Variáveis necessárias** em `apps/api/.env` e `apps/web/.env.local`:

```env
# apps/api/.env
DATABASE_URL=postgresql://gymops:gymops_dev@localhost:5432/gymops
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-key-minimum-32-characters!!
JWT_REFRESH_SECRET=dev-refresh-secret-minimum-32chars!!
FRONTEND_URL=http://localhost:3000

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## 2. Local Docker

```bash
cp .env.docker.example .env.docker
# Editar: senhas, secrets, integrações

docker compose build
docker compose up -d
# Aguardar containers (postgres + redis) ficarem healthy

docker compose exec api pnpm --filter @gymops/db migrate:deploy
docker compose exec api pnpm --filter @gymops/db seed  # apenas demo

# Acessar: http://localhost:3000 (web direto) ou http://localhost:7480/gymops (via gateway)
```

---

## 3. Deploy público `/gymops`

### Pré-requisitos

- Host com Docker + Docker Compose v2
- 2 vCPU, 4 GB RAM mínimos
- Porta 7480 aberta no firewall (frontend público)
- Domínio/IP configurado (`<HOST_PUBLICO>`)

### Variáveis de ambiente (`.env.docker`)

```env
# Banco
POSTGRES_USER=gymops
POSTGRES_PASSWORD=<senha forte>
POSTGRES_DB=gymops
DATABASE_URL=postgresql://gymops:<senha>@postgres:5432/gymops

# Redis (interno, não exposto)
REDIS_URL=redis://redis:6379

# Auth
JWT_SECRET=<gerado: openssl rand -hex 32>
JWT_REFRESH_SECRET=<gerado: openssl rand -hex 32>
ENCRYPTION_KEY=<gerado: openssl rand -hex 32>

# URLs
FRONTEND_URL=http://<HOST_PUBLICO>:7480/gymops
NEXT_PUBLIC_API_URL=/gymops/api
NEXT_PUBLIC_APP_BASE_PATH=/gymops

# CORS (BUG-010 — quando entregue)
ALLOWED_ORIGINS=http://<HOST_PUBLICO>:7480

# Integrações (preencher os que vai usar)
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=GymOps <no-reply@gymops.com>
TRELLO_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@<dominio>
OPENAI_API_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```

### Subida

```bash
docker compose -f docker-compose.public.yml up -d --build
docker compose -f docker-compose.public.yml exec api pnpm --filter @gymops/db migrate:deploy

# NÃO rodar seed em produção real (apenas em demo/staging)
```

### Validação pós-deploy

```bash
# Containers healthy?
docker compose -f docker-compose.public.yml ps

# API responde?
curl -fsS http://<HOST_PUBLICO>:7480/gymops/api/health

# Web responde?
curl -fsS -o /dev/null -w "%{http_code}\n" http://<HOST_PUBLICO>:7480/gymops/login
```

---

## 4. CI/CD path-aware (Sprint 21, OPS-002)

### Estado atual
`.github/workflows/ci.yml` compila web apenas com `NEXT_PUBLIC_API_URL` (sem `NEXT_PUBLIC_APP_BASE_PATH`). Deploy público pode ter regressão silenciosa.

### Estado alvo

Adicionar job `build-gymops` em `.github/workflows/ci.yml`:

```yaml
build-gymops:
  name: Build web (/gymops path-aware)
  runs-on: ubuntu-latest
  needs: validate
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
      with: { version: 9 }
    - uses: actions/setup-node@v4
      with: { node-version: 20, cache: pnpm }
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @gymops/db generate
    - run: pnpm --filter @gymops/web build
      env:
        NEXT_PUBLIC_API_URL: /gymops/api
        NEXT_PUBLIC_APP_BASE_PATH: /gymops
    - name: Verificar basePath no manifest
      run: |
        if ! grep -q '"/gymops/' apps/web/.next/build-manifest.json; then
          echo "ERRO: basePath /gymops não foi aplicado no build"; exit 1
        fi
```

E em `.github/workflows/e2e.yml`:

```yaml
on:
  push:
    branches: [main]
  pull_request:        # <— adicionar
    branches: [main]
  workflow_dispatch:
```

---

## 5. Healthchecks e readiness (BUG-009, Sprint 21)

### Problema atual

`docker-compose.public.yml` define healthcheck apenas em `postgres` e `redis`. `web` e `gateway` usam `depends_on: { ... : service_started }`. Docker Compose **não espera readiness** sem healthcheck dedicado + `service_healthy`.

### Estado alvo

```yaml
web:
  # ... existente ...
  healthcheck:
    test: ['CMD', 'wget', '-q', '--spider', 'http://localhost:3000/gymops']
    interval: 10s
    timeout: 5s
    retries: 12
    start_period: 30s

gateway:
  # ... existente ...
  healthcheck:
    test: ['CMD', 'wget', '-q', '--spider', 'http://localhost:80/gymops/login']
    interval: 10s
    timeout: 5s
    retries: 12
    start_period: 20s
  depends_on:
    web:
      condition: service_healthy    # <— era service_started
    api:
      condition: service_healthy
```

> Se `wget` não estiver no container `web` (Alpine base sem wget), usar `curl` ou adicionar `RUN apk add --no-cache wget` no Dockerfile.

---

## 6. CORS (BUG-010, Sprint 21)

### Problema atual

`apps/api/src/app.ts` tem allowlist hardcoded:

```ts
origin: [env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:7480', 'http://38.211.146.161:7480']
```

### Estado alvo

```ts
// apps/api/src/env.ts
ALLOWED_ORIGINS: z.string().optional()  // CSV

// apps/api/src/app.ts
const allowedOrigins = (env.ALLOWED_ORIGINS ?? env.FRONTEND_URL)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

await app.register(fastifyCors, {
  origin: allowedOrigins,
  credentials: true,
  // ...
});
```

E em `.env.docker`:

```env
ALLOWED_ORIGINS=http://<HOST_PUBLICO>:7480,http://localhost:7480
```

---

## 7. Rollback

Ver [`docs/runbook.md`](runbook.md#rollback).

---

## 8. Migration de dados em produção

- **Sempre executar migration antes de subir a nova versão da API**.
- Para mudanças destrutivas (drop column, alter type): planejar em 2 releases (release 1 = código tolera novo + velho; release 2 = migration que remove).
- Para mudanças que invalidam sessões (BUG-008, hash de refresh token): comunicar maintenance window; forçar todos os usuários a refazer login.

---

## 9. Checklist de deploy público (resumido)

- [ ] `.env.docker` configurado
- [ ] `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` únicos (gerados com `openssl rand -hex 32`)
- [ ] `FRONTEND_URL` correto
- [ ] `ALLOWED_ORIGINS` configurado
- [ ] `docker compose -f docker-compose.public.yml up -d --build` executado
- [ ] Migrations aplicadas
- [ ] **Não** rodar `seed` em produção real
- [ ] Smoke tests em `/gymops/api/health` e `/gymops/login` passam
- [ ] Healthchecks dos containers em `(healthy)`
- [ ] Checklist completo de [`docs/qa-release-checklist.md`](qa-release-checklist.md) verde
