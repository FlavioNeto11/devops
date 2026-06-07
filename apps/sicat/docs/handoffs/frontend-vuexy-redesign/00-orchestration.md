# Orchestration — frontend-vuexy-redesign

> work_id: `frontend-vuexy-redesign`  
> Data: 2026-04-21  
> Status: **em execução — rodada 2 (hardening visual + paridade template)**

---

## Demanda original

Refatorar 100% do frontend SICAT para replicar o layout e design system do Vuexy Vue.js Admin Template **Demo-6** (layout horizontal, sem sidebar lateral), com paridade de componentes e comportamento em **light/dark**, incluindo topbar com avatar e perfil, mantendo padrão visual profissional e coerente com o template de referência:

> https://demos.pixinvent.com/vuexy-vuejs-admin-template/demo-6

---

## Classificação

```yaml
orchestration:
  work_id: "frontend-vuexy-redesign"
  intent: "refactor"
  complexity: "complex"
  domains:
    - "frontend-ux"
    - "qa"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: frontend-vue-ux-mtr
      required: true
      reason: "paridade visual/UX com Vuexy demo-6 (wide), dark/light e componentes estruturais faltantes"
    - phase: "localhost-availability"
      agent: estrutura-vscode-mtr
      required: true
      reason: "subir stack local completa para validacao navegavel e regressao visual"
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: "validação visual e funcional com Playwright em modo wide, dark e light"
    - phase: "06-frontend-ux-r2-fixes"
      agent: frontend-vue-ux-mtr
      required: true
      reason: "corrigir achados de layout e comportamento levantados no QA"
    - phase: "09-qa-validation-rerun"
      agent: tester-qa-mtr
      required: true
      reason: "revalidar todos os fluxos após ajustes finais"
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: "documentar decisões de design system, evidências e status final"
```

---

## Contexto técnico coletado

### Stack atual do frontend SICAT

| Dimensão | Estado atual |
|---|---|
| Framework | Vue 3 + Vite |
| Componentes | **Custom** (CSS puro, sem lib de componentes) |
| Layout | Sidebar vertical (nav lateral) |
| State | Pinia (stores: auth.js) |
| Router | Vue Router 4 |
| Icons | Material Symbols (Google) |
| CSS | CSS custom properties próprias |
| Font | Sistema (sem Google Fonts explícita) |
| HTTP | fetch API direta nos services |
| Charts | Nenhum |
| Deps adicionais | jszip |

### Stack alvo — Vuexy demo-6

| Dimensão | Alvo |
|---|---|
| Framework | Vue 3 + Vite (mantém) |
| Componentes | **Vuetify 3.x** |
| Layout | **HorizontalNav** (barra horizontal fixa no topo) |
| State | Pinia (mantém) |
| Router | Vue Router 4 (mantém) |
| Icons | **Material Design Icons** (`@mdi/font`) |
| CSS | Vuetify CSS + SCSS custom tokens |
| Font | **Public Sans** (Google Fonts) |
| HTTP | Mantém serviços existentes |
| Charts | ApexCharts (`vue3-apexcharts`) — para dashboard |

---

## Reference técnica mapeada

O mapeamento completo do Vuexy demo-6 está em:
`docs/handoffs/vuexy-demo6-reference.md`

### Paleta de cores Vuetify (alvo)

```
primary:    #7367F0 (115, 103, 240) — roxo/violeta
secondary:  #8692D0
success:    #28C76F
warning:    #FF9F43
error:      #EA5455
info:       #00CFE8
background: #F5F5F9 (off-white azulado)
surface:    #FFFFFF
on-text:    #4B465C
```

### Estrutura de layout HTML alvo (demo-6)

```
.v-application.v-theme--light
  .layout-wrapper.layout-content-navbar.layout-horizontal
    <header.layout-navbar.navbar-sticky>
      <nav.app-bar-nav.navbar-scrollable>
        .app-brand (logo)
        <ul.horizontal-nav-list> (itens do menu)
        .navbar-extra (search, bell, avatar, theme toggle)
    .layout-page
      <main.content-wrapper>
        .container-xxl.container-p-y
          <RouterView />
      <footer.content-footer>
```

---

## Arquivos a refatorar (frontend/src/)

| Arquivo | Ação |
|---|---|
| `package.json` | Adicionar vuetify, @mdi/font, vite-plugin-vuetify, @vuetify/vite-plugin |
| `main.js` | Configurar Vuetify com tema Vuexy + MDI icons |
| `App.vue` | Substituir layout sidebar por HorizontalNav Vuetify |
| `router.js` | Manter rotas; ajustar meta se necessário |
| `styles/tokens.css` | Substituir por Vuetify + variáveis Vuexy |
| `layouts/` (criar) | `AppLayout.vue` (horizontal), `AuthLayout.vue` |
| `views/LoginView.vue` | Refatorar para design Vuexy login com v-card + VForm |
| `views/DashboardView.vue` | Refatorar com v-card, stats, apexcharts |
| `views/ManifestsView.vue` | Refatorar com v-data-table + v-chip + v-btn |
| `views/ManifestCreateView.vue` | Refatorar com VForm + v-text-field |
| `views/ManifestDetailView.vue` | Refatorar com v-card + v-chip |
| `views/JobsView.vue` | Refatorar com v-data-table |
| `views/SessionAccountView.vue` | Refatorar com v-card |
| `views/AccessAdminView.vue` | Refatorar com v-data-table + v-dialog |
| `views/CetesbAccountSelectionView.vue` | Refatorar com v-card + v-list |
| `components/AppHeader.vue` | Pode ser absorvido pelo AppLayout.vue |
| `stores/` | Manter stores existentes, sem refatoração de lógica |

---

## Dependências novas a instalar

```bash
npm install vuetify@^3.7 @vuetify/vite-plugin @mdi/font vue3-apexcharts apexcharts
```

**vite.config.js** precisa do plugin Vuetify:
```js
import vuetify from 'vite-plugin-vuetify'
plugins: [vue(), vuetify({ autoImport: true })]
```

---

## Regras críticas da refatoração

1. **NÃO alterar** stores (lógica de negócio mantida intacta)
2. **NÃO alterar** services (HTTP calls mantidas)
3. **NÃO alterar** rotas nem guards do router
4. **NÃO remover** features existentes (filtros, exportação, fluxos CETESB)
5. Layout horizontal obrigatório (menu no topo, sem sidebar)
6. Todas as cores via `--v-theme-*` conforme paleta Vuexy
7. Font: Public Sans via Google Fonts no index.html
8. Icons: MDI (`mdi-*`)  — remover Material Symbols
9. Manter acessibilidade: roles, aria-labels onde já existem
10. Todos os componentes Vuetify com `variant="outlined"` e `density="compact"` como padrão

---

## Critérios de pronto

- [ ] Vuetify 3 instalado e configurado com paleta Vuexy
- [ ] Layout horizontal funcional (logo + menu + navbar-extra)
- [ ] `LoginView.vue` visualmente igual ao Vuexy demo-6/login
- [ ] `DashboardView.vue` com cards v-card no estilo Vuexy
- [ ] Todas as Views refatoradas com componentes Vuetify
- [ ] Dark mode funcional via Vuetify theme toggle
- [ ] Light e dark com paridade de spacing, cores, contrastes e estados visuais
- [ ] Navbar superior com avatar, menu de perfil e ações rápidas no padrão Vuexy
- [ ] Login SICAT com composição e estética equivalentes ao Vuexy demo-6/login
- [ ] Manifesto em fluxo wizard no padrão demo-6/wizard-examples/checkout
- [ ] QA Playwright em modo wide com aprovação final sem bloqueios visuais
- [ ] Todas as rotas e guards existentes preservados
- [ ] Toda lógica de stores e services preservada
- [ ] App roda sem erros no `npm run dev`

---

## Próximos checkpoints esperados

| Arquivo | Agente responsável |
|---|---|
| `01-frontend-implementation.md` | `frontend-vue-ux-mtr` |
| `09-qa-validation.md` | `tester-qa-mtr` |

---

## Referências

- Template de referência: `docs/handoffs/vuexy-demo6-reference.md`
- URL demo-6: https://demos.pixinvent.com/vuexy-vuejs-admin-template/demo-6
- Relatório de mapeamento gerado em: 2026-04-21
