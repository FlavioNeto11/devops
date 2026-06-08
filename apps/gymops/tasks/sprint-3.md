# Sprint 3 — RBAC e Visões

**Duração**: 2 semanas  
**Objetivo**: Cada perfil vê exatamente o que precisa. Produto passa a servir gestor, executor e supervisão.  
**Pré-requisito**: Sprint 2 completa.

---

## Backend — RBAC

- [ ] Implementar `resolvePermission(userId, activityId, action)` em `apps/api/src/lib/rbac.ts`
  - Seguir exatamente o algoritmo documentado em `docs/rbac.md`
  - Testar todos os casos de `visibility_mode` (inherited, restricted, shared)
- [ ] Aplicar `resolvePermission` como preHandler em:
  - `GET /activities/:id` → 404 se sem acesso (evitar information leak)
  - `PATCH /activities/:id`
  - `POST /activities/:id/assign`
  - `POST /activities/:id/share`
  - `DELETE /activities/:id`
- [ ] Implementar filtro RBAC em `GET /activities`:
  - Query SQL que filtra automaticamente baseado nos memberships do usuário
  - Ver query documentada em `docs/rbac.md`
- [ ] Índices compostos para performance de RBAC:
  - `memberships(user_id, organization_id, scope_type, scope_id)`
  - `activity_assignees(user_id)` (visão pessoal)
  - `activity_permissions(activity_id, user_id)`

## Backend — Visões

- [ ] `GET /me/activities` — visão pessoal
  - `?view=today` → `due_at = today AND status != concluido`
  - `?view=overdue` → `due_at < today AND status NOT IN (concluido, cancelado)`
  - `?view=this_week` → `due_at BETWEEN today AND today+7`
  - `?view=awaiting_my_return` → status = aguardando_aprovacao + usuário é aprovador
  - Aplicar filtro RBAC (só atividades que o usuário pode ver)
  - Incluir unidade e área no response

- [ ] `GET /units/:id/dashboard` — visão operacional da unidade
  - Verificar permissão: `unit_manager` ou superior
  - `summary`: total, overdue, critical, dueToday
  - `byArea`: lista de áreas com atividades (filtradas por RBAC)
  - Ordenação: área por ordem definida em `unit_areas.order`

- [ ] `GET /dashboards/overview` — painel geral
  - Verificar permissão: `org_manager` ou superior
  - `kpis`: unitsWithCriticalOverdue, totalOverdue, financialDueToday, maintenanceOpen
  - `byUnit`: array com open, overdue, critical, unassigned por unidade
  - `financialDueToday`: query em atividades da área Financeiro com due_at = today
  - `maintenanceOpen`: query em atividades da área Manutenção com status aberto
  - Cache em Redis (TTL 5min) para evitar queries pesadas a cada request

## Frontend — Visão Pessoal `/me`

- [ ] Rota `/me` com layout próprio (sem sidebar de unidade)
- [ ] Header: "Minhas atividades · {data de hoje}"
- [ ] Tabs: Hoje / Atrasadas / Esta semana / Aguardando meu retorno
  - Número de itens em cada tab (badge)
- [ ] Lista de `ActivityCard` compactos com unidade e área visíveis
- [ ] Link para abrir drawer da atividade ao clicar
- [ ] Empty state por tab ("Nenhuma atividade atrasada 🎉")
- [ ] Polling a cada 60s (TanStack Query refetchInterval)

## Frontend — Visão por Unidade (upgrade)

- [ ] Integrar com dados reais do `GET /units/:id/dashboard`
- [ ] Resumo do dia (4 cards de KPI) com dados dinâmicos
- [ ] Filtros funcionais aplicados via query params
- [ ] Indicadores de criticidade e atraso baseados em dados reais
- [ ] Agrupamento por área com contagem de atividades por área

## Frontend — Painel Geral `/dashboard`

- [ ] Rota `/dashboard` acessível apenas para `org_manager`/`owner` (redirect se não tiver permissão)
- [ ] 4 cards de KPI no topo
- [ ] Tabela de unidades:
  - Colunas: Nome, Abertas, Atrasadas, Críticas, Sem responsável
  - Linha clicável → abre visão da unidade
  - Ordenação por coluna
  - Cores: linha vermelho se `critical > 0`, laranja se `overdue > 0`
- [ ] Filtros: por área, por gestor, por período
- [ ] Polling a cada 5min

## Frontend — Controles de permissão na UI

- [ ] Ocultar botão "Nova atividade" para `executor` e `viewer`
- [ ] Ocultar "Editar" em atividade para usuários sem permissão de edit
- [ ] Mostrar botão "Restringir" apenas para `area_leader` ou superior
- [ ] Modal "Compartilhar" (somente para `area_leader` ou superior):
  - Input de busca de usuário (search por nome/email)
  - Select de nível de acesso (view/edit)
  - Lista de usuários com acesso atual

## Frontend — Navegação inteligente

- [ ] Após login, detectar papel do usuário na organização:
  - `executor`/`viewer` → redirect para `/me`
  - `unit_manager`/`area_leader` → redirect para `/units/:id` (primeira unidade)
  - `org_manager`/`owner` → redirect para `/dashboard`
- [ ] Proteger rotas com middleware Next.js:
  - `/dashboard` → requer `org_manager` ou superior
  - `/units/:id` → requer acesso à unidade

## Testes

- [ ] Teste RBAC: executor não vê atividades de outras áreas
- [ ] Teste RBAC: atividade `restricted` retorna 404 para usuário sem permissão
- [ ] Teste: `GET /me/activities?view=overdue` retorna só atividades do usuário
- [ ] Teste: `GET /dashboards/overview` soma corretamente por unidade
- [ ] Teste: cache Redis do overview invalidado após PATCH /activities
