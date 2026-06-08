# GymOps — Checklist de Release / Go-Live

**Última atualização**: 2026-05-17  
**Quando usar**: antes de cada release pública. **Bloqueia go-live se algum checkbox P0 falhar**.  
**Responsável**: agente `qa-e2e` (líder) + `devops-gymops` + `docs-roadmap`.

> Este checklist é o **único critério oficial** para declarar "produto 100%". Atualizar `docs/status.md` somente após este checklist verde.

---

## Sumário de pré-requisitos

- [ ] **Pipeline verde** no PR de release (CI + E2E)
- [ ] **Build `/gymops` testado** no CI (OPS-002)
- [ ] **E2E rodando em `pull_request`** (OPS-001)
- [ ] **Healthchecks ativos** no compose público (BUG-009)
- [ ] **`docs/backlog.md`** sem P0 abertos
- [ ] **`docs/status.md`** reconciliado com código real

---

## 1. Smoke por perfil — ambiente LOCAL Docker

> Executar com seed (`pnpm --filter @gymops/db seed`). Cada perfil deve ser testado em sessão separada (limpar cookies/localStorage entre testes).

Usuários de teste (criar via SQL ou seed estendido):
- `owner@skyfit.com` (papel: `owner`, scope `organization`)
- `orgmgr@skyfit.com` (papel: `org_manager`, scope `organization`)
- `unitmgr@skyfit.com` (papel: `unit_manager`, scope `unit` da Vila Xavier)
- `arealdr@skyfit.com` (papel: `area_leader`, scope `area` Manutenção da Vila Xavier)
- `executor@skyfit.com` (papel: `executor`, scope `area` Manutenção da Vila Xavier)
- `viewer@skyfit.com` (papel: `viewer`, scope `organization`)

### 1.1 Owner

- [ ] Login funciona e redireciona para `/dashboard`
- [ ] Sidebar mostra: Painel Geral, Minhas Atividades, Central de Atividades, todas as unidades, Perfil, Ajuda, Configurações
- [ ] Acessa `/settings/organization` e vê auditoria
- [ ] Acessa `/settings/units` → cria/edita/arquiva unidade
- [ ] Acessa `/settings/units/[id]` → vincula/desvincula áreas (FEAT-002)
- [ ] Acessa `/settings/areas` → cria/edita área (incluindo `visibilityDefault`)
- [ ] Acessa `/settings/team` → convida em escopo org/unit/area (FEAT-001)
- [ ] Acessa `/settings/templates` → cria, duplica, arquiva
- [ ] Acessa `/settings/integrations` → conecta Trello e vê health (FEAT-005)
- [ ] Acessa `/settings/import` → roda import com áreas reais (FEAT-006)
- [ ] Acessa `/settings/imports` → vê histórico, retry, cancel
- [ ] Acessa `/settings/recurrences` → pausa/retoma recorrência
- [ ] Acessa `/settings/audit` → filtra por ação e data
- [ ] Acessa `/activities` → filtros, paginação, saved views, bulk, export CSV, drill-down funcionam
- [ ] Tutorial: convite aparece; tour de Primeiros Passos completa; `/help` lista todos os tutoriais

### 1.2 Org Manager

- [ ] Mesma sidebar que owner, **exceto** Auditoria (`/settings/audit`) — owner only
- [ ] Não consegue editar organização (`/settings/organization` retorna 403 ou redirect)
- [ ] Demais ações administrativas funcionam (unidades, áreas, equipe, templates, integrações, imports, recorrências)
- [ ] Central de atividades full access

### 1.3 Unit Manager

- [ ] Login redireciona para a unidade primária (`/units/[id]`)
- [ ] Sidebar mostra Painel Geral, Minhas Atividades, Central, **apenas a unidade própria**, Perfil, Ajuda
- [ ] Configurações: vê Templates + Recorrências; **não vê** Organização/Unidades/Áreas/Equipe/Integrações/Imports/Auditoria
- [ ] Cria, edita e atribui atividade na unidade própria
- [ ] **Não vê** atividades de outras unidades em `/activities`

### 1.4 Area Leader

- [ ] **(BUG-005)** Login resolve `primaryUnitId` corretamente via membership de área → unit via `unit_areas`
- [ ] Redireciona para a unidade que contém sua área
- [ ] Visualiza apenas atividades da área dele dentro da unidade
- [ ] Cria atividade na área própria
- [ ] **Não** consegue criar atividade em outra área (mesmo na mesma unidade)

### 1.5 Executor

- [ ] Login redireciona para `/me`
- [ ] **(BUG-006)** Botão "Nova atividade" visível quando contexto permite (não bloqueado por `canCreate`)
- [ ] Vê apenas atividades onde é `assignee`/`watcher` ou da área dele
- [ ] Atualiza status, marca checklist, comenta, anexa

### 1.6 Viewer

- [ ] Login redireciona para `/me`
- [ ] **Não** vê CTA de criação em nenhuma tela
- [ ] Sidebar não mostra Central de Atividades
- [ ] Configurações: apenas Notificações + Perfil
- [ ] `/help` filtra para tutoriais somente de leitura

---

## 2. Smoke por perfil — ambiente PÚBLICO (`/gymops`)

Repetir todos os itens da seção 1, **mas validando**:

- [ ] Todas as URLs com prefixo `/gymops`
- [ ] Cookies (`refresh_token`, `auth_token`) com `Path=/gymops` ou compatível
- [ ] Assets estáticos carregam (`/gymops/_next/static/...`)
- [ ] API requests vão para `/gymops/api/...`
- [ ] OAuth Google redireciona corretamente para `/gymops/auth/callback`
- [ ] Trello return URL aponta para `/gymops/settings/integrations`
- [ ] Centro de Ajuda funciona com prefix
- [ ] Refresh da página em qualquer rota não quebra (Next basePath funcional)

---

## 3. Fluxos críticos ponta a ponta

### 3.1 Setup → operacional

- [ ] Acessar `/setup` (anônimo) → criar nova organização com senha de **8 caracteres**
- [ ] Login automático ou redirect para `/login` funciona
- [ ] Nova org tem **6 áreas + 24 templates** (FEAT-004) — não as 5 áreas pobres
- [ ] Wizard oferece passo opcional de unidade inicial
- [ ] Branding (logo) editável em `/settings/organization` (FEAT-007)

### 3.2 Convite real ponta a ponta

- [ ] Owner convida `novo@teste.com` como `area_leader` da área X
- [ ] E-mail recebido (verificar em SMTP de teste ou log)
- [ ] Novo usuário abre `/invite/[token]` → cria senha
- [ ] Login automático → cai no contexto correto (BUG-005)
- [ ] Vê apenas atividades da área X
- [ ] Owner consegue revogar acesso

### 3.3 Importação Trello sem duplicatas

- [ ] Importar board Trello (JSON) → wizard usa áreas reais (FEAT-006)
- [ ] Reimportar o mesmo board → 0 atividades duplicadas; itens marcados `skipped` com motivo
- [ ] Cancelar job pendente funciona
- [ ] Retry de job falho funciona

### 3.4 Integrações operacionais

- [ ] Card Trello mostra status real e botão Reconectar (FEAT-005)
- [ ] Card WhatsApp mostra modo sandbox/prod, número, últimos erros, botão Testar canal
- [ ] Teste de canal cria entrada em `notification_deliveries`

### 3.5 Central de atividades acionável

- [ ] **(BUG-001)** Filtro por prioridade retorna resultados em todos os 4 níveis
- [ ] **(BUG-002)** Bulk update conclui sem 422
- [ ] **(BUG-003)** Export CSV reflete filtro de prioridade
- [ ] Paginação carrega mais (FEAT-003)
- [ ] Saved views salva e aplica (FEAT-003)
- [ ] Filtro por responsável funciona
- [ ] Clicar em linha abre drawer com edição funcional
- [ ] Bulk: status, prioridade, atribuir, arquivar

---

## 4. Operação e segurança

- [ ] `pnpm --filter @gymops/api typecheck` passa
- [ ] `pnpm --filter @gymops/web typecheck` passa
- [ ] `pnpm --filter @gymops/web lint` passa
- [ ] `pnpm --filter @gymops/web build` passa
- [ ] Build secundário com `NEXT_PUBLIC_APP_BASE_PATH=/gymops` passa (OPS-002)
- [ ] `pnpm --filter @gymops/api test` passa (incluindo testes novos de RBAC, tutorial, auth-by-area)
- [ ] `pnpm --filter @gymops/web test:e2e` passa
- [ ] E2E roda em PR (não apenas em main) — OPS-001
- [ ] `docker compose -f docker-compose.public.yml up -d` → todos os containers `(healthy)` em 90s — BUG-009
- [ ] `ALLOWED_ORIGINS` configurado via env (não hardcoded) — BUG-010
- [ ] `Session.refreshToken` armazenado em hash — BUG-008
- [ ] `ENCRYPTION_KEY` obrigatório em produção (verificar boot guard)
- [ ] Logs não vazam stack trace para clientes (verificar handler de erro)

---

## 5. Documentação

- [ ] `docs/status.md` atualizado com a versão da release
- [ ] `docs/backlog.md` sem P0 abertos
- [ ] `docs/CHANGELOG.md` ou notas de release atualizadas
- [ ] `README.md` aponta para a versão correta dos docs
- [ ] Variáveis de ambiente documentadas em `.env.docker.example`

---

## 6. Pós-release

- [ ] Monitorar logs por 24h
- [ ] Verificar `notification_deliveries` (taxa de falha)
- [ ] Verificar `audit_logs` (volume esperado)
- [ ] Backup do Postgres confirmado
- [ ] Comunicado aos clientes (se aplicável)

---

## Como reportar problemas no checklist

1. Se um checkbox falhar: **abrir issue** linkando este documento e a versão da release.
2. Se for bug P0: adicionar como `BUG-xxx` em [`docs/backlog.md`](backlog.md) e **bloquear release**.
3. Se for melhoria: adicionar como `FEAT-xxx` em [`docs/backlog.md`](backlog.md) — pode ir para release seguinte.
4. Atualizar `docs/status.md` com a evidência do problema.
