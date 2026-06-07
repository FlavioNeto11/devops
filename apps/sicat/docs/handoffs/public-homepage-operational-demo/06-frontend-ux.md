# Checkpoint 06 - frontend-ux

## Objetivo da fase
Implementar refatoracao completa da homepage publica (`/`) com experiencia premium centrada em Canvas animado/interativo no frontend Vue 3 + Vite + Vuetify, preservando rotas e autenticacao (`/login`).

## Arquivos analisados
- `frontend/package.json`
- `frontend/src/router.js`
- `frontend/src/views/HomeLandingView.vue` (estado anterior)
- `frontend/src/App.vue`
- `frontend/src/main.js`
- `.github/instructions/frontend-vue.instructions.md`
- `.github/instructions/documentation.instructions.md`

## Decisoes tecnicas
1. Engine grafica: **Canvas2D puro** (sem PixiJS).
- Motivo: escopo visual (formas vetoriais, gradientes, trilha de rota, hubs, particulas leves, camera pan/zoom suave e hit areas) foi atendido com performance adequada em Canvas2D sem custo extra de bundle/dependencia.
- Resultado: **nenhuma dependencia adicionada** em `frontend/package.json`.

2. Arquitetura modular (sem concentrar logica em view unica):
- Componente de experiencia: `frontend/src/components/landing/canvas/SicatCanvasExperience.vue`
- Overlay de controles/timeline: `frontend/src/components/landing/canvas/CanvasOverlayControls.vue`
- Engine de render e interacao: `frontend/src/components/landing/canvas/sceneEngine.js`
- Definicao das 9 cenas: `frontend/src/components/landing/canvas/scenes.js`
- Entidades/estado de simulacao (hubs, rota, truck, particulas): `frontend/src/components/landing/canvas/entities.js`
- Helpers de easing/interpolacao: `frontend/src/components/landing/canvas/easing.js`
- Hit areas e picking de interacao: `frontend/src/components/landing/canvas/hitAreas.js`

3. Integracao da homepage:
- `frontend/src/views/HomeLandingView.vue` passou a orquestrar layout e CTA, delegando renderizacao/interatividade do demo para componentes Canvas.

## Arquivos alterados
- `frontend/src/views/HomeLandingView.vue`
- `frontend/src/components/landing/canvas/SicatCanvasExperience.vue`
- `frontend/src/components/landing/canvas/CanvasOverlayControls.vue`
- `frontend/src/components/landing/canvas/sceneEngine.js`
- `frontend/src/components/landing/canvas/scenes.js`
- `frontend/src/components/landing/canvas/entities.js`
- `frontend/src/components/landing/canvas/easing.js`
- `frontend/src/components/landing/canvas/hitAreas.js`

## Cobertura dos requisitos mandatarios
1. Validacao de stack e decisao Canvas2D vs PixiJS:
- Validado em `frontend/package.json`.
- Decisao por Canvas2D puro, sem nova dependencia.

2. Separacao arquitetural:
- Logica de animacao, cenas, entidades, easing e interacao separada em modulos dedicados.

3. Narrativa Canvas em 9 cenas:
- Implementadas: abertura, agendamento, IA, transporte, tempo real, geofence, NFC, baixa compartilhada, auditoria.

4. Interatividade obrigatoria:
- Play/Pause
- Reiniciar demo
- Avanco manual de cenas (next/previous + timeline)
- Clique nas etapas
- Clique no caminhao
- Clique no painel IA
- Clique area NFC
- Clique baixa compartilhada
- Hover/cursor em areas interativas
- Tooltips/paineis explicativos via overlay HTML
- Sincronizacao overlay <-> cena atual

5. Layout exigido:
- Hero com texto/CTA + preview Canvas em execucao
- Secao principal com Canvas grande + overlay + timeline
- Secoes inferiores de funcionalidades conectadas ao Canvas (atalhos para cenas)

6. Qualidade visual premium:
- Fundo tecnologico com gradientes e grid atmosferico
- Glow controlado
- Transicoes suaves entre cenas
- Rota curva com movimento fluido do caminhao
- Particulas leves
- Camera pan/zoom sutil por cena

7. Performance e acessibilidade:
- `requestAnimationFrame` com delta time
- Pause/destroy no unmount
- Resize + `devicePixelRatio`
- Evita reatividade pesada no loop (estado interno da engine)
- Suporte a `prefers-reduced-motion`
- Canvas com `aria-label`

8. Rotas e autenticacao preservadas:
- `/` mantido como homepage publica
- `/login` preservado
- Nenhuma alteracao em fluxo de autenticacao

## Validacoes executadas
- Lint/diagnostico dos arquivos novos/alterados via ferramenta de erros do workspace (sem erros finais relevantes).
- Build frontend obrigatorio:
  - Comando: `npm run build` (cwd `frontend`)
  - Resultado: **sucesso** (Vite build concluido)
  - Observacao: warning de chunk grande do bundle (ja existente/esperado no ecossistema atual), sem bloquear compilacao.

## Riscos e pendencias
- Risco baixo: area de bundle JS/CSS permanece grande; oportunidade futura de code-splitting para reduzir warning de chunk.
- Nao houve alteracao de contrato backend, rotas autenticadas ou API client.

## Handoff para fase 09 (tester-qa-mtr)
Contexto para validacao:
1. Validar comportamento visual/interativo da homepage `/` em desktop e mobile:
- Controles de playback funcionando
- Timeline e hotspots clicaveis (etapas, caminhao, IA, NFC, baixa compartilhada)
- Overlay sincronizado com cena/hover/click

2. Validar regressao de navegacao:
- CTA de entrada levando para `/login`
- `/login` carregando normalmente sem regressao de auth

3. Validar build e estabilidade:
- Reexecutar `npm run build` em `frontend`
- Rodar checks UI que existirem no projeto para garantir ausencia de regressao

---

## Correcoes pos-QA (fase 09 REPROVADO parcial — 2026-04-22)

### Achado 1 — ALTO: Bounds do Canvas nao recalculados apos scroll

**Causa raiz**: `this.bounds = this.canvas.getBoundingClientRect()` era chamado apenas em `handleResize()`. Apos scroll da pagina, `this.bounds.left`/`top` ficaram com valores desatualizados, tornando as coordenadas canvas-relativas incorretas em `handlePointerMove` e `handleClick`.

**Correcao aplicada** (`frontend/src/components/landing/canvas/sceneEngine.js`):
- Adicionado `this.bounds = this.canvas.getBoundingClientRect()` no inicio de `handlePointerMove` e `handleClick`.
- Recalculo lazy: chamado uma vez por evento de interacao, sem overhead de loop ou listener de scroll adicional.

### Achado 2 — MEDIO: Hotspot "painel IA" nao detectado em varredura QA

**Causa raiz**: Derivada do Achado 1. Com bounds desatualizados, `pickHitArea` recebia coordenadas erradas e nao retornava a area `ia-panel`. Alem disso, o overlay HTML nao possuia atributo identificavel por seletor para testes automatizados.

**Correcao aplicada** (`frontend/src/components/landing/canvas/CanvasOverlayControls.vue`):
- Adicionado `:data-canvas-overlay="overlayTitle"` no elemento `.canvas-overlay__panel`.
- QA pode verificar o estado por `[data-canvas-overlay="Clique no painel IA"]` sem depender de scan de texto.

### Criterios de saida atendidos
1. Sem resize previo, hover em hotspots ativa cursor pointer (bounds recalculados em `pointermove`).
2. Clique no painel IA retorna overlay identificavel por atributo `data-canvas-overlay`.
3. `npm run build` em `frontend` passou — build em 6.57s, sem erros.
4. Rotas `/` e `/login` nao afetadas (nenhuma alteracao fora dos arquivos de canvas).

### Arquivos alterados nesta correcao
- `frontend/src/components/landing/canvas/sceneEngine.js` — bounds refresh em `handlePointerMove` e `handleClick`
- `frontend/src/components/landing/canvas/CanvasOverlayControls.vue` — atributo `data-canvas-overlay` no painel de overlay
