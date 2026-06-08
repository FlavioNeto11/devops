# Sprint 2 — Atividade como Núcleo

**Duração**: 2 semanas  
**Objetivo**: Sistema substitui Trello em operação básica.  
**Pré-requisito**: Sprint 1 completa.  
**Resultado esperado**: Criar atividade com checklist, comentar, anexar arquivo, ver histórico.

---

## Backend — packages/db

- [ ] Migrations: `activities`, `activity_assignees`, `activity_permissions`
- [ ] Migrations: `activity_checklists`, `activity_checklist_items`
- [ ] Migrations: `activity_comments`, `activity_attachments`
- [ ] Migration: `activity_events` (imutável — sem update/delete)
- [ ] Enums: ActivityStatus, ActivityPriority, VisibilityMode, AssigneeKind, AccessLevel
- [ ] Índices compostos: `activities(org_id, unit_id, status, due_at)`, `activity_events(activity_id, created_at)`
- [ ] Seed: 5-10 atividades de exemplo por área na unidade seed

## Backend — apps/api

### Atividades
- [ ] `GET /activities` — listar com filtros: unitId, areaId, status, priority, assigneeId, overdue
  - Calcular campo virtual `isOverdue` na query (`due_at < now() AND status NOT IN (concluido, cancelado)`)
  - Incluir: assignees (nome), checklistProgress (done/total)
  - Paginação por cursor
- [ ] `POST /activities` — criar atividade
  - Validar que unitId pertence à organização do usuário
  - Criar evento `created` em `activity_events`
  - Notificar assignees (enfileirar — job virá na Sprint 4)
- [ ] `GET /activities/:id` — detalhe completo
  - Incluir: checklists com items, assignees, contagem de comentários, attachments, último evento
- [ ] `PATCH /activities/:id` — atualizar campos
  - Gerar eventos de auditoria para cada campo alterado (status_changed, priority_changed, etc.)
  - Validar transição de status (não permitir de `concluido` para `novo` diretamente)
- [ ] `POST /activities/:id/assign` — atribuir/remover responsáveis
- [ ] `POST /activities/:id/share` — compartilhar atividade (criar `activity_permission`)

### Checklist
- [ ] `POST /activities/:id/checklists` — criar bloco (com items iniciais opcionais)
- [ ] `PATCH /checklists/:id` — editar título do bloco
- [ ] `DELETE /checklists/:id` — remover bloco (cascade items)
- [ ] `POST /checklists/:id/items` — adicionar item
- [ ] `PATCH /checklist-items/:id` — marcar/desmarcar, editar texto, reordenar
  - Ao marcar: registrar `doneBy`, `doneAt`
  - Gerar evento `checklist_checked` na atividade
- [ ] `DELETE /checklist-items/:id` — remover item

### Comentários
- [ ] `GET /activities/:id/comments` — listar (paginado, mais recentes primeiro)
- [ ] `POST /activities/:id/comments` — comentar
  - Criar evento `commented` em `activity_events`
- [ ] `PATCH /comments/:id` — editar (apenas autor, em até 15min após criação)
- [ ] `DELETE /comments/:id` — soft delete

### Anexos
- [ ] `POST /activities/:id/attachments/presign`
  - Validar MIME type (lista allowlist: imagens, PDF, xlsx, docx, csv, zip)
  - Validar tamanho máximo (10MB)
  - Gerar presigned PUT URL do R2 com expiração de 5min
  - Retornar `objectKey` e `uploadUrl`
- [ ] `POST /activities/:id/attachments` — registrar após upload confirmado
  - Criar evento `attached` em `activity_events`
- [ ] `GET /activities/:id/attachments` — listar com presigned GET URLs (exp 1h)
- [ ] `DELETE /attachments/:id` — soft delete (não deletar do R2 ainda)

### Histórico
- [ ] `GET /activities/:id/events` — timeline (paginado, mais recentes primeiro)
  - Incluir: actorId, eventType, payload, createdAt
  - Enriquecer com nome do ator

## Frontend — apps/web

### Lista de atividades
- [ ] Componente `ActivityCard` — card compacto:
  - Título, badge de status, badge de prioridade
  - Responsável (avatar + nome), prazo, progresso do checklist
  - Indicador visual de atraso (borda/cor vermelha)
  - Indicador de criticidade (ícone vermelho)
- [ ] Agrupamento por área na visão de unidade (accordion/seção colapsável)
- [ ] Filtros funcionais: Área, Status, Prioridade, Responsável, toggle Atrasadas
- [ ] Botão "Nova atividade" → abrir formulário

### Formulário de criação de atividade
- [ ] Campos: título (obrigatório), descrição, área (select), responsável (user search), participantes, prazo (datepicker), prioridade, visibilidade
- [ ] Validação client-side com React Hook Form + Zod
- [ ] Submit → POST /activities → fechar e abrir drawer da nova atividade

### Drawer de atividade (componente central)
- [ ] Abrir como slide-over (drawer lateral) ao clicar em qualquer card
- [ ] Header:
  - Título editável inline (click-to-edit)
  - Dropdown de status
  - Dropdown de prioridade
  - Badge "Atrasada" quando aplicável
  - Menu "..." (editar, excluir, compartilhar, configurar recorrência)
- [ ] Metadados (layout 2 colunas):
  - Unidade, Área, Template (se tiver)
  - Responsável (avatar, clicável para mudar)
  - Participantes (avatares, botão +)
  - Prazo (datepicker inline)
  - Visibilidade (ícone + label)
- [ ] Seção Checklist:
  - Lista de blocos com título
  - Items com checkbox, texto editável, botão deletar
  - Botão "+ Adicionar item" por bloco
  - Botão "+ Novo bloco de checklist"
  - Barra de progresso (X/Y itens concluídos)
- [ ] Seção Comentários:
  - Textarea para novo comentário
  - Lista de comentários com avatar, nome, tempo relativo
  - Opção editar/excluir para comentários próprios (menu ...)
  - Auto-scroll para mais recente
- [ ] Seção Anexos:
  - Área de drag-and-drop para upload
  - Lista com ícone de tipo, nome, tamanho, botão baixar
  - Validação de tamanho/tipo no frontend (antes do presign)
  - Progress bar durante upload
- [ ] Seção Histórico:
  - Timeline vertical com ícone por tipo de evento
  - "Sistema" para eventos automáticos
  - Paginação "Ver mais"

### Outros
- [ ] Toast de confirmação para todas as ações (criar, editar, comentar, marcar checklist)
- [ ] Empty state para unidade sem atividades
- [ ] Skeleton loading em todas as listas

## Testes

- [ ] Teste integração: CRUD completo de atividade
- [ ] Teste: presign URL → upload R2 → registrar anexo
- [ ] Teste: histórico de eventos gerado corretamente ao alterar status
- [ ] Teste: marcar checklist item → evento criado
