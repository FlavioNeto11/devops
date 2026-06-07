# Arquitetura de Componentes Frontend (SICAT)

## Objetivo

Padronizar componentes reutilizaveis do portal para reduzir duplicacao em views, manter consistencia visual de produto corporativo e facilitar evolucao de funcionalidades transversais (tabelas, filtros, formularios, modais, estados de carregamento, status, etc.).

> **Catalogo detalhado do design system:** [frontend/docs/design-system.md](../frontend/docs/design-system.md)
> (props, slots, exemplos de uso e padroes visuais). Playground interativo: rota `/dev/components`.
> A refatoracao UX/UI corporativa esta registrada em [DL-100](copilot/13-decision-log.md#dl-100) e
> [CHANGELOG-DL-100](CHANGELOG-DL-100-REFATORACAO-UX-DESIGN-SYSTEM.md).

## Estrutura recomendada

```text
frontend/src/
  components/
    sicat/                 # DESIGN SYSTEM — componentes base reutilizaveis (prefixo Sicat)
      SicatPageLayout.vue  SicatCard.vue          SicatDataTable.vue
      SicatFiltersPanel.vue SicatActionBar.vue    SicatFormSection.vue
      SicatFormField.vue   SicatSearchInput.vue   SicatMetricCard.vue
      SicatStatusBadge.vue SicatStatusTimeline.vue SicatInlineAlert.vue
      SicatLoadingState.vue SicatEmptyState.vue   SicatErrorState.vue
      SicatSnackbar.vue    SicatConfirmDialog.vue
    shell/                 # App Shell (orquestracao da pagina autenticada)
      SicatAppShell.vue  SicatTopbar.vue  SicatNavigation.vue
      SicatMobileDrawer.vue  SicatPageHeader.vue  SicatUserMenu.vue
    shared/inputs/         # inputs compartilhados especificos
      SicatDateInput.vue
    DestinadorCdfWorkspace.vue  ManifestCreateForm.vue  ...  # componentes de dominio
  features/                # decomposicao feature-based (views grandes + helpers/composables locais)
    dashboard/DashboardView.vue
    mtr/list/manifestHelpers.js
  composables/             # useNotification, useJobAwait, useJobStream, useConfirmDialog, ...
  lib/status-map.js        # fonte unica de tones + labels de status
  config/navigation.js     # fonte declarativa unica de navegacao
  styles/{tokens,base}.css
```

Regra pratica:

- `components/sicat/*`: **design system** — base reutilizavel, sem acoplamento a stores; toda apresentacao consistente nasce aqui.
- `components/shell/*`: orquestracao da pagina autenticada (topbar, drawer, page header).
- `features/<dominio>/*`: decomposicao de telas grandes — view orquestradora + helpers/composables/sub-componentes locais ao dominio.
- `components/*.vue` (raiz): componente funcional de um dominio especifico (workspaces, formularios complexos).
- `views/*.vue`: composicao de pagina e orquestracao de estado — **nunca** concentrar apresentacao base (use os componentes Sicat).

## Componente base implementado

### `SicatDateInput`

Localizacao:

- `frontend/src/components/shared/inputs/SicatDateInput.vue`

Responsabilidades:

- Entrada textual no formato BR (`dd/mm/aaaa`)
- Navegacao por dia (`-1` e `+1`)
- Calendario customizado (popover/dialog)
- Normalizacao de data no blur
- Emissao de evento de confirmacao para regras de negocio da tela

Contrato publico:

- Props principais:
  - `modelValue`
  - `id`
  - `ariaLabel`
  - `openCalendarAriaLabel`
  - `previousDayAriaLabel`
  - `nextDayAriaLabel`
  - `disabled`
- Emits:
  - `update:modelValue`: mudanca imediata
  - `commit`: mudanca confirmada (blur, selecao no calendario, shift de dia)

## Padrao de integracao nas views

Exemplo (resumo):

```vue
<SicatDateInput
  id="dateFrom"
  v-model="filters.dateFrom"
  aria-label="Data inicial"
  @commit="onDateFieldCommit('dateFrom', $event)"
/>
```

No script da view:

- A view trata regras de dominio entre campos (ex.: `dateFrom <= dateTo`).
- O componente trata somente interacao e apresentacao do campo.

## Convencoes para proximos componentes

1. Nome sempre com prefixo `Sicat` para base compartilhada.
2. Usar tokens de design existentes (`frontend/src/styles/tokens.css`).
3. Expor API minima (props/emits) e evitar acoplamento com stores.
4. Priorizar acessibilidade (`aria-*`, foco, escape, click outside).
5. Publicar componente em `shared/<categoria>` e remover duplicacao nas views.

## Roadmap — estado atual (DL-100)

O design system base foi entregue (ver tabela em [design-system.md](../frontend/docs/design-system.md)).
Itens antes sugeridos como roadmap já cobertos: `SicatStatusBadge`, estados de
form via `SicatFormField`/`SicatFormSection`, e dropdowns migrados para `v-menu`
nativo (Vuetify) em vez de infraestrutura própria de popover.

Evolução incremental remanescente:

- decomposição interna adicional de `ManifestCreateForm` (wizard) e `JobsView`;
- atualização dos testes Playwright (`frontend/tests/ui/`) para a navegação nova;
- code-splitting do bundle principal (`manualChunks`).

## Checklist de adocao

- Componente atende ao menos 2 telas/modulos.
- API documentada (props/emits/comportamento).
- Sem dependencia de store especifica.
- Estilo baseado em tokens globais.
- Validado em desktop e mobile.

## App Shell (`Sicat*`)

Camada de orquestracao da pagina autenticada do SICAT, introduzida em
[DL-098](copilot/13-decision-log.md#dl-098). Vive em
[frontend/src/components/shell/](../frontend/src/components/shell) e e
consumida unicamente por [frontend/src/App.vue](../frontend/src/App.vue).

A navegacao e governada por uma **fonte declarativa unica**:
[frontend/src/config/navigation.js](../frontend/src/config/navigation.js).
Qualquer mudanca de menu (novo item, agrupamento, RBAC) passa por esse
arquivo — `SicatNavigation` (desktop) e `SicatMobileDrawer` (mobile)
sao apenas renderizadores.

### Composicao

```text
SicatAppShell                  // orquestrador: topbar + drawer + main + page header
 |- SicatTopbar                // brand + SicatNavigation + acoes (tema, conta, user menu)
 |   |- SicatNavigation        // desktop: pills (direct) + v-menu dropdown (group)
 |   `- SicatUserMenu          // avatar + sessao/admin/troca-conta/tema/logout
 |- SicatMobileDrawer          // navegacao em drawer abaixo do breakpoint
 `- SicatPageHeader            // breadcrumb + titulo + descricao + slot actions/meta
```

### Responsabilidades e contrato resumido

| Componente | Responsabilidade | Props principais | Emits principais |
| --- | --- | --- | --- |
| `SicatAppShell` | Compoe topbar + drawer + main + page header; controla `isMobileMenuOpen`; injeta `SicatPageHeader` automaticamente exceto em rotas com `meta.hidePageHeader` ou rota chat. | `groups`, `isDesktop`, `currentRoute`, `activeAccount`, `themeMode`, `user`, etc. | `toggle-theme`, `logout`, `change-account` |
| `SicatTopbar` | Brand + navegacao desktop + acoes (home publica, conta CETESB, tema, user menu). Botao hamburger quando `!isDesktop`. | `groups`, `isDesktop`, `activeAccount`, `themeMode`, `user` | `open-mobile-menu`, `toggle-theme`, `logout`, `change-account` |
| `SicatNavigation` | Desktop. Itera `groups`: `kind === 'direct'` vira pill `<router-link>`; `kind === 'group'` vira `v-menu`/`v-card` com `v-list-item`s. Destaca grupo ativo via `findActiveGroup`. | `groups`, `currentPath` | (somente navegacao via router-link) |
| `SicatMobileDrawer` | Mobile. Mesma fonte declarativa, renderizada em secoes rotuladas dentro de `v-navigation-drawer`. | `modelValue`, `groups`, `currentPath`, `activeAccount` | `update:modelValue`, `change-account`, `logout` |
| `SicatPageHeader` | Breadcrumb (`route.meta.breadcrumb`), titulo, descricao, slot `actions` e slot `meta` (cards de conta/contexto). | `breadcrumb`, `title`, `description` | (slots) |
| `SicatUserMenu` | Avatar + dropdown com sessao, perfis admin (quando aplicavel), troca de conta CETESB, alternar tema, logout. | `user`, `themeMode`, `canAccessAdmin`, `activeAccount` | `toggle-theme`, `logout`, `change-account`, `open-session`, `open-admin` |

### Breakpoint desktop/mobile

- Largura limite: **1180 px** (computed `isDesktop` em [frontend/src/App.vue](../frontend/src/App.vue)).
- `<1180 px` → `SicatMobileDrawer` exibido sob demanda; topbar mostra
  botao hamburger.
- `>=1180 px` → `SicatNavigation` (topbar com dropdowns); drawer
  permanece desmontado.
- Listener de `resize` atualiza `viewportWidth`; alternancia e dinamica.

### Fonte declarativa de navegacao

[frontend/src/config/navigation.js](../frontend/src/config/navigation.js) exporta:

- `NAVIGATION_GROUPS` — array de grupos `{ id, label, icon, kind: 'direct' | 'group', to?, items?, requiresAdminAccess? }`.
- `filterNavigationGroups({ canAccessAdmin })` — aplica RBAC removendo
  o grupo `admin` (e itens com `requiresAdminAccess`) quando
  `canAccessAdmin === false`.
- `findActiveGroup(groups, currentPath)` — retorna o grupo do dropdown
  ativo para destaque visual.
- `isNavigationItemActive(currentPath, itemPath)` — match exato + match
  por prefixo para subrotas (`/manifestos/:id`, `/dmr/...`,
  `/mtr-provisorio/...`, `/relatorios/mtrs/...`, `/admin/acessos/...`,
  `/operacao/auditoria/...`).
- `flattenNavigation(groups)` — util para snapshots/QA e para o drawer.

> Regra: `SicatNavigation` e `SicatMobileDrawer` **nao decidem** quais
> itens existem — eles apenas renderizam o que `filterNavigationGroups`
> retorna. Toda evolucao de menu e centralizada em `navigation.js`.

### Convivencia com guards e RBAC

- Guards em [frontend/src/router.js](../frontend/src/router.js) (auth,
  conta CETESB ativa, RBAC admin) sao **a fonte autoritativa** de
  bloqueio de rota; o filtro de menu em `filterNavigationGroups` e
  apenas espelho visual.
- `meta.hidePageHeader` (opcional na rota) suprime o `SicatPageHeader`
  automatico — usado quando a propria view renderiza um cabecalho rico.

### Cabecalho de pagina (resolvido na DL-100)

- O cabecalho de pagina foi **padronizado em `SicatPageHeader`** (via
  `SicatPageLayout`) nas telas refatoradas. O legado `AppHeader.vue`
  (token-system antigo `var(--color-…)`), ja desconectado e sem
  importadores, foi **removido**.

## Navegacao modular

Evolucao registrada na [DL-099](copilot/13-decision-log.md#dl-099).

A fonte declarativa de navegacao continua em
[frontend/src/config/navigation.js](../frontend/src/config/navigation.js),
mas agora cada grupo tambem declara `module`, permitindo uma camada a mais
de semantica de produto sem espalhar regras pelos componentes shell.

Modulos publicados hoje (DL-100 — navegacao por audiencia):

- `operacao` — sempre visivel (operador parceiro): Inicio, MTR, MTR Provisorio, Residuos · DMR, Certificados · CDF, Assistente.
- `sistema` — **gated por `canAccessAdmin`** (SRE/admin): Visao geral, Jobs, Auditoria, Saude CETESB, Relatorios MTR (SRE), Command Center.
- `administracao` — **gated por `canAccessAdmin`**: Acessos.

> Os modulos `monitoramento` e `inteligencia` da DL-099 foram consolidados:
> "Centro Operacional" virou o modulo **`sistema`** (gated por role) e o Chat
> virou **Assistente** dentro de `operacao`. Cada rota declara `meta.audience`
> (`operator`/`system`/`admin`); `SicatPageHeader` deriva `tone="system"` para
> telas tecnicas. Jobs foi consolidado em `/sistema/jobs` (`/jobs` e
> `/operacao/jobs` redirecionam).

Regra estrutural:

- `navigation.js` define os grupos e o modulo de cada grupo.
- `groupNavigationByModule(groups)` monta buckets ordenados para consumo de
  UI, preservando compatibilidade de grupos sem `module` ao recair em
  `operacao`.
- `SicatMobileDrawer` consome essa estrutura e renderiza subtitulos por
  modulo; `SicatNavigation` desktop permanece estavel e continua guiado
  pela mesma fonte declarativa.

Consequence arquitetural: a semantica de produto fica centralizada no
arquivo declarativo, e nao em condicionais espalhadas por drawer, topbar ou
router.

## Modulo CDF dedicado e workspace reutilizavel

A cadeia DL-099 separou CDF de Manifestos no nivel de navegacao e rota,
sem quebrar o fluxo legado.

Pecas principais (convertidas ao design system na DL-100):

- [frontend/src/views/CdfListView.vue](../frontend/src/views/CdfListView.vue) —
  rota `/cdf` (lista/consulta/download), em `SicatPageLayout` + `SicatDataTable` + `SicatFiltersPanel`.
- [frontend/src/views/CdfCreateView.vue](../frontend/src/views/CdfCreateView.vue) —
  rota `/cdf/novo` (selecao de manifestos elegiveis + emissao), em `SicatCard` + `SicatDataTable` + `SicatFormSection`.
- `frontend/src/components/DestinadorCdfWorkspace.vue` — REMOVIDO: o fluxo de CDF foi unificado em
  [frontend/src/views/CdfCreateView.vue](../frontend/src/views/CdfCreateView.vue); a tela de manifestos apenas redireciona para `/cdf/novo` levando a seleção.
- [frontend/src/views/ManifestDetailView.vue](../frontend/src/views/ManifestDetailView.vue)
  — ponto de entrada contextual para `/cdf/novo?manifestId=:id`.

Padrao adotado:

- as views de pagina orquestram contexto de rota, pre-selecao e navegacao;
- o workspace concentra a UX operacional de filtros, listagem, emissao e download;
- toda apresentacao (tabela, status, form, alerts) usa o design system Sicat —
  **sem mais CSS legado** (`.sicat-table`/`.sicat-status`/`.sicat-form-grid` removidos).

> A view `CdfView.vue` (nao roteada / codigo morto) foi **removida** na DL-100.

## Utilitario central de status

[frontend/src/lib/status-map.js](../frontend/src/lib/status-map.js) passa a
ser a referencia de convergencia futura para tons de status de jobs e
manifestos.

Objetivo arquitetural:

- reduzir a proliferacao de helpers locais de badge/status em views como
  Manifestos, Dashboard, Jobs, Console operacional e CDF;
- alinhar nomes semanticos (`neutral`, `running`, `warning`, `success`,
  `error`) aos tokens globais e ao tema Vuetify;
- permitir migracao gradual, sem exigir uma troca transversal de uma vez.

Estado atual (DL-100):

- `status-map.js` e a **fonte unica** de tones + labels pt-BR, por dominio
  (`manifest`, `job`, `cdf`, `dmr`, `account-health`);
- consumido por `SicatStatusBadge` em todas as telas refatoradas;
- helpers locais de status (`statusClass`, `normalizeManifestStatusClass`,
  `resolveManifestStatusLabel` inline, etc.) foram **removidos** das views.
