---
applyTo: "apps/api/src/lib/rbac.ts,apps/api/src/routes/**/*.ts,apps/web/src/**/*.tsx,docs/rbac*.md"
---

# Instruções — RBAC (Permissões e Herança de Escopos)

Aplica-se a qualquer código que verifica, consome ou exibe permissões.

## Fonte canônica

[`docs/rbac-matrix.md`](../../docs/rbac-matrix.md) é a **fonte da verdade**. Quando backend, frontend ou esta matriz divergirem, **a matriz prevalece** e os outros devem ser ajustados.

Para o algoritmo: [`docs/rbac.md`](../../docs/rbac.md).

## Papéis e precedência

```
owner > org_manager > unit_manager > area_leader > executor > viewer
```

| Papel | Escopo de membership |
|---|---|
| `owner` | Organização |
| `org_manager` | Organização |
| `unit_manager` | Unidade |
| `area_leader` | Área |
| `executor` | Área (ou atividade via assignee) |
| `viewer` | Atividade (via activity_permissions) |

## Princípios não-negociáveis

1. **RBAC sempre no backend** — frontend nunca decide acesso final.
2. **Navegação no frontend é UX, não segurança.** Esconder item não impede chamada direta à API.
3. **Validar em toda request** — não confiar em token decodificado sem checar membership ativa.
4. **Membership cancelada (`deletedAt != null`)** = sem acesso, mesmo que token JWT ainda esteja válido.

## Algoritmo (resumo)

```typescript
async function resolveActivityPermission(userId, activityId, action: 'view' | 'edit' | 'delete') {
  const activity = await getActivity(activityId);
  const memberships = await getMemberships(userId, activity.organizationId);

  // 1. Owner / org_manager sempre passa
  if (hasOrgRole(memberships, ['owner', 'org_manager'])) return true;

  // 2. Unit manager da unidade da atividade
  if (hasUnitRole(memberships, activity.unitId, ['unit_manager'])) return true;

  // 3. Atividade restricted — quebra herança
  if (activity.visibilityMode === 'restricted') {
    return activity.createdBy === userId
        || isAssignee(activity, userId)
        || hasExplicitPermission(activity, userId, action);
  }

  // 4. Visibilidade inherited ou shared
  if (hasAreaRole(memberships, activity.areaId, ['area_leader'])) return true;

  if (hasAreaRole(memberships, activity.areaId, ['executor'])) {
    if (action === 'view') return true;
    return isAssignee(activity, userId);
  }

  if (activity.visibilityMode === 'shared') {
    return hasExplicitPermission(activity, userId, action);
  }

  // 5. Acesso mínimo via assignee
  if (isAssignee(activity, userId)) return action === 'view';

  return false;
}
```

## Visibility modes

| Mode | Comportamento |
|---|---|
| `inherited` (padrão) | Herança normal por membership na área |
| `restricted` | Quebra herança — exige `activity_permissions` explícita (ou owner/org_manager/unit_manager/created_by/assignee) |
| `shared` | Herança + `activity_permissions` extras (mesmo sem membership na área) |

## Frontend — UX por role

```tsx
const { userRole } = useAuthStore();
const isAdmin = userRole === 'owner' || userRole === 'org_manager';
const isOwner = userRole === 'owner';

// Esconder item de menu — UX apenas
{isOwner && <NavItem href="/settings/organization" />}

// Mas o backend SEMPRE valida — não confiar nesse check
```

## 403 vs 404 — evitar enumeração

Quando há risco de o atacante descobrir existência de recurso restrito:

- **404 Not Found** se o usuário **não pode nem saber que existe** (ex: atividade `restricted` em organização que ele tem acesso, mas que ele não pode ver).
- **403 Forbidden** se a existência é óbvia mas a ação é negada (ex: ele vê a atividade mas tenta editar sem permissão).

Regra prática para `GET /activities/:id`:
- Se `resolveActivityPermission(uid, id, 'view') === false` → 404.

Para `PATCH /activities/:id`:
- Se pode `view` mas não pode `edit` → 403.

## Endpoints e nível mínimo

| Endpoint | Nível mínimo |
|---|---|
| `GET /units` | `org_manager` |
| `GET /units/:id` | membership na unidade |
| `POST /units` | `org_manager` |
| `PATCH /units/:id` | `org_manager` |
| `DELETE /units/:id` | `org_manager` |
| `POST /activities` | `area_leader` (mas backend permite `executor` com membership na área) |
| `GET /activities/:id` | `resolveActivityPermission(uid, id, 'view')` |
| `PATCH /activities/:id` | `resolveActivityPermission(uid, id, 'edit')` |
| `POST /memberships` | `org_manager`, ou `unit_manager` da unidade (escopo) |
| `POST /invitations` | `org_manager`, ou `unit_manager` da unidade |
| `GET /audit-logs` | `owner` only |
| `POST /imports/*` | `org_manager` |
| `/ai/*` | precisa de `resolveActivityPermission` quando IA acessa atividade |

## Audit log de mudanças sensíveis

Toda mudança de permissão (membership criada/removida/role alterada, convite enviado/aceito/cancelado) deve gerar `logAudit({...})` para rastreabilidade.

Ações típicas:

- `membership.created`, `membership.deleted`, `membership.role_changed`
- `invitation.sent`, `invitation.accepted`, `invitation.cancelled`
- `activity.visibility_changed`
- `activity_permission.granted`, `activity_permission.revoked`

## Proteção do último owner

Nunca permitir remoção ou rebaixamento do único `owner` da organização. Validar no backend antes de qualquer `DELETE /memberships/:id` ou `PATCH membership.role`:

```typescript
const owners = await db.membership.count({
  where: { organizationId, role: 'owner', deletedAt: null },
});
if (owners <= 1 && membershipToRemove.role === 'owner') {
  return reply.status(409).send({
    error: { code: 'LAST_OWNER', message: 'Não é possível remover o último owner da organização.' },
  });
}
```

## Desalinhamentos conhecidos (a corrigir)

Ver [`docs/rbac-matrix.md`](../../docs/rbac-matrix.md) seção "Desalinhamentos conhecidos":

- **Executor criar atividade**: backend permite, frontend bloqueia. Alinhar em Sprint 11.
- **org_manager alterar papel owner**: backend deve recusar. Validar.
- **Viewer listar atividades**: backend retorna só compartilhadas; frontend não restringe explicitamente.

Antes de mexer em RBAC, conferir esta seção da matriz e atualizar coerentemente backend + frontend + testes + docs.

## Quando alterar RBAC

Use o prompt `.github/prompts/update-rbac.prompt.md` para garantir sincronização.

Checklist:

- [ ] `docs/rbac-matrix.md` atualizada com a nova regra
- [ ] `apps/api/src/lib/rbac.ts` ajustado se for novo algoritmo
- [ ] Rotas Fastify afetadas ajustadas
- [ ] Frontend (`canCreate`, sidebar, dialogs) ajustado
- [ ] Testes de integração cobrindo cada role da matriz
- [ ] Teste E2E cobrindo o fluxo end-to-end
- [ ] `docs/status.md` atualizado se desalinhamento foi resolvido
