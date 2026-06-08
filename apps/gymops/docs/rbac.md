# RBAC — Modelo de Permissões e Herança de Escopos

## Princípio central

Permissões são resolvidas **no backend a cada request**, nunca no frontend. O sistema usa RBAC com herança por escopo (organização → unidade → área → atividade), com possibilidade de override explícito no nível da atividade.

---

## Papéis disponíveis

| Papel (`UserRole`) | Escopo de membership | Descrição |
|---|---|---|
| `owner` | organização | Fundador/admin técnico, acesso irrestrito |
| `org_manager` | organização | Gestor da rede, acesso de leitura e edição em tudo |
| `unit_manager` | unidade | Gestor local, acesso total na sua unidade |
| `area_leader` | área | Responsável por uma área funcional específica |
| `executor` | área ou atividade | Executa tarefas; vê só o que foi delegado |
| `viewer` | atividade | Convidado somente leitura em itens compartilhados |

---

## Tabela de capacidades por papel

| Ação | owner | org_manager | unit_manager | area_leader | executor | viewer |
|---|---|---|---|---|---|---|
| Criar organização | ✓ | — | — | — | — | — |
| Ver todas as unidades | ✓ | ✓ | — | — | — | — |
| Criar/editar unidades | ✓ | ✓ | — | — | — | — |
| Ver unidade própria | ✓ | ✓ | ✓ | ✓* | ✓* | — |
| Criar/editar memberships | ✓ | ✓ | na unidade | na área | — | — |
| Ver painel geral | ✓ | ✓ | — | — | — | — |
| Criar atividade | ✓ | ✓ | ✓ | ✓ | — | — |
| Ver atividades da área | ✓ | ✓ | ✓ | ✓ | herdado** | restrito** |
| Editar atividade | ✓ | ✓ | ✓ | ✓ | próprias | — |
| Comentar | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Marcar checklist | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Anexar arquivo | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Alterar visibilidade atividade | ✓ | ✓ | ✓ | ✓ | — | — |
| Compartilhar atividade restrita | ✓ | ✓ | ✓ | ✓ | — | — |
| Gerenciar templates | ✓ | ✓ | — | — | — | — |
| Iniciar importação Trello | ✓ | ✓ | — | — | — | — |
| Gerenciar integrações | ✓ | ✓ | — | — | — | — |

`*` dentro do escopo do membership
`**` depende de `visibility_mode` da atividade

---

## Herança de escopos

```
Organização (scope_type = "organization")
    └── Unidade (scope_type = "unit")
            └── Área (scope_type = "area")
                    └── Atividade (visibility_mode)
```

Regra de herança: um papel no escopo superior inclui capacidades de leitura nos escopos inferiores dentro da mesma organização.

- `org_manager` em organização X → pode ver todas as unidades/áreas/atividades de X
- `unit_manager` em unidade Y → pode ver/editar tudo dentro de Y (todas as áreas de Y)
- `area_leader` em área Z → pode ver/editar tudo dentro de Z (em qualquer unidade que tenha essa área)

---

## Regras de visibilidade de atividade

### `inherited` (padrão)
- Qualquer usuário com membership na área (area_leader, executor, unit_manager superior) vê a atividade
- Comportamento mais comum para atividades operacionais não sensíveis

### `restricted`
- Quebra a herança da área
- Só podem acessar:
  1. `owner` e `org_manager` da organização (sempre)
  2. `unit_manager` da unidade da atividade
  3. `created_by` da atividade
  4. Usuários em `activity_assignees` (responsible + participant)
  5. Usuários em `activity_permissions` com grant explícito
- Uso típico: Financeiro (senhas, contas, valores), documentos confidenciais

### `shared`
- Comportamento herdado PLUS
- Usuários avulsos adicionados via `activity_permissions` (sem necessidade de membership na área)
- Uso típico: Compartilhar uma atividade com um fornecedor externo ou outro gestor

---

## Algoritmo de resolução de permissão

```typescript
// Pseudocódigo do middleware de autorização no Fastify

async function resolvePermission(
  userId: string,
  activityId: string,
  requiredAction: 'view' | 'edit' | 'delete'
): Promise<boolean> {
  const activity = await getActivity(activityId);
  const memberships = await getMemberships(userId, activity.organizationId);

  // 1. Owner/org_manager sempre passa
  if (hasOrgRole(memberships, ['owner', 'org_manager'])) return true;

  // 2. Unit manager da unidade da atividade
  if (hasUnitRole(memberships, activity.unitId, ['unit_manager'])) return true;

  // 3. Atividade restrita — sem herança de área
  if (activity.visibilityMode === 'restricted') {
    return (
      activity.createdBy === userId ||
      isAssignee(activity, userId) ||
      hasExplicitPermission(activity, userId, requiredAction)
    );
  }

  // 4. Visibilidade herdada ou shared
  // 4a. Area leader da área da atividade
  if (hasAreaRole(memberships, activity.areaId, ['area_leader'])) return true;

  // 4b. Executor com membership na área
  if (hasAreaRole(memberships, activity.areaId, ['executor'])) {
    if (requiredAction === 'view') return true;
    // executor só edita se for assignee
    return isAssignee(activity, userId);
  }

  // 4c. Shared: permissão explícita concedida
  if (activity.visibilityMode === 'shared') {
    return hasExplicitPermission(activity, userId, requiredAction);
  }

  // 5. Assignee/watcher em qualquer visibilidade (acesso mínimo)
  if (isAssignee(activity, userId)) {
    return requiredAction === 'view';
  }

  return false;
}
```

---

## Queries de banco para RBAC

### Memberships efetivos de um usuário em uma organização

```sql
SELECT scope_type, scope_id, role
FROM memberships
WHERE user_id = $userId
  AND organization_id = $orgId
  AND deleted_at IS NULL;
```

### Atividades visíveis para um executor na visão pessoal

```sql
SELECT a.id, a.title, a.status, a.priority, a.due_at, a.unit_id, a.area_id
FROM activities a
WHERE a.organization_id = $orgId
  AND a.deleted_at IS NULL
  AND (
    -- Gestores superiores veem tudo
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = $userId
        AND m.organization_id = $orgId
        AND m.role IN ('owner', 'org_manager')
        AND m.deleted_at IS NULL
    )
    OR
    -- Unit manager vê atividades da unidade
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = $userId
        AND m.scope_type = 'unit'
        AND m.scope_id = a.unit_id
        AND m.role = 'unit_manager'
        AND m.deleted_at IS NULL
    )
    OR
    -- Area leader/executor vê atividades herdadas/shared da área
    (
      a.visibility_mode IN ('inherited', 'shared')
      AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.user_id = $userId
          AND m.scope_type = 'area'
          AND m.scope_id = a.area_id
          AND m.deleted_at IS NULL
      )
    )
    OR
    -- Assignee vê qualquer atividade onde foi adicionado
    EXISTS (
      SELECT 1 FROM activity_assignees aa
      WHERE aa.activity_id = a.id
        AND aa.user_id = $userId
    )
    OR
    -- Permissão explícita em atividades restritas/shared
    EXISTS (
      SELECT 1 FROM activity_permissions ap
      WHERE ap.activity_id = a.id
        AND ap.user_id = $userId
    )
  )
ORDER BY a.due_at ASC NULLS LAST, a.priority DESC;
```

---

## Endpoints que requerem verificação de RBAC

| Endpoint | Permissão mínima necessária |
|---|---|
| `GET /units` | `org_manager` ou superior |
| `GET /units/:id/dashboard` | `unit_manager` da unidade |
| `GET /dashboards/overview` | `org_manager` ou superior |
| `POST /activities` | `area_leader` na área ou superior |
| `GET /activities/:id` | `resolvePermission(userId, id, 'view')` |
| `PATCH /activities/:id` | `resolvePermission(userId, id, 'edit')` |
| `POST /activities/:id/share` | `unit_manager` ou superior da unidade |
| `POST /memberships` | `unit_manager` ou superior (no escopo) |
| `POST /imports/trello` | `org_manager` ou superior |

---

## Erros de autorização

- `401 Unauthorized` — token ausente ou inválido
- `403 Forbidden` — token válido mas sem permissão para a ação
- `404 Not Found` — usar quando o recurso existe mas o usuário não tem acesso (evitar vazamento de informação para atividades restritas)
