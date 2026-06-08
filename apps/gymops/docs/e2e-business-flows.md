# Fluxos de Negócio E2E — GymOps

**Última atualização**: 2026-05-17

Este documento define os **critérios de aceite por fluxo de negócio** que devem guiar a suíte Playwright. Cada fluxo tem: personas envolvidas, pré-condições, passos, critérios de aceite e estado atual.

> **Reconciliação 2026-05-17**: vários cenários abaixo estavam marcados como "❌ Não implementado" mesmo já existindo no código (convite por token, aceite de convite, retry/cancel de import). Estado atual foi corrigido por inspeção do código. Cenários remanescentes sem implementação fazem parte do backlog em [`docs/backlog.md`](backlog.md) (Sprints 18–21).

**Legenda de estado atual**:
- ✅ — implementado + coberto por E2E ou smoke automatizado
- ✅ (backend) — funcionalidade existe na API, falta apenas spec Playwright
- ⚠️ — implementado parcialmente; faltam casos descritos
- ❌ — não implementado

A suíte atual cobre auth, activity, RBAC, import, dashboard, tutorial. Cenários novos (S18–S21) devem ser adicionados como specs em `apps/web/e2e/`.

---

## Fluxo X — Modo Tutorial (Sprint 17, smoke entregue)

**Personas**: novo usuário em primeiro acesso; usuário existente acessando ajuda.

**Pré-condições**:
- Usuário autenticado.
- `tutorial_progress` vazio (para validar convite de onboarding).

**Passos**:
1. Após login, em até 1 segundo o convite "Quer fazer um tour rápido pelo GymOps?" aparece no canto inferior direito.
2. Usuário clica "Começar agora" → overlay do tutorial `first-steps` aparece com o passo 1.
3. Usuário avança com botão "Próximo" até o último passo, depois "Concluir".
4. Convite não reaparece para essa sessão; status no backend = `completed`.
5. Usuário acessa `/help` pelo sidebar; vê todos os tutoriais permitidos para seu papel.
6. Usuário busca por "Painel" e abre o tutorial Painel Geral; overlay aparece sobre `[data-tutorial="dashboard-kpis"]`.

**Critérios de aceite**:
- Convite respeita "Não mostrar mais" entre sessões.
- Passo com `target` ausente é pulado automaticamente (não trava o overlay).
- Tecla Esc fecha o tutorial.
- Mobile (375 px) não corta o cartão.
- Viewer não vê tutoriais administrativos (`team-permissions`, `audit`, etc).

**Estado atual**: ✅ smoke Playwright em [`apps/web/e2e/tutorial.spec.ts`](../apps/web/e2e/tutorial.spec.ts). Validação visual (mobile, RBAC por papel) **manual** — checklist em [`docs/tutorial-mode.md`](tutorial-mode.md#validação-manual).

---

## Fluxo 1 — Autenticação e sessão

**Personas**: Todos os usuários  
**Sprint de implementação dos testes**: 15

### Cenários

#### 1.1 Login por e-mail/senha
- **Pré-condição**: Usuário cadastrado no seed
- **Passos**: Acessar `/login` → preencher credenciais → clicar "Entrar"
- **Critérios de aceite**:
  - Redireciona para rota padrão do papel
  - Token não aparece em `localStorage` (verificar via `page.evaluate`)
  - Cookie `refresh_token` presente no browser
- **Estado atual**: ✅ Spec existe em `e2e/auth.spec.ts`

#### 1.2 Login Google OAuth
- **Pré-condição**: Ambiente com Google OAuth configurado (stub em CI)
- **Passos**: Clicar "Entrar com Google" → callback → consume cookie
- **Critérios de aceite**:
  - URL de callback sem `?token=`
  - Usuário autenticado após `/auth/consume`
- **Estado atual**: ⚠️ Não testado (requer stub OAuth em CI)

#### 1.3 Refresh silencioso em 401
- **Passos**: Autenticar → expirar access token (manipular) → fazer requisição → verificar renovação
- **Critérios de aceite**:
  - Requisição original completa com sucesso após refresh
  - Sem logout forçado do usuário
- **Estado atual**: ❌ Não testado

#### 1.4 Logout
- **Passos**: Logar → clicar logout → verificar sessão destruída
- **Critérios de aceite**:
  - Cookies removidos
  - Store Zustand limpo
  - Redirecionado para `/login`
- **Estado atual**: ⚠️ Parcialmente testado

---

## Fluxo 2 — Criação e execução de atividade

**Personas**: `unit_manager`, `area_leader`, `executor`  
**Sprint de implementação dos testes**: 15

### Cenários

#### 2.1 Criar atividade com template
- **Pré-condição**: Logado como `unit_manager`; unidade com área e templates cadastrados
- **Passos**: Abrir unidade → clicar "Nova atividade" → selecionar template → preencher → salvar
- **Critérios de aceite**:
  - Atividade aparece na lista da área correta
  - Checklist pré-preenchido pelo template
  - Evento `created` no histórico
  - Prazo SLA aplicado se template define
- **Estado atual**: ⚠️ Spec parcial em `e2e/activity.spec.ts`

#### 2.2 Alterar status de atividade
- **Passos**: Abrir drawer → alterar status para `em_andamento`
- **Critérios de aceite**:
  - Status atualizado na lista sem reload
  - Evento de status_changed no histórico
  - Badge de status atualizado
- **Estado atual**: ❌ Não testado

#### 2.3 Marcar checklist e concluir atividade recorrente
- **Passos**: Marcar todos os itens → alterar status para `concluido`
- **Critérios de aceite**:
  - Progresso do checklist = 100%
  - Toast informando geração da próxima ocorrência
  - Nova atividade criada com mesmo template
- **Estado atual**: ❌ Não testado

#### 2.4 Atividade com visibilidade restrita
- **Passos**: Criar atividade com `visibility = restricted` → verificar acesso de terceiro
- **Critérios de aceite**:
  - Usuário sem permissão não vê a atividade na lista
  - API retorna 404 (não vaza existência)
- **Estado atual**: ❌ Não testado

---

## Fluxo 3 — RBAC e controle de acesso

**Personas**: Múltiplas  
**Sprint de implementação dos testes**: 15

### Cenários

#### 3.1 org_manager vê todas as unidades
- **Pré-condição**: Org com 3 unidades, usuário `org_manager`
- **Critérios de aceite**: Sidebar lista todas as 3 unidades; painel geral acessível
- **Estado atual**: ⚠️ Parcial em `e2e/rbac.spec.ts`

#### 3.2 unit_manager só vê sua unidade
- **Pré-condição**: `unit_manager` com membership em 1 de 3 unidades
- **Critérios de aceite**: Sidebar lista só a unidade própria; `/dashboard` retorna 403 ou redirect
- **Estado atual**: ❌ Não testado

#### 3.3 executor não acessa tela administrativa
- **Pré-condição**: `executor` com membership em área
- **Critérios de aceite**:
  - Sem link para `/settings/units`, `/settings/team` etc. na sidebar
  - Acesso direto por URL retorna 403 ou redirect
- **Estado atual**: ⚠️ Parcial em `e2e/rbac.spec.ts`

#### 3.4 Acesso sem auth retorna 401
- **Critérios de aceite**: GET /imports, /integrations, /activities retornam 401 sem token
- **Estado atual**: ✅ Testado em `e2e/rbac.spec.ts` (nível API)

#### 3.5 Não-membro não acessa recursos de organização alheia
- **Critérios de aceite**: GET /imports?organizationId=<outra_org> retorna 403
- **Estado atual**: ✅ Testado em `e2e/rbac.spec.ts` (nível API)

---

## Fluxo 4 — Importação Trello

**Personas**: `owner`, `org_manager`  
**Sprint de implementação dos testes**: 15

### Cenários

#### 4.1 Importação completa via JSON
- **Pré-condição**: `org_manager` logado; arquivo JSON de board Trello disponível
- **Passos**: Settings → Importar → Upload JSON → aguardar análise → revisar mapeamento → commit → ver relatório
- **Critérios de aceite**:
  - Job criado (202)
  - Dry-run concluído com preview
  - Após commit: atividades criadas == cards mapeados
  - Relatório final exibe: criados / ignorados / falhas
  - Status do job = `done`
- **Estado atual**: ⚠️ Parcial em `e2e/import.spec.ts`

#### 4.2 Rollback em falha
- **Critérios de aceite**:
  - Se commit falhar (FK violation, timeout), 0 atividades criadas
  - Job status = `failed`
  - Relatório exibe erro sem stack trace para o usuário
- **Estado atual**: ✅ Testado em nível API (unit test)

#### 4.3 Retry de job falho
- **Critérios de aceite**:
  - Centro de importações (`/settings/imports`) exibe job com status `failed`
  - Botão Retry reativa o job para `awaiting_review`
  - Após novo commit, job conclui com status `committed`
- **Estado atual**: ✅ (backend + UI) — `POST /imports/:id/retry` operacional; UI em [`apps/web/src/app/(app)/settings/imports/page.tsx`](../apps/web/src/app/(app)/settings/imports/page.tsx). Spec Playwright a criar.

#### 4.4 Cancelar job pendente
- **Critérios de aceite**:
  - Job em `pending|processing|awaiting_review` pode ser cancelado.
  - Status final = `cancelled`.
- **Estado atual**: ✅ (backend + UI) — `POST /imports/:id/cancel` operacional. Spec Playwright a criar.

#### 4.5 Dedupe cross-job (Sprint 20, FEAT-006)
- **Pré-condição**: importar o mesmo board duas vezes em jobs diferentes.
- **Critérios de aceite**:
  - Segundo job marca itens duplicados como `status=skipped` com `errorMessage='Duplicate of activity X'`.
  - Total de atividades não duplica.
- **Estado atual**: ❌ Não implementado. Hoje a idempotência é apenas por `importJobId + sourceId`, então reimportar gera duplicatas.

#### 4.6 Wizard usa catálogo real de áreas/unidades (Sprint 20, FEAT-006)
- **Pré-condição**: organização com áreas customizadas (não as 6 padrão).
- **Critérios de aceite**:
  - Wizard de mapeamento lista as áreas reais da organização.
  - Mapeamento de board → unidade usa `targetUnitId` (autocomplete) em vez de `targetUnitName`.
- **Estado atual**: ❌ Não implementado. Hoje o wizard usa lista hardcoded.

---

## Fluxo 5 — Gestão de equipe e convites

**Personas**: `owner`, `org_manager`, novo usuário  
**Estado geral**: ✅ implementado no backend; UI atual cobre apenas escopo `organization` — escopo `unit`/`area` no backlog **FEAT-001** (Sprint 19).

### Cenários

#### 5.1 Convidar novo usuário (escopo organização)
- **Passos**: Settings → Equipe → Convidar → preencher e-mail + papel → enviar → verificar convite pendente
- **Critérios de aceite**:
  - Convite aparece na lista com status `pendente`
  - E-mail enviado via `mailer.sendInvitation()`
  - Token tokenizado (sha256 do random) gerado e único
- **Estado atual**: ✅ (backend) — `POST /invitations` operacional; spec Playwright a criar.

#### 5.2 Aceitar convite e ganhar acesso correto
- **Passos**: Abrir link `/invite/:token` → preencher nome e senha → logar → verificar acesso
- **Critérios de aceite**:
  - Usuário criado no banco
  - Membership criado com papel e escopo corretos
  - Acesso apenas ao escopo concedido (não a outras unidades/áreas)
  - Convite marcado como `accepted`
- **Estado atual**: ✅ — `POST /invitations/:token/accept` operacional; página `/invite/[token]` existe; spec Playwright a criar.

#### 5.3 Revogar acesso
- **Passos**: Settings → Equipe → Revogar → confirmar
- **Critérios de aceite**:
  - Membership soft deleted (campo `deletedAt`)
  - Usuário sem acesso ao próximo request (token válido mas membership ausente → 403)
- **Estado atual**: ✅ (backend) — `DELETE /memberships/:id` operacional; spec Playwright a criar.

#### 5.4 Convidar com escopo `unit` ou `area` (Sprint 19, FEAT-001)
- **Passos**: Equipe → Convidar → escolher escopo (Org/Unidade/Área) → escolher `scopeId` → enviar
- **Critérios de aceite**:
  - Convite criado com `scopeType` correto.
  - Usuário aceita e cai apenas no escopo concedido.
- **Estado atual**: ❌ Não implementado (UI). Backend já aceita.

#### 5.5 Editar papel ou escopo de membership existente (Sprint 19, FEAT-001)
- **Passos**: Equipe → linha do usuário → editar papel/escopo → salvar
- **Critérios de aceite**: `PATCH /memberships/:id` aplica mudança; usuário sente o efeito no próximo request.
- **Estado atual**: ❌ Não implementado.

---

## Fluxo 6 — Painel geral e visões

**Personas**: `org_manager`, `unit_manager`, `executor`  
**Sprint de implementação dos testes**: 15

### Cenários

#### 6.1 org_manager vê KPIs consolidados
- **Critérios de aceite**: Painel exibe total por unidade; cards de KPI corretos
- **Estado atual**: ⚠️ Parcial em `e2e/dashboard.spec.ts`

#### 6.2 executor vê apenas atividades próprias em /me
- **Pré-condição**: executor com algumas atividades atribuídas, outras não
- **Critérios de aceite**:
  - `/me` exibe somente atividades onde é assignee ou watcher
  - Não exibe atividades de outras áreas sem delegação
- **Estado atual**: ❌ Não testado

---

## Fluxo 7 — Notificações

**Personas**: Todos  
**Sprint de implementação dos testes**: 15

### Cenários

#### 7.1 Configurar preferências de notificação
- **Passos**: Settings → Notificações → habilitar e-mail → salvar
- **Critérios de aceite**: Preferências salvas; próximo login mantém configuração
- **Estado atual**: ⚠️ Parcial em `e2e/auth.spec.ts`

#### 7.2 Testar canal de notificação
- **Passos**: Settings → "Teste de envio" → escolher canal (email/push/whatsapp) → clicar Testar
- **Critérios de aceite**: Toast de sucesso na UI; entrada criada em `notification_deliveries`.
- **Estado atual**: ✅ (backend + UI) — `POST /notifications/test` operacional; spec Playwright a criar.

#### 7.3 Filtros operacionais no delivery log (Sprint 20, FEAT-009)
- **Pré-condição**: várias entregas em diferentes canais/status.
- **Critérios de aceite**: filtros por canal, status, data; paginação.
- **Estado atual**: ❌ Não implementado.

---

## Fluxo 8 — Central global de atividades (Sprint 12)

**Personas**: `owner`, `org_manager`  
**Sprint de implementação dos testes**: 15

### Cenários

#### 8.1 Busca e filtragem
- **Passos**: Abrir /activities → buscar por termo → filtrar por unidade + status → ver resultado
- **Critérios de aceite**:
  - Resultados correspondem aos filtros aplicados
  - Contagem KPI strip atualiza com filtros
  - **(BUG-001)** Filtro por prioridade aceita valores PT (`baixa/media/alta/critica`).
- **Estado atual**: ⚠️ UI existe; BUG-001 abre na Sprint 18.

#### 8.2 Ação em lote (status)
- **Passos**: Selecionar 2 atividades → alterar status → confirmar
- **Critérios de aceite**:
  - **(BUG-002)** Mutação envia `organizationId` junto.
  - Ambas as atividades atualizadas.
  - Feedback de sucesso (X atividades atualizadas).
- **Estado atual**: ⚠️ UI existe; BUG-002 abre na Sprint 18.

#### 8.3 Export CSV
- **Passos**: Aplicar filtros → Exportar CSV → verificar conteúdo.
- **Critérios de aceite**:
  - **(BUG-003)** CSV reflete todos os filtros, incluindo prioridade.
  - UTF-8 BOM presente (Excel-friendly).
- **Estado atual**: ⚠️ UI existe; BUG-003 abre na Sprint 18.

#### 8.4 Paginação (Sprint 19, FEAT-003)
- **Critérios de aceite**: lista usa cursor (`meta.nextCursor`); botão "Carregar mais" funciona.
- **Estado atual**: ❌ Não implementado.

#### 8.5 Saved views (Sprint 19, FEAT-003)
- **Passos**: Aplicar filtros → salvar como "Atrasadas críticas VX" → reabrir → verificar persistência.
- **Critérios de aceite**: Filtro disponível no próximo acesso ao /activities; backend `saved-views` (já existe) consumido.
- **Estado atual**: ❌ Não implementado (UI). Backend pronto.

#### 8.6 Drill-down (Sprint 19, FEAT-003)
- **Passos**: Clicar em uma linha → abrir `ActivityDrawer` no contexto da Central.
- **Critérios de aceite**: drawer abre; edição funciona; lista atualiza ao fechar.
- **Estado atual**: ❌ Não implementado.

---

## Fluxo 9 — Setup de nova organização (Sprint 19, FEAT-004)

**Personas**: novo cliente (público).

#### 9.1 Wizard completo
- **Passos**: `/setup` → org → owner → unidade opcional → confirmar.
- **Critérios de aceite**:
  - Org criada com starter pack canônico (6 áreas + 24 templates) — ver [`docs/bootstrap-spec.md`](bootstrap-spec.md).
  - **(BUG-004)** Senha mínima validada como 8 caracteres antes de submeter.
  - Owner logado automaticamente após confirmar (ou redirect para `/login` com mensagem).
- **Estado atual**: ⚠️ Wizard existe; starter pack pobre (5 áreas, sem templates); BUG-004 aberto.

---

## Fluxo 10 — Integrações operacionais (Sprint 20, FEAT-005)

**Personas**: `owner`, `org_manager`.

#### 10.1 Diagnóstico do Trello
- **Critérios de aceite**:
  - Card mostra `healthy/unhealthy/desconectado` em tempo (quase) real.
  - Botão "Reconectar" abre URL de OAuth e atualiza estado.
  - Lista de boards conectados visível.
- **Estado atual**: ❌ Não implementado (UI). Backend pronto (`/integrations/trello/health`, `/reconnect`).

#### 10.2 Diagnóstico do WhatsApp
- **Critérios de aceite**:
  - Card mostra modo (sandbox/prod), número remetente, últimos 5 erros, status configurado/não.
  - Botão "Testar canal" envia template para o próprio usuário.
- **Estado atual**: ❌ Não implementado (UI). Backend pronto (`/integrations/whatsapp/status`).

---

## Fluxo 11 — Smoke por perfil (Sprint 21, OPS-004)

Validação manual e/ou Playwright para cada papel: owner, org_manager, unit_manager, area_leader, executor, viewer.

Checklist completo: [`docs/qa-release-checklist.md`](qa-release-checklist.md).

---

## Fluxo 12 — Deploy `/gymops` end-to-end (Sprint 21, OPS-002)

**Personas**: DevOps.

#### 12.1 Pipeline CI builda variante `/gymops`
- **Critérios de aceite**:
  - Job `build-gymops` compila web com `NEXT_PUBLIC_APP_BASE_PATH=/gymops`.
  - Smoke HTTP em `/gymops/login` retorna 200.
- **Estado atual**: ❌ Não implementado.

#### 12.2 Compose público sobe com healthchecks
- **Critérios de aceite**:
  - `docker compose -f docker-compose.public.yml up -d` → todos os serviços (`postgres`, `redis`, `api`, `worker`, `web`, `gateway`) ficam `(healthy)`.
  - Acesso a `http://<HOST>:7480/gymops/login` retorna 200 do gateway → web.
- **Estado atual**: ❌ Web/gateway hoje usam `service_started`. BUG-009 aberto.

---

## Configuração dos testes E2E

### Dados de seed necessários para E2E

```typescript
// e2e/fixtures/seed.ts — a criar na Sprint 15
export const E2E_SEED = {
  org: { name: 'SkyFit E2E', slug: 'skyfit-e2e' },
  units: ['Vila Xavier', 'Centro'],
  areas: ['manutencao', 'administrativo'],
  users: {
    owner:       { email: 'owner@e2e.com', password: 'e2ePass123!' },
    org_manager: { email: 'orgmgr@e2e.com', password: 'e2ePass123!' },
    unit_manager: { email: 'unitmgr@e2e.com', password: 'e2ePass123!' },
    executor:    { email: 'exec@e2e.com', password: 'e2ePass123!' },
  },
};
```

### Estratégia de isolamento

- Cada spec roda com banco resetado (ou schema isolado por spec)
- Usar `test.use({ storageState: ... })` do Playwright para reutilizar auth sem re-login
- Stubs de serviços externos: SMTP → Ethereal/Mailpit; Push → mock; WhatsApp → stub Twilio

### Prioridade de implementação (Sprint 15)

1. Fluxo 1 (auth) — base para todos os outros
2. Fluxo 3 (RBAC) — confiança de segurança
3. Fluxo 2 (atividade) — golden path operacional
4. Fluxo 4 (importação) — fluxo crítico de migração
5. Fluxos 5–8 — conforme features ficam prontas
