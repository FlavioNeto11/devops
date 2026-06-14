---
title: "SICAT — Contrato de Agentes"
status: canonical
applies_to: [sicat]
updated: 2026-06-09
language: pt-BR
---

# SICAT — Contrato de Agentes

> **Fonte única, tool-agnóstica.** Qualquer agente (Claude Code, GitHub Copilot, futuros) lê este
> arquivo primeiro ao trabalhar em `apps/sicat`. O [`CLAUDE.md`](./CLAUDE.md) é a camada específica
> do Claude e aponta para cá; a camada de execução do Copilot vive em `.github/` (não duplica
> fronteiras). Padrão de meta-doc: [`../../docs/standards/meta-doc-standard.md`](../../docs/standards/meta-doc-standard.md).
>
> Contrato da plataforma: [`../../AGENTS.md`](../../AGENTS.md). Regras HARD de infra:
> [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md). Em conflito,
> a regra do escopo mais específico prevalece se marcada explicitamente.

> **Nota de escopo:** este é o `AGENTS.md` **app-wide** (monorepo `backend` + `frontend`). Para
> detalhe profundo do backend (camadas `route → service → repository → job → worker → gateway`,
> DL-022/DL-093, contrato OpenAPI), o canônico continua sendo
> [`backend/AGENTS.md`](./backend/AGENTS.md) — aponte para lá em vez de duplicar.

## 1. Visão geral

SICAT é uma plataforma operacional de automação **MTR/CDF/DMR da CETESB-SP**. O monorepo
(`npm workspaces`) tem dois workspaces: **`backend`** (Node.js 20 + Express + Postgres + worker
de fila transacional, TypeScript via `tsx`, gateway CETESB em `real`) e **`frontend`** (SPA Vue 3
+ Vuetify, design system `Sicat*`). API e worker são a **mesma imagem** (`npm start` × `npm run
worker`). Inclui camada de IA (LangChain/LangGraph/OpenAI, AI Control Center) e observabilidade
opcional via Langfuse. Idioma de produto: pt-BR. Estado real: ver
[`docs/10-estado-atual/estado-atual.md`](./docs/10-estado-atual/estado-atual.md).

Encaixe na plataforma: `basePath: /sicat`, namespace `apps`, hosts `dev.nvit.com.br` (público via
Cloudflare Tunnel) e `nvit.localhost` (dev local). Contrato da esteira em
[`devops.yaml`](./devops.yaml).

## 2. Como começar uma tarefa (sempre)

1. Ler este `AGENTS.md` e o [`CLAUDE.md`](./CLAUDE.md).
2. Ler o estado atual em [`docs/10-estado-atual/estado-atual.md`](./docs/10-estado-atual/estado-atual.md)
   (snapshot honesto: implementado / em progresso / planejado). Nunca assumir; ler.
3. Para tarefa de backend, ler também [`backend/AGENTS.md`](./backend/AGENTS.md) (fronteiras de
   camada + contrato OpenAPI).
4. Consultar a matriz de decisão (§4) e as regras HARD da plataforma
   ([`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md)).
5. Planejar → executar → validar (§6) → atualizar docs (§7) → relatório final.

## 3. Ordem oficial de leitura

| # | Doc | Para quê |
|---|---|---|
| 1 | [`AGENTS.md`](./AGENTS.md) | Este arquivo — fronteiras app-wide |
| 2 | [`CLAUDE.md`](./CLAUDE.md) | Stack, armadilhas, env vars, dev/debug (Claude) |
| 3 | [`README.md`](./README.md) | Setup técnico, endpoints, fluxos CETESB reais |
| 4 | [`ONBOARDING-DEVOPS.md`](./ONBOARDING-DEVOPS.md) | Mapeamento na esteira (serviços, roteamento, secrets, deploy) |
| 5 | [`backend/AGENTS.md`](./backend/AGENTS.md) | Camadas, contrato, persistência/fila, gateway CETESB |
| 6 | [`docs/10-estado-atual/estado-atual.md`](./docs/10-estado-atual/estado-atual.md) | Estado real (ler antes de implementar) |
| 7 | [`docs/copilot/13-decision-log.md`](./docs/copilot/13-decision-log.md) | Decisões arquiteturais (DL-022, DL-093, etc.) |
| 8 | [`docs/FRONTEND-COMPONENTS-ARCHITECTURE.md`](./docs/FRONTEND-COMPONENTS-ARCHITECTURE.md) · [`frontend/docs/design-system.md`](./frontend/docs/design-system.md) | Padrão de componentes Vue + design system `Sicat*` |

## 4. Matriz de decisão

| Tipo de tarefa | Comece por | Fronteira |
|---|---|---|
| Criar/alterar endpoint HTTP | [`backend/AGENTS.md`](./backend/AGENTS.md) §3 (contract-first: OpenAPI → examples → `operations.ts` → routes → testes) | segura até validar; deploy = com aprovação |
| Integração CETESB (login, manifesto, catálogo) | [`backend/AGENTS.md`](./backend/AGENTS.md) §9 + HARs em `docs/cetesb/`; tudo em `src/gateways/cetesb-gateway.js` | com aprovação (toca sistema externo real) |
| Banco / fila / worker | [`backend/AGENTS.md`](./backend/AGENTS.md) §4 (migrations `src/sql/`, `FOR UPDATE SKIP LOCKED`, locking otimista `version`) | migration nova = com aprovação |
| Tela / componente Vue | [`docs/FRONTEND-COMPONENTS-ARCHITECTURE.md`](./docs/FRONTEND-COMPONENTS-ARCHITECTURE.md) + design system `Sicat*` (`SicatPageLayout`, `SicatDataTable`, `SicatStatusBadge` via `lib/status-map.js`) | segura |
| Feature de IA (chat / AI Control) | env `OPENAI_API_KEY` no `sicat-config`; `AI_CONTROL_*` no `devops.yaml`/compose | com aprovação se gastar tokens |
| Roteamento / manifests K8s | [`ONBOARDING-DEVOPS.md`](./ONBOARDING-DEVOPS.md) §3 + [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md) §2 | com aprovação |
| Publicar / reverter | [`../../docs/runbooks/rollback.md`](../../docs/runbooks/rollback.md) | com aprovação |

Trabalho multi-verbo no Copilot é **delegation-first** (`orquestrador-mtr` → especialistas); ver
[`backend/AGENTS.md`](./backend/AGENTS.md) §8 e `.github/copilot-instructions.md`. Para Claude,
trate como cadeia de fases (implementar → validar → documentar), não as misture.

## 5. Fronteiras de operação

### ✅ Seguras (autônomas / idempotentes)

- Leitura de código, docs, manifests e `devops.yaml`.
- Backend (workspace `backend`): `npm run typecheck`, `npm run lint`, `npm run validate:openapi`,
  `npm run gen:operations`, `npm test` e os `test:*` direcionados, `npm run smoke:health`,
  `npm run smoke:openapi`, `npm run scan:secrets`.
- `npm run migrate` **contra Postgres local** (Docker Compose) — migrations são idempotentes
  (advisory-lock); nunca contra banco do cluster sem aprovação.
- Dev local: `docker compose up -d postgres`, `npm run dev`, `npm run worker`, `npm run dev:frontend`.
- Build local de imagens `:local` (sem push).
- `kubectl get/describe/logs` em recursos de `sicat` no namespace `apps` (read-only).

### ⚠️ Com aprovação do operador

- Qualquer chamada que atinja a **CETESB real** (`CETESB_GATEWAY_MODE=real` é o padrão) — smokes
  `manifest-real-*`, `smoke:auth`, `catalog-sync`, `bootstrap-session-context.ps1`.
- `kubectl apply` de `k8s/*` no cluster; `scripts/publish-app.ps1 -App sicat`; rollout/restart.
- Criar/atualizar `Secret`/`ConfigMap` (`sicat-config`, `sicat-db`, `sicat-certs`) no cluster.
- `docker build … && docker push ghcr.io/flavioneto11/sicat/{api,frontend}`.
- Migration nova em `src/sql/` (muda schema vivo) e commit/push.

### ⛔ Proibidas

- `git push --force` em `main`; `--no-verify` para pular hooks.
- Versionar segredo real (`.env`, `*.pem`, JWT, chaves OpenAI/CETESB/Langfuse). Só `*.example` com
  placeholders + SealedSecret cifrado. Nunca aplicar `k8s/secret.example.yaml` no cluster.
- Chamar a CETESB fora de `src/gateways/cetesb-gateway.js` (de `routes/`, `services/` ou `workers/`).
- Hardcodar JWT, headers ou endpoints CETESB fora do gateway.
- Converter `src/gateways/cetesb-gateway.js` para `.ts` (decisão DL-093, intencional).
- Alterar `metadata.name`/labels de recurso vivo sob Argo sem planejar recriação (Argo faz prune).
- Apagar/editar dados do `sicat-postgres` do cluster sem aprovação.

## 6. Validação obrigatória

Rodar no workspace `backend` (`cd apps/sicat/backend`) antes de concluir:

```bash
npm run typecheck            # tsc --noEmit (zero erros esperados)
npm run lint                 # ESLint em src/**/*.ts, scripts/**, tests/**
npm run validate:openapi     # OpenAPI + fonte-de-verdade CETESB + links markdown
npm run gen:operations       # se mudou a superfície HTTP — operations.ts em lockstep
npm test                     # suíte tsx --test (ou test:api / test:integration / test:worker / test:contract)
```

Frontend (mudou UI), a partir da raiz do app:

```bash
npm run build:frontend       # Vite build com base /sicat/
```

Se um comando falhar por motivo pré-existente e **não relacionado** à mudança, documente no relatório
em vez de mascarar. Validação que toca a CETESB real entra na fronteira **com aprovação** (§5).

## 7. Política de atualização de docs

| Mudança | Atualizar |
|---|---|
| Endpoint HTTP (criar/alterar/remover) | `openapi/mtr_automacao_openapi_interna.yaml` → `examples/` → `src/generated/operations.ts` → rotas → testes de contrato (lockstep) + `docs/10-estado-atual/estado-atual.md` |
| Schema/migration (`src/sql/`) | `docs/DL-022-EVOLUCAO-PERSISTENCIA-FILA.md` + estado-atual |
| Comportamento CETESB | validar contra HAR em `docs/cetesb/` + `docs/copilot/13-decision-log.md` se virar decisão |
| Componente/tela Vue | `docs/FRONTEND-COMPONENTS-ARCHITECTURE.md` + `frontend/docs/design-system.md` |
| Roteamento / serviço novo | `devops.yaml` + `ONBOARDING-DEVOPS.md` + manifests `k8s/` |
| Decisão arquitetural | `docs/copilot/13-decision-log.md` (próximo `DL-NNN`) |

Marcar estado com os ícones padrão: `✅ Implementado` · `⚠️ Parcial` · `🔵 Planejado` ·
`❌ Fora de escopo`. Nunca prometer feature inexistente.

## 8. Princípios não-negociáveis

1. **AGENTS.md é a fonte das fronteiras/decisão** — não duplicar em `CLAUDE.md` nem em `.github/`.
   Detalhe de backend mora em [`backend/AGENTS.md`](./backend/AGENTS.md); aponte, não copie.
2. **Fronteira de camadas estrita**: `route → service → repository → job → worker → gateway`.
   CETESB só via `src/gateways/cetesb-gateway.js`; SQL só em `src/repositories/**`.
3. **Contract-first**: mudança de superfície HTTP atualiza OpenAPI/examples/`operations.ts`/rotas/
   testes no mesmo PR.
4. **Postgres é a fonte transacional única** — fila por tabela `jobs` (`FOR UPDATE SKIP LOCKED`),
   locking otimista por `version`. Não há broker externo (sem Kafka/Redis na fila).
5. **Comandos assíncronos** retornam `202` + `command-accepted` com job persistido; preservar
   `correlationId`/`jobId`/`commandId`/`sessionContextId`/`integrationAccountId` e erro em
   `application/problem+json`; honrar `Idempotency-Key`.
6. **Regras HARD de infra** valem sem exceção (labels, roteamento, segredos, GitOps, imagens):
   [`../../docs/standards/hard-constraints.md`](../../docs/standards/hard-constraints.md).
7. **Documentar é parte da entrega** — estado real, sem promessas; segredos nunca em git.
