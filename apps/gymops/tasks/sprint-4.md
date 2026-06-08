# Sprint 4 — Templates, Recorrência e Notificações

**Duração**: 2 semanas  
**Objetivo**: Rotina operacional com tração real. Criação padronizada, tarefas automáticas, alertas.  
**Pré-requisito**: Sprint 3 completa.  
**Resultado**: MVP utilizável em piloto ao fim desta sprint.

**Estado atual (2026-05-15)**: ~50% completo. Templates OK, recorrência parcial, notificações pendentes.  
**Itens pendentes** foram movidos para [`tasks/sprint-7.md`](sprint-7.md).

---

## Backend — Templates ✅ Feito

- [x] Migration: `activity_templates`
- [x] CRUD: `GET/POST/PATCH /activity-templates`
- [x] Soft delete via `deletedAt` (não campo `isActive`)
- [x] Ao `POST /activities` com `templateId`:
  - [x] Pré-criar checklist com `config.defaultChecklist`
  - [x] Aplicar `defaultPriority` se priority não informada
  - [x] Aplicar `defaultVisibility` se visibilityMode não informado
  - [x] Calcular `dueAt = now() + suggestedSlaDays` se dueAt não informado
- [ ] Seed de 24 templates padrão para as 6 áreas — **→ Sprint 7**
- [ ] `DELETE /activity-templates/:id` — **→ Sprint 7**

Estrutura de `config_jsonb` implementada:
```json
{
  "defaultChecklist": ["item 1", "item 2"],
  "defaultPriority": "alta",
  "defaultVisibility": "inherited",
  "suggestedSlaDays": 3,
  "specificFields": ["equipment", "supplier"],
  "aiContextHint": "chamado de manutenção de equipamento"
}
```

**Atenção**: ao usar `ActivityTemplate` com relação `area`, usar `include`, não `select`:
```typescript
include: { area: { select: { key: true } } }  // ✅
select: { area: { select: { key: true } } }   // ❌
```

## Backend — Recorrência ⚠️ Parcial

- [x] Migration: `recurrence_rules`
- [x] Schema `RecurrenceRule` completo (frequency, interval, daysOfWeek, mode, nextRunAt)
- [x] Worker `recurrence-worker.ts` (cron horário, cálculo de nextRunAt)
- [ ] `POST /activities/:id/recurrence` — criar/atualizar regra — **→ Sprint 7**
- [ ] `DELETE /activities/:id/recurrence` — remover regra — **→ Sprint 7**
- [ ] Modo `pre_generate` (gerar N ocorrências de uma vez) — **→ Sprint 7**
- [ ] Evento `recurrence_triggered` no worker — **→ Sprint 7**

## Backend — Notificações ❌ Pendente Sprint 7

- [ ] Migration: `notification_preferences`, `fcm_subscriptions`, coluna `users.phone`
- [ ] Templates e-mail React Email: `activity_assigned`, `due_reminder`, `overdue`, `invite`
- [ ] `apps/api/src/lib/firebase.ts` — inicializar Firebase Admin
- [ ] `POST /notifications/subscribe` — salvar FCM token
- [ ] `PATCH /notification-preferences/:userId`
- [ ] Worker `notification-worker.ts` (e-mail + push + WhatsApp)
- [ ] Crons BullMQ: `due-reminder` (08h), `overdue` (09h)
- [ ] Hook: ao criar atividade com assignees → enfileirar `activity_assigned`

---

## Frontend — Templates ✅ Feito

- [x] Seletor de template ao criar atividade (dropdown filtrado por área)
- [x] Pré-preenchimento dos campos ao selecionar template
- [ ] Preview do template ao selecionar (checklist, prioridade, SLA) — **melhoria futura**
- [ ] Página `/settings/templates` (para `org_manager`) — **→ Sprint 7**

## Frontend — Recorrência ❌ Pendente Sprint 7

- [ ] Modal "Configurar Recorrência" (ver wireframe em `docs/wireframes.md` seção 7)
- [ ] Badge "↻ Recorrente" nos cards
- [ ] Toast ao concluir atividade recorrente

## Frontend — Notificações ❌ Pendente Sprint 7

- [ ] Página `/settings/notifications` com toggles por canal
- [ ] Solicitar permissão push na primeira visita pós-login
- [ ] Badge de notificações não lidas no header

---

## Regras de responsividade para esta sprint

Todo novo componente desta sprint deve funcionar em mobile e desktop:
- Modal de Recorrência: `max-h-[90vh] overflow-y-auto`; checkboxes dos dias como grid 7 cols em mobile
- Página de Notificações: `p-3 md:p-6`, toggles como lista vertical em mobile
- Página de Templates: `p-3 md:p-6`, tabela com `overflow-x-auto`
- Toast: posicionar em `bottom-4` em mobile, `top-4` em desktop

---

## Testes previstos → Sprint 7

- [ ] Criar atividade com template → checklist criado automaticamente
- [ ] Worker recorrência: atividade gerada no `next_run_at` correto
- [ ] Worker recorrência: modo `on_complete` não gera antes de concluir
- [ ] E-mail enviado ao criar atividade com assignee
- [ ] Preferência de notificação respeitada (desabilitado → não enfileira)
