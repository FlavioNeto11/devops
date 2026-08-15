# GymOps — Status Real do Projeto

**Última atualização**: 2026-06-12 (onboarding novo: wizard split-screen com configuração inicial por IA para qualquer segmento)

> **2026-06-12 — Onboarding novo (full-stack, sem migration):** `/setup`
> redesenhado como wizard split-screen (painel grafite com trilha de passos;
> mobile com stepper compacto). Passo 0 "Como começar": **Configurar com IA**
> (recomendado) ou manualmente. Fluxo IA: descrição livre do negócio →
> `POST /organizations/setup-draft` (PÚBLICO, rate limit 3/15min; conhecimento
> setorial 100% no prompt `org-setup.prompt.ts`; zod valida SHAPE; retry com
> **self-correction** — os erros de validação voltam ao modelo; sem chave →
> 503 `AI_UNAVAILABLE` com saída p/ fluxo manual) → proposta **editável**
> (confiança, segmento, slug com checagem, áreas com cor/cadeado restricted,
> rotinas em accordions, unidades) → admin → confirmar. A IA NUNCA cria nada;
> o commit é `POST /organizations` com `blueprint` (áreas+templates aninhados+
> N unidades — validado por `org-blueprint.schema.ts`; key canônica sem
> `templates` herda as rotinas do sistema; `blueprint.units`+`initialUnit`
> juntos = 422 `CONFLICTING_UNITS`; `setupMeta` → `settings.onboarding`).
> Fluxo manual: org → áreas (6 canônicas pré-marcadas; renomear/cor/restringir
> preserva rotinas — key é o contrato; sem edição e ≤1 unidade = caminho
> canônico puro SEM blueprint) → admin → unidades (0–5) → confirmar.
> `bootstrapOrganization` aceita `blueprint?` (transação timeout 15s; audit
> `mode: blueprint|canonical`); **`trustProxy: true`** no Fastify (antes os
> rate limits "por IP" eram globais atrás do Traefik). Login: "Cadastre sua
> empresa". Testes `org-bootstrap.test.ts` 5/5 (postgres efêmero pgvector);
> colisão prom-client entre ARQUIVOS de teste no mesmo fork é pré-existente.
> Validado E2E com IA REAL: org "odonto-demo-e2e" criada pelo wizard (5 áreas
> do segmento odontológico, 12 rotinas, 3 unidades, settings.onboarding
> mode=ai; área renomeada na revisão persistiu; owner novo loga como owner com
> org/unit resolvidos); regressão manual "demo-manual-e2e" = 6/24/1 canônico;
> mobile 375px sem overflow. Orgs `*-demo-e2e` ficaram no banco como exemplo.

> **2026-06-12 — Checklist rico (full-stack):** migration
> `20260612160000_checklist_item_extras` (`activity_checklists.disabled_at`,
> `activity_checklist_items.comment`, `activity_attachments.checklist_item_id`
> com FK ON DELETE SET NULL). Ao MARCAR um item, painel inline expande para
> comentário (campo único, `PATCH /checklist-items/:id { comment }`) e anexo
> vinculado ao item (`registerAttachment` aceita `checklistItemId`; valida
> pertencimento à atividade). Checklist pode ser DESATIVADO (soft —
> `PATCH /checklists/:id { disabled }`, sai do `checklistProgress`, badge +
> somente leitura) ou REMOVIDO (delete já existia; agora exposto na UI com
> confirmação + evento `checklist_removed`). IA para revisar checklist
> EXISTENTE: `POST /ai/checklists/:id/revise` (instrução livre → rascunho com
> diff determinístico; **nunca salva** — usuário confirma via
> `POST /checklists/:id/apply-revision`, transação atômica; bloqueado para
> atividades `restricted`; rate limit 10/min; fallback gracioso
> `aiUnavailable`). Eventos novos: `checklist_item_commented`,
> `checklist_disabled/enabled/removed`, `checklist_revised`. Validado E2E
> logado (admin demo): check→painel→comentário, anexo por item (API+UI),
> desativar/reativar, remover, revisão IA real (OpenAI) com diff aplicado.
> Nota lab: R2 não configurado → anexos registram metadados sem storage
> (degradação preexistente, igual aos anexos da atividade).

> **2026-06-12 — Re-design visual (tema graphite):** paleta monocromática em
> escala zinc — primário quase-preto no light / branco no dark (globals.css +
> tokens `--sidebar-*` novos no tailwind.config); sidebar GRAFITE nos dois
> modos (ativo `bg-white/10`, hover `sidebar-accent`); badges de status e
> prioridade no padrão **dot** (pílula neutra + ponto colorido — funciona em
> light e dark; antes `*-100/*-700` quebravam no dark); KPIs do dashboard com
> chip de ícone neutro e criticidade no número; paddings unificados
> `p-3 md:p-6` (11 páginas usavam `p-4 md:p-8`). Nenhuma rota, contrato ou
> permissão alterada. Validado logado (admin demo) em dashboard e central.

> **2026-06-12 — Passe de resiliência (plataforma):** API com graceful shutdown
> (SIGTERM → `app.close()` + `prisma.$disconnect()`, força saída em 10s);
> `fetchTrelloBoards`/`fetchTrelloBoard` com timeout de 15s (`AbortSignal.timeout`
> — import não pendura mais o worker se a API do Trello não responder); no k8s,
> rotas web e api ganharam compressão gzip/br na borda (Traefik `compress`) e as
> probes ganharam `timeoutSeconds: 3` (default de 1s flapeava em single-node).
> Nenhuma rota, contrato ou permissão alterada.

> **2026-06-12 — Passe de UX (frontend web apenas):** títulos de aba por rota
> (`(app)/layout.tsx`); sidebar com foco visível, `aria-label`/`aria-current` e
> labels nos botões só-ícone; login com erros acionáveis por status (401/429/5xx/
> rede); estado vazio da Central com botão "Limpar filtros" e orientação; bulk
> update confirma acima de 5 itens; mensagens vazias do `/me` sem emoji e
> contextuais; switch de notificações com `aria-label`; dashboard com
> `scope/aria-sort` nos cabeçalhos ordenáveis; auditoria com tempo relativo
> pt-BR (absoluto no hover); manifest PWA com nome completo/categorias/lang.
> Nenhuma rota, contrato ou permissão alterada.
**Documento de verdade única**: este arquivo + [`docs/backlog.md`](backlog.md) + [`docs/implementation-plan.md`](implementation-plan.md).
**Não declarar produto 100% até** cumprir o [`docs/qa-release-checklist.md`](qa-release-checklist.md).

> ⚠️ **Nota sobre validação**: Em 2026-05-19 o stack Docker local foi validado com `docker-compose.yml`: API saudável em `http://localhost:3001/health`, web saudável em `http://localhost:7480/gymops/login`, login demo funcional (`admin@skyfit.com / gymops123`), dashboard, unidade, central de atividades, perfil, ajuda, integrações, importação, unidades e equipe navegados com sucesso. O acesso público em `http://38.211.146.161:7480/gymops/login` segue dependente de firewall/NAT/rede. A suíte `pnpm --filter @gymops/api test` agora foi validada com PostgreSQL local; depois dela é necessário reaplicar o seed demo antes da validação manual do browser.

**Ambiente local**: API `http://localhost:3001` | Web `http://localhost:7480/gymops/login`
**Ambiente público (alvo)**: frontend `http://<HOST>:7480/gymops/login` | API `http://<HOST>:3001/health`
**Seed (dev)**: admin@skyfit.com / gymops123 — org SkyFit com 3 unidades, 6 áreas, 24 templates

---

## Readiness por bloco (estado após S18–S21)

| Bloco | Estado | Observação |
|---|---|---|
| **Auth (email/senha + refresh + Google OAuth)** | ✅ | Refresh token agora armazenado como SHA-256 hash. Login resolve contexto via `resolveUserContext` (cobre org/unit/área). |
| **RBAC backend** | ✅ | `hasUnitRole()` cobre memberships de área via `unit_areas`. `canCreate()` inclui executor. |
| **Organização (CRUD + wizard + branding)** | ✅ | Logo URL + delivery log com filtros na UI. `/setup` com 4 passos, 6 áreas, 24 templates via `bootstrapOrganization()`. |
| **Unidades** | ✅ | `unit_areas` gerenciável via UI (botão Layers → UnitAreasDialog). |
| **Áreas** | ✅ | `visibilityDefault` editável na UI (select inherited/shared/restricted). |
| **Templates** | ✅ | CRUD completo + starter pack canônico de 24 templates no `bootstrapOrganization()`. |
| **Equipe / Memberships** | ✅ | Lista consolidada org+unit+área. Convite com escopo org/unit/área. Edição de papel inline. Histórico de convites com filtro de status. |
| **Atividades (CRUD + checklist + comments + anexos + history)** | ✅ | Base estável. |
| **Central de Atividades global** | ✅ | Paginação cursor (infinite scroll), saved views, filtros PT, bulk update com organizationId, export CSV com todos os filtros incluindo prioridade. |
| **Integrações (Trello + WhatsApp)** | ✅ | UI mostra health Trello (saudável/degradado), reconnect, status WhatsApp, últimos erros, botões de teste de canal. |
| **Importação Trello** | ✅ | Wizard carrega áreas/unidades reais da API. Deduplicação cross-job via `import_sources`. |
| **Recorrências** | ✅ | CRUD + pause/resume + workers. |
| **Notificações (e-mail + push VAPID + WhatsApp)** | ✅ | Delivery log com filtros canal/status/paginação. |
| **Auditoria** | ✅ | Log paginado com filtros. |
| **Modo Tutorial Guiado** | ✅ | 15 tutoriais, overlay, onboarding, Central de Ajuda. |
| **Profile / Avatar (R2 presign)** | ✅ | Funcional. |
| **Onboarding /setup** | ✅ | 4 passos. Senha mínima 8 chars alinhada com API. 6 áreas + 24 templates criados automaticamente. |
| **Workers** | ✅ | Processo separado, degradação graciosa sem Redis. |
| **Storage R2** | ✅ | Presign + upload + delete. |
| **CI** | ✅ | lint + typecheck + test + build em push/PR. Job adicional `build-gymops` com `NEXT_PUBLIC_APP_BASE_PATH=/gymops`. |
| **E2E (Playwright)** | ✅ | Roda em push main + pull_request → main. Artifact sempre upload (`if: always()`). 6 smoke specs por perfil. |
| **Docker (local + alvo público)** | ✅ | `docker-compose.yml` validado com web em `7480:3000`, api em `3001:3001`, healthchecks de API/web OK e worker estável. |
| **Segurança** | ✅ | Refresh token como SHA-256 hash. CORS via `ALLOWED_ORIGINS` env. localhost ainda allowlisted por conveniência (aceitável). |
| **Documentação** | ✅ | Reconciliada nesta auditoria. |

---

## Bugs P0/P1 — status pós-auditoria de 2026-05-18

| ID | Sev | Status | Evidência |
|---|---|---|---|
| **BUG-001** | P0 | ✅ | `PRIORITY_OPTIONS` usa PT. Labels e filtros alinhados. |
| **BUG-002** | P0 | ✅ | `bulkUpdateMutation` inclui `organizationId`. |
| **BUG-003** | P0 | ✅ | Endpoint `/activities/export` aceita `priority` (corrigido em auditoria). |
| **BUG-004** | P0 | ✅ | `setup/page.tsx` valida `ownerPassword.length < 8`. |
| **BUG-005** | P0 | ✅ | `auth-context.ts` cobre org/unit/área. Teste `auth.login-by-area.test.ts`. |
| **BUG-006** | P0 | ✅ | `canCreate()` inclui executor. |
| **BUG-007** | P1 | ✅ | `hasUnitRole()` via `unit_areas`. Teste `rbac.has-unit-role.test.ts`. |
| **BUG-008** | P1 | ✅ | `refreshTokenHash` no schema. Migration aplicada. Lookup e revogação por hash. |
| **BUG-009** | P1 | ✅ | `docker-compose.public.yml` com healthchecks e `condition: service_healthy`. |
| **BUG-010** | P1 | ⚠️ Parcial | `ALLOWED_ORIGINS` via env funciona. `localhost:3000`/`7480` ainda hardcoded (aceitável para dev). |
| **BUG-011 (OPS-001)** | P1 | 🟡 | Gate real em PR via workflow **raiz** `ci-gymops-e2e.yml` (Forja 4.1 F5, 2026-07-02) — o e2e.yml aninhado nunca executou no monorepo (morto, histórico). 1ª execução expôs BUG-013 (vitest × prom-client) e BUG-014 (import.spec.ts ESM×CJS) — ambos ✅ resolvidos (PR #195), assim como o BUG-015 (locator de login ambíguo — 35/50 testes) e o BUG-016 (asserts defasados: landing por papel, CTA de criação na página da unidade, wizard de import; + resiliência ao rate limit real de /auth/login) que a suite revelou rodando de verdade. |
| **BUG-012 (OPS-002)** | P1 | ✅ | `build-gymops` job no CI. |

---

## Features entregues em S19–S21

| ID | Status | Evidência |
|---|---|---|
| **FEAT-001** | ✅ | `team/page.tsx`: invite escopado org/unit/área, edit role inline, histórico convites. |
| **FEAT-002** | ✅ | `units/page.tsx`: `UnitAreasDialog` — vincular/desvincular/reordenar áreas por unidade. |
| **FEAT-003** | ✅ | `activities/page.tsx`: infinite scroll cursor, saved views, filtros PT, bulk status/priority. |
| **FEAT-004** | ✅ | `/setup` 4 passos + `bootstrapOrganization()` em `apps/api/src/lib/bootstrap-organization.ts`. |
| **FEAT-005** | ✅ | `integrations/page.tsx`: health Trello, reconnect, WhatsApp status/erros, teste canais. |
| **FEAT-006** | ✅ | `import/page.tsx` usa áreas/unidades reais. `import_sources` dedup cross-job. |
| **FEAT-007** | ✅ | `organization/page.tsx`: logo URL + delivery log com filtros. |
| **FEAT-008** | ✅ | `areas/page.tsx`: select `visibilityDefault` no dialog de edição. |
| **FEAT-009** | ✅ | Delivery log com filtros canal/status incluído em `organization/page.tsx`. |
| **OPS-004** | ✅ | 6 smoke specs: owner, org-manager, unit-manager, area-leader, executor, viewer. |

---

## Itens ainda pendentes (P1/P2)

| ID | Prioridade | Descrição |
|---|---|---|
| **BUG-010** | P1 | localhost:3000/7480 ainda hardcoded no CORS (não é bloqueador). |
| **OPS-005** | P1 | `.env.docker.public.example` separado do local (documentar ports e variáveis). |
| **FEAT-010** | P2 | Profile: timezone, prefs por evento, teste WhatsApp contextual. |
| **FEAT-011** | P2 | Saved views compartilhadas por org. |
| **FEAT-012** | P2 | Audit log: filtro por usuário/resource. |
| **OPS-006** | P2 | Sentry (frontend + backend). |
| **OPS-007** | P2 | Postgres performance indexes. |
| **OPS-008** | P2 | Queue stats endpoint `/admin/queues/stats`. |
| **OPS-009** | P2 | Documentação OpenAPI gerada. |
| **FEAT-013** | P2 | Rate limits granulares por endpoint. |

---

## Limitações de validação desta auditoria

| Item | Limitação | Impacto |
|---|---|---|
| Acesso público `/gymops` | O IP `38.211.146.161` não foi alcançavel a partir deste ambiente. | Confirmar externamente apos liberar firewall/NAT nas portas 7480 e 3001. |
| Testes da API + seed demo | A suíte `pnpm --filter @gymops/api test` limpa o banco compartilhado em `localhost:5432`. | Reaplicar `docker compose run --rm api pnpm --filter @gymops/db seed` antes do login manual. |

---

## Linha do tempo das sprints

| Sprint | Conteúdo | Estado |
|---|---|---|
| 1–8 | Motor transacional (auth, org, unit, area, activities, recorrência, notificações, IA, Trello, hardening) | ✅ Concluída |
| 9–16 | Camada administrativa de frontend | ✅ Concluída |
| 17 | Modo Tutorial Guiado | ✅ Concluída |
| **18** | Estabilização crítica (BUG-001..008, BUG-009, BUG-010) | ✅ Concluída |
| **19** | Profundidade administrativa (FEAT-001..004) | ✅ Concluída |
| **20** | Operação e integrações (FEAT-005..009) | ✅ Concluída |
| **21** | QA e readiness (OPS-001..004, CI, Docker, smoke) | ✅ Concluída — **pendentes P2 e validação runtime** |

**Readiness**: código validado (lint ✅, typecheck ✅, build ✅). Testes de integração aguardam ambiente com PostgreSQL. Sem blockers P0 conhecidos.

Detalhes em [`docs/product-roadmap.md`](product-roadmap.md) e [`docs/sprints.md`](sprints.md).

---

## Plataforma de IA — F5 (2026-06-11)

- **Feedback 👍/👎 no chat**: modelo `AiFeedback` (`ai_feedback`, migration `20260611200000_ai_feedback` — **pendente de aplicar no cluster**), rota `POST /ai/feedback` (upsert por thread+mensagem+usuário, métrica `countFeedback`, fire-and-forget para o control-plane) e botões no `AiChatWidget`.
- **Primeira tool MUTANTE** `create_activity` (R3, dry-run + confirmação): a IA resolve unidade/área por NOME, aplica o MESMO RBAC do `POST /activities` (`hasUnitRole`), devolve PRÉVIA assinada (HMAC, `ai/graph/pending-actions.ts`, exp 10min) e só executa via `POST /ai/confirm` após clique do usuário — "IA nunca salva direto" preservado (o clique É o salvar).
- **Prompt do especialista `ops` via control-plane**: `refreshSpecialistPrompt()` busca `GET /v1/prompts/gymops.chat.system/active` a cada 60s (timeout 2s; fallback inline). Envs opcionais: `AI_CONTROL_PLANE_URL` / `AI_CONTROL_PLANE_TOKEN`.
- **Eval**: golden set ganhou `gym-graph-005/006` (criação → prévia+confirmação); `ai-eval.mjs --graph` cobre a tool mutante (dispatch real em dry-run). Gates `--enforce-kpis` verdes (12/12 mock, 6/6 graph).
