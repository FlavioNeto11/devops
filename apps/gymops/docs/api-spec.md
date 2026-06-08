# API Specification — REST Endpoints

## Convenções

- Base URL: `https://api.gymops.com/v1`
- Autenticação: `Authorization: Bearer <access_token>` em todos os endpoints protegidos
- Resposta padrão: `{ "data": ..., "meta"?: { pagination } }`
- Erro padrão: `{ "error": { "code": string, "message": string, "details"?: any } }`
- Paginação por cursor: `?after=<cursor>&limit=<n>` (máx 100)
- Timestamps: ISO 8601 UTC (`2024-05-14T10:30:00Z`)
- IDs: UUID v4

---

## Auth

### `POST /auth/login`
Login por credenciais (email + senha).

**Body**: `{ "email": string, "password": string }`

**Response 200**:
```json
{
  "data": {
    "accessToken": "eyJ...",
    "expiresIn": 900,
    "user": { "id": "uuid", "name": "João", "email": "joao@gym.com" }
  }
}
```
Refresh token em cookie httpOnly `refresh_token`.

---

### `POST /auth/refresh`
Renovar access token usando refresh token no cookie.

**Response 200**: mesmo formato do login.

---

### `POST /auth/logout`
Revogar sessão atual.

**Response 204**: sem body.

---

### `GET /auth/google/start`
Redirecionar para Google OAuth.

**Query**: `?redirectUri=string`

**Response 302**: redirect para Google.

---

### `GET /auth/google/callback`
Callback do Google OAuth.

**Query**: `?code=string&state=string`

**Response 302**: redirect para o frontend com `?token=...` ou cookie.

---

## Organizações

### `GET /organizations/:id`
Detalhe da organização (requer `org_manager` ou superior).

**Response 200**:
```json
{
  "data": {
    "id": "uuid", "name": "SkyFit", "slug": "skyfit",
    "logoUrl": null, "settings": {}
  }
}
```

### `PATCH /organizations/:id`
Editar dados da organização (requer `owner`).

**Body**: `{ "name"?: string, "logoUrl"?: string, "settings"?: object }`

---

## Unidades

### `GET /units`
Listar unidades da organização.

**Query**: `?organizationId=uuid&status=active|inactive`

**Response 200**:
```json
{
  "data": [
    { "id": "uuid", "name": "Vila Xavier", "code": "VX", "status": "active" }
  ],
  "meta": { "total": 15 }
}
```

### `POST /units`
Criar unidade (requer `org_manager`).

**Body**: `{ "organizationId": "uuid", "name": string, "code"?: string, "address"?: string }`

### `GET /units/:id`
Detalhe da unidade com áreas ativadas.

### `PATCH /units/:id`
Editar unidade (requer `unit_manager` ou superior).

**Body**: `{ "name"?: string, "code"?: string, "status"?: string }`

---

## Áreas

### `GET /areas`
Catálogo de áreas da organização.

**Query**: `?organizationId=uuid`

### `POST /areas`
Criar área (requer `org_manager`).

**Body**: `{ "organizationId": "uuid", "name": string, "key": string, "color"?: string, "visibilityDefault"?: "inherited"|"restricted"|"shared" }`

### `POST /units/:id/areas`
Ativar área em uma unidade.

**Body**: `{ "areaId": "uuid", "order"?: number }`

### `DELETE /units/:id/areas/:areaId`
Desativar área na unidade.

---

## Memberships (RBAC)

### `GET /memberships`
Listar memberships.

**Query**: `?organizationId=uuid&userId=uuid&scopeType=organization|unit|area&scopeId=uuid`

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid", "userId": "uuid", "role": "unit_manager",
      "scopeType": "unit", "scopeId": "uuid", "user": { "name": "Maria" }
    }
  ]
}
```

### `POST /memberships`
Conceder papel a usuário.

**Body**:
```json
{
  "organizationId": "uuid",
  "userId": "uuid",
  "role": "unit_manager",
  "scopeType": "unit",
  "scopeId": "uuid"
}
```

### `DELETE /memberships/:id`
Revogar papel (soft delete).

---

## Templates de Atividade

### `GET /activity-templates`
Listar templates.

**Query**: `?organizationId=uuid&areaId=uuid`

### `POST /activity-templates`
Criar template (requer `org_manager`).

**Body**:
```json
{
  "organizationId": "uuid",
  "areaId": "uuid",
  "name": "Chamado de Manutenção",
  "description": "Template para chamados de equipamentos",
  "config": {
    "defaultChecklist": ["Fotografar equipamento", "Solicitar 2 orçamentos", "Aprovar fornecedor"],
    "defaultPriority": "alta",
    "defaultVisibility": "inherited",
    "suggestedSlaDays": 3,
    "specificFields": ["equipment", "location", "supplier", "criticality"]
  }
}
```

### `PATCH /activity-templates/:id`
Editar template.

---

## Atividades

### `GET /activities`
Listar atividades com filtros (aplicar RBAC automaticamente).

**Query**:
```
?organizationId=uuid
&unitId=uuid
&areaId=uuid
&status=novo|em_andamento|aguardando_terceiro|aguardando_aprovacao|concluido|cancelado
&priority=baixa|media|alta|critica
&assigneeId=uuid
&overdue=true|false
&after=cursor
&search=texto
&limit=50
```

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Esteira 4 parada",
      "status": "em_andamento",
      "priority": "critica",
      "dueAt": "2024-05-20T00:00:00Z",
      "isOverdue": false,
      "unit": { "id": "uuid", "name": "Vila Xavier" },
      "area": { "id": "uuid", "name": "Estrutura/Manutenção" },
      "assignees": [{ "userId": "uuid", "name": "João", "kind": "responsible" }],
      "checklistProgress": { "done": 1, "total": 4 }
    }
  ],
  "meta": { "total": 18, "nextCursor": "..." }
}
```

### `GET /activities/export`
Exportar atividades em CSV.

**Query**: `?organizationId=uuid&unitId=uuid&areaId=uuid&status=novo|em_andamento|aguardando_terceiro|aguardando_aprovacao|concluido|cancelado&overdue=true|false&search=texto&format=csv`

**Response 200**: `text/csv`

### `POST /activities`
Criar atividade.

**Body**:
```json
{
  "organizationId": "uuid",
  "unitId": "uuid",
  "areaId": "uuid",
  "templateId": "uuid",
  "title": "Solicitar orçamento da esteira 4",
  "description": "Esteira parada desde segunda",
  "priority": "critica",
  "dueAt": "2024-05-20T00:00:00Z",
  "visibilityMode": "inherited",
  "metadata": { "equipment": "Esteira 4", "location": "Sala principal", "criticality": "alta" },
  "assigneeIds": ["uuid"],
  "watcherIds": ["uuid"]
}
```

### `GET /activities/:id`
Detalhe completo da atividade (inclui checklists, assignees, contagem de comentários).

### `PATCH /activities/:id`
Atualizar campos da atividade.

**Body** (todos opcionais):
```json
{
  "title": string,
  "description": string,
  "status": ActivityStatus,
  "priority": ActivityPriority,
  "dueAt": string,
  "visibilityMode": VisibilityMode,
  "metadata": object
}
```

### `POST /activities/:id/assign`
Atribuir/remover responsáveis e participantes.

**Body**:
```json
{
  "add": [{ "userId": "uuid", "kind": "responsible|participant|watcher" }],
  "remove": ["uuid"]
}
```

### `POST /activities/:id/share`
Compartilhar atividade restrita com usuário específico.

**Body**: `{ "userId": "uuid", "accessLevel": "view|edit" }`

---

## Checklist

### `POST /activities/:id/checklists`
Criar bloco de checklist.

**Body**: `{ "title": string, "items": [{ "text": string, "order": number }] }`

### `PATCH /checklists/:id`
Editar título do bloco.

### `DELETE /checklists/:id`
Remover bloco.

### `POST /checklists/:id/items`
Adicionar item ao checklist.

**Body**: `{ "text": string, "order"?: number }`

### `PATCH /checklist-items/:id`
Marcar/desmarcar item.

**Body**: `{ "done": boolean, "text"?: string, "order"?: number }`

---

## Comentários

### `GET /activities/:id/comments`
Listar comentários (paginado, mais recentes primeiro).

**Query**: `?after=cursor&limit=20`

### `POST /activities/:id/comments`
Comentar na atividade.

**Body**: `{ "body": string }`

### `PATCH /comments/:id`
Editar comentário (apenas autor, em até 15min).

### `DELETE /comments/:id`
Excluir comentário (soft delete).

---

## Anexos

### `POST /activities/:id/attachments/presign`
Gerar URL de upload direto para R2.

**Body**: `{ "filename": string, "mimeType": string, "sizeBytes": number }`

**Response 200**:
```json
{
  "data": {
    "uploadUrl": "https://r2.example.com/presigned...",
    "objectKey": "attachments/uuid/filename.pdf",
    "expiresIn": 300
  }
}
```

### `POST /activities/:id/attachments`
Registrar anexo após upload concluído.

**Body**: `{ "objectKey": string, "filename": string, "mimeType": string, "sizeBytes": number }`

### `GET /activities/:id/attachments`
Listar anexos (com presigned URL de download).

### `DELETE /attachments/:id`
Remover anexo (soft delete + opcional exclusão do R2).

---

## Histórico

### `GET /activities/:id/events`
Timeline de eventos da atividade (imutável).

**Query**: `?after=cursor&limit=50`

**Response 200**:
```json
{
  "data": [
    {
      "id": "uuid",
      "eventType": "status_changed",
      "actor": { "id": "uuid", "name": "João" },
      "payload": { "from": "novo", "to": "em_andamento" },
      "createdAt": "2024-05-14T10:30:00Z"
    }
  ]
}
```

---

## Recorrência

### `POST /activities/:id/recurrence`
Configurar recorrência.

**Body**:
```json
{
  "frequency": "semanal",
  "interval": 1,
  "weekdays": [1, 2, 3, 4, 5],
  "generationMode": "on_complete",
  "preGenerateN": null
}
```

### `DELETE /activities/:id/recurrence`
Remover regra de recorrência.

---

## Visões

### `GET /me/activities`
Visão pessoal do usuário autenticado.

**Query**: `?view=today|overdue|this_week|awaiting_my_return&organizationId=uuid`

### `GET /units/:id/dashboard`
Visão operacional da unidade.

**Response 200**:
```json
{
  "data": {
    "summary": {
      "total": 18, "overdue": 4, "critical": 2, "dueToday": 3
    },
    "byArea": [
      {
        "area": { "id": "uuid", "name": "Estrutura/Manutenção" },
        "activities": [...]
      }
    ]
  }
}
```

### `GET /dashboards/overview`
Painel geral da organização (requer `org_manager` ou superior).

**Response 200**:
```json
{
  "data": {
    "kpis": {
      "unitsWithCriticalOverdue": 7,
      "totalOverdue": 41,
      "financialDueToday": 9,
      "maintenanceOpen": 22
    },
    "byUnit": [
      {
        "unit": { "id": "uuid", "name": "Vila Xavier" },
        "open": 18, "overdue": 4, "critical": 2, "unassigned": 1
      }
    ]
  }
}
```

---

## IA

### `POST /ai/activities/draft`
Criar rascunho de atividade a partir de texto livre.

**Body**: `{ "organizationId": "uuid", "text": "A recepção da Vila Xavier está com infiltração..." }`

**Response 200** (rascunho para revisão, não salvo):
```json
{
  "data": {
    "draft": {
      "title": "Infiltração na recepção - Vila Xavier",
      "area": { "key": "manutencao", "name": "Estrutura/Manutenção" },
      "suggestedTemplate": "Chamado de Manutenção",
      "priority": "alta",
      "suggestedDueDays": 3,
      "checklist": ["Tirar fotos", "Solicitar 2 orçamentos", "Aprovar fornecedor", "Acompanhar execução"]
    }
  }
}
```

### `POST /ai/activities/checklist`
Sugerir checklist para atividade existente.

**Body**: `{ "activityId": "uuid" }`

**Response 200**: `{ "data": { "suggestions": ["item1", "item2"] } }`

### `POST /ai/summaries/daily`
Gerar resumo diário para gestor de unidade.

**Body**: `{ "unitId": "uuid", "date": "2024-05-14" }`

**Response 200**: `{ "data": { "summary": "Texto curto para o gestor..." } }`

### `POST /ai/activities/delay-analysis`
Explicar contexto de atraso de atividade (SQL detecta, IA explica).

**Body**: `{ "activityId": "uuid" }`

**Response 200**: `{ "data": { "explanation": "Esta atividade está atrasada há 3 dias...", "riskLevel": "high" } }`

---

## Importações

### `POST /imports/trello`
Iniciar job de importação Trello.

**Body**:
```json
{
  "organizationId": "uuid",
  "mode": "api|json_upload",
  "integrationAccountId": "uuid",
  "boardIds": ["trello-board-id"],
  "jsonData": null
}
```

**Response 202**: `{ "data": { "importJobId": "uuid" } }`

### `GET /imports/:id`
Acompanhar status do job.

### `GET /imports/:id/preview`
Ver resultado do dry-run com mapeamento sugerido.

### `PATCH /imports/:id/mapping`
Ajustar mapeamento (wizard de revisão): boards → unidades, lists → áreas/status/ignorar.

**Body**: `{ "mapping": { "list-id": { "type": "area|status|ignore", "value": "area-key" } } }`

### `POST /imports/:id/commit`
Confirmar e executar a importação (ação irreversível após confirmação).

---

## Notificações

### `PATCH /notification-preferences/:userId`
Atualizar preferências de notificação.

**Body**: `{ "email": { "enabled": true }, "push": { "enabled": true }, "whatsapp": { "enabled": false } }`

### `POST /notifications/subscribe`
Registrar subscription de web push.

**Body**: `{ "subscription": { "endpoint": string, "keys": object } }`

### `POST /notifications/test`
Enviar notificação de teste (requer `org_manager`).

**Body**: `{ "userId": "uuid", "channel": "email|push|whatsapp" }`

---

## Tutorial Progress

Endpoints do modo tutorial guiado (ver [`docs/tutorial-mode.md`](tutorial-mode.md)). Todos exigem usuário autenticado e operam apenas sobre o **próprio** progresso — não há listagem cruzada para admin.

### `GET /me/tutorial-progress`
Lista o progresso de todos os tutoriais do usuário autenticado.

**Resposta**:
```json
{
  "data": [
    {
      "id": "uuid",
      "tutorialId": "first-steps",
      "status": "in_progress",
      "currentStepId": "structure",
      "completedSteps": ["welcome"],
      "startedAt": "2026-05-17T10:23:45.000Z",
      "completedAt": null,
      "skippedAt": null,
      "updatedAt": "2026-05-17T10:24:10.000Z"
    }
  ]
}
```

### `PATCH /me/tutorial-progress/:tutorialId`
Upsert de progresso. Cria a entrada se não existir.

`tutorialId` deve casar com `^[a-z0-9-]{1,64}$`.

**Body** (todos opcionais):
```json
{
  "status": "not_started | in_progress | completed | skipped | deferred",
  "currentStepId": "string | null",
  "completedSteps": ["step-id-1", "step-id-2"]
}
```

Regras:
- `status=in_progress` preenche `startedAt` automaticamente.
- `status=completed` preenche `completedAt`.
- `status=skipped` preenche `skippedAt`.
- `completedSteps` aceita até 200 ids, cada ≤ 64 chars `[a-z0-9-]`.

**Resposta**: a entrada atualizada (mesmo formato do GET).

**Erros**:
- `422 VALIDATION_ERROR` — `tutorialId` inválido ou body fora do schema.

### `POST /me/tutorial-progress/:tutorialId/restart`
Zera `completed_steps_json`, define `status=in_progress`, atualiza `startedAt=now()` e limpa `completedAt`/`skippedAt`.

**Body**: vazio.

**Resposta**: a entrada zerada.
