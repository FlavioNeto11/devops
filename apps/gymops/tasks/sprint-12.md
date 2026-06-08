# Sprint 12 — Central Global de Atividades

**Objetivo**: Liderança tem cockpit transversal para acompanhar e operar toda a organização.  
**Resultado de negócio**: Qualquer atividade encontrável em <3 interações; ação em lote elimina trabalho repetitivo.  
**Duração**: 2 semanas

---

## Backend — API (apps/api)

### Ampliar `GET /activities`

- [ ] Novos parâmetros de query:
  - `q` — busca textual em `title` e `description` (usar `ILIKE '%q%'` ou Prisma `contains`)
  - `dueFrom` e `dueTo` — período ISO 8601
  - `sort` — `dueAt_asc | dueAt_desc | priority_desc | createdAt_desc` (default: `createdAt_desc`)
  - `recurring` — `true` (só recorrentes)
  - `unassigned` — `true` (sem responsável)
  - `hasAttachment` — `true` (com pelo menos um anexo)
  - `watcherId` — atividades em que userId é watcher
  - `templateId` — filtrar por template
  - `awaitingApproval` — status `aguardando_aprovacao`
- [ ] RBAC no filtro: `org_manager` vê org inteira; `unit_manager` só suas unidades (adicionar filtro automático)
- [ ] Retornar `meta.total` para o KPI strip
- [ ] Manter paginação cursor existente (`after`, `limit`)

### Ações em lote

- [ ] `POST /activities/bulk-update`
  - Body: `{ ids: string[], patch: { status?: string, priority?: string, dueAt?: string | null } }`
  - Validar: todos os ids pertencem à organização do usuário
  - Validar RBAC: usuário tem permissão de edição em cada atividade (ou limitar ao que o RBAC permite)
  - Executar em `db.$transaction`
  - Retornar `{ data: { updated: number } }`
- [ ] `POST /activities/bulk-assign`
  - Body: `{ ids: string[], add: string[], remove: string[] }` (arrays de userId)
  - Validar pertencimento dos ids à org
  - Retornar `{ data: { updated: number } }`

### Filtros salvos

- [ ] Migration para `SavedView`:
  ```prisma
  model SavedView {
    id             String   @id @default(uuid())
    userId         String
    organizationId String
    name           String
    filtersJson    Json
    isDefault      Boolean  @default(false)
    createdAt      DateTime @default(now())
    updatedAt      DateTime @updatedAt
    user           User         @relation(fields: [userId], references: [id])
    organization   Organization @relation(fields: [organizationId], references: [id])
  }
  ```
- [ ] `POST /saved-views` — criar filtro salvo
- [ ] `GET /saved-views?organizationId=` — listar filtros do usuário
- [ ] `DELETE /saved-views/:id` — excluir filtro

---

## Frontend — Web (apps/web)

### Central Global de Atividades (`/activities`)

- [ ] Criar rota `/activities` (owner, org_manager, unit_manager*)
- [ ] Componente `GlobalActivitiesPage`:
  - **KPI strip**: Atrasadas | Críticas | Sem responsável | Aguardando aprovação
    - Cada KPI é clicável e aplica filtro correspondente
  - **Barra de filtros** (colapsável no mobile):
    - Busca textual (`q`)
    - Selects: Unidade, Área, Status (multi), Prioridade (multi)
    - Filtros avançados (toggle): Responsável, Watcher, Prazo de/até, Só recorrentes, Só sem responsável, Só aguardando aprovação
    - Botão "Salvar filtro" → modal com campo de nome
  - **Filtros salvos**: chip list acima da tabela; clicar aplica; X remove da sessão
  - **Tabela** com colunas:
    - [ ] (checkbox seleção)
    - Título + badge de prioridade
    - Unidade | Área | Status | Prazo | Responsável | ↻ (recorrente)
  - **Barra de ações em lote** (aparece ao selecionar ≥1):
    - Alterar status, Alterar prioridade, Alterar prazo, Atribuir responsável
    - Botão "Exportar CSV" (filtra os selecionados ou todos conforme filtro)
- [ ] Drawer de atividade: reutilizar `ActivityDrawer` existente
- [ ] Paginação cursor com "Carregar mais"
- [ ] Adicionar link "Central de Atividades" na sidebar (owner, org_manager, unit_manager*)
- [ ] Responsivo: filtros colapsam em mobile; tabela com `overflow-x-auto`

### Exportação CSV

- [ ] Botão "Exportar CSV" → chama endpoint com filtros atuais → download
- [ ] Backend: `GET /activities/export?format=csv&<filtros>` — retornar CSV com headers:
  `ID, Título, Unidade, Área, Status, Prioridade, Prazo, Responsável, Criado em`

---

## Testes

- [ ] `GET /activities` com parâmetros novos: validar filtros e RBAC automático por unitId
- [ ] `POST /activities/bulk-update` — ids de outra org → 403; transação: todos ou nenhum
- [ ] `POST /saved-views` + `GET /saved-views` — isolamento por userId
- [ ] unit_manager vê apenas atividades de suas unidades mesmo sem filtro de unidade

---

## Critérios de aceite

- [ ] org_manager filtra atividades por unidade + status + prazo e vê resultado em <2s
- [ ] Seleciona 5 atividades → altera prioridade para crítica → toast "5 atividades atualizadas"
- [ ] Salva filtro "Atrasadas críticas VX" → reabre página → filtro disponível e aplicável
- [ ] KPI "Atrasadas" exibe contagem correta e clicar filtra automaticamente
- [ ] unit_manager não vê atividades de outras unidades
- [ ] Toda tela responsiva em 375px e 1280px

---

## Pitfalls conhecidos

- Busca textual com `ILIKE` pode ser lenta em tabelas grandes — adicionar índice em `activities.title` se necessário
- `bulk-update` e `bulk-assign`: limitar a 100 ids por request para evitar timeout
- Filtro de `watcherId`: requer join com tabela de watchers (verificar se existe coluna ou tabela de watchers)
- `SavedView.filtersJson`: não validar schema no banco — apenas armazenar; validar no GET antes de aplicar
- Export CSV: não usar `res.download()` do Fastify diretamente — usar `reply.header('Content-Disposition', 'attachment; filename=...')`
