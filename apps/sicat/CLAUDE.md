---
title: "SICAT — Manual para Claude Code"
status: canonical
applies_to: [sicat]
updated: 2026-06-09
language: pt-BR
---

# SICAT — Manual para Claude Code

> **Comece por aqui.** As fronteiras de operação e a matriz de decisão vivem no
> [`AGENTS.md`](./AGENTS.md) — leia antes de agir. Este arquivo traz o contexto específico do Claude
> (stack, armadilhas, env vars, fluxo de trabalho).
>
> Contexto da plataforma: [`../../CLAUDE.md`](../../CLAUDE.md) e [`../../AGENTS.md`](../../AGENTS.md).
> Máquina: [`~/.claude/CLAUDE.md`](C:\Users\Administrator\.claude\CLAUDE.md). Detalhe de backend:
> [`backend/AGENTS.md`](./backend/AGENTS.md). **Não repita** esses conteúdos — aponte.

## O que é SICAT

Plataforma operacional de automação **MTR/CDF/DMR da CETESB-SP**. Monorepo `npm workspaces` com
**`backend`** (API Express + worker de fila, Node 20 + TypeScript via `tsx`, gateway CETESB em modo
`real`) e **`frontend`** (SPA Vue 3 + Vuetify, design system `Sicat*`). A `api` e o `worker` são a
**mesma imagem/código** — só muda o comando (`npm start` × `npm run worker`). Tem camada de IA
(LangChain/LangGraph/OpenAI, AI Control Center) e observabilidade opcional via Langfuse.

Na plataforma: `basePath: /sicat`, namespace `apps`, hosts `dev.nvit.com.br` (público) e
`xpto.localhost` (dev). Frontend em `/sicat` (sem strip, base `/sicat/`); API em `/sicat/api`
(strip — o processo vê `/health`, `/v1/*` na raiz). Contrato: [`devops.yaml`](./devops.yaml).

## Ordem de leitura

1. Este arquivo.
2. [`AGENTS.md`](./AGENTS.md) — fronteiras + matriz de decisão (obrigatório antes de agir).
3. [`README.md`](./README.md) — setup, endpoints, fluxos CETESB reais.
4. [`ONBOARDING-DEVOPS.md`](./ONBOARDING-DEVOPS.md) — esteira (serviços, roteamento, secrets, deploy).
5. [`backend/AGENTS.md`](./backend/AGENTS.md) — camadas, contrato OpenAPI, persistência/fila, gateway.
6. [`docs/10-estado-atual/estado-atual.md`](./docs/10-estado-atual/estado-atual.md) — estado real.

## Stack & decisões de arquitetura

| Aspecto | Decisão | Por quê |
|---|---|---|
| Frontend | Vue 3 + Vuetify (Vite → nginx) | SPA de operação; design system `Sicat*` (DL-100) |
| Backend | Node.js 20 + Express, TypeScript `type: module`, runtime `tsx` | sem passo de transpile em dev; `tsc` (`tsconfig.build.json`) só para `dist/` em prod (DL-093) |
| Gateway CETESB | `src/gateways/cetesb-gateway.js` — **mantido em JS** | única exceção JS em `src/`, via ESM interop — decisão DL-093 (não converter) |
| Banco / fila | Postgres 16; fila transacional na tabela `jobs` (`FOR UPDATE SKIP LOCKED`) | fonte transacional única; **sem broker externo** (sem Kafka/Redis na fila) — DL-022 |
| Worker | mesma imagem do backend, `npm run worker` | operações async (`manifest.submit/print/cancel/receive`, `cdf.*`, `catalog.sync`, `cadastro.submit`) |
| Contrato HTTP | contract-first: `openapi/mtr_automacao_openapi_interna.yaml` → `src/generated/operations.ts` | superfície tipada e auditável |
| Auth | sessão própria do app sobre login CETESB real (JWT); frontend com guards | login real obrigatório (`CETESB_GATEWAY_MODE=real`) |
| IA | LangChain/LangGraph + OpenAI; AI Control Center; Langfuse opcional | chaves só no backend, nunca no frontend |
| Deploy | Kubernetes (esteira da plataforma) | padrão; Argo CD via `k8s/kustomization.yaml` |

## Armadilhas conhecidas

1. **CETESB direto fora do gateway** → quebra a fronteira de camadas. Toda HTTP CETESB passa por
   `src/gateways/cetesb-gateway.js`; nunca chamar de `routes/`/`services/`/`workers/`. A **verdade da
   API real da CETESB** (endpoints/payloads/auth capturados) vive em
   [`../../docs/portal-contracts/cetesb/`](../../docs/portal-contracts/cetesb/) (não no OpenAPI
   **interno** do SICAT). Para alinhar o gateway aos padrões da CETESB, leia o `drift-report.md` da
   versão `LATEST`; ao mudar endpoints do gateway, atualize o mapa
   `backend/docs/portal-contracts/sicat-cetesb-endpoint-map.jsonl` (o gate `portal-contracts` valida
   os `anchors` contra o gateway).
2. **Converter o gateway para `.ts`** → proibido (DL-093). Ele fica em JS intencionalmente.
3. **Modo `real` é o padrão** (`CETESB_GATEWAY_MODE=real`). Qualquer teste/smoke `*-real-*` ou
   `catalog-sync` atinge a CETESB de verdade e exige credenciais + `NODE_EXTRA_CA_CERTS` apontando
   para `certs/cetesb-chain.pem` — fronteira **com aprovação**.
4. **Subpath `/sicat/api` é stripado**: o processo enxerga rotas na raiz (`/health`, `/v1/*`). O
   frontend chama `/sicat/api/v1/...`. Frontend buildado com `--base=/sicat/`.
5. **`recaptchaToken` é opcional** — a CETESB aceita string vazia (`""`) via API backend; não
   automatizamos recaptcha.
6. **Mudança de superfície HTTP em lockstep**: OpenAPI → `examples/` → `src/generated/operations.ts`
   → `routes/` → testes de contrato, tudo no mesmo PR (`npm run validate:openapi` + `gen:operations`).
7. **Segredo real no histórico legado** (GCP API Key vazada no repo `FlavioNeto11/sicat`,
   importado via `git subtree --squash`): pendência de rotação — ver
   [`ONBOARDING-DEVOPS.md`](./ONBOARDING-DEVOPS.md) §7. Nunca reintroduzir segredo em git.
8. **UI sempre via design system**: `SicatPageLayout`/`SicatDataTable`/`SicatStatusBadge`
   (status via `lib/status-map.js`); feedback por `useNotification` (nunca `v-snackbar` inline).

## Variáveis de ambiente chave

> Defaults observados em [`devops.yaml`](./devops.yaml) e [`docker-compose.yml`](./docker-compose.yml).
> Segredos (`OPENAI_*`, `CETESB_*` credenciais, `LANGFUSE_*` keys, `DATABASE_URL`) vêm de `.env`
> da máquina → `Secret` `sicat-config`/`sicat-db` no cluster (nunca em git).

```bash
# Frontend (build-time)
VITE_API_BASE_URL=/sicat/api      # casar com basePath; em dev local: http://localhost:8080

# Backend — servidor
PORT=8080
DATABASE_URL=postgres://...@sicat-postgres:5432/mtr_automation   # secret sicat-db
DATABASE_SSL=false
STORAGE_DIR=/data/storage         # PVC compartilhado api↔worker (docs MTR/CDF gerados)
AUTO_MIGRATE=true                 # migrations no boot (idempotente, advisory-lock)
AUTO_SEED=true                    # seed no boot
NODE_EXTRA_CA_CERTS=/opt/certs/cetesb-chain.pem   # CA CETESB (ConfigMap sicat-certs)

# Backend — CETESB (modo real é o padrão)
CETESB_GATEWAY_MODE=real
CETESB_TOKEN_HEADER_MODE=both
CETESB_BASE_URL=https://mtrr.cetesb.sp.gov.br      # default do compose

# IA / observabilidade (chaves só no backend)
OPENAI_API_KEY=<secret>           # IA falha apenas em uso (lazy)
AI_CONTROL_ENABLED=true
LANGFUSE_ENABLED=false            # opcional; self-hosted no compose
```

## Como trabalhar aqui

- **Setup local:** `cp .env.example .env` → `docker compose up -d postgres` →
  (em `backend/`) `npm install` → `npm run migrate` → `npm run dev` + `npm run worker`; frontend:
  `npm run dev:frontend` (raiz). Stack inteiro: `docker compose up --build`.
- **Adicionar feature:** ler [`AGENTS.md`](./AGENTS.md) + [`backend/AGENTS.md`](./backend/AGENTS.md)
  → seguir [`../../docs/standards/golden-path.md`](../../docs/standards/golden-path.md) → manter o
  contract-first → validar (`AGENTS.md` §6) → PR com testes.
- **Debugar:** [`../../TROUBLESHOOTING.md`](../../TROUBLESHOOTING.md) (incl. §14 MIME do frontend
  sob subpath) → `kubectl logs -n apps deploy/sicat-api` / `deploy/sicat-worker`; saúde via
  `GET /sicat/api/health` e endpoints `/v1/health/*`.
- **Publicar/reverter:** `scripts/publish-app.ps1 -App sicat` (com aprovação) /
  [`../../docs/runbooks/rollback.md`](../../docs/runbooks/rollback.md). GitOps via
  [`../../platform/argocd/apps/sicat.yaml`](../../platform/argocd/apps/sicat.yaml).

## Regras inegociáveis

Ver [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md) (labels,
roteamento, segredos, GitOps, imagens) + as específicas de SICAT no [`AGENTS.md`](./AGENTS.md) §8:
fronteira de camadas (`route → service → repository → job → worker → gateway`), CETESB só pelo
gateway, contract-first, Postgres como fila/fonte transacional única e segredo nunca em git.
