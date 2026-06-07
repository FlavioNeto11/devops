# 06 — Frontend UX / Shell / Navegação

- **work_id:** `frontend-ux-navegacao-shell`
- **Fase:** 06
- **Owner:** `frontend-vue-ux-mtr`
- **Data:** 2026-04-25
- **Status:** done

## Objetivo da fase

Reformular a UX/UI do frontend SICAT (Vue 3 + Vuetify), eliminando duplicidades
no menu (`Jobs`/`CO · Jobs`, `Relatório MTR`/`CO · Relatório MTR`),
decompondo o `App.vue` monolítico (~926 linhas), introduzindo fonte
declarativa de navegação compartilhada entre desktop e mobile e
padronizando cabeçalho de página — preservando rotas, guards, sessão
CETESB e RBAC admin.

## Etapa 1 — Diagnóstico

### Inventário do menu atual (origem `frontend/src/App.vue` ~L23-L40)

| Posição no menu | Rota | View | Observação |
| --- | --- | --- | --- |
| Dashboard | `/dashboard` | `DashboardView` | OK |
| Manifestos | `/manifestos` | `ManifestsView` | OK |
| MTR Provisório | `/mtr-provisorio` | `MtrProvisorioListView` | OK |
| DMR | `/dmr` | `DmrListView` | OK |
| Chat operacional | `/conversacional/chat` | `ConversationalChatAppView` | OK |
| Relatório MTR | `/relatorios/mtrs` | `ManifestReportView` | **conflita** com CO · Relatório MTR |
| Jobs | `/jobs` | `JobsView` | **conflita** com CO · Jobs |
| Centro Operacional | `/operacao/dashboard` | `OperationsDashboardView` | OK |
| CO · Jobs | `/operacao/jobs` | `JobsConsoleView` | duplicidade visual com `/jobs` |
| CO · Auditoria | `/operacao/auditoria` | `AuditExplorerView` | OK |
| CO · Saúde CETESB | `/operacao/cetesb-health` | `CetesbAccountsHealthView` | OK |
| CO · Relatório MTR | `/operacao/relatorios/mtr` | `MtrReportsView` | duplicidade visual com `/relatorios/mtrs` |
| CO · Command Center | `/operacao/command-center` | `CommandCenterView` | OK |
| Sessão | `/sessao` | `SessionAccountView` | redundante com user menu |
| Acessos | `/admin/acessos` | `AccessAdminView` | RBAC admin |

### Redundâncias e dores concretas

- `frontend/src/App.vue` mistura: topbar, brand, navegação horizontal, navbar
  mobile, drawer, tema, user menu, page header, footer e wrapper de auth
  em ~926 linhas (era impossível manter atomicamente).
- `Jobs` (lista do parceiro) vs `CO · Jobs` (console de jobs com
  requeue/DLQ): mesmo verbo, intenções diferentes, sem agrupamento.
- `Relatório MTR` (relatório do parceiro) vs `CO · Relatório MTR`
  (relatório operacional): semântica próxima sem hierarquia visível.
- 15 itens lineares na topbar geravam wrap em viewport <1400px.
- `Sessão` ocupava espaço no menu principal sendo já acessível pelo user
  menu (duplicado em `App.vue` L36 e no menu do avatar L424).
- Conflito de prefixo `CO ·` poluindo a leitura — quando agrupado, o
  prefixo se torna o cabeçalho do grupo, libertando o label.

### Componentes com excesso

- `App.vue` (~926 linhas, ~600 de CSS escopado) era o maior ofensor.
- `AppHeader.vue` ainda usa o token-system antigo (`var(--color-…)`) e
  vive desconectado do shell — fora do escopo desta fase, mas marcado
  para refinamento.

## Etapa 2 — Plano (executado)

### Ordem priorizada

1. Criar fonte declarativa: `frontend/src/config/navigation.js`.
2. Criar componentes do shell em `frontend/src/components/shell/`.
3. Substituir `App.vue` por composição enxuta.
4. Validar com `npm run build`.

### Novos componentes

- `SicatAppShell.vue` — orquestra topbar, drawer e área de conteúdo;
  injeta `SicatPageHeader` automaticamente exceto em rotas
  `meta.hidePageHeader` ou `chat`.
- `SicatTopbar.vue` — brand + navegação desktop + ações (home pública,
  conta CETESB, tema, user menu).
- `SicatNavigation.vue` — desktop, consome `groups`; itens `direct`
  viram pill `<router-link>`, itens `group` viram `v-menu` dropdown
  (decisão: dropdowns por intenção, ver justificativa abaixo).
- `SicatMobileDrawer.vue` — drawer com seções rotuladas, mesma fonte
  declarativa.
- `SicatPageHeader.vue` — breadcrumb + título + descrição + slot
  `actions` + slot `meta`.
- `SicatUserMenu.vue` — avatar + sub-menu de sessão/admin/troca
  de conta/tema/logout.

### Estratégia da fonte declarativa

`frontend/src/config/navigation.js` exporta:

- `NAVIGATION_GROUPS` — array de grupos com `id`, `label`, `icon`,
  `kind: 'direct' | 'group'`, `to?`, `description?`,
  `requiresAdminAccess?`, `items?`.
- `filterNavigationGroups({ canAccessAdmin })` — aplica RBAC.
- `findActiveGroup(groups, currentPath)` — destaca dropdown ativo.
- `isNavigationItemActive(currentPath, itemPath)` — match com prefixo
  para rotas filhas (`/manifestos/:id`, `/dmr/...`, etc.).
- `flattenNavigation(groups)` — útil para QA/snapshots.

### Plano de compatibilidade

- **Nenhuma rota foi removida.** Todas continuam acessíveis, apenas
  reagrupadas no menu.
- `meta.breadcrumb` continua sendo a fonte para o page header e
  permanece intacto em todas as rotas.
- Guards de auth, conta CETESB e admin (`router.js` `beforeEach`) não
  foram tocados.

### Decisão de UX — desktop: dropdowns por grupo

Avaliados:

- **Pills planas** (atual): rejeita-se — 15 itens não cabem em <1400px
  e o usuário não distingue Jobs de CO · Jobs.
- **Sidebar lateral**: rejeita-se — perderíamos o `wide-mode` atual e
  forçaríamos refactor de todas as views.
- **Topbar com dropdowns por grupo (escolhida)**: 5 a 7 entradas no
  topo (Início, Operação MTR, MTR Provisório, DMR, Centro Operacional,
  Chat operacional, Administração quando aplicável), descongestionando
  imediatamente sem alterar viewport. Cada grupo mostra subtítulos
  descritivos no menu, ensinando a diferença entre Jobs e Console
  de jobs.

## Etapa 3 — Implementação

### Arquivos criados

- `frontend/src/config/navigation.js`
- `frontend/src/components/shell/SicatAppShell.vue`
- `frontend/src/components/shell/SicatTopbar.vue`
- `frontend/src/components/shell/SicatNavigation.vue`
- `frontend/src/components/shell/SicatMobileDrawer.vue`
- `frontend/src/components/shell/SicatPageHeader.vue`
- `frontend/src/components/shell/SicatUserMenu.vue`

### Arquivos alterados

- `frontend/src/App.vue` — reduzido de ~926 linhas para ~330 linhas;
  agora é apenas uma "casca" que escolhe entre `fullBleed`, `auth-wrapper`
  ou `SicatAppShell` e repassa props/eventos. Toda a lógica de tema,
  sessão, rotas e estado de viewport permanece (não houve mudança de
  comportamento), só foi reorganizada.

### Decisões técnicas adicionais

- O `SicatPageHeader` foi mantido idêntico em conteúdo
  (breadcrumb/título/descrição/cards de conta) — apenas extraído para
  componente. Isso evita regressões visuais nas views existentes.
- `meta.hidePageHeader` (novo opcional) permite uma view ocultar o
  cabeçalho — usado implicitamente para `/conversacional/chat` (rota
  já `isChatRoute`).
- Tokens em `frontend/src/styles/tokens.css` permanecem; os componentes
  do shell usam tokens Vuetify (`rgb(var(--v-theme-…))`) já adotados
  no `App.vue` original — coerência visual preservada.
- `globalThis.window` mantido para acessibilidade SSR-safe (padrão já
  usado no projeto e na user memory).

## Etapa 4 — Compatibilidade preservada

- ✅ Auth/Login/checkAuth/refresh: lógica permanece em `App.vue` script
  (mesma sequência `onMounted` → `ensureActiveSession` →
  `syncSicatSession`).
- ✅ Guards de rota (`router.js` `beforeEach`) não tocados.
- ✅ `requiresActiveCetesbAccount` e `hasActiveCetesbAccount` continuam
  governando o redirect para `/login/cetesb`.
- ✅ `requiresAdminAccess` e `canAccessAdmin` continuam governando
  acesso ao módulo `Administração`. O grupo `admin` no
  `NAVIGATION_GROUPS` é filtrado por `filterNavigationGroups({ canAccessAdmin })`.
- ✅ Tema (light/`vuexy` e dark/`vuexyDark`) preservado, com
  `applyStoredAppTheme` no `onMounted` e watcher do
  `theme.global.name.value`.
- ✅ Toda rota antiga continua acessível por URL direta. A
  reorganização não emite redirects.
- ✅ `InAppCopilotAssistant` segue montado quando `showShell` é true.

## Comandos de validação

- ✅ `cd frontend && npm run build` — sucesso (`✓ built in 7.64s`).
  Bundles: `index-rObqT3Ib.css` 1.018,88 kB e `index-B1xZTXaD.js`
  1.355,61 kB (warnings de chunk size pré-existentes, não regredem).
- 🔁 Recomendado para fase 09 (`tester-qa-mtr`):
  - `cd frontend && npm run test:ui:audit`
  - smoke navegação manual: dashboard → manifestos → relatório → jobs;
    centro operacional → console de jobs → auditoria; admin/acessos
    com perfil sem RBAC e com RBAC.
  - smoke responsivo: viewport <1180px abre drawer; ≥1180px usa topbar.
  - smoke dark/light: alternar via user menu e via header.
  - smoke guards: deslogar e tentar `/dashboard` (deve cair em
    `/login`); logado sem conta CETESB ativa indo para `/dashboard`
    (deve cair em `/login/cetesb`).

## Próximos refinamentos sugeridos (fora do escopo desta fase)

- Migrar `AppHeader.vue` (legado, ainda em token-system antigo) para
  `SicatPageHeader` nas views internas que ainda o consomem.
- Padronizar todas as views internas a aceitarem `meta.hidePageHeader`
  quando elas mesmas renderizam um cabeçalho próprio rico (ex.
  Dashboard executivo, Centro Operacional Dashboard) — evitando título
  duplicado.
- Decompor `CetesbOperationalFlowsPanel.vue` e `ManifestList.vue`
  seguindo o mesmo padrão `Sicat*`.
- Adicionar atalhos de teclado no `SicatNavigation` (ex. `g d` para
  Dashboard) e foco gerenciado nos dropdowns.
- Code-splitting de rotas (Vite manualChunks) — bundle JS já passa
  500 kB, warning não-bloqueante.

## Handoff

- Próximo agente: `tester-qa-mtr` — fase 09.
- Foco do QA: build, navegação por grupos, drawer mobile,
  responsividade, dark/light, guards de rota e RBAC admin.
- Artefato de handoff: este checkpoint + `docs/handoffs/frontend-ux-navegacao-shell/00-orchestration.md`.
