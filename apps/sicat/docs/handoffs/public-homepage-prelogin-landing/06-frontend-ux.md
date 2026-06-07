# 06 - Frontend UX · public-homepage-prelogin-landing

**Status**: ✅ CONCLUÍDO  
**Data**: 2026-04-22  
**Agente**: frontend-vue-ux-mtr

---

## Objetivo da fase

Implementar a homepage pública pré-login do SICAT como landing page premium, antes da aplicação autenticada, sem quebrar o fluxo de auth existente.

---

## Arquivos analisados

| Arquivo | Relevância |
|---|---|
| `frontend/src/router.js` | Rotas, guards de navegação |
| `frontend/src/App.vue` | Shell condicional (`showShell`) |
| `frontend/src/views/LoginView.vue` | Padrão de view sem shell |
| `frontend/src/styles/tokens.css` | Design tokens (cores, espaçamentos, gradientes) |
| `frontend/src/styles/base.css` | Tipografia e reset base |
| `frontend/src/main.js` | Stack: Vue + Vuetify + Pinia + fontes |

---

## Decisões

1. **Rota `/` mapeada para `HomeLandingView`** (era `redirect: '/dashboard'`).
2. **`hideShell: true`** na rota para não renderizar nav/sidebar autenticado.
3. **Guard ajustado**: `'/' || '/login'` com auth ativo redireciona para `/dashboard` ou `/login/cetesb`.
4. **Componente standalone** com CSS scoped — sem dependência de componentes de layout autenticados.
5. **Tema dark** próprio da landing (`#0f0e1a`) coerente com identidade da plataforma.
6. **Sem imagens externas** — uso exclusivo de CSS gradients, Vuetify icons (MDI), animações CSS.
7. **Fontes reutilizadas** do bundle já importado (`Public Sans` + `Manrope` + `Material Design Icons`).

---

## Arquivos alterados

| Arquivo | Tipo | Descrição |
|---|---|---|
| `frontend/src/views/HomeLandingView.vue` | **NOVO** | Landing page pública completa |
| `frontend/src/router.js` | **EDITADO** | Import + rota `/` + guard `/` |

---

## Conteúdo implementado em `HomeLandingView.vue`

### Seções
- **Nav sticky** com brand SICAT + CTA "Acessar plataforma" → `/login`
- **Hero** fullscreen: headline, desc, mockup animado MTR com steps da jornada, floating badges
- **Stats bar**: 4 indicadores (7 etapas, NFC, 3× confirmação, 100% rastreabilidade)
- **Como funciona** (7 cards interativos com hover + timer automático): jornada completa origem→baixa
- **Funcionalidades** (grid 8 cards): IA, Agendamento, Baixa Automática, Baixa Compartilhada, NFC, Tempo Real, Antifraude, Rastreabilidade
- **IA highlight**: orb animado com rings rotativos + bubbles flutuantes + lista de benefícios
- **Segurança antifraude / NFC**: 4 pilares + card NFC animado com steps validação
- **Rastreabilidade**: timeline de eventos + 4 stat cards
- **CTA final**: headline + button "Acessar o SICAT agora" → `/login`
- **Footer**: brand + copyright + link entrar

### Storytelling da jornada (7 steps)
1. Origem agenda manifesto (IA auxilia)
2. IA valida e automatiza
3. Motorista inicia transporte
4. Acompanhamento em tempo real
5. Destino valida proximidade
6. NFC confirma presença física
7. Baixa compartilhada concluída

---

## Validações executadas

| Check | Resultado |
|---|---|
| `npm run build` (frontend) | ✅ `built in 19.33s` — sem erros |
| Lint (`npm run lint`) | ⚠️ Script não existe no package.json frontend |
| Playwright `test:ui:audit` | ⚠️ Script existe apenas como VS Code task (requer dev server) |
| Build chunk size warning | ℹ️ Warning pré-existente (chunk > 500kB) — não introduzido por esta entrega |

---

## Bloqueios registrados

- **Lint**: `npm run lint` não existe no `package.json` do frontend. Não há configuração ESLint standalone para o frontend.
- **Playwright UI tests**: requerem dev server ativo (`localhost:5174`). Não executado nesta fase — pendente para `tester-qa-mtr`.

---

## Correção pós-QA (2026-04-22)

**Bloqueador reportado**: usuário não autenticado em `/` estava sendo redirecionado para `/login?reason=expired` pelo guard `ensureActiveSession()` em `App.vue`.

**Causa raiz**: o guard verificava apenas `route.path !== '/login'` antes de redirecionar — ignorava demais rotas públicas adicionadas posteriormente (como `/`).

**Fix aplicado** em `frontend/src/App.vue`:

```diff
- if (route.path !== '/login') {
+ if (route.meta?.requiresSicatAuth !== false) {
    router.replace({ path: '/login', query: { reason: 'expired' } });
  }
```

A lógica agora respeita o meta flag `requiresSicatAuth: false` declarado no router, cobrindo todas as rotas públicas presentes e futuras sem precisar listar paths explícitos.

**Comportamentos verificados**:
- Não autenticado em `/` → permanece na landing
- Não autenticado em rota protegida → vai para `/login?reason=expired`
- Autenticado em `/` → router guard continua redirecionando para `/dashboard`

**Check executado**: `npx playwright test tests/ui/audit.spec.ts` → **10/10 passed (34.5s)**

---

## Handoff para próxima fase

**Próximo agente**: `tester-qa-mtr`

**Prompt sugerido**:
```
work_id: public-homepage-prelogin-landing

Fase 07 — QA/Validação da homepage pública.

O frontend-vue-ux-mtr implementou a landing page pré-login em:
- frontend/src/views/HomeLandingView.vue (NOVO)
- frontend/src/router.js (EDITADO — rota / + guard)

Build passa. Lint não disponível standalone.

Validar:
1. Rota / exibe HomeLandingView sem shell autenticado (hideShell: true)
2. CTA "Acessar plataforma" navega para /login
3. Usuário autenticado em / é redirecionado para /dashboard
4. Fluxo de login/auth existente continua intacto
5. Responsividade mobile (640px, 960px breakpoints)
6. Animações e interações (timer automático de steps, hover nos cards)
7. Executar: npx playwright test tests/ui/ --reporter=list (com dev server em localhost:5174)

Checkpoint anterior: docs/handoffs/public-homepage-prelogin-landing/06-frontend-ux.md
```
