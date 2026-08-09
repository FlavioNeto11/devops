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
`nvit.localhost` (dev). Frontend em `/sicat` (sem strip, base `/sicat/`); API em `/sicat/api`
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
9. **CDF e o limite de 31 dias da CETESB**: a busca de CDF (`gateway.searchCdfCertificates`) **fatia**
   o período em janelas ≤ 31 dias (`chunkDateRangeBr`) e mescla/deduplica por `cerHashCode || cerCodigo`
   — chat e tela cobrem ranges longos sem o erro "intervalo > 31 dias". Teto de ~2 anos
   (`CDF_SEARCH_RANGE_TOO_WIDE`). Mesmo padrão do `searchManifests`.
10. **Tool conversacional não devolve lista bruta grande**: o resultado de `list_cdf_certificates` no
    `conversation-tool-dispatcher.ts` é uma **amostra enxuta** (cap 50, sem `externalSnapshot`); a
    contagem real vai em `totalItems`. Devolver a lista crua (com o snapshot da CETESB) era serializado
    múltiplas vezes (resposta HTTP + trilha de auditoria) e **estourava o heap** (OOM → CrashLoop →
    Cloudflare "invalid/incomplete response"). A tela `/v1/cdf/certificates` mantém o payload do contrato.
    Backend roda com `NODE_OPTIONS=--max-old-space-size=1536` e limite 2Gi (`k8s/backend.yaml`).
11. **Validar deploy do frontend: afirme o HASH do bundle a cada navegação.** `Cache-Control:
    no-cache` no `index.html` **não** conserta a cópia que o navegador **já** guardou sem
    validador (`ETag`/`Last-Modified`): ele aplica *frescor heurístico* e serve a cópia velha
    **sem consultar o servidor** — na PRIMEIRA transição depois do deploy o avaliador continua
    no bundle antigo (autocura nas seguintes). Já custou uma rodada inteira de revalidação:
    achados "grandes" que eram cache do browser. Protocolo: **hard reload** + comparar, **a cada
    tela**, `assets/index-<hash>.js` do `curl` no servidor com
    `performance.getEntriesByType('resource')` da página aberta. E **`grep` no bundle não prova
    comportamento** — o build minifica (identificadores locais viram `a`, `b`, `c`; só literais
    de string sobrevivem). Verifique no **código-fonte** e com **teste**: lógica pura em
    `frontend/tests/unit` (`cd frontend/tests/unit && node --test`), layout/interação em
    `frontend/tests/ui` (Playwright — ex.: `fab-overlap-audit.spec.js`, que mede sobreposição do
    FAB por hit-test e traz um *controle negativo* para provar que o medidor enxerga). Detalhe
    em [`../../TROUBLESHOOTING.md`](../../TROUBLESHOOTING.md) §14.3.
12. **Deploy sob Argo (`selfHeal: true`)**: imagem é `:local` (build local) — `docker build` + recriar
    pod basta para **código**. Mudança de **manifesto** (memória/env) tem de ir pelo **git**: `apply`
    solto é revertido pelo selfHeal. Sequência: build → commit → push → forçar refresh
    (`kubectl annotate application sicat -n argocd argocd.argoproj.io/refresh=hard --overwrite`) → Argo
    sincroniza o commit novo. Detalhes do incidente em [`../../TROUBLESHOOTING.md`](../../TROUBLESHOOTING.md).
13. **`runMigrations` NÃO tem advisory lock** — este arquivo e `k8s/backend.yaml` afirmavam que tinha;
    os dois foram corrigidos na fase 4.5. `src/db/migrate.ts` faz `select 1 from schema_migrations` →
    `begin` → SQL → `insert` → `commit`, sem lock. Com `AUTO_MIGRATE=true` na **api** e no **worker**
    (ambos `strategy: Recreate`), dois bootstraps simultâneos podem colidir em `23505` na PK de
    `schema_migrations`; o perdedor faz rollback e o processo **lança** — `server.ts` não tem
    try/catch no top-level await e `worker.ts` faz `exit 1`, logo **api + worker em CrashLoop
    simultâneo**, não "chat degradado". Autocura no restart. Migration inédita → **rollout
    escalonado**: api primeiro, worker só depois de Ready.
14. **RBAC do chat: nunca "desative a permissão para destravar alguém".** `listPermissionKeysByUserId`
    filtra `ap.is_active = true`, e a integridade do gate é avaliada **por chave**: desativar uma
    permissão a remove do conjunto de **todos** e torna aquela ação insatisfazível para o mundo
    inteiro, inclusive os admins — transforma um incidente de 3 usuários em incidente de 5. A alavanca
    intuitiva faz o oposto do que parece. **Destravar é sempre CONCEDER papel.** Duas restrições duras
    que sustentam o rollback: o seed **nunca** renomeia/desativa/reescreve `admin.global` (é a escada
    de saída — `ensureAdminAuthorization` decide por NOME de papel e nunca lê `access_permissions`), e
    o seed é **aditivo** (`do nothing`/`do update`, nunca `delete`) — trocá-lo por
    `replaceAdminAccessRolePermissions` faria o primeiro restart desfazer um rollback de emergência.
    Três armadilhas de verbo/alavanca que já custaram uma rodada de revisão: (a) quem desativa a chave
    é o **`DELETE`**, não o `PATCH {isActive:false}` (esse é NO-OP), e o `DELETE` **não tem volta pela
    API** — as 8 chaves do catálogo passaram a ser recusadas com 409 `ACCESS_PERMISSION_IS_CATALOG_KEY`;
    (b) **alargar o papel-PISO não é rollback** — o piso é o que o `POST /v1/sicat/auth/register`
    PÚBLICO concede, então alargá-lo promove a internet inteira, sobrevive a restart e some da métrica;
    o rollback de regime é `CONVERSATION_PERMISSION_ENFORCEMENT=observe`, reversível por env; (c) o
    piso é condicionado a **não ter nenhuma CHAVE EFETIVA**, não a "não ter papel" — papel vazio não
    suprime o piso, e grant de piso expirado é revivido.
    Runbook: [`docs/05-operacao/runbook-rbac-conversacional.md`](./docs/05-operacao/runbook-rbac-conversacional.md).

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
AUTO_MIGRATE=true                 # migrations no boot — ⚠️ SEM advisory lock (ver armadilha 13)
AUTO_SEED=true                    # seed no boot (base-data + catálogo RBAC, idempotente)
CONVERSATION_PERMISSION_ENFORCEMENT=enforce  # gate RBAC do chat: enforce (default) | observe
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
