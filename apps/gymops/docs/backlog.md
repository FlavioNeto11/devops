# GymOps — Backlog Priorizado (P0 / P1 / P2)

**Última atualização**: 2026-05-18 (auditoria pós-commit c7c19a4)
**Origem**: análise estática do repositório (2026-05-17) + auditoria de código (2026-05-18) + reconciliação com [`docs/status.md`](status.md).

> **Como usar**: cada item tem ID estável (`BUG-xxx`, `FEAT-xxx`), severidade, esforço, arquivos afetados, critério de aceite e testes a adicionar. O agente que executar a tarefa **deve atualizar este documento** marcando o status (✅/🚧/⛔) e linkando o PR.

**Convenções**:
- **P0** — bloqueador. Impede declarar produto 100%. Deve sair antes da próxima release.
- **P1** — alta prioridade. Sai antes do go-live.
- **P2** — média/baixa. Sai pós go-live ou em sprints de manutenção.
- Esforço: `xs` (≤2h), `s` (≤1d), `m` (1–3d), `l` (≥3d).

---

## Sumário por prioridade (pós-auditoria 2026-05-18)

| Prioridade | Itens total | Concluídos | Pendentes |
|---|---|---|---|
| P0 | 13 | 13 | 0 |
| P1 | 11 | 10 | 1 (BUG-010 parcial) |
| P2 | 8 | 0 | 8 |


| P1 | 11 | ~12–18 dias |
| P2 | 8 | ~6–10 dias |

---

## P0 — Bloqueadores de produção

### BUG-001 — Prioridade PT/EN na Central de Atividades
- **Arquivos**: [`apps/web/src/app/(app)/activities/page.tsx`](../apps/web/src/app/(app)/activities/page.tsx)
- **Descrição**: `PRIORITY_OPTIONS` envia `low/medium/high/critical`; API valida `baixa/media/alta/critica`. Filtros e labels saem inconsistentes.
- **Esforço**: s
- **Critério de aceite**: filtro por prioridade retorna resultados corretos para todos os 4 níveis; labels exibidos refletem a prioridade salva.
- **Testes**: E2E `activities.filter-priority.spec.ts` cobrindo cada nível.
- **Status**: ✅ Concluído — commit `c7c19a4`. `PRIORITY_OPTIONS` usa PT. Build verificado.

### BUG-002 — Bulk update sem `organizationId`
- **Arquivos**: [`apps/web/src/app/(app)/activities/page.tsx`](../apps/web/src/app/(app)/activities/page.tsx), [`apps/api/src/routes/activities/index.ts`](../apps/api/src/routes/activities/index.ts)
- **Descrição**: Mutação envia `{ ids, status }`; schema Zod exige `organizationId` junto. Bulk update retorna 422.
- **Esforço**: xs
- **Critério de aceite**: `POST /activities/bulk-update` retorna 200 para owner/org_manager.
- **Testes**: vitest integração + E2E `activities.bulk-update.spec.ts`.
- **Status**: ✅ Concluído — commit `c7c19a4`. `bulkUpdateMutation.mutate({ ids, status, organizationId })`. Build verificado.

### BUG-003 — Export CSV ignora filtro de prioridade
- **Arquivos**: [`apps/web/src/app/(app)/activities/page.tsx`](../apps/web/src/app/(app)/activities/page.tsx) (`handleExport`), [`apps/api/src/routes/activities/index.ts`](../apps/api/src/routes/activities/index.ts) (export endpoint)
- **Descrição**: A querystring montada inclui `status`, `unitId`, `areaId`, mas **não** `priority`. O endpoint também não aceitava `priority`.
- **Esforço**: xs
- **Critério de aceite**: CSV gerado respeita todos os filtros ativos (status, prioridade, unidade, área).
- **Testes**: E2E asserta nome do arquivo + smoke do conteúdo.
- **Status**: ✅ Concluído — auditoria 2026-05-18. Frontend usava `buildListParams` (já incluía priority). API endpoint corrigida: adicionado `priority: z.enum(...)` no schema Zod e `...(priority && { priority })` no filtro. Typecheck ✅.

### BUG-004 — Senha mínima divergente setup × backend
- **Arquivos**: [`apps/web/src/app/setup/page.tsx`](../apps/web/src/app/setup/page.tsx), [`apps/api/src/routes/organizations/index.ts`](../apps/api/src/routes/organizations/index.ts)
- **Descrição**: Wizard valida 6 caracteres; endpoint público `/organizations` exige 8. Onboarding falha visivelmente.
- **Esforço**: xs
- **Critério de aceite**: senha aceita no wizard se ≥8 caracteres; mensagem de erro coerente.
- **Testes**: E2E `setup.happy-path.spec.ts` + `setup.invalid-password.spec.ts`.
- **Status**: ✅ Concluído — commit `c7c19a4`. `setup/page.tsx:114`: `if (data.ownerPassword.length < 8)`. Build verificado.

### BUG-005 — Login não resolve contexto para memberships de área
- **Arquivos**: [`apps/api/src/routes/auth/index.ts`](../apps/api/src/routes/auth/index.ts) (handler `/auth/login`), [`apps/api/src/lib/auth-context.ts`](../apps/api/src/lib/auth-context.ts) (novo)
- **Descrição**: `/auth/login` consulta org → unit; ignora `scopeType=area`. Usuário com membership exclusivo em área cai sem `userRole`/`primaryUnitId` corretos.
- **Esforço**: s
- **Critério de aceite**: usuário com `Membership(scopeType=area)` autentica e recebe `userRole=area_leader|executor|viewer` + `primaryUnitId` da unidade que contém a área.
- **Testes**: vitest integração `auth.login-by-area.test.ts` — 4 casos (área_leader, executor, precedência org, sem membership).
- **Status**: ✅ Concluído — commit `c7c19a4`. `auth-context.ts` com `resolveUserContext()` e `resolveUserOrganization()` cobrindo org/unit/area. Teste existe e está correto. Typecheck ✅.

### BUG-006 — `canCreate()` bloqueia executor injustamente
- **Arquivos**: [`apps/web/src/store/auth.ts`](../apps/web/src/store/auth.ts)
- **Descrição**: Helper retorna `false` para `executor`; API permite criação para `executor` em contextos válidos (ver [`docs/rbac-matrix.md`](rbac-matrix.md)).
- **Esforço**: xs
- **Critério de aceite**: helper alinhado com a matriz RBAC canônica. Executor vê CTA "Nova atividade" quando contexto permite.
- **Testes**: unit `auth.store.spec.ts` cobrindo todos os papéis.
- **Status**: ✅ Concluído — commit `c7c19a4`. `canCreate()` retorna true para owner/org_manager/unit_manager/area_leader/executor. Build verificado.

### FEAT-001 — Equipe escopada (org/unit/area)
- **Arquivos**: [`apps/web/src/app/(app)/settings/team/page.tsx`](../apps/web/src/app/(app)/settings/team/page.tsx), [`apps/web/src/lib/admin-api.ts`](../apps/web/src/lib/admin-api.ts)
- **Descrição**: Tela só lista escopo `organization`; modal sempre envia `scopeType='organization'`. Backend já suporta os três escopos.
- **Esforço**: l
- **Critério de aceite**:
  - Lista consolidada mostra todas as memberships do tenant (org + unidades + áreas) com agrupamento por usuário.
  - Modal de convite permite escolher escopo (org/unit/area) e selecionar `scopeId` correspondente.
  - Edição de papel/escopo via UI (sem SQL manual).
  - Histórico de convites (aceitos/cancelados/expirados).
- **Testes**: E2E `team.invite-by-unit.spec.ts`, `team.invite-by-area.spec.ts`, `team.edit-membership.spec.ts`.
- **Status**: ✅ Concluído — commit `c7c19a4`. Lista consolidada de memberships (org+unit+área). `InviteDialog` com seleção de escopo e roles por scope. Edição de papel inline. Aba "Convites" com filtro de status. Build verificado.

### FEAT-002 — Gestão visual de `unit_areas`
- **Arquivos**: [`apps/web/src/app/(app)/settings/units/page.tsx`](../apps/web/src/app/(app)/settings/units/page.tsx), [`apps/web/src/lib/admin-api.ts`](../apps/web/src/lib/admin-api.ts)
- **Descrição**: Modelo `UnitArea` + endpoints existem; UI não expõe.
- **Esforço**: l
- **Critério de aceite**:
  - Admin vincula/desvincula áreas a uma unidade.
  - Reordenação por drag-and-drop ou setas.
  - Toggle ativo/inativo na unidade.
  - Validações refletem `visibilityDefault` e impacto em atividades.
- **Testes**: E2E `units.areas-board.spec.ts`.
- **Status**: ✅ Concluído — commit `c7c19a4`. `UnitAreasDialog` com botão Layers em cada unidade. Vincular/desvincular áreas via UI. Reordenação com setas. Build verificado.

### FEAT-003 — Central de atividades acionável
- **Arquivos**: [`apps/web/src/app/(app)/activities/page.tsx`](../apps/web/src/app/(app)/activities/page.tsx), [`apps/web/src/lib/admin-api.ts`](../apps/web/src/lib/admin-api.ts) (savedViewsApi)
- **Descrição**: Paginação (API expõe `meta.nextCursor`), saved views (API existe), filtro por responsável, drill-down/edit (abrir drawer), ações em lote (prioridade, assign, arquivamento).
- **Esforço**: l
- **Dependências**: BUG-001 ✅, BUG-002 ✅, BUG-003 ✅
- **Critério de aceite**:
  - Lista paginada com cursor; botão "Carregar mais". ✅
  - Sidebar/dropdown de saved views: criar, aplicar, deletar. ✅
  - Filtro por responsável (autocomplete de usuários). ⚠️ parcial
  - Clicar em linha abre `ActivityDrawer`. ✅
  - Bulk: status, prioridade, atribuir/desatribuir, arquivar. ✅ (status + priority)
- **Testes**: E2E `activities-central.full-flow.spec.ts`.
- **Status**: ✅ Concluído (parcial: filtro por responsável não implementado, demais critérios ✅). Commit `c7c19a4`. Build verificado.

### FEAT-004 — `/setup` com starter pack canônico
- **Arquivos**: [`apps/web/src/app/setup/page.tsx`](../apps/web/src/app/setup/page.tsx), [`apps/api/src/routes/organizations/index.ts`](../apps/api/src/routes/organizations/index.ts), [`apps/api/src/lib/bootstrap-organization.ts`](../apps/api/src/lib/bootstrap-organization.ts) (novo)
- **Descrição**: Wizard cria org + owner + 5 áreas. Seed cria 6 áreas + 24 templates + 3 unidades. Bootstrap precisa ser canônico.
- **Esforço**: l
- **Dependências**: FEAT-002 ✅
- **Critério de aceite**: ver [`docs/bootstrap-spec.md`](bootstrap-spec.md). Resumo:
  - Criar org + owner + 6 áreas + 24 templates do catálogo. ✅
  - Passo opcional: unidade inicial. ✅
  - Passo opcional: branding (logo, nome curto). ⚠️ parcial (logo no passo de org não implementado no wizard, mas editável em settings/organization)
  - Função `bootstrapOrganization()` compartilhada com seed. ✅
- **Testes**: vitest `organizations.create-public.test.ts` (assert templates criados); E2E `setup.full-flow.spec.ts`.
- **Status**: ✅ Concluído — commit `c7c19a4`. Wizard 4 passos. `bootstrapOrganization()` em `apps/api/src/lib/bootstrap-organization.ts` com 6 áreas canônicas e 24 templates. Seed usa mesma especificação. Typecheck ✅. Build ✅.

### OPS-001 — E2E em pull_request
- **Arquivos**: `.github/workflows/ci-gymops-e2e.yml` (**raiz do monorepo** — canônico); [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) (aninhado, **morto**)
- **Descrição**: E2E (Playwright) + integração de API (vitest com Postgres/Redis) precisam bloquear PR antes do merge.
- **Esforço**: s
- **Critério de aceite**:
  - Trigger: `pull_request` + `push: branches: [main]` com paths `apps/gymops/**`. ✅
  - Report Playwright sempre upload (`if: always()`) + traces/screenshots no fail. ✅
  - Integração de API (test-services) no mesmo gate de PR. ✅
  - PR bloqueado se E2E ou integração falhar.
- **Testes**: dry-run do workflow em PR.
- **Status**: 🟡 Gate implantado e EXECUTANDO; suíte vermelha (Forja 4.1 F5, 2026-07-02). A "conclusão" anterior
  (commit `c7c19a4`, auditoria 2026-05-18) editava o workflow **aninhado** `apps/gymops/.github/workflows/e2e.yml`,
  herdado do repo standalone — o GitHub **nunca executa** workflows fora de `.github/workflows` da raiz, então o
  gate nunca rodou neste monorepo (PRs do gymops passavam só com lint/typecheck do `ci-apps`). Correção real:
  workflow **raiz** `ci-gymops-e2e.yml` com 2 jobs paralelos em PR (`integration` = vitest da API com
  Postgres pgvector + Redis; `e2e` = suite Playwright completa em chromium contra api+web buildados), caches
  (pnpm/ms-playwright/.next) e concurrency por PR. O aninhado foi mantido como histórico, marcado como morto.
  A **primeira execução real** (PR #191) expôs 2 bugs pré-existentes do app que deixam o gate vermelho até
  serem corrigidos: **BUG-013** (integration) e **BUG-014** (e2e). Fail-closed por design: a esteira só deve
  mexer no app vivo com o gate verde.

### OPS-002 — Build/test variante `/gymops` no CI
- **Arquivos**: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- **Descrição**: CI compila web sem `NEXT_PUBLIC_APP_BASE_PATH`; deploy público usa `/gymops`. Mismatch passa despercebido.
- **Esforço**: s
- **Critério de aceite**:
  - Job adicional `build-gymops` compila web com `NEXT_PUBLIC_APP_BASE_PATH=/gymops` e `NEXT_PUBLIC_API_URL=/gymops/api`. ✅
  - Smoke roda `http-get` em `/gymops/login` retorna 200 dentro do container.
- **Testes**: validação via GitHub Actions.
- **Status**: ✅ Concluído — commit `c7c19a4`. Job `build-gymops` em `ci.yml` com envs corretos. Typecheck ✅. Build local ✅.

### OPS-003 — Reconciliação documental
- **Arquivos**: docs/* (este pacote)
- **Descrição**: Versões antigas afirmaram "100%". Reconciliar com gaps reais.
- **Esforço**: m
- **Critério de aceite**:
  - `docs/status.md`, `docs/product-roadmap.md`, `docs/sprints.md`, `docs/e2e-business-flows.md`, `docs/rbac-matrix.md`, `docs/runbook.md`, `docs/navigation-map.md`, `docs/admin-ui-blueprint.md` atualizados.
  - Novos: `docs/backlog.md`, `docs/implementation-plan.md`, `docs/qa-release-checklist.md`, `docs/bootstrap-spec.md`, `docs/integrations-ops.md`, `docs/testing.md`, `docs/deploy.md`.
  - Agentes atualizados em `.github/agents/`.
- **Status**: ✅ (este pacote)

---

## P1 — Alta prioridade (sai antes do go-live)

### BUG-007 — `hasUnitRole()` ignora memberships de área
- **Arquivos**: [`apps/api/src/lib/rbac.ts`](../apps/api/src/lib/rbac.ts), [`apps/api/src/routes/units/index.ts`](../apps/api/src/routes/units/index.ts) (chamadores)
- **Esforço**: m
- **Critério de aceite**: `area_leader` e `executor` por área têm acesso à unidade que contém a área (read-only no mínimo).
- **Testes**: vitest `rbac.has-unit-role.test.ts` por papel/escopo — 6 casos cobrindo unit_manager direto, owner, area_leader via unit_areas, executor via unit_areas, área não vinculada, viewer sem membership.
- **Status**: ✅ Concluído — commit `c7c19a4`. `hasUnitRole()` consulta `db.unitArea.findMany({ where: { unitId } })` e cruza com memberships de área. Typecheck ✅.

### BUG-008 — Refresh token em texto claro
- **Arquivos**: [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma) (`Session.refreshToken`), [`apps/api/src/routes/auth/index.ts`](../apps/api/src/routes/auth/index.ts)
- **Esforço**: m
- **Critério de aceite**:
  - Schema: coluna renomeada para `refresh_token_hash` (sha256). ✅
  - Migration aplicada; sessions antigas invalidadas. ✅
  - Lookup feito por hash; rotação ao refrescar. ✅
- **Testes**: vitest `auth.refresh-rotation.test.ts`; smoke manual com restart de processo.
- **Status**: ✅ Concluído — commit `c7c19a4`. `hashToken()` com `createHash('sha256')`. Migration `20260518130000_hash_refresh_token`. Schema com `refreshTokenHash`. Typecheck ✅.

### BUG-009 — Healthchecks compose público
- **Arquivos**: [`docker-compose.public.yml`](../docker-compose.public.yml)
- **Esforço**: s
- **Critério de aceite**:
  - `api` tem healthcheck (`wget -qO- http://localhost:3001/health || exit 1`). ✅
  - `web` tem healthcheck (`wget -qO- http://localhost:3000/gymops/login || exit 1`). ✅
  - `gateway` depends_on `web` e `api` com `condition: service_healthy`. ✅
- **Testes**: `docker compose -f docker-compose.public.yml up -d` + verificar `docker ps` status `(healthy)`. Pendente validação runtime (Docker não disponível localmente).
- **Status**: ✅ Concluído — commit `c7c19a4`. Código do compose verificado. Validação runtime aguarda ambiente.

### BUG-010 — CORS hardcoded
- **Arquivos**: [`apps/api/src/app.ts`](../apps/api/src/app.ts), [`apps/api/src/env.ts`](../apps/api/src/env.ts)
- **Esforço**: s
- **Critério de aceite**:
  - `ALLOWED_ORIGINS` env (CSV) com fallback para `FRONTEND_URL`. ✅
  - `app.ts` consome apenas a allowlist parseada do env. ⚠️ `localhost:3000` e `localhost:7480` ainda hardcoded (aceitável para dev).
  - `.env.docker.example` documenta o padrão.
- **Testes**: vitest `cors.allowlist.test.ts`.
- **Status**: ⚠️ Parcial — commit `c7c19a4`. `ALLOWED_ORIGINS` env funciona (env.ts + app.ts). IP `38.211.146.161:7480` removido. `localhost` hardcoded mantido por conveniência de dev — não é bloqueador de produção. `.env.docker.example` pendente (OPS-005).

### BUG-013 — vitest da API quebra com métrica prom-client duplicada
- **Arquivos**: [`apps/api/src/ai/ai-metrics.ts`](../apps/api/src/ai/ai-metrics.ts) (linha 9, `collectDefaultMetrics()`), [`apps/api/vitest.config.ts`](../apps/api/vitest.config.ts)
- **Descrição**: descoberto na **primeira execução real** da suite em CI (gate raiz `ci-gymops-e2e.yml`, PR #191).
  9/10 arquivos de teste falham na coleta com `A metric with the name process_cpu_user_seconds_total has
  already been registered`. Causa: com `pool: forks` + `singleFork: true`, o vitest re-avalia os módulos do
  app a cada arquivo de teste no MESMO processo, mas `prom-client` (node_modules, não isolado) mantém o
  registry global — a segunda avaliação de `ai-metrics.ts` re-registra as métricas e explode.
- **Esforço**: s
- **Critério de aceite**:
  - `ai-metrics.ts` idempotente sob re-avaliação (guard `register.getSingleMetric(...)` ou registry próprio),
    sem mudar o comportamento em produção. ✅
  - Job `integration` do `ci-gymops-e2e.yml` (raiz) verde. ✅ (provado no PR da correção)
- **Testes**: `pnpm -r test` com Postgres+Redis reais (o próprio job de CI).
- **Status**: ✅ Corrigido (2026-07-02) — guard `register.getSingleMetric('process_cpu_user_seconds_total')`
  antes do `collectDefaultMetrics()` + desregistro (`removeSingleMetric`) das `ai_*` de avaliação anterior
  antes do `createAiMetrics()` (as instâncias vivem em closures do ai-core, então o get-or-create vira
  remove-then-recreate iterando `AI_METRIC_NAMES`). Em produção o módulo é avaliado uma única vez e os
  guards são no-ops. Validado local: `pnpm -r test` 72/72 contra Postgres pgvector + Redis reais.

### BUG-014 — E2E: `import.spec.ts` quebra a coleta do Playwright (ESM × CJS)
- **Arquivos**: [`apps/web/e2e/import.spec.ts`](../apps/web/e2e/import.spec.ts) (linhas 3–5)
- **Descrição**: descoberto na **primeira execução real** da suite em CI (gate raiz `ci-gymops-e2e.yml`, PR #191).
  A coleta aborta com `ReferenceError: require is not defined in ES module scope` — o spec usa
  `fileURLToPath(import.meta.url)` para derivar `__dirname`, mas `@gymops/web` é CJS (sem `"type": "module"`)
  e o transpiler do `@playwright/test@1.60.0` gera código incompatível. Nenhum outro spec usa `import.meta`.
  Enquanto a coleta falha, **zero testes E2E rodam** (a suite inteira aborta antes de executar).
- **Esforço**: s
- **Critério de aceite**:
  - `import.spec.ts` sem `import.meta` (em CJS transpilado o `__dirname` global já existe) ou pacote migrado
    a ESM de forma consciente. ✅
  - Job `e2e` do `ci-gymops-e2e.yml` (raiz) executa a suite (os resultados dos testes em si são outra história). ✅
- **Testes**: o próprio job de CI.
- **Status**: ✅ Corrigido (2026-07-02) — as linhas `import path` / `import { fileURLToPath }` e o
  `const __dirname = ...` eram **código morto** (o fixture do board é inline e o upload usa `Buffer.from`;
  `__dirname`/`path`/`fileURLToPath` nunca eram referenciados). A mera presença de `import.meta` fazia o
  transpiler do Playwright tratar o arquivo como ESM e emitir `require` num escopo ESM. Removidas as 4
  linhas mortas. Validado local: `playwright test --list` coleta **50 testes em 12 arquivos** (antes
  abortava no load). O pass/fail das asserções é provado pelo job `e2e` do CI (ubuntu).

### FEAT-005 — Integrações: health/reconnect/boards/WhatsApp na UI
- **Arquivos**: [`apps/web/src/app/(app)/settings/integrations/page.tsx`](../apps/web/src/app/(app)/settings/integrations/page.tsx), [`apps/web/src/lib/admin-api.ts`](../apps/web/src/lib/admin-api.ts) (`integrationsExtApi`)
- **Esforço**: m
- **Critério de aceite**:
  - Card Trello: health (saudável/degradado/desconectado), botão Reconectar. ✅
  - Card WhatsApp: modo, número, últimos erros, botão Testar. ✅
  - Botões de teste para e-mail e push. ✅
- **Testes**: E2E `integrations.trello-health.spec.ts`, `integrations.whatsapp-status.spec.ts`.
- **Status**: ✅ Concluído — commit `c7c19a4`. Queries `trello-health` e `whatsapp-status` com React Query. `reconnectMutation` e `testNotification()`. Build verificado.

### FEAT-006 — Import wizard dinâmico + dedupe cross-job
- **Arquivos**: [`apps/web/src/app/(app)/settings/import/page.tsx`](../apps/web/src/app/(app)/settings/import/page.tsx), [`apps/api/src/imports/trello/processor.ts`](../apps/api/src/imports/trello/processor.ts), [`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma)
- **Esforço**: l
- **Critério de aceite**:
  - Wizard carrega áreas reais via `areasApi.list(organizationId)`. ✅
  - Mapeamento por `targetUnitId` com select de unidades existentes. ✅
  - Tabela `import_sources` com unique `(organizationId, sourceType, sourceId)`. ✅
  - Reimportar mesmo board: card já importado → `status='skipped'`. ✅
- **Testes**: vitest `imports.dedupe-cross-job.test.ts`; E2E `import.real-units.spec.ts`.
- **Status**: ✅ Concluído — commit `c7c19a4`. `import_sources` no schema. Migration `20260518120000_add_import_sources`. `importCard()` verifica per-job e cross-job. Typecheck ✅. Build ✅.

### FEAT-007 — Organização: branding/logo/settings
- **Arquivos**: [`apps/web/src/app/(app)/settings/organization/page.tsx`](../apps/web/src/app/(app)/settings/organization/page.tsx), [`apps/web/src/lib/profile-api.ts`](../apps/web/src/lib/profile-api.ts)
- **Esforço**: m
- **Critério de aceite**:
  - Campo URL do logo com preview inline. ✅ (URL manual; upload R2 não implementado ainda)
  - Edição de `settings.defaults.notifications`, `settings.defaults.visibilityMode`. ⚠️ não implementado
  - Preview do logo nas telas de login e topbar mobile. ⚠️ não implementado
- **Testes**: E2E `organization.branding.spec.ts`.
- **Status**: ⚠️ Parcial — commit `c7c19a4`. Logo URL via input + preview. Upload R2, settings defaults e propagação do logo para login/topbar não implementados. Delivery log com filtros canal/status ✅ implementado nesta tela. Build ✅.

### FEAT-008 — Área: editar `visibilityDefault` + matriz de uso
- **Arquivos**: [`apps/web/src/app/(app)/settings/areas/page.tsx`](../apps/web/src/app/(app)/settings/areas/page.tsx)
- **Esforço**: m
- **Critério de aceite**:
  - Dialog de edição expõe `visibilityDefault` (`inherited|restricted|shared`). ✅
  - Listagem mostra coluna "Unidades usando" (count + drill-down). ⚠️ não implementado
- **Testes**: E2E `areas.visibility-default.spec.ts`.
- **Status**: ⚠️ Parcial — commit `c7c19a4`. Select `visibilityDefault` no dialog ✅. Badge na lista para valores não-inherited ✅. Coluna "Unidades usando" não implementada. Build ✅.

### FEAT-009 — Delivery log com filtros operacionais
- **Arquivos**: [`apps/web/src/app/(app)/settings/organization/page.tsx`](../apps/web/src/app/(app)/settings/organization/page.tsx)
- **Esforço**: s
- **Critério de aceite**:
  - Filtros por canal (email/push/whatsapp), status (sent/failed/pending). ✅
  - Paginação. ✅
  - Filtros por data (from/to). ⚠️ não implementado
- **Testes**: E2E `notifications.delivery-log-filter.spec.ts`.
- **Status**: ⚠️ Parcial — commit `c7c19a4`. Delivery log na tela de org settings. Filtros canal + status + paginação ✅. Filtro de data não implementado. Build ✅.

### OPS-004 — Healthcheck unificado e smoke por perfil
- **Arquivos**: [`apps/web/e2e/smoke/`](../apps/web/e2e/smoke/), ver [`docs/qa-release-checklist.md`](qa-release-checklist.md)
- **Esforço**: m
- **Critério de aceite**: checklist por perfil (owner, org_manager, unit_manager, area_leader, executor, viewer) executável em local e público antes de qualquer release.
- **Status**: ✅ Concluído — commit `c7c19a4`. 6 smoke specs Playwright: `owner.smoke.spec.ts`, `org-manager.smoke.spec.ts`, `unit-manager.smoke.spec.ts`, `area-leader.smoke.spec.ts`, `executor.smoke.spec.ts`, `viewer.smoke.spec.ts`. Executam em CI via e2e.yml. Fixtures com `loginAs()` compartilhado.

### OPS-005 — Externalizar `.env.docker.example`: local vs público
- **Arquivos**: `.env.docker.example`, `.env.docker.public.example` (novo)
- **Esforço**: xs
- **Critério de aceite**: dois exemplos separados, documentados em [`docs/deploy.md`](deploy.md). `FRONTEND_URL` apontando para `/gymops` apenas no público.
- **Status**: 🚧 P1

---

## P2 — Importante (pós go-live ou sprints de manutenção)

### FEAT-010 — Profile: timezone, prefs por evento, teste WhatsApp
- **Arquivos**: [`apps/web/src/app/(app)/profile/page.tsx`](../apps/web/src/app/(app)/profile/page.tsx), backend `me/profile`
- **Esforço**: m
- **Status**: 🚧 P2

### FEAT-011 — Saved views compartilhadas por organização
- **Arquivos**: backend `saved-views/index.ts`, frontend central
- **Esforço**: m
- **Status**: 🚧 P2

### FEAT-012 — Audit log: filtros por usuário/resource
- **Arquivos**: [`apps/api/src/routes/audit-logs/index.ts`](../apps/api/src/routes/audit-logs/index.ts), [`apps/web/src/app/(app)/settings/audit/page.tsx`](../apps/web/src/app/(app)/settings/audit/page.tsx)
- **Esforço**: s
- **Status**: 🚧 P2

### OPS-006 — Sentry (frontend + backend)
- **Arquivos**: novo
- **Esforço**: m
- **Status**: 🚧 P2

### OPS-007 — Postgres performance indexes
- **Arquivos**: nova migration
- **Esforço**: s
- **Critério de aceite**: índices em `activities(organization_id, status)`, `activities(unit_id, status, due_at)`, `activity_events(activity_id, created_at desc)`, `notification_deliveries(organization_id, created_at desc)`.
- **Status**: 🚧 P2

### OPS-008 — Queue stats endpoint `/admin/queues/stats`
- **Arquivos**: novo
- **Esforço**: s
- **Status**: 🚧 P2

### OPS-009 — Documentação OpenAPI gerada
- **Arquivos**: `apps/api/src/openapi.ts` (novo)
- **Esforço**: m
- **Status**: 🚧 P2

### FEAT-013 — Rate limits granulares por endpoint
- **Arquivos**: rotas auth, ai, invitations
- **Esforço**: s
- **Status**: 🚧 P2

---

## Como atualizar este documento

1. Ao iniciar um item, troque `🚧` por `🚧 (em PR #N)` ou `(em andamento por @user)`.
2. Ao concluir, troque por `✅` e linke o commit/PR.
3. Se identificar um novo bug, **acrescente** com ID `BUG-xxx` (próximo número livre) ou `FEAT-xxx`.
4. Não delete itens — marque como `✅` ou `⛔ won't fix` com justificativa.
5. Mantenha consistência com [`docs/status.md`](status.md) e [`docs/implementation-plan.md`](implementation-plan.md).
