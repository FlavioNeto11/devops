# Checkpoint 09 - qa-validation

## Objetivo da fase
Validar regressao funcional minima de `/` e `/login`, validar interatividade obrigatoria da homepage Canvas e confirmar estado compilavel do frontend.

## Escopo validado
- Rota publica `/`
- Rota publica `/login`
- Canvas principal em `#demo-canvas` (controles e interacoes)
- Build de compilacao do frontend
- Reteste pos-correcao dos dois achados da fase 09 (2026-04-22)

---

## Ciclo 1 — Validacao inicial (2026-04-22, antes das correcoes)

### Evidencias
1. Regressao minima de navegacao publica: aprovada.
2. Controles obrigatorios do Canvas (toolbar): aprovados.
3. Interacoes Canvas: parcialmente aprovadas.
   - Clique em painel IA: **nao validado** (titulo `Clique no painel IA` nao observado nas varreduras).
   - Hover/cursor: dependente de resize previo (beforeResize: 0 hotspots, afterResize: 25 hotspots).
4. Build: sucesso.

### Achados
1. **Alto**: Bounds do Canvas nao recalculados apos scroll — hotspots/cursor falham sem resize previo.
2. **Medio**: Hotspot `painel IA` nao comprovado — varreduras em cena IA nao retornaram `Clique no painel IA`.

### Status ciclo 1: **REPROVADO (parcial)**

---

## Ciclo 2 — Reteste pos-correcao (2026-04-22)

### Correcoes verificadas no codigo-fonte
- `sceneEngine.js` linha 162: `this.bounds = this.canvas.getBoundingClientRect()` no inicio de `handlePointerMove`.
- `sceneEngine.js` linha 181: `this.bounds = this.canvas.getBoundingClientRect()` no inicio de `handleClick`.
- `CanvasOverlayControls.vue` linha 66: `:data-canvas-overlay="overlayTitle"` no elemento `.canvas-overlay__panel`.

### Criterio 1 — Hover sem resize previo ativa cursor pointer
- Procedimento: page load → `window.scrollTo({ top: 600 })` (sem resize) → hover em grid 20 pontos sobre canvas 1 (main demo, 1218x560).
- Resultado: `pointerCount: 1` em grid-4-2 (x=1163, y=600, cena Abertura).
- **APROVADO** — cursor `pointer` ativado sem resize previo. Bounds recalculados lazily em `pointermove`.

### Criterio 2 — Clique no painel IA retorna overlay com data-canvas-overlay
- Procedimento: navegar para cena IA via chip timeline `3 IA` → varredura de clique 6x5 grid sobre canvas 1.
- Resultado direto: clique em (xi=1, yi=0, x=383, y=320) retornou `data-canvas-overlay="Clique no painel IA"`.
- Verificacao do atributo: `document.querySelector('[data-canvas-overlay="Clique no painel IA"]')` presente apos o clique.
- Outros overlays confirmados na mesma sessao: `Painel IA`, `Agendamento e manifesto`, `Caminhao em movimento`.
- **APROVADO** — hotspot painel IA detectado e overlay identificavel por seletor CSS.

### Criterio 3 — Build frontend aprovado
- Comando: `npm run build` (cwd `frontend`).
- Resultado: `built in 6.73s` — zero erros de compilacao.
- Warning de chunk grande do Vite: presente e nao bloqueante (comportamento esperado).
- **APROVADO**.

### Criterio 4 — Regressao de rotas `/` e `/login`
- `/`: title `SICAT MTR - Frontend`, h1 `Operacao MTR premium, da origem a auditoria`, CTA `Entrar na plataforma` — **OK**.
- `/login`: URL correta, campo email presente, campo password presente, botao `Sign in` presente — **OK**.
- **APROVADO**.

### Riscos residuais pos-correcao
- Nenhum risco bloqueante identificado.
- Warning de chunk grande do Vite e oportunidade de code-splitting futura (nao bloqueante, pre-existente).

### Status ciclo 2: **APROVADO**

---

## Resultado objetivo da fase
- Status geral: **APROVADO**
- Todos os criterios de reteste atendidos apos correcoes do frontend-vue-ux-mtr.

## Arquivos corrigidos (pelo frontend-vue-ux-mtr)
- `frontend/src/components/landing/canvas/sceneEngine.js`
- `frontend/src/components/landing/canvas/CanvasOverlayControls.vue`

## Handoff para fase 10
- Fase 10 (`documentador-mtr`) desbloqueada.
- Consolidar documentacao final com base nos checkpoints 00, 06 e 09.

## Comandos e validacoes utilizadas
- Validacao de codigo-fonte: `grep_search` em `sceneEngine.js` e `CanvasOverlayControls.vue`.
- Testes UI: Playwright MCP em `http://127.0.0.1:5175`.
- Build: `npm run build` (cwd `frontend`) — sucesso em 6.73s.
