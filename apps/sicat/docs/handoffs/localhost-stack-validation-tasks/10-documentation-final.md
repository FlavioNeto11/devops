# 10 - Documentation Final

## work_id: localhost-stack-validation-tasks

**Data:** 2026-04-22
**Status final da cadeia:** `blocked_with_evidence`

---

## Resumo executivo

A stack local foi levantada com sucesso. Postgres, API e worker estão operacionais.
O frontend responde por HTTP e gerou artefatos visuais positivos, mas há um bloqueio
localizado em 4 testes de `tests/ui/audit.spec.ts`. A stack NÃO está inoperante;
o bloqueio é restrito à suite de auditoria visual Playwright.

---

## O que foi ajustado nesta cadeia

### `.vscode/tasks.json`
- Criada task `localhost: up` como ponto de entrada único e confiável para subir a stack local.
  - Sequência: `stack: prepare quick` → `stack: restart (real-dev + frontend)`.
- Mantidas as tasks `real` e `real-dev` para cenários distintos.
- Removidas referências quebradas a tasks mock inexistentes.

### `.vscode/launch.json`
- `Run Stack (localhost)` e `Run Stack (real + frontend)` passaram a depender de `localhost: up`.
- `Open API Docs (8080)` corrigido para não apontar task mock inexistente.
- Configurações de debug alinhadas ao runtime TypeScript atual (`tsx` + `.ts`).

### `scripts/restart-stack-vscode.ps1`
- Ajustado para encerrar processos atuais da API e do worker em TypeScript antes de reiniciar.
- Eliminado o risco de restart parcial que deixava instâncias antigas em plano de fundo.

---

## Task recomendada para subir o ambiente

```
localhost: up
```

**Sequência interna:**
1. `stack: prepare quick` — valida OpenAPI + migra Postgres
2. `stack: restart (real-dev + frontend)` — encerra processos ativos, inicia API (`npm run dev`), worker (`npm run worker`) e frontend Vite (`--port 5174`)

**Portas esperadas após execução:**

| Componente | URL |
|------------|-----|
| Postgres   | `localhost:5432` |
| API        | `http://127.0.0.1:8080` |
| API Docs   | `http://127.0.0.1:8080/docs` |
| OpenAPI    | `http://127.0.0.1:8080/openapi.yaml` |
| Frontend   | `http://127.0.0.1:5174` |

---

## Evidências consolidadas por componente

### Postgres — PASS
- Container `mtr_postgres` em estado `Up`, bind `0.0.0.0:5432->5432/tcp`
- Porta `5432` em escuta local
- `docker exec mtr_postgres pg_isready -U postgres` → `/var/run/postgresql:5432 - accepting connections`

### API — PASS
- Processo `tsx watch src/server.ts` ativo
- `GET /v1/ping → 200`
- `GET /v1/health/system → 200` (`status: healthy`, `environment: development`)
- `GET /docs → 200`
- `GET /openapi.yaml → 200`
- `npm run smoke:health` → **7/7 testes passaram**
- `npm run smoke:openapi` → `ok: true`
- `npm run validate:openapi` → `[ok] OpenAPI validado com sucesso`

### Worker — PASS
- Processo `src/worker.ts` ativo
- `GET /v1/health/workers → 200`
  - `healthy: 19`, `degraded: 0`, `unhealthy: 0`, `active_last_5m: 1`
- Smoke confirmou: `/v1/health/workers`, `/v1/health/jobs/active`, `/v1/health/jobs/dlq`, `/v1/health/metrics/performance` → todos `200`

### Frontend — FAIL (bloqueio localizado)
- Processo Vite ativo em `http://127.0.0.1:5174`
- `GET / → 200`, `GET /login → 200`
- Screenshot positivo gerado: `frontend/test-results/qa-login-desktop.png`
- Artefatos visuais positivos disponíveis:
  - `frontend/test-results/02-dark-login-desktop-1920x1080.png`
  - `frontend/test-results/03-light-dashboard-desktop-1920x1080.png`
  - `frontend/test-results/07-mobile-login-375x667.png`
  - `frontend/test-results/10-font-rendering.png`
- **Suite `tests/ui/audit.spec.ts`: 6 passed / 4 failed**

---

## Falhas Playwright em `tests/ui/audit.spec.ts`

| # | Teste | Falha observada |
|---|-------|-----------------|
| 1 | `01-Light Mode - Login Page` | `expect(locator('body')).toBeVisible()` falhou — body reportado como `hidden` |
| 2 | `04-Navbar Visibility & Structure` | `Found 0 nav/header elements` |
| 3 | `08-No Console Errors on Load` | Erro de console: `500 Internal Server Error` |
| 4 | `09-Vuetify Components Render` | `Found 0 Vuetify components` |

Artefatos de falha reproduzidos em `frontend/test-results/`:
- `audit-Frontend-Vuexy-Audit-9da7b--01-Light-Mode---Login-Page/` (screenshot + trace + video)
- `audit-Frontend-Vuexy-Audit-80949-Navbar-Visibility-Structure/` (screenshot + trace)
- `audit-Frontend-Vuexy-Audit-77027-8-No-Console-Errors-on-Load/` (screenshot + trace)
- `audit-Frontend-Vuexy-Audit-31599-9-Vuetify-Components-Render/` (screenshot + trace)

---

## Comandos executados nesta cadeia

```bash
# Infra
docker compose up -d postgres
npm run migrate
npm run validate:openapi

# Stack
pwsh -ExecutionPolicy Bypass -File scripts/restart-stack-vscode.ps1
npm run dev            # API
npm run worker         # Worker
cd frontend && npm run dev -- --host 127.0.0.1 --port 5174   # Frontend

# Validação
npm run smoke:health
npm run smoke:openapi
npm run validate:openapi
docker exec mtr_postgres pg_isready -U postgres
Invoke-WebRequest http://127.0.0.1:8080/v1/ping
Invoke-RestMethod http://127.0.0.1:8080/v1/health/workers
cd frontend && npm run test:ui -- tests/ui/audit.spec.ts
```

---

## Riscos remanescentes

| Risco | Severidade | Owner natural |
|-------|-----------|---------------|
| 4 falhas em `tests/ui/audit.spec.ts` (body hidden, navbar ausente, console error 500, Vuetify não renderizando) | Alta | `frontend-vue-mtr` |
| `jobs_dlq_total: 1` registrado no health — histórico de falha na DLQ | Baixa | backend / operação |
| Worker com `total: 35` e `stopped: 16` no histórico — acumulado operacional confunde leitura do dashboard | Baixa | documentação / ops |
| Docker Desktop requer ativação manual no Windows antes da primeira execução da stack | Pontual | infraestrutura local |
| WebKit não instalado no ambiente local — screenshot CLI mobile não disponível via Playwright CLI | Baixo impacto | DevExp |

---

## Pass/fail final por componente

| Componente | Status |
|------------|--------|
| Postgres   | ✓ PASS |
| API        | ✓ PASS |
| Worker     | ✓ PASS |
| Frontend   | ✗ FAIL (bloqueio localizado — suite audit) |

**Stack operacional:** SIM
**Bloqueio restante:** Regressão visual/funcional em `tests/ui/audit.spec.ts` (4/10)

---

## Próximos passos reais

1. **Frontend** (`frontend-vue-mtr`): investigar as 4 falhas do audit Playwright — verificar por que `body` fica `hidden`, por que navbar e Vuetify não são detectados e qual endpoint retorna 500 na carga inicial.
2. **DLQ**: verificar e limpar o job pendente na DLQ se não houver dados relevantes para análise.
3. **Worker histórico**: avaliar se os `stopped: 16` devem ser purgados ou documentados como normal decay operacional.

---

## Checkpoints desta cadeia

- [00-orchestration.md](./00-orchestration.md) — plano e classificação
- [01-localhost-availability.md](./01-localhost-availability.md) — subida da stack + ajustes VS Code
- [09-qa-validation.md](./09-qa-validation.md) — validação operacional com evidências
- [10-documentation-final.md](./10-documentation-final.md) — este documento
