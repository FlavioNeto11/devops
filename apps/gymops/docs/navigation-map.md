# Mapa de Navegação — GymOps

**Última atualização**: 2026-05-17

Este documento descreve o que cada papel (role) vê e pode acessar na interface. Para a matriz de permissões por ação, ver [`docs/rbac-matrix.md`](rbac-matrix.md).

> **Modo Tutorial (Sprint 17)**: o botão **Ajuda** (`/help`) aparece para **todos os papéis** no rodapé do sidebar e na topbar mobile. A Central de Ajuda filtra automaticamente os tutoriais visíveis por papel. Cada tela principal exibe um botão "Ver tutorial" no header — ele se esconde se o papel atual não tem acesso ao tutorial daquela tela. Detalhes em [`docs/tutorial-mode.md`](tutorial-mode.md).

---

## Navegação por papel (estado atual + planejado)

### `owner` — Dono / Fundador

Acesso irrestrito a toda a organização.

**Sidebar**
```
● Painel Geral               /dashboard
● Minhas atividades          /me
──────────────────────
● [Lista de unidades]        /units/:id  (todas)
──────────────────────
● Configurações
  ├─ Perfil                  /profile          [Sprint 9]
  ├─ Organização             /settings/organization  [Sprint 9]
  ├─ Unidades                /settings/units   [Sprint 10]
  ├─ Áreas                   /settings/areas   [Sprint 10]
  ├─ Equipe e Permissões     /settings/team    [Sprint 11]
  ├─ Templates               /settings/templates  [Existe]
  ├─ Notificações            /settings/notifications  [Existe]
  ├─ Integrações             /settings/integrations  [Existe]
  ├─ Importações             /settings/imports  [Sprint 13]
  └─ Recorrências            /settings/recurrences  [Sprint 14]
──────────────────────
● Central de Atividades      /activities       [Sprint 12]
```

---

### `org_manager` — Gestor da Rede

Mesma navegação do `owner`, exceto a aba "Organização" (exclusiva do owner).

**Sidebar**
```
● Painel Geral               /dashboard
● Minhas atividades          /me
──────────────────────
● [Lista de unidades]        /units/:id  (todas)
──────────────────────
● Configurações
  ├─ Perfil                  /profile
  ├─ Unidades                /settings/units
  ├─ Áreas                   /settings/areas
  ├─ Equipe e Permissões     /settings/team
  ├─ Templates               /settings/templates
  ├─ Notificações            /settings/notifications
  ├─ Integrações             /settings/integrations
  ├─ Importações             /settings/imports
  └─ Recorrências            /settings/recurrences
──────────────────────
● Central de Atividades      /activities
```

---

### `unit_manager` — Gestor de Unidade

Acesso às suas unidades e configurações relacionadas ao seu escopo.

**Sidebar**
```
● Minhas atividades          /me
──────────────────────
● [Suas unidades]            /units/:id  (apenas as suas)
──────────────────────
● Configurações
  ├─ Perfil                  /profile
  ├─ Equipe da unidade       /settings/team?unit=:id  (só sua unidade)
  ├─ Notificações            /settings/notifications
  └─ Recorrências            /settings/recurrences?unit=:id
```

> Não vê: Painel Geral, Central de Atividades global, Organização, Unidades (admin), Áreas (admin), Templates (admin), Integrações, Importações.

---

### `area_leader` — Líder de Área

Focado na operação da área. Sem telas administrativas.

**Sidebar**
```
● Minhas atividades          /me
──────────────────────
● [Unidades onde tem área]   /units/:id  (restrito à sua área)
──────────────────────
● Configurações
  ├─ Perfil                  /profile
  └─ Notificações            /settings/notifications
```

---

### `executor` — Colaborador / Executor

Visão mínima. Acesso apenas às atividades delegadas.

**Sidebar**
```
● Minhas atividades          /me
──────────────────────
● [Unidades onde tem área]   /units/:id  (atividades visíveis conforme RBAC)
──────────────────────
● Configurações
  ├─ Perfil                  /profile
  └─ Notificações            /settings/notifications
```

> Pode criar atividade se tiver membership na área (backend permite; frontend ajustar canCreate() — Sprint 11).

---

### `viewer` — Convidado / Somente leitura

Acesso apenas aos itens explicitamente compartilhados.

**Sidebar**
```
● Minhas atividades          /me  (somente itens compartilhados)
──────────────────────
● Configurações
  ├─ Perfil                  /profile
  └─ Notificações            /settings/notifications
```

> Sem acesso a unidades, dashboard, configurações organizacionais.

---

## Rotas existentes (estado atual, 2026-05-17)

| Rota | Título | Estado | Roles |
|------|--------|--------|-------|
| `/login` | Login | ✅ Existe | Público |
| `/auth/callback` | Callback OAuth | ✅ Existe | Público |
| `/invite/:token` | Aceitar convite | ✅ Existe | Público |
| `/setup` | Wizard nova organização | ✅ Existe (starter pack pobre — FEAT-004) | Público |
| `/dashboard` | Painel Geral | ✅ Existe | owner, org_manager, unit_manager |
| `/me` | Minhas Atividades | ✅ Existe | Todos |
| `/units/:id` | Visão da Unidade | ✅ Existe | unit_manager+, conforme RBAC |
| `/activities` | Central de Atividades | ✅ Existe (com BUGs 001/002/003 — Sprint 18) | owner, org_manager, unit_manager |
| `/profile` | Meu Perfil | ✅ Existe | Todos |
| `/help` | Central de Ajuda (tutoriais) | ✅ Existe | Todos |
| `/settings` | Notificações + delivery log | ✅ Existe | Todos |
| `/settings/organization` | Organização | ✅ Existe (sem branding/logo — FEAT-007) | owner |
| `/settings/units` | Unidades | ✅ Existe (sem aba "Áreas da unidade" — FEAT-002) | owner, org_manager |
| `/settings/areas` | Áreas | ✅ Existe (sem `visibilityDefault` — FEAT-008) | owner, org_manager |
| `/settings/team` | Equipe | ✅ Existe (só escopo org — FEAT-001) | owner, org_manager |
| `/settings/templates` | Templates | ✅ Existe | owner, org_manager, unit_manager |
| `/settings/integrations` | Integrações | ✅ Existe (sem health/reconnect/diag — FEAT-005) | owner, org_manager |
| `/settings/import` | Importar Trello (wizard) | ✅ Existe (áreas hardcoded — FEAT-006) | owner, org_manager |
| `/settings/imports` | Histórico de imports (retry/cancel) | ✅ Existe | owner, org_manager |
| `/settings/recurrences` | Recorrências | ✅ Existe | owner, org_manager, unit_manager |
| `/settings/audit` | Auditoria | ✅ Existe | owner |

> Observação: o botão **"Ajuda"** (`/help`) está no rodapé do sidebar e na topbar mobile para todos os papéis. A Central de Ajuda filtra automaticamente os tutoriais visíveis por papel (ver [`docs/tutorial-mode.md`](tutorial-mode.md)).

---

## Lógica de rota padrão pós-login (já implementada)

```typescript
// apps/web/src/lib/router.ts (lógica atual)
switch (userRole) {
  case 'owner':
  case 'org_manager':
    redirect('/dashboard');
    break;
  case 'unit_manager':
  case 'area_leader':
    redirect('/units/:primaryUnitId');
    break;
  case 'executor':
  case 'viewer':
  default:
    redirect('/me');
}
```

---

## Sidebar — comportamento por viewport

**Mobile** (<768px):
- Sidebar oculta por padrão (`hidden`)
- Top bar com botão hamburger + nome da org + avatar
- Sidebar abre como overlay `fixed` com `z-50`
- Fecha ao clicar fora ou navegar

**Desktop** (≥768px):
- Sidebar `relative` estática, sempre visível
- Sem top bar de hamburger
- Items de configuração agrupados em seção expansível

---

## Desalinhamentos a resolver antes de Sprint 11

| Desalinhamento | Impacto | Ação |
|----------------|---------|------|
| `canCreate()` bloqueia executor no frontend | Executor não vê botão "Nova atividade" mas backend permite POST | Alinhar após fechar rbac-matrix.md |
| Sidebar lista todas as unidades para todos os roles | unit_manager vê unidades que não administra | Filtrar por membership no build da sidebar |
| `/settings/team` abre memberships globais | unit_manager veria toda a equipe da org | Escopo automático por unitId do usuário |
