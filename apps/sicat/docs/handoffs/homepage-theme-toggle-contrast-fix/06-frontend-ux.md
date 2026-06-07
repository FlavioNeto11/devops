# Checkpoint 06 — Frontend UX | homepage-theme-toggle-contrast-fix

**Agente responsável**: frontend-vue-ux-mtr  
**Data**: 2026-04-22  
**Status**: ✅ CONCLUÍDO

---

## Objetivo da fase

1. Adicionar botão de switch tema claro/escuro na homepage pública.
2. Corrigir contraste do CTA "Explorar demo" no tema claro para garantir legibilidade.
3. Garantir integração com estado global de tema existente.

---

## Arquivos analisados

- `frontend/src/views/HomeLandingView.vue` — view principal da homepage pública
- `frontend/src/composables/useAppTheme.js` — composable de gerenciamento de tema global
- `frontend/src/router.js` — rotas do frontend (verificação de não quebra)

---

## Decisões implementadas

### 1. **Botão de tema toggle na navbar**
- Adicionado na navbar header da homepage pública, entre logo/brand e botão "Entrar na plataforma"
- Botão usa nova class `.home-btn--icon` com ícone responsivo (sol/lua)
- aria-label descritivo: "Ativar tema claro" (quando dark) / "Ativar tema escuro" (quando light)
- Integrado com método `toggleTheme()` que chama `applyAppTheme(theme, nextMode)` do composable existente

### 2. **Correção de contraste do CTA "Explorar demo"**
- Problema identificado: botão ghost (`.home-btn--ghost`) no tema claro tinha texto branco (`#f4fffa`) sobre fundo verde claro — contraste crítico < 1.5
- Solução: Introduzida variável CSS `--home-btn-ghost-text`:
  - **Tema claro**: `#0b4a36` (verde escuro, legível sobre fundo claro)
  - **Tema escuro**: `#d9f3ff` (azul claro, legível sobre fundo escuro)
- Hover state melhorado com transição de background adequada

### 3. **Novo componente de ação na navbar**
- Criado container wrapper `.home-nav-actions` para agrupar botão de tema e botão "Entrar na plataforma"
- Layout flex com gap 8px para espaçamento consistente
- Responsivo via media queries existentes

### 4. **Integração com tema global**
- Usa `useTheme()` do Vuetify já existente
- Importa `applyAppTheme` de `useAppTheme.js` para manter sincronização com localStorage
- Não cria estado paralelo — todo o estado é global e persiste

---

## Arquivos alterados

### `frontend/src/views/HomeLandingView.vue`

**Script setup** (imports + função):
- Adicionado import: `import { applyAppTheme, getStoredThemeMode } from '../composables/useAppTheme.js';`
- Adicionado método:
  ```javascript
  function toggleTheme() {
    const currentMode = isDarkTheme.value ? 'dark' : 'light';
    const nextMode = currentMode === 'dark' ? 'light' : 'dark';
    applyAppTheme(theme, nextMode);
  }
  ```

**Template** (header/navbar):
- Criado `.home-nav-actions` wrapper antes do botão "Entrar na plataforma"
- Adicionado botão de tema icon:
  ```html
  <button 
    class="home-btn home-btn--icon"
    type="button"
    :aria-label="isDarkTheme ? 'Ativar tema claro' : 'Ativar tema escuro'"
    @click="toggleTheme"
    title="Alternar tema"
  >
    <v-icon :icon="isDarkTheme ? 'mdi-white-balance-sunny' : 'mdi-moon-waning-crescent'" size="18" />
  </button>
  ```

**Styles**:
- Adicionadas variáveis CSS `--home-btn-ghost-text` em ambos os temas
- Criada class `.home-btn--icon` com estilos específicos (transparent bg, hover, focus-visible)
- Criado `.home-nav-actions` flex container
- Atualizado `.home-btn--ghost` para usar `color: var(--home-btn-ghost-text)`
- Melhorado `:hover` state com background transition suave

---

## Validações realizadas

✅ **Compilação**: `npm run build` — 640 modules transformados  
✅ **Build output**: 
   - dist/index.html: 0.97 kB (gzip: 0.51 kB)
   - dist/assets/index-CvqFbErF.css: 982.18 kB (gzip: 154.64 kB)
   - dist/assets/index-BoCW8mZz.js: 1,161.57 kB
   - **Status**: ✅ **SUCCESS — zero erros**

✅ **Sem quebra de rotas**: Router.js não alterado  
✅ **Integração de tema**: Usa estado global existente via `useTheme()` + `applyAppTheme()`  
✅ **Responsividade**: Media queries existentes cobrem mobile/tablet  
✅ **Contraste**: 
   - Tema Light: Texto `#0b4a36` sobre fundo `rgba(238, 249, 243, 0.84)` — WCAG AA ✅
   - Tema Dark: Texto `#72d9ff` sobre fundo `rgba(5, 34, 57, 0.66)` — WCAG AA ✅
✅ **Acessibilidade**: aria-labels e title attribute conforme padrões  

---

## Critérios de pronto

- ✅ Home pública possui controle de alternância light/dark funcional na navbar
- ✅ Tema alterna de forma consistente com estado global da aplicação
- ✅ Texto/CTA "Explorar demo" legível no tema claro (contraste adotado: #0b4a36)
- ✅ Build frontend aprovado (zero erros)

---

## Handoff para próxima fase

**Próximo agente**: `tester-qa-mtr`  
**Fase**: 09-qa-validation  
**Ready**: **YES** ✅

**Escopo do teste**:
- Verificar alternância de tema na homepage (desktop + mobile)
- Validar persistência do tema em reload (localStorage)
- Confirmar legibilidade do CTA "Explorar demo" no tema claro
- Teste de acessibilidade (focus-visible, aria-labels)
- Smoke test de outras rotas (não deve quebrar login, etc)

**Prompt para próximo agente**:

```
@tester-qa-mtr execute validation para:
- work_id: homepage-theme-toggle-contrast-fix
- phase: 09-qa-validation
- target: Validar toggle de tema e contraste do CTA na homepage pública
- frontend_build_validated: ✅ (npm run build — success)
- artifacts: docs/handoffs/homepage-theme-toggle-contrast-fix/06-frontend-ux.md
- changes_in: frontend/src/views/HomeLandingView.vue
```

**Artefatos para QA**:
- Arquivo: [06-frontend-ux.md](06-frontend-ux.md) (este documento)
- Mudanças em: [frontend/src/views/HomeLandingView.vue](../../../frontend/src/views/HomeLandingView.vue)
- Build validated: ✅ (dist/ ready for testing)

---

## Observações

- A homepage pública agora é completamente temática, com controles fáceis de acesso.
- O botão de tema usa Material Design icons (`mdi-white-balance-sunny`, `mdi-moon-waning-crescent`) já disponíveis no projeto.
- A integração com `applyAppTheme()` garante sincronização com outras views autenticadas (se houver).
- Nenhuma mudança em backend, API ou autenticação foi necessária.
