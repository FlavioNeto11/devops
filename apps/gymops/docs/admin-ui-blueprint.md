# Blueprint de UI Administrativa — GymOps

**Última atualização**: 2026-05-17

Este documento especifica cada tela administrativa a ser construída nas Sprints 9–14. Para cada tela: propósito, usuários-alvo, campos, ações, RBAC, API necessária e wireframe textual.

> **Modo Tutorial (Sprint 17)**: cada tela administrativa expõe um `<TutorialTrigger />` no header (visível apenas para papéis permitidos) e um ou mais `data-tutorial` em seções chave (lista, formulário, filtros). A lista completa de targets está em [`docs/tutorial-mode.md`](tutorial-mode.md#como-adicionar-data-tutorial-a-um-elemento). Não criar tela administrativa nova sem registrar ao menos um tutorial correspondente no registry.

---

## 1. Perfil do Usuário (Sprint 9)

**Rota**: `/profile`  
**Usuários**: Todos autenticados  
**Prioridade**: Alta — desbloqueia cadastro de telefone para WhatsApp

### Campos
- Nome completo (editável)
- E-mail (somente leitura — identidade da conta)
- Telefone (`+5511999998888` formato E.164 — obrigatório para WhatsApp)
- Avatar (upload para R2 ou URL externa)
- Fuso horário (select; padrão: `America/Sao_Paulo`)
- Início da semana (seg/dom)

### Ações
- Salvar perfil
- Trocar avatar (presign R2 → upload → registrar)
- Validar formato do telefone antes de salvar

### Validações
- Telefone: E.164 obrigatório se WhatsApp habilitado
- Avatar: MIME type (image/*) + tamanho ≤5MB
- Fuso horário: lista IANA válida

### API

| Método | Rota | Situação |
|---|---|---|
| GET | `/auth/me` | Existe — dados básicos |
| PATCH | `/me/profile` | **Novo (Sprint 9)** — nome, telefone, avatar, timezone |
| POST | `/me/avatar/presign` | **Novo (Sprint 9)** — presign R2 |
| POST | `/me/avatar` | **Novo (Sprint 9)** — registrar após upload |

### Wireframe textual

```
┌─ Meu Perfil ─────────────────────────────────────────┐
│ [Avatar 80px]  João Silva                             │
│                joao@skyfit.com (não editável)         │
│                [Trocar avatar]                        │
├───────────────────────────────────────────────────────┤
│ Nome completo     [João Silva________________]         │
│ Telefone          [+5511999998888____________]         │
│ Fuso horário      [America/Sao_Paulo ▼]               │
│ Início da semana  [Segunda-feira ▼]                   │
├───────────────────────────────────────────────────────┤
│                              [Cancelar] [Salvar]      │
└───────────────────────────────────────────────────────┘
```

---

## 2. Gestão da Organização (Sprint 9)

**Rota**: `/settings/organization`  
**Usuários**: `owner`  
**Prioridade**: Alta

### Campos (por seção)

**Identidade**
- Nome da organização
- Slug (único no sistema; afeta URLs)
- Logo (upload)

**Políticas operacionais** (salvas em `organization.settings` JSONB)
- Horário de envio do resumo diário (padrão: 07:00)
- Prazo padrão para novas atividades (dias)
- Visibilidade padrão de atividades (inherited/shared/restricted)

**Ambiente** (somente leitura)
- ID da organização
- Data de criação
- Plano atual

### Ações
- Editar identidade (salvar seção)
- Editar políticas (salvar seção)

### Validações
- Slug: `^[a-z0-9-]+$`; único; mínimo 3 chars
- Logo: MIME image/*; ≤5MB

### API

| Método | Rota | Situação |
|---|---|---|
| GET | `/organizations/:id` | Existe |
| PATCH | `/organizations/:id` | Existe — ampliar com logo presign e settings schema |

### Wireframe textual

```
┌─ Configurações da Organização ───────────────────────┐
│ [Tabs: Identidade | Políticas | Ambiente]             │
├───────────────────────────────────────────────────────┤
│ Aba: Identidade                                       │
│ Logo          [Logo 64px] [Trocar logo]               │
│ Nome          [SkyFit_______________________]         │
│ Slug          [skyfit______________________]          │
│               ↳ app.gymops.com/skyfit                 │
│                              [Salvar identidade]      │
├───────────────────────────────────────────────────────┤
│ Aba: Políticas                                        │
│ Resumo diário às    [07:00 ▼]                         │
│ Prazo padrão        [7 dias ▼]                        │
│ Visibilidade padrão [inherited ▼]                     │
│                              [Salvar políticas]       │
└───────────────────────────────────────────────────────┘
```

---

## 3. Gestão de Templates (Sprint 9 — melhoria da tela existente)

**Rota**: `/settings/templates`  
**Usuários**: `owner`, `org_manager`  
**Status**: Tela existe; melhorar com preview e duplicação

### Campos por template
- Nome, descrição
- Área, prioridade padrão, visibilidade padrão
- SLA sugerido (dias)
- Checklist padrão (itens ordenados)
- `isSystem` (somente leitura — templates do seed)

### Ações
- Criar novo template
- Editar template (não-system)
- Duplicar template (cria cópia editável)
- Arquivar template (soft delete)
- Preview: simular pré-preenchimento no formulário de nova atividade
- Filtrar por área

### Validações
- Nome obrigatório; único por área na organização
- Checklist sem itens vazios
- SLA ≥ 1 se informado
- Templates `isSystem` não podem ser excluídos (só arquivados por owner)

### API nova

| Método | Rota | Situação |
|---|---|---|
| POST | `/activity-templates/:id/duplicate` | **Novo (Sprint 9)** |

---

## 4. Gestão de Unidades (Sprint 10)

**Rota**: `/settings/units`  
**Usuários**: `owner`, `org_manager`  
**Prioridade**: Alta

### Campos
- Nome, código (único por org), endereço
- Status (ativa/inativa)
- Contagem de áreas ativas, membros ativos, atividades abertas

### Ações
- Criar unidade (modal)
- Editar unidade (drawer)
- Ativar / inativar unidade
- Abrir dashboard administrativo da unidade
- Navegar para visão operacional da unidade

### Validações
- Código: único por organização; `^[A-Z0-9-]+$`
- Nome: obrigatório, mínimo 2 chars
- Inativação: alertar se existirem atividades abertas ou recorrências ativas

### API

| Método | Rota | Situação |
|---|---|---|
| GET | `/units` | Existe |
| POST | `/units` | Existe |
| PATCH | `/units/:id` | Existe |
| GET | `/units/:id/dashboard` | Existe — usar no painel admin |
| DELETE | `/units/:id` | **Novo opcional (Sprint 10)** — soft archive |

### Wireframe textual

```
┌─ Unidades ────────────────────────────────────────────┐
│ [Buscar unidade...___________] [+ Nova unidade]       │
│ Filtro: [Todas ▼] [Status: Todas ▼]                   │
├───────────────────────────────────────────────────────┤
│ Nome          | Código | Áreas | Membros | Status      │
│ Vila Xavier   | VX     | 6     | 12      | ● Ativa     │
│ Centro        | CT     | 5     | 8       | ● Ativa     │
│ Shopping      | SH     | 4     | 6       | ○ Inativa   │
│ [Editar] [Dashboard] [Ver operação]                    │
├───────────────────────────────────────────────────────┤
│ Total: 3 unidades | 2 ativas | 1 inativa               │
└───────────────────────────────────────────────────────┘
```

---

## 5. Gestão de Áreas (Sprint 10)

**Rota**: `/settings/areas`  
**Usuários**: `owner`, `org_manager`  
**Prioridade**: Alta

### Campos
- Nome, chave (key; única por org), cor hexadecimal
- Visibilidade padrão de atividades na área
- Unidades em que está habilitada + ordem em cada unidade

### Ações
- Criar área
- Editar área (nome, cor, visibilidade padrão)
- Habilitar área em unidade (com posição de ordem)
- Desabilitar área em unidade
- Reordenar áreas dentro de uma unidade (drag ou botões)
- Arquivar área (com confirmação se tem atividades/templates)

### Validações
- Chave: `^[a-z_]+$`; única por organização
- Cor: hex válido (`#RRGGBB`)
- Arquivar: confirmar impacto em atividades e templates ativos

### API

| Método | Rota | Situação |
|---|---|---|
| GET | `/areas` | Existe |
| POST | `/areas` | Existe |
| PATCH | `/areas/:id` | Existe |
| POST | `/units/:id/areas` | Existe |
| DELETE | `/units/:id/areas/:areaId` | Existe |
| PATCH | `/units/:id/areas/reorder` | **Novo (Sprint 10)** |

### Wireframe textual

```
┌─ Áreas ───────────────────────────────────────────────┐
│ [+ Nova área]                   [Filtrar por unidade ▼]│
├───────────────────────────────────────────────────────┤
│ ● Administrativo  #3B82F6  inherited  ✓ VX ✓ CT ✓ SH  │
│ ● Marketing       #8B5CF6  inherited  ✓ VX ✓ CT ✗ SH  │
│ ● Manutenção      #EF4444  restricted ✓ VX ✓ CT ✓ SH  │
│   [Editar] [Gerenciar vínculos] [Reordenar em unidade] │
├───────────────────────────────────────────────────────┤
│ Drawer "Gerenciar vínculos — Manutenção":             │
│  Vila Xavier   [Posição: 1 ▼]  [Habilitar/Desabilitar]│
│  Centro        [Posição: 2 ▼]  [Habilitar/Desabilitar]│
│  Shopping      [Desabilitada]  [Habilitar/Desabilitar] │
└───────────────────────────────────────────────────────┘
```

---

## 6. Gestão de Equipe e Permissões (Sprint 11)

**Rota**: `/settings/team`  
**Usuários**: `owner` (tudo), `org_manager` (abaixo de owner), `unit_manager` (sua unidade)  
**Prioridade**: Alta

### Campos por membro/convite
- Nome, e-mail, telefone
- Papel atual por escopo
- Status (ativo, convite pendente, inativo)
- Quem concedeu o acesso, quando

### Ações
- Convidar pessoa (novo usuário — com e-mail de convite)
- Adicionar usuário existente (busca por e-mail)
- Alterar papel de membro
- Revogar acesso (memberships soft delete)
- Reenviar convite
- Cancelar convite
- Visualizar matriz de permissões por unidade/área

### Validações
- Não remover último `owner`
- `unit_manager` não pode conceder papel org-level
- Convite duplicado ativo não é permitido
- Expiração de convite: padrão 7 dias

### API nova (Sprint 11)

| Método | Rota | Objetivo |
|---|---|---|
| POST | `/invitations` | Criar convite (gera token, envia e-mail) |
| GET | `/invitations` | Listar convites por org (com status/expiração) |
| POST | `/invitations/:id/resend` | Reenviar e-mail |
| DELETE | `/invitations/:id` | Cancelar convite |
| POST | `/invitations/:token/accept` | Aceitar convite (criar usuário + memberships) |

**Modelo Prisma (Sprint 11)**:
```prisma
model Invitation {
  id             String   @id @default(uuid())
  organizationId String
  email          String
  role           String
  scopeType      String
  scopeId        String?
  tokenHash      String   @unique
  invitedBy      String
  status         String   @default("pending") // pending | accepted | cancelled | expired
  expiresAt      DateTime
  acceptedAt     DateTime?
  createdAt      DateTime @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id])
}
```

### Wireframe textual

```
┌─ Equipe ──────────────────────────────────────────────┐
│ [Buscar por nome/e-mail] [Filtro: papel ▼] [Convidar] │
├───────────────────────────────────────────────────────┤
│ Nome      | E-mail       | Papel          | Status     │
│ João S.   | joao@...     | owner          | ● Ativo    │
│ Ana M.    | ana@...      | unit_manager   | ● Ativo    │
│           | conv@...     | executor       | ⌛ Pendente │
│ [Editar papel] [Revogar] | [Reenviar] [Cancelar]      │
├───────────────────────────────────────────────────────┤
│ Drawer "Convidar pessoa":                             │
│  E-mail          [_________________________________]  │
│  Escopo          [Organização ▼]                      │
│  Papel           [org_manager ▼]                      │
│  Expira em       [7 dias ▼]                           │
│                              [Cancelar] [Enviar]      │
└───────────────────────────────────────────────────────┘
```

---

## 7. Central Global de Atividades (Sprint 12)

**Rota**: `/activities`  
**Usuários**: `owner`, `org_manager` (tudo); `unit_manager` (suas unidades)  
**Prioridade**: Alta

### Filtros disponíveis
- Busca textual (título + descrição)
- Unidade, Área
- Status (multi-select)
- Prioridade (multi-select)
- Responsável, Watcher
- Prazo de/até
- Somente recorrentes
- Somente sem responsável
- Somente com anexo
- Somente "aguardando aprovação"
- Salvar como filtro reutilizável

### KPI strip
- Atrasadas | Críticas | Sem responsável | Aguardando aprovação

### Colunas da tabela
- Atividade (título com badge de prioridade)
- Unidade | Área | Status | Prioridade | Prazo | Responsável | Recorrente

### Ações
- Abrir drawer de atividade
- Selecionar múltiplas → ações em lote:
  - Alterar status
  - Alterar prioridade
  - Alterar prazo
  - Atribuir/remover responsável
- Exportar CSV (filtrado)
- Salvar filtro atual com nome

### API nova (Sprint 12)

| Método | Rota | Situação |
|---|---|---|
| GET | `/activities` | Existe — ampliar: `q`, `dueFrom`, `dueTo`, `sort`, `recurring`, `unassigned`, `watcherId` |
| POST | `/activities/bulk-update` | **Novo** — `{ ids[], patch: { status?, priority?, dueAt? } }` |
| POST | `/activities/bulk-assign` | **Novo** — `{ ids[], add[], remove[] }` |
| POST | `/saved-views` | **Novo** — `{ name, scope: "org", filtersJson }` |
| GET | `/saved-views` | **Novo** — `organizationId` |
| DELETE | `/saved-views/:id` | **Novo** |

---

## 8. Centro de Importações (Sprint 13)

**Rota**: `/settings/imports`  
**Usuários**: `owner`, `org_manager`  
**Prioridade**: Média

### Campos por job
- ID, origem (JSON/API), data, status, board(s), criados/ignorados/falhas, erros, usuário executor

### Ações
- Ver histórico de jobs (paginado)
- Abrir detalhe com itens criados/falhos
- Baixar relatório CSV
- Retry de job falho
- Cancelar job em processamento
- Iniciar nova importação (acesso ao wizard)

### API nova (Sprint 13)

| Método | Rota | Objetivo |
|---|---|---|
| GET | `/imports` | Existe — adicionar filtros por status/data |
| GET | `/imports/:id/items` | **Novo** — itens detalhados (criados, ignorados, falhos) |
| POST | `/imports/:id/retry` | **Novo** — reenfileirar job em status failed |
| POST | `/imports/:id/cancel` | **Novo** — cancelar job pending/processing |
| GET | `/integrations/trello/health` | **Novo** — verificar validade do token |
| POST | `/integrations/trello/reconnect` | **Novo** — renovar token expirado |

---

## 9. Centro de Recorrências (Sprint 14)

**Rota**: `/settings/recurrences`  
**Usuários**: `owner`, `org_manager`, `unit_manager`  
**Prioridade**: Média

### Campos por regra
- Atividade de origem, frequência, próxima execução, última execução
- Status (ativa/pausada), unidade/área

### Ações
- Listar regras (com filtro por unidade/área/status)
- Pausar regra
- Retomar regra
- Editar frequência
- Excluir regra (com confirmação)
- Ver histórico de ocorrências geradas

---

## 10. Centro de Notificações e Logs (Sprint 14)

**Rota**: `/settings/notifications` (expandir tela existente)  
**Usuários**: Todos (próprias preferências); `owner`/`org_manager` (logs organizacionais)  
**Prioridade**: Média

### Tabs

**Preferências** (existente — manter)
- Toggles por canal: e-mail, push, WhatsApp
- Gerenciar dispositivos inscritos

**Histórico de entregas** (novo)
- Tabela: canal, tipo, data, status (enviado/falhou), mensagem de erro
- Filtro por canal e período
- Botão "Testar canal" (e-mail + push + WhatsApp)

### API nova (Sprint 14)

| Método | Rota | Objetivo |
|---|---|---|
| GET | `/notifications/deliveries` | Histórico de entregas do usuário |
| POST | `/notifications/test` | Ampliar com `channel: 'whatsapp'` |
| GET | `/integrations/whatsapp/status` | Sandbox vs produção, sender, falhas recentes |

---

## Convenções de UX para telas administrativas

- Toda tela administrativa usa o layout de Settings (tabs laterais no desktop, tabs horizontais no mobile)
- Drawers para criação/edição contextual sem sair da lista
- Confirmação obrigatória (modal) para ações destrutivas: revogar acesso, arquivar, excluir
- Feedback transacional: toast de sucesso/erro após toda ação
- Estados vazios com call-to-action claro ("Nenhuma unidade. [Criar primeira unidade]")
- Loading skeletons em listas (nunca spinners globais)
- Paginação cursor para listas >50 itens
- Responsive: drawer fullscreen no mobile, max-w-2xl no desktop

---

## 11. Profundidade administrativa (Sprints 18–21)

> Os blueprints originais (1–10) entregaram a base. Esta seção complementa com a **profundidade operacional** identificada na reconciliação 2026-05-17. Referência cruzada: [`docs/backlog.md`](backlog.md), [`docs/implementation-plan.md`](implementation-plan.md).

### 11.1 Equipe escopada por org/unit/area (FEAT-001 — Sprint 19)

**Estado atual**: a tela `/settings/team` ([`apps/web/src/app/(app)/settings/team/page.tsx`](../apps/web/src/app/(app)/settings/team/page.tsx)) lista apenas memberships `scopeType='organization'` e o modal de convite força `scopeType='organization'`.

**Estado alvo**:
- **3 abas**: "Organização", "Por unidade", "Por área".
- **Lista consolidada** com agrupamento por usuário, mostrando todas as memberships.
- **Modal de convite**: seletor de escopo (org/unit/area) + seletor de `scopeId` correspondente (autocomplete).
- **Edição de membership**: clicar em uma linha abre drawer com edição de papel/escopo (via `PATCH /memberships/:id` — criar endpoint se não existir).
- **Histórico de convites**: filtro por status (`pending|accepted|cancelled|expired`).
- **Busca de usuário existente** para evitar duplicar convite quando o usuário já está na organização.

### 11.2 Matriz `unit_areas` (FEAT-002 — Sprint 19)

**Estado atual**: o modelo `UnitArea` existe; endpoints `addArea`/`removeArea`/`reorderAreas` estão em `unitsApi`; UI não expõe.

**Estado alvo**:
- Nova aba **"Áreas da unidade"** dentro de `/settings/units/[id]` (ou drawer ao clicar em uma unidade da listagem).
- **Lista das áreas vinculadas**, ordenadas, com drag-handle para reorder.
- **Listagem das áreas disponíveis** (do catálogo da org) com botão "Vincular".
- **Toggle de status da unidade** (`active/inactive`).
- **Aviso de impacto**: ao desvincular uma área, mostrar contagem de atividades existentes e exigir confirmação.

### 11.3 Central de Atividades acionável (FEAT-003 — Sprint 19)

**Estado atual**: tabela + KPIs + bulk update (com BUG-002) + export CSV (com BUG-003) + filtro de prioridade quebrado (BUG-001).

**Estado alvo (além dos bugs corrigidos)**:
- **Paginação por cursor** (botão "Carregar mais" no rodapé).
- **Saved views**: dropdown no header com "Aplicar / Salvar atual / Renomear / Excluir". Backend `saved-views` já existe.
- **Filtro por responsável**: autocomplete de usuários (`GET /users?q=`).
- **Drill-down**: clicar na linha abre o `ActivityDrawer` (reutilizar componente). Ao fechar, lista revalida.
- **Bulk actions estendidos**: alterar prioridade, atribuir/desatribuir responsável, arquivar.

### 11.4 Organização com branding/logo/settings (FEAT-007 — Sprint 20)

**Estado atual**: edita apenas o nome.

**Estado alvo**:
- Upload de logo (mesmo fluxo de presign R2 do avatar do usuário).
- Edição de `settings.defaults.notifications` (booleans por canal).
- Edição de `settings.defaults.visibilityMode` (`inherited|restricted|shared`) — afeta atividades novas.
- Preview do logo na tela de login e na topbar mobile.

### 11.5 Áreas com `visibilityDefault` e matriz de uso (FEAT-008 — Sprint 20)

**Estado alvo**:
- Dialog de edição expõe `visibilityDefault`.
- Listagem mostra coluna **"Unidades usando"** (count) com drill-down (modal listando as unidades).

### 11.6 Integrações operacionais (FEAT-005 — Sprint 20)

**Estado atual**: cards "conectado/desconectado". Não expõe health/reconnect/boards/erros que a API já devolve.

**Estado alvo**: ver [`docs/integrations-ops.md`](integrations-ops.md). Resumo:
- Card Trello com badge de saúde (polling 30s), botão "Reconectar", lista de boards.
- Card WhatsApp com modo (sandbox/prod), número remetente, últimos 5 erros, botão "Testar canal".

### 11.7 Import wizard dinâmico (FEAT-006 — Sprint 20)

**Estado atual**: áreas hardcoded; mapeamento por `targetUnitName`.

**Estado alvo**:
- Wizard carrega áreas reais via `areasApi.list(organizationId)`.
- Mapeamento de board → unidade vira `Select` de unidades existentes (autocomplete), guardando `targetUnitId`.
- Preview de **duplicidades** antes do commit (dedupe cross-job em backend — ver FEAT-006).
- Opção "Criar nova unidade" inline (chama `POST /units`).
