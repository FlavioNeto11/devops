# AI Control Center — 10 · Infra de teste (Docker + Admin + Langfuse)

> Atualização do stack Docker para disponibilizar o AI Control Center para testes,
> com admin global, Langfuse self-hosted e OpenAI configurado.

## Stack (docker-compose.yml)

| Serviço | Imagem | Porta host | Papel |
|---|---|---|---|
| `postgres` | postgres:16 | 5432 | DB do SICAT (fonte de verdade) |
| `api` | build `.` (tsx, bind-mount) | 8080 | API + AI Control + SSE |
| `worker` | build `.` | — | jobs assíncronos |
| `frontend` | build `frontend` (Vite) | 5173 | UI (tela `/sistema/ai-control`) |
| **`langfuse`** | **langfuse/langfuse:2** | **3000** | observabilidade externa (UI + API pública) |
| **`langfuse-db`** | postgres:16 | — | DB do Langfuse |

Sem rebuild de imagem para o código novo: `api`/`worker` fazem bind-mount de `./:/app` e rodam via `tsx`; nenhuma dependência npm nova foi adicionada (o adapter Langfuse usa `fetch` global).

## Variáveis (host `.env`, carregado por dotenv + interpolado pelo compose)

- OpenAI: `OPENAI_API_KEY` (já existia), `OPENAI_AGENT_MODEL=gpt-4.1`, `OPENAI_SYNTHESIS_MODEL=gpt-4.1`, **`OPENAI_ESCALATION_MODEL=gpt-4.1`** e **`OPENAI_JUDGE_MODEL=gpt-4o-mini`** adicionados (evitam os defaults `gpt-5.x` proibidos).
- Langfuse: `LANGFUSE_ENABLED=true`, `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`/`LANGFUSE_PROJECT_ID=sicat-mtr`, `LANGFUSE_PUBLIC_BASE_URL=http://localhost:3000`. O `.env` define `LANGFUSE_BASE_URL=http://localhost:3000` (dev no host); **no container o compose força `LANGFUSE_BASE_URL=http://langfuse:3000`** (DNS interno).
- O serviço `langfuse` recebe `LANGFUSE_INIT_*` (headless): cria org/projeto/usuário e **reusa as mesmas chaves** do `.env`, então a auth Basic do SICAT casa sem passo manual.

Separação browser × backend: o backend chama `http://langfuse:3000` (interno); deep links e status usam `LANGFUSE_PUBLIC_BASE_URL` (`http://localhost:3000`). Implementado via `LangfuseConfig.publicBaseUrl`.

## Write-path Langfuse (traces fluem de verdade)

`ai-control-observability-service.ts` agora, além do SSE + persistência local, faz **push de ingestão** ao Langfuse (`LangfuseClient.ingest` → `POST /api/public/ingestion`) por evento operacional: `trace-create` (id = conversationTurnId) + `observation-create` (EVENT). Fire-and-forget, sanitizado, só quando `isLangfuseReady()` — nunca bloqueia o turn.

## Admin global

Script `scripts/admin/create-ai-admin.ts` (usa o código real: scrypt `hashPassword`, repos, IDs). Cria/atualiza usuário + garante role `admin.global` + concede vínculo (`access_user_roles`), idempotente.

```bash
docker compose exec -T api npx tsx scripts/admin/create-ai-admin.ts [email] [senha] [nome]
```

**Credenciais default (teste):** `admin@sicat.local` / `Admin@Sicat2026` (também é o login do Langfuse UI). Login: `POST /v1/sicat/auth/login` → `accessToken` + `user.adminAccess.allowed=true (source:"database")`.

## Como subir / acessar

```bash
docker compose up -d            # sobe tudo (migração 017 auto-aplica no boot da api)
docker compose exec -T api npx tsx scripts/admin/create-ai-admin.ts   # cria o admin
```
- SICAT: http://localhost:5173 → login admin → **Sistema → AI Control Center**.
- Langfuse UI: http://localhost:3000 (mesmo login).
- API AI Control: `http://localhost:8080/v1/ai-control/*` (Bearer admin).

## Verificado nesta entrega

| Check | Resultado |
|---|---|
| `docker compose config -q` | ✅ válido |
| Containers (6) | ✅ Up |
| Migração `017` + 11 tabelas + 3 views | ✅ |
| Admin login | ✅ `adminAccess.allowed=true (database)` |
| OpenAI | ✅ `providerConfigured=true`, modelos autorizados |
| Tools | ✅ 20/20 |
| Langfuse status | ✅ `ready` (auth Basic OK contra o self-hosted) |
| Turn → trace local | ✅ `count=1` em `ai_trace_events` |
| Turn → trace Langfuse | ✅ `provider=langfuse, count=1` (push + pull) |

## Reset

```bash
docker compose down                 # mantém volumes (dados)
docker compose down -v              # zera DB SICAT + Langfuse (perde admin/traces)
```
