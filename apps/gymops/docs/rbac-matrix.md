# Matriz RBAC — GymOps

**Última atualização**: 2026-05-17

Este documento é a fonte canônica de permissões. Quando houver divergência entre backend, frontend e esta matriz, **esta matriz prevalece** e os outros devem ser ajustados.

Para o algoritmo de resolução, ver [`docs/rbac.md`](rbac.md).

> **Reconciliação 2026-05-17**: foram identificadas três divergências entre código atual e esta matriz, todas no backlog **Sprint 18**:
> - **BUG-005**: login (`/auth/login`) resolve membership de org/unit, mas não cobre membership **scopeType=area** — usuário de área cai sem `userRole`/`primaryUnitId`.
> - **BUG-006**: `canCreate()` no frontend (`apps/web/src/store/auth.ts`) bloqueia `executor`, mas esta matriz e a API permitem em escopo válido.
> - **BUG-007**: `hasUnitRole()` no backend (`apps/api/src/lib/rbac.ts`) ignora membership por área, então `area_leader`/`executor` por área não passam em guards de unidade.
>
> Esta matriz **continua sendo a fonte da verdade**. O código será alinhado nos PRs S18 (ver [`docs/implementation-plan.md`](implementation-plan.md)).

---

## Resolução canônica do contexto do usuário

Função única consumida por `/auth/login`, `/auth/refresh`, `/auth/consume` e `/me/role` (a ser extraída em `apps/api/src/lib/auth-context.ts` na Sprint 18, BUG-005).

```
resolveUserContext(userId, organizationId) → { userRole, primaryUnitId }

1. SELECT memberships WHERE userId = ? AND organizationId = ? AND deletedAt IS NULL
2. Se houver membership scopeType='organization':
   - userRole = role da membership org (owner > org_manager)
   - primaryUnitId = primeira unidade ativa da org (ordenada por createdAt)
3. Senão se houver membership scopeType='unit':
   - userRole = role da membership unit (unit_manager > area_leader > executor > viewer)
   - primaryUnitId = scopeId da primeira membership unit (ordenada por createdAt)
4. Senão se houver membership scopeType='area':              ← coberto a partir do BUG-005
   - userRole = role da membership area (area_leader > executor > viewer)
   - primaryUnitId = primeira Unit que tem essa Area via unit_areas (ordenada por unit.createdAt)
5. Senão: { userRole: null, primaryUnitId: null } → redirect /login com mensagem "sem acesso"
```

Regra de precedência de papel quando o mesmo usuário tem múltiplas memberships:
`owner > org_manager > unit_manager > area_leader > executor > viewer`.

---

## Helper canCreate (frontend)

Definição canônica (Sprint 18, BUG-006):
```ts
canCreate(): boolean {
  const role = get().userRole;
  // Todos os papéis abaixo podem criar atividade em escopo válido.
  // Backend faz a checagem fina por unidade/área no POST /activities.
  return role === 'owner'
      || role === 'org_manager'
      || role === 'unit_manager'
      || role === 'area_leader'
      || role === 'executor';   // ← executor pode criar; só viewer não
}
```

Justificativa: `executor` em area/unit pode criar atividade dentro do escopo onde tem membership. A regra fina é do backend; o helper só esconde o CTA quando não há sentido (viewer puro).

---

## Papéis e escopos

| Papel | Escopo de membership |
|-------|---------------------|
| `owner` | Organização |
| `org_manager` | Organização |
| `unit_manager` | Unidade |
| `area_leader` | Área |
| `executor` | Área (ou atividade via assignee) |
| `viewer` | Atividade (via activity_permissions) |

---

## Matriz completa por domínio

Legenda: ✅ Permitido | ⚠️ Parcial/condicional | ❌ Proibido | — Não aplicável

### Organização

| Ação | owner | org_mgr | unit_mgr | area_ldr | executor | viewer |
|------|-------|---------|----------|----------|----------|--------|
| Ver dados da org | ✅ | ✅ | ⚠️ própria | ❌ | ❌ | ❌ |
| Editar branding/slug | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Editar políticas | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ver plano/billing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Unidades

| Ação | owner | org_mgr | unit_mgr | area_ldr | executor | viewer |
|------|-------|---------|----------|----------|----------|--------|
| Listar todas as unidades | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver unidade própria | ✅ | ✅ | ✅ | ⚠️ sua área | ⚠️ sua área | ❌ |
| Criar unidade | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Editar unidade | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ativar/Inativar unidade | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver dashboard de unidade | ✅ | ✅ | ✅ (própria) | ❌ | ❌ | ❌ |

### Áreas

| Ação | owner | org_mgr | unit_mgr | area_ldr | executor | viewer |
|------|-------|---------|----------|----------|----------|--------|
| Listar áreas | ✅ | ✅ | ⚠️ da unidade | ⚠️ própria | ❌ | ❌ |
| Criar área | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Editar área | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Vincular área a unidade | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Reordenar áreas em unidade | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Arquivar área | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Memberships / Equipe

| Ação | owner | org_mgr | unit_mgr | area_ldr | executor | viewer |
|------|-------|---------|----------|----------|----------|--------|
| Listar membros da org | ✅ | ✅ | ⚠️ unidade | ❌ | ❌ | ❌ |
| Convidar usuário (externo) | ✅ | ✅ | ⚠️ unidade | ❌ | ❌ | ❌ |
| Adicionar usuário existente | ✅ | ✅ | ⚠️ unidade | ❌ | ❌ | ❌ |
| Alterar papel org-level | ✅ | ⚠️ abaixo de owner | ❌ | ❌ | ❌ | ❌ |
| Alterar papel unit-level | ✅ | ✅ | ⚠️ própria unidade | ❌ | ❌ | ❌ |
| Alterar papel area-level | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Revogar acesso | ✅ | ✅ | ⚠️ unidade | ❌ | ❌ | ❌ |
| Remover o último owner | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Templates de atividade

| Ação | owner | org_mgr | unit_mgr | area_ldr | executor | viewer |
|------|-------|---------|----------|----------|----------|--------|
| Listar templates | ✅ | ✅ | ✅ | ✅ | ✅ (leitura) | ❌ |
| Criar template | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Editar template | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Duplicar template | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Arquivar template | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Excluir template isSystem | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Atividades

> Obs.: visibilidade de atividade (`visibility_mode`) afeta `view` mas não `create`. Executor pode criar atividade com membership na área (backend). Frontend alinhado em Sprint 18 (BUG-006 — `canCreate()` agora inclui `executor`).

| Ação | owner | org_mgr | unit_mgr | area_ldr | executor | viewer |
|------|-------|---------|----------|----------|----------|--------|
| Listar atividades (org) | ✅ | ✅ | ⚠️ unidade | ⚠️ área | ⚠️ delegadas | ⚠️ compartilhadas |
| Criar atividade | ✅ | ✅ | ✅ | ✅ | ✅ (backend) ⚠️ (frontend bloqueado) | ❌ |
| Ver atividade (inherited/shared) | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ se permissão |
| Ver atividade (restricted) | ✅ | ✅ | ✅ | ❌ | ⚠️ se assignee | ⚠️ se permission |
| Editar atividade | ✅ | ✅ | ✅ | ✅ | ⚠️ próprias/assignee | ❌ |
| Alterar status | ✅ | ✅ | ✅ | ✅ | ✅ (assignee) | ❌ |
| Alterar prioridade | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Alterar visibilidade | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Compartilhar atividade restrita | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Atribuir responsável | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Excluir atividade | ✅ | ✅ | ⚠️ unidade | ⚠️ área | ❌ | ❌ |
| Ações em lote | ✅ | ✅ | ⚠️ unidade | ❌ | ❌ | ❌ |

### Checklists, Comentários, Anexos

| Ação | owner | org_mgr | unit_mgr | area_ldr | executor | viewer |
|------|-------|---------|----------|----------|----------|--------|
| Marcar item checklist | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Comentar | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Anexar arquivo | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

### Integrações e Importações

| Ação | owner | org_mgr | unit_mgr | area_ldr | executor | viewer |
|------|-------|---------|----------|----------|----------|--------|
| Ver integrações | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Conectar/desconectar Trello | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Iniciar importação | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver histórico de importações | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Retry/cancel de import | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Notificações

| Ação | owner | org_mgr | unit_mgr | area_ldr | executor | viewer |
|------|-------|---------|----------|----------|----------|--------|
| Ver/editar próprias preferências | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Testar canal próprio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ver delivery log organizacional | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### IA

| Ação | owner | org_mgr | unit_mgr | area_ldr | executor | viewer |
|------|-------|---------|----------|----------|----------|--------|
| Criar atividade via IA | ✅ | ✅ | ✅ | ✅ | ⚠️ se pode criar | ❌ |
| Sugestão de checklist | ✅ | ✅ | ✅ | ✅ | ⚠️ se pode ver ativ. | ❌ |
| Análise de atraso (por atividade) | ✅ | ✅ | ✅ | ✅ | ⚠️ se pode ver ativ. | ❌ |
| Resumo diário | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

> IA nunca acessa conteúdo de atividades `restricted` — guard via `resolveActivityPermission`.

---

## Desalinhamentos conhecidos (a corrigir)

| Desalinhamento | Backend | Frontend | Ação |
|----------------|---------|----------|------|
| Executor criar atividade | ✅ Permite (POST /activities com membership) | ✅ `canCreate()` corrigido (BUG-006 S18) | — |
| Viewer listar atividades | ⚠️ Retorna apenas compartilhadas | Sem validação explícita | Comportamento esperado confirmado |
| org_manager alterar papel owner | ❌ Não deve permitir | Guard implementado no backend | Confirmar tela de equipe escopada (FEAT-001) |

---

## Regras especiais

### Visibilidade de atividade sobrescreve herança

```
visibility_mode = 'restricted' → quebra herança da área
  → Apenas: owner, org_manager, unit_manager da unidade, created_by, assignees, activity_permissions explícitas

visibility_mode = 'shared' → herança normal + activity_permissions extras
  → Qualquer usuário com permissão explícita vê, mesmo sem membership na área

visibility_mode = 'inherited' (padrão) → herança normal
  → Quem tem membership na área vê
```

### Precedência de papel

Quando um usuário tem múltiplos papéis (ex: `org_manager` na org + `unit_manager` em unidade específica), o papel de maior precedência na hierarquia prevalece para qualquer ação na organização.

```
owner > org_manager > unit_manager > area_leader > executor > viewer
```

### Proteção do último owner

Nunca permitir remoção ou rebaixamento do único `owner` da organização — validar no backend antes de qualquer `DELETE /memberships` ou `PATCH membership.role`.
