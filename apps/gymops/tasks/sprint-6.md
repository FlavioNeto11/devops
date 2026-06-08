# Sprint 6 — IA Estruturada + Mobile

**Duração**: 2 semanas  
**Objetivo**: MVP superior ao Trello no uso diário: criação inteligente, alertas automáticos, totalmente responsivo.  
**Pré-requisito**: Sprint 5 completa.  
**Resultado**: MVP comercialmente convincente para substituir Trello.

**Estado atual (2026-05-15)**: ~80% completo. IA funcional, mobile 100%, crons pendentes.  
**Itens pendentes** foram movidos para [`tasks/sprint-7.md`](sprint-7.md).

---

## Backend — Setup IA ✅ Feito

- [x] OpenAI SDK (`openai` npm package v4+)
- [x] `apps/api/src/ai/ai.service.ts`:
  - [x] `callAI(fn, fallback, timeoutMs = 10_000)` — timeout + fallback gracioso
  - [x] `callAIAsync(fn, fallback)` — 60s para workers
  - [x] `chatJSON(client, prompt, model)` — `json_object` response format
  - [x] Rate limiting 10 req/min via Redis
- [x] Schemas Zod: `ActivityDraftSchema`, `ChecklistSuggestionSchema`, `DelayAnalysisSchema`, `DailySummarySchema`
- [x] Prompts versionados em `apps/api/src/ai/prompts/`:
  - [x] `activity-draft.prompt.ts`
  - [x] `checklist.prompt.ts`
  - [x] `daily-summary.prompt.ts`
  - [x] `delay-analysis.prompt.ts`

**Regra crítica**: nunca enviar conteúdo de atividades `restricted` ao LLM.  
**Fallback**: sempre retornar fallback determinístico — jamais propagar erro de IA para o cliente.

## Backend — Endpoints IA ✅ Feito

- [x] `POST /ai/activities/draft` — texto → rascunho ActivityDraftSchema
- [x] `POST /ai/activities/checklist` — atividade → sugestões ChecklistSuggestionSchema
- [x] `POST /ai/activities/delay-analysis` — atividade → DelayAnalysisSchema
- [x] `POST /ai/summaries/daily` — trigger manual (usado para teste)
- [x] `GET /ai/summaries/daily?unitId=` — ler cache Redis
- [x] Rate limit: 10 req/min por userId em todos os `/ai/*`

## Backend — Workers IA ⚠️ Parcial

- [x] `apps/api/src/workers/ai-summary-worker.ts` — estrutura criada
- [ ] Cron BullMQ repeatable `{ pattern: '0 7 * * *', tz: 'America/Sao_Paulo' }` — **→ Sprint 7**
- [ ] Gerar e enviar para todas as unidades com unit_manager ativo — **→ Sprint 7**
- [ ] E-mail + WhatsApp após geração — **→ Sprint 7**
- [ ] Worker `delay-scan-worker.ts` — **→ Sprint 7**
  - Cron a cada hora
  - Flags em Redis: `delay:activity:{id}` TTL 2h
  - Notificar unit_manager para atividades críticas recém-atrasadas (1x)
- [ ] Logging de chamadas IA (duração, tokens, sem conteúdo) — **→ melhoria futura**

---

## Frontend — Criação com IA ✅ Feito

- [x] Botão "✨ Criar com IA" ao lado de "Nova atividade" na visão da unidade
- [x] `AiDraftDialog.tsx`:
  - [x] Passo 1: textarea com texto livre + Ctrl+Enter para submeter
  - [x] Passo 2: rascunho editável (título, descrição, prazo, área, prioridade)
  - [x] Badge de confiança (verde ≥70%, âmbar <70%)
  - [x] Confirmar → `POST /activities` normal
  - [x] `max-h-[90vh] overflow-y-auto` — funciona em mobile
- [x] Fallback se IA falhar: toast informativo + modal fecha

## Frontend — Checklist com IA ✅ Feito

- [x] `ChecklistSuggestPanel.tsx` no ActivityDrawer (quando total de items = 0)
- [x] Loading state durante chamada IA
- [x] Lista de sugestões com checkboxes
- [x] `onAddItems(items)` → cria checklist "Sugestões da IA" + adiciona items

## Frontend — Painel de atrasos com IA ✅ Feito

- [x] Seção "Atividades Atrasadas" no painel geral com botão "🧠 Analisar"
- [x] `DelayAnalysisModal.tsx`:
  - [x] riskLevel badge (low/medium/high/critical)
  - [x] summary + possibleReasons + suggestedActions
  - [x] `max-h-[90vh] overflow-y-auto`

## Frontend — Resumo diário ✅ Feito

- [x] `DailySummaryBadge.tsx` na visão por unidade
- [x] Pill badge violeta quando resumo disponível
- [x] Modal com texto + highlights + alertCount
- [x] `max-h-[90vh] overflow-y-auto`

---

## Mobile — Adaptação responsiva ✅ 100% Feito

- [x] **`apps/web/src/components/layout/sidebar.tsx`**:
  - `fixed inset-y-0 left-0 z-50` no mobile, `md:relative md:translate-x-0` no desktop
  - `mobileOpen` prop controla `-translate-x-full` / `translate-x-0`
  - Backdrop overlay `fixed inset-0 z-40 bg-black/50 md:hidden`
  - Collapse toggle `hidden md:flex` (não aparece no mobile)
  - Todos os links chamam `onMobileClose?.()` ao clicar

- [x] **`apps/web/src/app/(app)/layout.tsx`**:
  - Top bar mobile `md:hidden` com hamburger + nome da org
  - `mobileNavOpen` state + `Menu` icon
  - Outer div `flex flex-col h-screen` (não mais flex-row no mobile)
  - Body div `flex flex-1 overflow-hidden`

- [x] **`apps/web/src/app/(app)/settings/layout.tsx`**:
  - Mobile: tabs horizontais scroll `overflow-x-auto flex gap-1 border-b md:hidden`
  - Desktop: sidebar vertical `hidden md:block w-52`

- [x] **`ActivityDrawer.tsx`**:
  - Overlay (click-to-close) `hidden flex-1 md:block`
  - Drawer `w-full md:max-w-2xl` (full-screen no mobile)
  - Modais internos `max-h-[90vh] overflow-y-auto`

- [x] **Todas as páginas**: `p-3 md:p-6`
  - `/dashboard`, `/units/[id]`, `/me`, `/settings`, `/settings/import`, `/settings/integrations`

- [x] **Tabelas**: `overflow-x-auto` + `<div>` wrapper
- [x] **Tabs em `/me`**: `overflow-x-auto` + `min-w-max` container + `whitespace-nowrap` buttons
- [x] **Header `/units/[id]`**: `flex-wrap items-start`
- [x] **AI modals**: `max-h-[90vh] overflow-y-auto`

---

## Regras de responsividade (mantidas para próximas sprints)

Ver `CLAUDE.md` seção "Layout e responsividade — REGRA CRÍTICA":
- Breakpoint `md:` para tudo. Mobile-first na base.
- Todo modal/drawer: `max-h-[90vh] overflow-y-auto`
- Todo `p-6` isolado → `p-3 md:p-6`
- Toda tabela → `overflow-x-auto`
- Sidebar sempre via `mobileOpen`/`onMobileClose` props

---

## Testes previstos → Sprint 7

- [ ] `POST /ai/activities/draft` → retorna área = manutenção para texto sobre infiltração
- [ ] Resposta válida contra ActivityDraftSchema (Zod)
- [ ] IA com timeout → fallback retorna sem error 500
- [ ] Rate limit: 11ª req em 1min → 429
- [ ] Atividade `restricted` → dados não enviados ao LLM
- [ ] Worker delay-scan: atividade vencida há 2 dias → flag em Redis
- [ ] Worker resumo: não inclui títulos de atividades restricted
