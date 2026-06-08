# Sprint 5 — Importador Trello e WhatsApp

**Duração**: 2 semanas  
**Objetivo**: Migrar boards existentes e ativar alertas WhatsApp.  
**Pré-requisito**: Sprint 4 completa.

**Estado atual (2026-05-15)**: ~60% completo. Dry-run funciona com JSON. Commit atômico e OAuth Trello pendentes.  
**Itens pendentes** foram movidos para [`tasks/sprint-7.md`](sprint-7.md).

---

## Backend — Integrações (base) ⚠️ Parcial

- [x] Migrations: `integration_accounts`, `import_jobs`, `import_items`
- [ ] `apps/api/src/lib/crypto.ts` — AES-256-GCM para `auth_jsonb` — **→ Sprint 7**

## Backend — OAuth Trello ❌ Pendente Sprint 7

- [ ] `GET /integrations/trello/start` — redirect para Trello OAuth
- [ ] `GET /integrations/trello/callback` — trocar token, salvar criptografado em `integration_accounts`
- [ ] `GET /integrations/trello/boards` — listar boards da conta conectada
- [ ] `DELETE /integrations/trello` — revogar e remover tokens

## Backend — Worker de Importação ⚠️ Parcial

- [x] `apps/api/src/workers/import-worker.ts` com BullMQ
- [x] `POST /imports/trello` → enfileirar job, retornar `importJobId`
- [x] `GET /imports/:id` → status atual + progresso
- [x] `GET /imports/:id/preview` → dry-run com mapeamento sugerido
- [x] `PATCH /imports/:id/mapping` → salvar decisões do wizard
- [x] Processador JSON (`processor.ts`) — dry-run funciona
- [x] `area-matcher.ts` — heurística de mapeamento list → área por keywords
- [ ] `POST /imports/:id/commit` — transaction atômica com mapeamento revisado — **→ Sprint 7**
- [ ] Tratamento de rate limit Trello (retry + exponential backoff) — **→ Sprint 7**
- [ ] Upload JSON: endpoint multipart `POST /imports/trello/upload` — **verificar se existe**
- [ ] Download e re-hospedagem de attachments no R2 (< 10MB) — **dependente do R2Client Sprint 7**
- [ ] E-mail de relatório ao concluir importação — **dependente de notificações Sprint 7**
- [ ] Evento `imported` em cada atividade criada — **→ Sprint 7**

**Armadilhas conhecidas no processador**:
```typescript
// Sempre usar ?? [] para arrays opcionais do JSON Trello
const actions = board.actions ?? [];
const cards = board.cards ?? [];
const members = board.members ?? [];
// Cast de Prisma JSON — SEMPRE double-cast
boardData as unknown as TrelloBoard
job.source as unknown as { mode: string; boards?: TrelloBoard[] }
```

## Backend — Mapeamento de entidades Trello

- [x] Board → Unit
- [x] List → Area (via area-matcher ou wizard)
- [x] Card → Activity
- [x] Card members → ActivityAssignee (por email)
- [x] Comments (actions type=commentCard) → ActivityComment
- [x] Checklists + checkItems → ActivityChecklist + ActivityChecklistItem
- [ ] Attachments → ActivityAttachment (< 10MB: R2; ≥ 10MB: link externo) — **→ Sprint 7**
- [x] Labels → `metadata_jsonb.labels`
- [x] Archived cards → status = cancelado
- [x] Archived lists → indicar na preview como "arquivado"

## Backend — WhatsApp (Twilio) ⚠️ Configurado, não integrado

- [x] `apps/api/src/notifications/whatsapp.service.ts` com `sendWhatsApp()`
- [ ] Canal `whatsapp` no worker de notificações — **→ Sprint 7**
- [ ] Enfileirar WhatsApp para atividade crítica criada com assignee — **→ Sprint 7**
- [ ] Enfileirar WhatsApp para prazo vencido em atividade crítica — **→ Sprint 7**

---

## Frontend — Importação ⚠️ Parcial

- [x] Rota `/settings/import`
- [x] Passo 1 — Escolher modo (OAuth ou JSON upload)
- [x] Upload JSON com drag-and-drop
- [x] Passo 3 — Preview + Wizard de revisão (mapeamento de listas)
- [x] Botão "Confirmar e importar"
- [ ] Passo 2 — Seleção de boards via OAuth — **dependente OAuth Trello Sprint 7**
- [ ] Passo 4 — Barra de progresso durante commit (polling) — **→ Sprint 7**
- [ ] Passo 5 — Relatório final (criados/ignorados/falhas) — **→ Sprint 7**

## Frontend — Integrações ✅ Feito

- [x] Rota `/settings/integrations` com card de status de cada integração
- [ ] Conectar/desconectar Trello via OAuth — **dependente OAuth Sprint 7**
- [ ] Campo "Número WhatsApp" no perfil — **→ Sprint 7**

---

## Regras de responsividade para esta sprint

- Wizard de importação: `p-3 md:p-6`, cada passo em card full-width em mobile
- Upload JSON: área drag-and-drop com `min-h-[120px]`, toque funciona em mobile (input file)
- Tabela de mapeamento (listas → tipo): `overflow-x-auto`, selects com largura mínima
- Barra de progresso: simples em mobile, sem colunas laterais
- Relatório final: lista vertical em mobile, sem tabela

---

## Testes previstos → Sprint 7

- [ ] Importar board JSON de 50 cards → verificar todos criados
- [ ] Wizard remapeia lista "Janeiro" → type=ignore → cards não importados
- [ ] Card com checklist → checklist preservado com estado done
- [ ] Attachment > 10MB → salvo como link externo
- [ ] Usuário com email Trello mas sem conta GymOps → atividade sem assignee + import_item.status = failed
- [ ] Importação duplicada do mesmo board → alerta antes de prosseguir
- [ ] Mensagem WhatsApp enviada para atividade crítica
