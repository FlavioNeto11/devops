<!-- markdownlint-disable MD013 MD024 MD033 MD036 MD040 -->

# Changelog DL-098 — Frontend UX: App Shell `Sicat*` + navegação declarativa

- **work_id:** `frontend-ux-navegacao-shell`
- **Decision log:** [DL-098](copilot/13-decision-log.md#dl-098)
- **Data:** 2026-04-25
- **Status:** ✅ Concluído (cadeia `frontend-ux-navegacao-shell` fechada)

## Resumo executivo

Refatoração profunda da camada de navegação e shell do frontend SICAT
(Vue 3 + Vuetify):

- `frontend/src/App.vue` decomposto de ~926 linhas para ~330 linhas,
  delegando shell, navegação, drawer mobile, page header e user menu
  a 6 componentes `Sicat*` em [frontend/src/components/shell/](../frontend/src/components/shell).
- Nova fonte declarativa única de navegação em
  [frontend/src/config/navigation.js](../frontend/src/config/navigation.js),
  consumida por desktop (`SicatNavigation`) e mobile
  (`SicatMobileDrawer`).
- Eliminadas as duplicidades visuais `Jobs` × `CO · Jobs` e
  `Relatório MTR` × `CO · Relatório MTR` por meio de agrupamento por
  intenção, sem alterar URLs.
- Guards de autenticação, conta CETESB ativa e RBAC admin **preservados
  integralmente** — nenhuma rota foi removida, redirects antigos
  permanecem funcionais.

## Motivação

| Dor | Origem | Impacto |
| --- | --- | --- |
| Monolitia do `App.vue` | ~926 linhas misturando topbar, navegação, drawer, tema, page header, footer, auth wrapper | Inviabilidade de manter atomicamente; refatoração paralisada |
| Duplicidade `Jobs`/`CO · Jobs` e `Relatório MTR`/`CO · Relatório MTR` | 15 itens lineares no menu, prefixo `CO ·` poluindo a leitura | Confusão semântica entre operação parceiro × operação interna |
| Wrap do menu em viewport <1400px | Topbar com 15 pills | Layout quebrado em telas de produção |
| `Sessão` redundante no menu principal | Mesma ação disponível no avatar | Ruído visual |

## Escopo

### Arquivos criados

- [frontend/src/config/navigation.js](../frontend/src/config/navigation.js)
- [frontend/src/components/shell/SicatAppShell.vue](../frontend/src/components/shell/SicatAppShell.vue)
- [frontend/src/components/shell/SicatTopbar.vue](../frontend/src/components/shell/SicatTopbar.vue)
- [frontend/src/components/shell/SicatNavigation.vue](../frontend/src/components/shell/SicatNavigation.vue)
- [frontend/src/components/shell/SicatMobileDrawer.vue](../frontend/src/components/shell/SicatMobileDrawer.vue)
- [frontend/src/components/shell/SicatPageHeader.vue](../frontend/src/components/shell/SicatPageHeader.vue)
- [frontend/src/components/shell/SicatUserMenu.vue](../frontend/src/components/shell/SicatUserMenu.vue)

### Arquivos alterados

- [frontend/src/App.vue](../frontend/src/App.vue) — reduzido a "casca" que
  decide entre `fullBleed`, `auth-wrapper` ou `SicatAppShell`; toda a
  lógica de tema, sessão, rotas e viewport permanece (sem mudança
  comportamental).

### Documentação criada/alterada

- [docs/copilot/13-decision-log.md](copilot/13-decision-log.md) — entrada
  DL-098.
- [docs/CHANGELOG-DL-098-FRONTEND-UX-NAVEGACAO-SHELL.md](CHANGELOG-DL-098-FRONTEND-UX-NAVEGACAO-SHELL.md) — este arquivo.
- [docs/FRONTEND-COMPONENTS-ARCHITECTURE.md](FRONTEND-COMPONENTS-ARCHITECTURE.md) — nova seção “App Shell (`Sicat*`)”.
- [docs/handoffs/frontend-ux-navegacao-shell/10-documentation-final.md](handoffs/frontend-ux-navegacao-shell/10-documentation-final.md) — checkpoint final.

## Mapa de navegação completo

Fonte: [frontend/src/config/navigation.js](../frontend/src/config/navigation.js).

| Grupo | Label | Ícone (mdi) | Rota | Permissão | Visibilidade |
| --- | --- | --- | --- | --- | --- |
| `home` (direct) | Início | `mdi-view-dashboard-outline` | `/dashboard` | autenticado + conta CETESB ativa | sempre |
| `mtr` (group) | Operação MTR — Manifestos | `mdi-file-document-multiple-outline` | `/manifestos` | autenticado + conta CETESB ativa | sempre |
| `mtr` (group) | Operação MTR — Relatório MTR | `mdi-chart-box-outline` | `/relatorios/mtrs` | autenticado + conta CETESB ativa | sempre |
| `mtr` (group) | Operação MTR — Jobs | `mdi-cog-outline` | `/jobs` | autenticado + conta CETESB ativa | sempre |
| `mtr-provisorio` (direct) | MTR Provisório | `mdi-file-clock-outline` | `/mtr-provisorio` | autenticado + conta CETESB ativa | sempre |
| `dmr` (group) | DMR — Declarações | `mdi-file-tree-outline` | `/dmr` | autenticado + conta CETESB ativa | sempre |
| `dmr` (group) | DMR — Pendentes | `mdi-clock-alert-outline` | `/dmr/pendentes` | autenticado + conta CETESB ativa | sempre |
| `centro-operacional` (group) | Centro Operacional — Visão geral | `mdi-view-grid-outline` | `/operacao/dashboard` | autenticado + conta CETESB ativa | sempre |
| `centro-operacional` (group) | Centro Operacional — Console de jobs | `mdi-engine-outline` | `/operacao/jobs` | autenticado + conta CETESB ativa | sempre |
| `centro-operacional` (group) | Centro Operacional — Auditoria | `mdi-text-search` | `/operacao/auditoria` | autenticado + conta CETESB ativa | sempre |
| `centro-operacional` (group) | Centro Operacional — Saúde CETESB | `mdi-pulse` | `/operacao/cetesb-health` | autenticado + conta CETESB ativa | sempre |
| `centro-operacional` (group) | Centro Operacional — Relatório MTR (Operação) | `mdi-file-chart-outline` | `/operacao/relatorios/mtr` | autenticado + conta CETESB ativa | sempre |
| `centro-operacional` (group) | Centro Operacional — Command Center | `mdi-flash-outline` | `/operacao/command-center` | autenticado + conta CETESB ativa | sempre |
| `conversacional` (direct) | Chat operacional | `mdi-chat-processing-outline` | `/conversacional/chat` | autenticado + conta CETESB ativa | sempre |
| `admin` (group, RBAC) | Administração — Perfis e acessos | `mdi-shield-key-outline` | `/admin/acessos` | `requiresAdminAccess` (`canAccessAdmin === true`) | filtrado por `filterNavigationGroups({ canAccessAdmin })` |

> Item legado `Sessão` (`/sessao`) **não é mais exposto** no menu principal;
> permanece acessível pelo `SicatUserMenu` (avatar). Rota continua
> registrada no router para acesso direto.

## Comandos de validação executados

| Comando | Resultado |
| --- | --- |
| `cd frontend && npm run build` | ✅ `built in 7.08s`; bundles `index-rObqT3Ib.css` 1.018,88 kB e `index-B1xZTXaD.js` 1.355,61 kB; warning pré-existente de chunk size (não regressão) |
| `npm run validate:openapi` | ✅ exit 0 (validador inclui markdown links) |
| Smoke estático de navegação | ✅ 7 grupos cobertos; sem duplicidade; helpers `filterNavigationGroups`, `findActiveGroup`, `isNavigationItemActive` validados |
| Smoke responsivo (estático) | ✅ breakpoint 1180 px; `<1180` → `SicatMobileDrawer`; `≥1180` → topbar |
| Smoke tema | ✅ persistência em `localStorage[sicat.ui.theme]` via `useAppTheme` |
| Smoke guards | ✅ deslogado → `/login`; sem conta CETESB → `/login/cetesb`; sem RBAC admin → grupo `admin` filtrado e `/admin/acessos` bloqueado |

## Pendências (fora do escopo desta entrega)

- **`test:ui:audit` Playwright (`frontend/audit.spec.ts`)** — exige browsers Playwright instalados e dev server em `http://127.0.0.1:5174`; rodar manualmente antes de release humano via task VS Code `frontend: test:ui:audit`.
- **Code-splitting do bundle** — `index-B1xZTXaD.js` segue acima de 500 kB; aplicar `manualChunks`/`dynamic import()` em `frontend/vite.config.*` em refinamento futuro.
- **Migração do `AppHeader.vue` legado** — ainda usa o token-system antigo (`var(--color-…)`); migrar para `SicatPageHeader` nas views internas que ainda o consomem.
- **Atalhos de teclado no `SicatNavigation`** — adicionar bindings (`g d` → Dashboard, `g m` → Manifestos, etc.) e foco gerenciado nos dropdowns.
- **`meta.hidePageHeader` opt-in nas views com cabeçalho próprio** — Dashboard executivo e Centro Operacional Dashboard renderizam header próprio rico; aplicar `meta.hidePageHeader: true` para evitar título duplicado.

## Referências cruzadas

- [docs/handoffs/frontend-ux-navegacao-shell/00-orchestration.md](handoffs/frontend-ux-navegacao-shell/00-orchestration.md)
- [docs/handoffs/frontend-ux-navegacao-shell/06-frontend-ux.md](handoffs/frontend-ux-navegacao-shell/06-frontend-ux.md)
- [docs/handoffs/frontend-ux-navegacao-shell/09-qa-validation.md](handoffs/frontend-ux-navegacao-shell/09-qa-validation.md)
- [docs/handoffs/frontend-ux-navegacao-shell/10-documentation-final.md](handoffs/frontend-ux-navegacao-shell/10-documentation-final.md)
- [docs/copilot/13-decision-log.md](copilot/13-decision-log.md#dl-098)
- [docs/FRONTEND-COMPONENTS-ARCHITECTURE.md](FRONTEND-COMPONENTS-ARCHITECTURE.md)
