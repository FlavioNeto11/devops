# GymOps — Runbook de Operações

> **Status 2026-05-19**: stack local validado em Docker com `docker-compose.yml`, web em `http://localhost:7480/gymops/login`, API em `http://localhost:3001/health`, login demo funcional e navegação principal verificada. A validação externa do IP `38.211.146.161` continua manual por depender de firewall/NAT/rede. Antes de qualquer release pública executar [`docs/qa-release-checklist.md`](qa-release-checklist.md).

## Topologia de deploy

| Variante | Web | API | Porta externa | Acesso |
|---|---|---|---|---|
| **Local dev** | Next dev server | Fastify direto | 3000 (web) + 3001 (api) | `http://localhost:3000` |
| **Local Docker** | Container Next.js com `basePath=/gymops` | Fastify exposto diretamente | 7480 (web) + 3001 (api) | `http://localhost:7480/gymops/login` |
| **Público esperado** | Mesmo container web, acessado pelo IP publico | Fastify exposto diretamente | 7480 (web) + 3001 (api) | `http://<HOST>:7480/gymops/login` |

## Docker local e público

### Endereços oficiais

- Local Docker: `http://localhost:7480/gymops/login`
- Público: `http://<HOST_PUBLICO>:7480/gymops/login` (ajustar IP/DNS)
- API local: `http://localhost:3001/health`
- API pública: `http://<HOST_PUBLICO>:3001/health`

### Subida local

```bash
docker compose up -d postgres redis
docker compose run --rm api pnpm --filter @gymops/db migrate:deploy
docker compose run --rm api pnpm --filter @gymops/db seed
docker compose up -d api worker web
```

Se a suíte `pnpm --filter @gymops/api test` for executada contra o mesmo Postgres exposto em `localhost:5432`, o seed demo é sobrescrito pelos dados de teste. Rode o seed novamente antes de validar login e navegação.

### Subida pública

Atualize `.env.docker` com:

```env
FRONTEND_URL=http://38.211.146.161:7480/gymops
NEXT_PUBLIC_API_URL=http://38.211.146.161:3001
NEXT_PUBLIC_APP_BASE_PATH=/gymops
```

Depois faça rebuild do web:

```bash
docker compose --env-file .env.docker build web
docker compose up -d web api worker
```

O frontend também normaliza automaticamente o host da API no browser quando um build antigo ainda estiver com `http://localhost:3001` embutido e a aplicacao for aberta por outro hostname ou IP.

### Portas

| Serviço | Porta externa | Porta interna |
|---|---|---|
| web | 7480 | 3000 |
| api | 3001 | 3001 |
| postgres | 5432 | 5432 |
| redis | 6379 | 6379 |

### Firewall

Windows:

```powershell
netsh advfirewall firewall add rule name="GymOps Web 7480" dir=in action=allow protocol=TCP localport=7480
netsh advfirewall firewall add rule name="GymOps API 3001" dir=in action=allow protocol=TCP localport=3001
```

Linux:

```bash
sudo ufw allow 7480/tcp
sudo ufw allow 3001/tcp
```

## Deploy em produção

### Ordem obrigatória

```bash
# 1. Migrations ANTES de subir a aplicação
pnpm --filter @gymops/db migrate:deploy

# 2. Subir processos (ex: Render)
#    Serviço api:    pnpm --filter @gymops/api start
#    Serviço worker: pnpm --filter @gymops/api start:worker
```

**Nunca** rodar seed em produção de cliente. Seed é para staging/demo apenas.

### Variáveis obrigatórias em produção

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=<64 chars random>
JWT_REFRESH_SECRET=<64 chars random>
ENCRYPTION_KEY=<64 chars hex>
FRONTEND_URL=https://app.gymops.com
```

### Serviços necessários

| Serviço | Provider sugerido | Variável |
|---|---|---|
| PostgreSQL 16 + pgvector | Neon | `DATABASE_URL` |
| Redis | Upstash | `REDIS_URL` |
| Object storage | Cloudflare R2 | `R2_*` |
| SMTP | Resend / Postmark | `SMTP_*` |
| WhatsApp | Twilio | `TWILIO_*` |
| Frontend | Vercel | — |
| API + Worker | Render (2 serviços) | — |

---

## Rollback

### Rollback de migration

```bash
# Identificar a migration que causou o problema
pnpm --filter @gymops/db exec prisma migrate status

# Marcar como rolled back (não desfaz dados — use com cautela)
pnpm --filter @gymops/db exec prisma migrate resolve --rolled-back <migration_name>

# Reverter código para a versão anterior via git e subir novamente
git revert HEAD
pnpm --filter @gymops/db migrate:deploy
```

### Rollback de deploy (Render)

No Render, use "Rollback" na aba "Deployments" para reverter para o build anterior sem downtime.

---

## Troubleshooting

### `/gymops/login` retorna 404

Rebuildar o web com `NEXT_PUBLIC_APP_BASE_PATH=/gymops` e subir novamente.

### Assets quebrados ou rota sem base path

Normalmente é build antigo do web. Rebuild obrigatório ao mudar `NEXT_PUBLIC_APP_BASE_PATH`.

### Browser apontando para `http://api:3001`

Esse hostname só existe dentro da rede Docker. No browser use `http://localhost:3001` localmente e `http://38.211.146.161:3001` no IP público.

Se a troca de `.env.docker` não refletir no bundle do web, use `docker compose --env-file .env.docker build web` antes do `up -d web`.

### CORS

Se os requests falharem por CORS, confira `FRONTEND_URL` no `.env.docker` e reinicie a API.

### Cookie/auth não persiste

Confirme `FRONTEND_URL`, `path=/` nos cookies da API e `secure=false` em HTTP local.

### Worker reiniciando

Cheque `docker compose logs worker --tail=150`. Se `REDIS_URL` estiver ausente, o worker precisa degradar com fallback inline.

### `.env.docker` ausente

Copie o example:

```bash
cp .env.docker.example .env.docker
```

### `ENCRYPTION_KEY` inválida

Precisa ter 64 caracteres hexadecimais.

### Migrations ausentes

```bash
docker compose run --rm api pnpm --filter @gymops/db migrate:deploy
```

### Seed ausente

```bash
docker compose run --rm api pnpm --filter @gymops/db seed
```

### Login demo falha depois de rodar os testes da API

Os testes usam o PostgreSQL exposto em `localhost:5432` e limpam as tabelas antes de cada suite. Recrie o dataset demo:

```bash
docker compose run --rm api pnpm --filter @gymops/db seed
```

### Redis down

**Sintoma**: workers não processam jobs; notificações não são enviadas.

**Diagnóstico**: verificar `REDIS_URL` no painel do Render/Upstash.

**Comportamento esperado**: a API continua funcional — workers têm fallback `setImmediate` e rodam inline. O delay-scan não deduplicará notificações sem Redis (usuários podem receber múltiplas notificações por atividade atrasada até o Redis ser restaurado).

### R2 inacessível

**Sintoma**: upload de anexos retorna erro; `uploadUrl` é `null`.

**Diagnóstico**: verificar variáveis `R2_*`. O endpoint retorna `{ uploadUrl: null }` graciosamente — nenhum dado é perdido, apenas uploads bloqueados.

### Worker sem jobs sendo processados

**Sintoma**: atividades recorrentes não geradas; resumos diários não enviados.

**Diagnóstico**: verificar se o processo `worker` está rodando (`pnpm start:worker`). Verificar logs do container `worker`. Verificar conexão Redis.

### API não sobe em produção

**Causa mais comum**: `ENCRYPTION_KEY` ausente ou com menos de 64 chars.

**Diagnóstico**: verificar logs de startup — `❌ Invalid environment variables` lista os campos inválidos.

---

## Smoke tests pós-deploy

Execute manualmente após cada deploy em staging/produção:

```bash
BASE=https://api.gymops.com

# 1. Health check
curl $BASE/health

# 2. Login
curl -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@skyfit.com","password":"gymops123"}'

# 3. Listar organizações (com token retornado acima)
curl $BASE/organizations -H "Authorization: Bearer <token>"

# 4. Dashboard KPIs
curl "$BASE/dashboard?organizationId=<org_id>" -H "Authorization: Bearer <token>"
```

---

## Arquitetura de processos

```
Processo api     → Fastify HTTP (múltiplas réplicas OK)
Processo worker  → 5 workers BullMQ (réplica única recomendada)
```

Os workers não devem rodar em múltiplas réplicas simultâneas — isso causaria jobs duplicados. Use apenas uma instância do processo `worker`.

---

## Índices e performance

Para volumes maiores que ~10k atividades por organização, aplicar índices adicionais:

```sql
CREATE INDEX CONCURRENTLY activities_due_at_idx ON activities(due_at) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY activities_assigned_idx ON activity_assignees(user_id, activity_id);
CREATE INDEX CONCURRENTLY activities_org_status_idx ON activities(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY activity_events_activity_id_created_at_idx ON activity_events(activity_id, created_at DESC);
CREATE INDEX CONCURRENTLY notification_deliveries_org_created_at_idx ON notification_deliveries(organization_id, created_at DESC);
```

OPS-007 (P2): empacotar como migration Prisma na Sprint 21+.

---

## Healthchecks e prontidão (readiness)

### Endpoints

| Serviço | Endpoint | Esperado |
|---|---|---|
| API | `GET /health` | `200 { "status": "ok", ... }` |
| Web local | `GET /` | `200` (página) |
| Web público | `GET /gymops/login` | `200` (página) |
| Gateway público | `GET /gymops/api/health` | `200` (proxied da API) |
| Postgres | `pg_isready -U gymops` | `accepting connections` |
| Redis | `redis-cli ping` | `PONG` |

### Verificação rápida

```bash
# Local Docker
docker ps --filter "name=gym-" --format "table {{.Names}}\t{{.Status}}"

# Público — depois de subir o compose público
curl -fsS http://localhost:7480/gymops/api/health || echo "API NOT READY"
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:7480/gymops/login
```

### Issue conhecida (BUG-009, Sprint 21)

No `docker-compose.public.yml`, `web` e `gateway` dependem apenas de `service_started`. O Docker Compose **não espera readiness** sem healthcheck dedicado + `condition: service_healthy`. Resultado: o gateway pode subir e proxyar antes da web estar pronta. Mitigação até o fix: aguardar 30s após `docker compose up -d` antes do primeiro acesso.

---

## Troubleshooting

| Sintoma | Causa provável | Resolução |
|---|---|---|
| `/gymops/login` retorna 502 (gateway) | Web ainda subindo | Aguardar healthcheck; ver logs `docker logs gym-web-1` |
| `/gymops/api/*` retorna 404 | Variável `FRONTEND_URL` ou `NEXT_PUBLIC_APP_BASE_PATH` errada | Confirmar `.env.docker` com `/gymops`; rebuild web |
| Login falha com 401 imediato em prod | Cookie `refresh_token` não cross-site (HTTPS atrás de proxy) | Conferir `secure`/`sameSite` em `auth/index.ts`; conferir `trust proxy` no Fastify |
| Trello redirect cai em URL errada | `FRONTEND_URL` com host errado | Ajustar `FRONTEND_URL` no `.env.docker` |
| WhatsApp não envia em sandbox | Número não joinado no Twilio sandbox | Ver [`docs/integrations-ops.md`](integrations-ops.md) |
| Bulk update retorna 422 | BUG-002 — falta `organizationId` no body | Workaround manual; fix na Sprint 18 |
| Usuário só com membership de área não consegue navegar | BUG-005 — login não resolve contexto por área | Criar membership temporária org-level; fix na Sprint 18 |

---

## Rollback

### Aplicação (API/Worker/Web)

Cada serviço é stateless. Rollback = reimplantar imagem anterior.

```bash
# Tag/imagem anterior
docker compose -f docker-compose.public.yml down
docker image tag gymops/web:previous gymops/web:latest
docker image tag gymops/api:previous gymops/api:latest
docker compose -f docker-compose.public.yml up -d
```

### Banco (Prisma)

- **Migrations** são `forward-only` por padrão. **Não fazer rollback automático** de migration aplicada.
- Para reverter mudança: criar migration nova que desfaça (compensatória).
- Se incidente crítico exigir: restaurar snapshot Postgres (ver provedor — Neon, RDS, etc.).
- Tabelas com soft delete (`deletedAt`) podem ter dados restaurados via `UPDATE`.

### Storage R2

R2 não tem versionamento por padrão. Para arquivos críticos (logos de organização, anexos), considerar bucket de backup com replicação.

---

## Smoke por perfil

Ver [`docs/qa-release-checklist.md`](qa-release-checklist.md) — execução manual por owner / org_manager / unit_manager / area_leader / executor / viewer.
