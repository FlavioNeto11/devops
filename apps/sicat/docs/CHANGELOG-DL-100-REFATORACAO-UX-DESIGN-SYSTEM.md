<!-- markdownlint-disable MD013 MD024 MD034 -->

# CHANGELOG — DL-100: Refatoração UX/UI corporativa + Design System `Sicat*`

**Data:** 2026-05-29
**Tipo:** Frontend UX / Design System / Arquitetura de componentes
**Status:** ✅ COMPLETADO (build verde; validação visual e2e pendente de ambiente com backend)

Transforma o frontend de "protótipo técnico" em produto corporativo profissional: padrão visual consistente, navegação orientada à jornada do usuário, telas governáveis e separação clara entre **operação diária (parceiro)** e **ferramentas técnicas (SRE/admin)** — preservando autenticação SICAT, seleção obrigatória de conta CETESB, guards de rota e contratos backend.

---

## 1. Design System `Sicat*` (novo)

Catálogo completo com props, slots e exemplos em [frontend/docs/design-system.md](../frontend/docs/design-system.md). Playground interativo em `/dev/components`.

Componentes em [frontend/src/components/sicat/](../frontend/src/components/sicat):

| Componente | Função |
| --- | --- |
| `SicatPageLayout` | Wrapper de página (header/banner/filters/actions/body/footer) com estados loading/error globais |
| `SicatPageHeader` (estendido) | Kicker + título + descrição + breadcrumbs + slot `actions`; prop `tone="system"` (auto via `route.meta.audience`) |
| `SicatCard` | Card padronizado (variants default/glass/metric/system) |
| `SicatMetricCard` | KPI (label/valor/trend/tone/ícone) |
| `SicatDataTable` | Wrapper de `v-data-table` com loading/empty/error, seleção, slots de célula e footer |
| `SicatFiltersPanel` | Painel de filtros colapsável com chips ativos e ações limpar/aplicar |
| `SicatActionBar` | Barra de ações com modo seleção em lote |
| `SicatFormSection` / `SicatFormField` | Seção e campo de formulário padronizados |
| `SicatSearchInput` | Input de busca com debounce |
| `SicatStatusBadge` | Badge de status localizado (consome `lib/status-map.js`) |
| `SicatStatusTimeline` | Linha do tempo de status (done/current/pending/error) |
| `SicatLoadingState` / `SicatEmptyState` / `SicatErrorState` | Estados de UI padronizados |
| `SicatInlineAlert` | Alerta contextual inline |
| `SicatSnackbar` + `useNotification` | Toasts globais (stack máx 3) |
| `SicatConfirmDialog` + `useConfirmDialog` | Confirmação reutilizável (renomeado de `ConfirmDialog`) |

## 2. Composables e status centralizados

- [`useNotification`](../frontend/src/composables/useNotification.js) — toasts globais; `SicatSnackbar` montado uma vez em `App.vue`. Substitui todo `v-snackbar` inline.
- [`useJobAwait`](../frontend/src/composables/useJobAwait.js) — polling de job (padrão 202 + `jobId`) até estado terminal, cleanup no unmount.
- [`useJobStream`](../frontend/src/composables/useJobStream.js) — SSE de eventos de job com cleanup garantido em `onBeforeUnmount`.
- [`lib/status-map.js`](../frontend/src/lib/status-map.js) — **fonte única** de tones + labels pt-BR por domínio (`manifest`, `job`, `cdf`, `dmr`, `account-health`). Helpers locais de status removidos das views.

## 3. Navegação por audiência (drawer único, gated por role)

[`navigation.js`](../frontend/src/config/navigation.js) reorganizado em 3 módulos:

- **Operação** (sempre): Início, MTR (Manifestos · Emitir · Relatórios), MTR Provisório, Resíduos · DMR (Declarações · Pendentes · Nova), Certificados · CDF, Assistente.
- **Sistema** (gated `canAccessAdmin`): Visão geral, Jobs, Auditoria, Saúde CETESB, Relatórios MTR (SRE), Command Center.
- **Administração** (gated `canAccessAdmin`): Acessos.

Mudanças de rota ([router.js](../frontend/src/router.js)):

- **Jobs consolidado** em `/sistema/jobs` (era duplicado em `/jobs` e `/operacao/jobs`). `JobsConsoleView` removido; `/jobs` e `/operacao/jobs` redirecionam (compat).
- `meta.audience` (`operator`/`system`/`admin`) em todas as rotas → `SicatPageHeader` deriva `tone="system"` para telas técnicas.
- `requiresAdminAccess` adicionado às rotas `/operacao/*` e `/sistema/jobs`.
- "Minha sessão" (`/sessao`) movida para o `SicatUserMenu` (fora do drawer).
- Breadcrumbs renomeados (Centro Operacional → Sistema; Chat operacional → Assistente).

## 4. Estrutura feature-based

`frontend/src/features/<dominio>/` para decomposição:

- `features/dashboard/DashboardView.vue` — painel intencional do operador (pendências + ações rápidas + últimos manifestos).
- `features/mtr/list/manifestHelpers.js` — helpers puros extraídos da `ManifestsView`.

## 5. Telas refatoradas

**Operação:** Dashboard (painel intencional), Manifestos, CDF (lista + criar + workspace), DMR (lista/pendentes/criar/detalhe), MTR Provisório (lista/detalhe).
**Sistema:** Visão geral operacional, Saúde CETESB, Command Center, Relatórios MTR (SRE), Audit Explorer, Acessos.

Destaques de decomposição:

- **`ManifestsView` 2.900 → 1.996 linhas (−31%)**: dropdown manual (~370 linhas de posicionamento + `ResizeObserver` + listeners globais) substituído por `v-menu` nativo; status via `SicatStatusBadge`; page chrome via `SicatPageLayout`.
- `DestinadorCdfWorkspace` e `CdfCreateView` convertidos aos componentes Sicat (tabelas, form, status, alerts).

## 6. Limpeza

- `HomeLandingView` reescrita como landing institucional estática (subsistema de 15 arquivos canvas removido) → bundle público menor.
- Código morto removido: `CdfView.vue`, `JobsConsoleView.vue`, `UiState.vue`, `CetesbOperationalFlowsPanel.vue` (órfão/corrompido), composables `useScrollProgress`/`useStickyStoryStage`.
- **`base.css` 1.253 → 1.033 linhas**, zero classes legadas mortas (removidas `.sicat-card/table/status/grid/metric/form-grid/field/empty/glass-card/subtitle/...` e `.ui-state*`). Restam apenas `.sicat-input`/`.sicat-btn`, usadas legitimamente pelo `SicatDateInput`.

## 7. Validação

- `cd frontend && npm run build` → ✅ verde em todos os incrementos.
- 0 `v-snackbar` inline nas telas refatoradas; 0 helpers de status duplicados; 0 classes CSS mortas em `base.css`.
- Contratos backend e contratos dos stores Pinia (`authStore.integrationAccountId`/`sessionContextId`, padrão 202+jobId) preservados.

## 8. Pendências conhecidas

- Validação visual e2e das jornadas densas (emitir MTR em lote, receber + CDF, DMR, Jobs) — requer ambiente com backend.
- Testes Playwright em `frontend/tests/ui/` codificam a navegação antiga (`/jobs` sem admin, labels antigas) — atualizar.
- `ManifestCreateForm` (wizard) e `JobsView` permanecem grandes; decomposição interna adicional é evolução incremental (já consistentes visualmente e funcionais).
- Code-splitting do bundle principal (`manualChunks`) segue pendência pré-existente.
