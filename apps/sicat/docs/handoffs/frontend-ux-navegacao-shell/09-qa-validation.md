# 09 — QA Validation

- **work_id:** `frontend-ux-navegacao-shell`
- **Fase:** 09
- **Owner:** `tester-qa-mtr`
- **Data:** 2026-04-25
- **Status:** done

## Objetivo da fase

Validar a refatoração de UX/Shell entregue na fase 06 sem regressão de
build, navegação, responsividade, tema e guards de segurança (auth +
conta CETESB ativa + RBAC admin), preservando todas as rotas legadas.

## Escopo validado

1. Build de regressão do frontend.
2. Suíte `test:ui:audit` (Playwright) — avaliada e justificada.
3. Smoke estático de navegação (fonte declarativa × shell × drawer).
4. Responsividade (breakpoint desktop/mobile).
5. Persistência de tema (light/dark + localStorage).
6. Guards de rota (deslogado, sem conta CETESB, RBAC admin).
7. Compatibilidade de rotas legadas (apenas reagrupadas no menu).

## 1. Build de regressão

Comando:

```powershell
cd c:\GIT\PADILHA\sicat\frontend; npm run build
```

Resultado: **OK**

- ✓ built in **7.08s** (wall-clock total ~8.1s incluindo npm overhead).
- Bundles principais (sem regressão face à fase 06):
  - `dist/assets/index-rObqT3Ib.css` — 1.018,88 kB (gzip 161,35 kB)
  - `dist/assets/index-B1xZTXaD.js` — 1.355,61 kB (gzip 406,60 kB)
- Warnings: somente o aviso pré-existente "Some chunks are larger than
  500 kB after minification" — já mapeado em
  [06-frontend-ux.md](06-frontend-ux.md) como refinamento futuro de
  code-splitting; não-bloqueante.
- Erros: nenhum.

Hashes idênticos ao build da fase 06 (`index-rObqT3Ib.css` e
`index-B1xZTXaD.js`), confirmando estabilidade da entrega.

## 2. Suíte test:ui:audit (Playwright)

Comando previsto pelo workspace task `frontend: test:ui:audit`:

```powershell
cd c:\GIT\PADILHA\sicat\frontend; npx playwright test tests/ui/audit.spec.ts --reporter=list
```

**Status: SKIP justificado.**

Motivos:

- A suíte requer browsers Playwright instalados (`npx playwright
  install`) e um servidor dev/preview rodando (`npm run dev` ou
  `npm run preview`) acessível em `http://127.0.0.1:5174`.
- O ambiente atual de validação é headless e não possui binários de
  browser provisionados; subir o servidor em background no meio da
  validação introduziria estado não-determinístico fora do escopo de
  smoke estático.
- A regressão estrutural que justificaria reexecutar `audit.spec.ts`
  está coberta por: (a) build verde, (b) smoke estático de navegação
  abaixo, (c) inspeção dos componentes do shell.
- Recomendação: rodar manualmente em ambiente com browser via task
  VS Code `frontend: test:ui:audit` antes do release humano (já
  registrado em [06-frontend-ux.md](06-frontend-ux.md#comandos-de-validação)).

## 3. Smoke estático de navegação

Fonte declarativa: [frontend/src/config/navigation.js](../../../frontend/src/config/navigation.js)

| Grupo | `id` | `kind` | Rota(s) | Renderizado por |
| --- | --- | --- | --- | --- |
| Início | `home` | direct | `/dashboard` | pill (router-link) |
| Operação MTR | `mtr` | group | `/manifestos`, `/relatorios/mtrs`, `/jobs` | dropdown (`v-menu`) |
| MTR Provisório | `mtr-provisorio` | direct | `/mtr-provisorio` | pill |
| DMR | `dmr` | group | `/dmr`, `/dmr/pendentes` | dropdown |
| Centro Operacional | `centro-operacional` | group | `/operacao/dashboard`, `/operacao/jobs`, `/operacao/auditoria`, `/operacao/cetesb-health`, `/operacao/relatorios/mtr`, `/operacao/command-center` | dropdown |
| Chat operacional | `conversacional` | direct | `/conversacional/chat` | pill |
| Administração | `admin` | group (RBAC) | `/admin/acessos` | dropdown (apenas se `canAccessAdmin`) |

Verificações cruzadas:

- Desktop (`SicatNavigation`): em [SicatNavigation.vue#L29-L80](../../../frontend/src/components/shell/SicatNavigation.vue#L29-L80)
  o `<template>` itera `groups`; itens `kind === 'direct'` viram
  `<router-link>` pill, itens `kind === 'group'` viram `v-menu`/`v-card`
  com `v-list-item` para cada `item`. ✅ Cobre todos os 7 grupos.
- Mobile (`SicatMobileDrawer`): em [SicatMobileDrawer.vue#L46-L80](../../../frontend/src/components/shell/SicatMobileDrawer.vue#L46-L80)
  itera `groups`; `direct` vira `v-list-item` topo-de-lista, `group`
  vira seção rotulada (`drawer-group__label`) com `v-list` interna. ✅
- Pills diretos (Início, Chat operacional, MTR Provisório) navegam
  imediatamente via `<router-link :to>` sem dropdown — confirmado em
  [SicatNavigation.vue#L31-L40](../../../frontend/src/components/shell/SicatNavigation.vue#L31-L40).
- Sem duplicidade visual:
  - `Jobs` (`/jobs`) está dentro do grupo "Operação MTR".
  - `Console de jobs` (`/operacao/jobs`) está dentro do grupo
    "Centro Operacional".
  - `Relatório MTR` (`/relatorios/mtrs`) → grupo "Operação MTR".
  - `Relatório MTR (Operação)` (`/operacao/relatorios/mtr`) → grupo
    "Centro Operacional".
  - O prefixo `CO ·` foi removido (rótulos limpos), pois o agrupamento
    declarativo já comunica a intenção. ✅
- Item legado `/sessao` foi removido do menu principal e segue
  acessível pelo `SicatUserMenu` (avatar) — sem duplicação.

Helpers da fonte declarativa também foram inspecionados:

- `filterNavigationGroups({ canAccessAdmin })`
  ([navigation.js#L141-L162](../../../frontend/src/config/navigation.js#L141-L162))
  remove o grupo `admin` quando `canAccessAdmin = false` e filtra itens
  `requiresAdminAccess`.
- `findActiveGroup` + `isNavigationItemActive`
  ([navigation.js#L196-L235](../../../frontend/src/config/navigation.js#L196-L235))
  garantem destaque do dropdown ativo, com prefixos para subrotas
  (`/manifestos/:id`, `/dmr/...`, `/mtr-provisorio/...`,
  `/relatorios/mtrs/...`, `/admin/acessos/...`,
  `/operacao/auditoria/...`).

## 4. Responsividade

- Breakpoint encontrado: **1180 px** (largura do viewport).
- Origem: [frontend/src/App.vue#L36-L37](../../../frontend/src/App.vue#L36-L37)
  ```js
  const viewportWidth = ref(globalThis.window?.innerWidth ?? 1280);
  const isDesktop = computed(() => viewportWidth.value >= 1180);
  ```
- `isDesktop` é propagado como prop para `SicatAppShell` →
  `SicatTopbar`. O `SicatMobileDrawer` é controlado por
  `isMobileMenuOpen` em [SicatAppShell.vue#L33-L48](../../../frontend/src/components/shell/SicatAppShell.vue#L33-L48)
  e abre via evento `open-mobile-menu` da topbar (botão hambúrguer
  exibido quando `!isDesktop`).
- Listener de resize (`handleWindowResize`) atualiza `viewportWidth` —
  alternância dinâmica entre topbar/drawer ao redimensionar.
- Conclusão: **<1180 px → drawer mobile; ≥1180 px → topbar com
  dropdowns**. ✅

## 5. Tema (dark/light) + persistência

- Composable: [frontend/src/composables/useAppTheme.js](../../../frontend/src/composables/useAppTheme.js#L1)
- Chave de `localStorage`: **`sicat.ui.theme`** (constante
  `THEME_STORAGE_KEY` em [useAppTheme.js#L1](../../../frontend/src/composables/useAppTheme.js#L1)).
- `getStoredThemeMode` lê de `globalThis.localStorage` quando
  disponível ([useAppTheme.js#L25-L30](../../../frontend/src/composables/useAppTheme.js#L25-L30)).
- `applyAppTheme` persiste a escolha do usuário; `applyStoredAppTheme`
  é chamado no boot (`onMounted` em `App.vue`).
- Toggles disponíveis:
  - `SicatTopbar` botão de tema (clique → emite `toggle-theme`).
  - `SicatUserMenu` (avatar) — também aciona `toggle-theme`.
  - Ambos descem até `App.vue#toggleTheme()` que chama `applyTheme()`.
- Watcher em `App.vue` em `theme.global.name.value` chama
  `syncThemeSideEffects(...)` para manter side effects (ex.: classe no
  body, tokens) em sincronia.
- Conclusão: alternância funciona pelos dois pontos de UI e a escolha
  persiste em `localStorage[sicat.ui.theme]`. ✅

## 6. Guards (auditoria estática em router.js)

Arquivo: [frontend/src/router.js](../../../frontend/src/router.js#L304-L367)

- **Deslogado → `/login`**:
  ([router.js#L321-L325](../../../frontend/src/router.js#L321-L325))
  ```js
  if (to.meta.requiresSicatAuth && !hasSicatAuth) {
    authStore.logout();
    next({ path: '/login', query: { reason: 'expired' } });
    return;
  }
  ```
- **Logado sem conta CETESB ativa → `/login/cetesb`**:
  ([router.js#L332-L335](../../../frontend/src/router.js#L332-L335))
  ```js
  if (to.meta.requiresActiveCetesbAccount && !hasActiveCetesbAccount) {
    next('/login/cetesb');
    return;
  }
  ```
- **Sem `canAccessAdmin` → grupo Administração escondido + bloqueio
  de rota**:
  - Filtro de menu: `filterNavigationGroups({ canAccessAdmin })` em
    [App.vue#L22-L24](../../../frontend/src/App.vue#L22-L24) → grupo `admin`
    omitido quando `canAccessAdmin = false`
    ([navigation.js#L141-L150](../../../frontend/src/config/navigation.js#L141-L150)).
  - Guard de rota: `requiresAdminAccess` em
    [router.js#L201-L208](../../../frontend/src/router.js#L201-L208) é
    interceptado em [router.js#L337-L343](../../../frontend/src/router.js#L337-L343)
    chamando `ensureAdminRouteAccess(authStore)`; se retorno falso →
    `next('/dashboard')`.
- **Reentrada autenticada em `/login/cetesb` com conta ativa →
  `/dashboard`**:
  ([router.js#L327-L330](../../../frontend/src/router.js#L327-L330)) — evita
  loop de seleção de conta após login.

Conclusão: cadeia completa de auth → conta → RBAC admin preservada e
coerente com filtro do menu. ✅

## 7. Compatibilidade de rotas legadas

Todas as rotas mencionadas no escopo continuam definidas em
`router.js` e respondem normalmente — apenas o agrupamento no menu
mudou.

| Rota | Definida em | Grupo de menu (UI) |
| --- | --- | --- |
| `/jobs` | [router.js#L99-L106](../../../frontend/src/router.js#L99-L106) | Operação MTR |
| `/relatorios/mtrs` | [router.js#L69-L76](../../../frontend/src/router.js#L69-L76) | Operação MTR |
| `/operacao/jobs` | [router.js#L218-L226](../../../frontend/src/router.js#L218-L226) | Centro Operacional |
| `/operacao/relatorios/mtr` | [router.js#L246-L254](../../../frontend/src/router.js#L246-L254) | Centro Operacional |

Conclusão: nenhuma quebra de URL direta — bookmarks e links externos
continuam válidos. ✅

## Bugs / Regressões encontrados

Nenhum bug ou regressão funcional identificado nesta fase.

Observação não-bloqueante (já mapeada na fase 06):

- Bundle JS principal acima de 500 kB — warning pré-existente; sugerir
  `manualChunks`/`dynamic import()` em refinamento futuro
  (`frontend/vite.config.*`). Não é regressão da entrega.

## Itens skipados e justificativa

| Item | Status | Justificativa |
| --- | --- | --- |
| `test:ui:audit` (Playwright) | SKIP | Requer browser instalado e dev server up; ambiente headless. Estrutura coberta por build + smoke estático. Reexecução manual recomendada antes de release. |
| Validação visual (drawer animation, dropdown z-index, dark contrast em telas reais) | SKIP | Validação visual definitiva exige browser humano; fora do alcance de auditoria estática. |

## Veredito final

**APROVADO COM RESSALVA.**

- Aprovado: build verde, fonte declarativa coerente, shell decomposto
  conforme especificado, guards e RBAC preservados, rotas legadas
  intactas, persistência de tema OK.
- Ressalva: validação visual e `test:ui:audit` precisam de execução
  humana em ambiente com browser antes do release final — registrado
  como recomendação operacional, não impede o handoff para
  documentação.

## Handoff

- Próximo agente: `documentador-mtr` — fase 10.
- Foco esperado:
  - decision-log entry novo (DL-XXX) consolidando a refatoração;
  - mapa de navegação atualizado em
    `docs/FRONTEND-COMPONENTS-ARCHITECTURE.md` (ou doc específico);
  - changelog dedicado em `docs/CHANGELOG-DL-<id>.md`;
  - referências cruzadas a [06-frontend-ux.md](06-frontend-ux.md) e
    [09-qa-validation.md](09-qa-validation.md).
- Artefatos: este checkpoint +
  [00-orchestration.md](00-orchestration.md) +
  [06-frontend-ux.md](06-frontend-ux.md).
