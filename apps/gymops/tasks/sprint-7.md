# Sprint 7 — Fechar Gaps de Implementação

**Duração**: 2 semanas  
**Objetivo**: Completar todos os itens de implementação do MVP funcional.  
**Pré-requisito**: Sprints 1–6 implementados.  
**Resultado**: Todos os módulos funcionais implementados. Produto pronto para Sprint 8 (hardening).

Ver estado de operações em [`docs/status.md`](../docs/status.md).

---

## Estado final (2026-05-15): ✅ Concluído

| Item | Estado |
|------|--------|
| R2 Storage (inline no attachments route) | ✅ Feito |
| Google OAuth (`auth/index.ts` com fetch nativo) | ✅ Feito |
| Notificações e-mail / push / WhatsApp + worker | ✅ Feito |
| Recorrência API (POST/DELETE) + UI + worker | ✅ Feito |
| crypto.ts (AES-256-GCM para auth_jsonb) | ✅ Feito |
| delay-scan-worker (hourly, flags Redis, overdue) | ✅ Feito |
| ai-summary-worker (tick horário, envia às 07h) | ✅ Feito |
| Seed de 24 templates (4 × 6 áreas) | ✅ Feito |
| Testes de integração API (vitest, 6 suítes) | ✅ Feito |
| Trello OAuth routes | ❌ Movido para Sprint 8 (P1) |
| Import progress bar + relatório final | ❌ Movido para Sprint 8 (P1) |

---

## 1. Cloudflare R2 ✅

R2Client em `apps/api/src/routes/attachments/index.ts` via `getR2Client()`.  
Retorna graceful `{ uploadUrl: null }` quando variáveis R2_* ausentes.

---

## 2. Google OAuth ✅

`GET /auth/google/start` e `GET /auth/google/callback` em `routes/auth/index.ts` com fetch nativo.  
**Nota**: callback redireciona com `?token=` na URL — corrigir em Sprint 8 (P0).

---

## 3. Notificações ✅

- `lib/mailer.ts` — sendActivityAssigned, sendDueReminder, sendOverdueAlert
- `lib/push.ts` — web-push VAPID (não Firebase FCM)
- `lib/whatsapp.ts` — Twilio
- `workers/notification-worker.ts` — BullMQ + crons 08h/09h
- `routes/notifications/index.ts` — /vapid-key, /preferences, /subscribe, /test
- Hook em `POST /activities` → enfileira `activity_assigned` para non-creator assignees

---

## 4. Recorrência ✅

Backend: `POST /activities/:id/recurrence` + `DELETE /activities/:id/recurrence`.  
Modos: `on_complete` (ao concluir) + `pre_generate` (cron horário).  
Frontend: `RecurrenceModal` no `ActivityDrawer.tsx` + badge `↻` no `ActivityCard.tsx`.

---

## 5. Workers ✅

| Worker | Arquivo | Comportamento |
|--------|---------|---------------|
| recurrence-worker | `workers/recurrence-worker.ts` | Hourly; gera próxima atividade via on_complete ou pre_generate |
| notification-worker | `workers/notification-worker.ts` | BullMQ; crons 08h/09h; e-mail+push+WA |
| import-worker | `workers/import-worker.ts` | dry_run + commit via BullMQ |
| ai-summary-worker | `workers/ai-summary-worker.ts` | Hourly tick; gera às 07h |
| delay-scan-worker | `workers/delay-scan-worker.ts` | Hourly; flags Redis TTL 2h; enfileira overdue |

Todos registrados em `apps/api/src/index.ts`. **Nota**: rodam no mesmo processo da API — separar em Sprint 8 (P1).

---

## 6. Seed de 24 templates ✅

`packages/db/prisma/seed.ts` — 4 templates por área × 6 áreas padrão.

---

## 7. Testes de integração API ✅

Configuração: `apps/api/vitest.config.ts` + `src/test/setup.ts` + `src/test/helpers.ts`.

| Suíte | Cobertura |
|-------|-----------|
| `auth.test.ts` | Register, login, me, logout, membership scope |
| `rbac.test.ts` | unit_manager isolation, restricted visibility, status transitions |
| `recurrence.test.ts` | POST/DELETE rule, weekly weekdays, upsert, on_complete generation |
| `import.test.ts` | Dry-run preview, commit 50 cards, ignore list, checklist preservation |
| `ai.test.ts` | Fallback, rate limit 429, restricted not leaked, daily summary null |
| `notifications.test.ts` | activity_assigned, self-skip, delay-scan dedup, priority filter |

---

## 8. Trello OAuth ❌ → Sprint 8

Movido para Sprint 8 (P1). Ver `tasks/sprint-8.md` seção 5.

---

## 9. Import progress bar + relatório ❌ → Sprint 8

Movido para Sprint 8 (P1). Ver `tasks/sprint-8.md` seção 6.

---

## Critério de aceitação da Sprint 7

- [x] Upload de PDF em uma atividade → aparece na lista (R2 com env vars)
- [x] Login com Google funciona end-to-end
- [x] Criar atividade com assignee → notificação enfileirada (não para o criador)
- [x] Notificação push: subscribe + send via web-push VAPID
- [x] Recorrência semanal configurada → nova atividade gerada ao concluir
- [x] delay-scan: atividade atrasada critica/alta → overdue enfileirado (1x/2h)
- [x] 24 templates disponíveis ao criar atividade
- [x] 6 suítes de testes de integração API escritas e tipagem correta (0 erros TS)
- [ ] Trello OAuth connect → Movido Sprint 8
- [ ] Import progress bar → Movido Sprint 8
