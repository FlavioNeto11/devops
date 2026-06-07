# 10 - Documentation Final

## Objetivo da fase

Consolidar o encerramento do WORK_ID `homepage-canvas-continuous-storytelling` apos a aprovacao da fase 09 rodada 16, registrando historico de regressoes, correcoes acumuladas e status final do workstream.

## Rastreabilidade da cadeia

Checkpoints consolidados nesta fase:

- [00-orchestration.md](./00-orchestration.md)
- [06-frontend-ux.md](./06-frontend-ux.md)
- [09-qa-validation.md](./09-qa-validation.md)

---

## Historico de regressoes e correcoes

### Regressao rodada 10 — progressao narrativa quebrada

Estado intermediario (QA rodada 10):

1. overlap com CTA ja estava resolvido (`maxOverlapY=0` em desktop/tablet/mobile);
2. progressao narrativa estava quebrada:
   - sequencia observada sem completar os 4 marcos esperados;
   - `profiles` nao dominava o final da secao (`conversation` permanecia dominante na cauda).

Leitura consolidada: sucesso na geometria de saida, mas regressao funcional de progressao/timeline.

**Correcao aplicada (rodada 14):** timeline desacoplada da geometria de saida.

Principais ajustes:

1. introducao de janela narrativa normalizada:
   - `STORY_TIMELINE_PROGRESS_WINDOW`;
   - `resolveStoryTimelineProgress(progress)`.
2. uso do progresso normalizado em toda a narrativa do canvas unificado:
   - milestone ativa;
   - progresso interno de milestone;
   - visibilidade/crossfade/foco final;
   - revelacao dos nos da jornada.

Efeito: ajustes de `exit-space`/`bottom-clearance` deixaram de distorcer o fechamento da timeline, preservando overlap zero sem quebrar o takeover final de `profiles`.

---

### Problema reportado rodada 15 — transicao 1->2 cedo demais e clipping de Geofence/NFC

**Problema 1: transicao 1->2 prematura.**
O passo 1 (journey) perdia dominancia antes do esperado, fazendo capabilities aparecer cedo demais durante o scroll.

**Problema 2: clipping estrutural da legenda do passo 1.**
Os items Geofence (item 4) e NFC (item 5) da legenda de journey ficavam completamente invisiveis na maioria dos viewports.

---

### Causa raiz do clipping (rodada 16)

A grid do milestone `journey` usava auto-placement sem placement explicito:

| Filho | Placement automatico | Resultado |
| --- | --- | --- |
| Header (filho 1) | grid row 1, col 1 | correto |
| Spine SVG (filho 2) | grid row 1, col 2 | altura intrinseca = 667px, **dominava row 1** |
| Legend (filho 3) | grid row 2, col 1 | sobrava apenas ~51px — **todos os cards cortados** |

Os items 2 a 7 da legenda (incluindo Geofence e NFC) ficavam fora do frame visivel. O spine SVG consumia praticamente toda a altura disponivel na row compartilhada com o header, deixando a row da legenda degradada a altura minima.

---

### Correcao aplicada rodada 16 — UnifiedVerticalStoryCanvas

**Arquivo:** `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`

Adicionado placement explicito via seletores filho direto:

```css
/* Header — span completo, row 1 */
.story-milestone--journey > .milestone-header {
  grid-column: 1 / -1;
  grid-row: 1;
}

/* Spine — col 1, row 2 inteira */
.story-milestone--journey > .journey-spine {
  grid-column: 1;
  grid-row: 2;
  height: 100%;
}

/* Legenda — col 2, row 2 */
.story-milestone--journey > .journey-nodes-legend {
  grid-column: 2;
  grid-row: 2;
}
```

Mobile (<=768px):

- spine ocultado (`display: none`);
- legenda com 2 colunas (`repeat(2, minmax(0,1fr))`);
- placements resetados para auto.

Nenhuma alteracao em timing, sticky, ancora, dark mode ou outros milestones.

---

## Aprovacao QA — rodada 16

Status da fase 09 rodada 16: **Aprovado**.

### Clipping da legenda do passo 1

| Breakpoint | Items visiveis | clipped |
| --- | --- | --- |
| Desktop (1280x900) | 8/8 | 0 |
| Tablet (1024x768) | 8/8 | 0 |
| Mobile (390x844) | 8/8 | 0 |

Geofence (item 4) e NFC (item 5) totalmente visiveis em todos os breakpoints.

### Transicao 1->2

Journey permanece dominante ate scrollY ~2950 (crossover em `timelineP` ~0.349). Passo 1 mantem plateau alto ate ~2700. Status: PASS.

### Sequencia deterministica

`journey (2500) -> capabilities (3200) -> conversation (3800) -> profiles (4200+)` confirmada em desktop.
Status: PASS.

### Dominancia final de profiles

| Breakpoint | profiles | outros |
| --- | --- | --- |
| Desktop | 1.0 | 0 |
| Tablet (1024) | 1.0 | 0 |
| Mobile (390) | 1.0 | 0 |

Status: PASS.

### Overlap frame x CTA

`maxOverlapY=0`, `frameBottom=491 < ctaTop=531`. Status: PASS.

### Sticky

`stageTop=72`, `cssTop=72`, `delta=0` em todos os pontos amostrados (scrollY 2500, 2900, 3200, 3600, 4000). Status: PASS.

### Sem overflow horizontal

`overflowDelta=0` em desktop. Status: PASS.

### Ancora

`a[href="#unified-story-canvas"]` presente. Apos clique: `hash=#unified-story-canvas`, `scrollY=2066`. Status: PASS.

### Dark mode

Estado inicial: `home-root--dark` ativo. Toggle ida/volta funcional. Status: PASS.

---

## Nao regressao completa (consolidada)

Todos os itens de nao regressao ficaram aprovados na rodada final (rodada 16):

1. passo 1 dominante na entrada;
2. dark mode funcional (toggle ida/volta);
3. ancora `#unified-story-canvas` funcional;
4. sticky estavel (`stageTop=72`, `cssTop=72` na janela util, `delta=0`);
5. sem overflow horizontal (`overflowDelta=0`);
6. sem scroll interno concorrente em `.story-milestone`;
7. clipping zero em todos os items da legenda journey (8/8 visiveis, 0 clipped).

---

## Arquivos alterados no ciclo completo

| Arquivo | Motivo |
| --- | --- |
| `frontend/src/composables/useStickyStoryStage.js` | Sticky lifecycle, janela narrativa normalizada |
| `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue` | Grid placement journey, rebalanceamento espacial, fix grid clipping rodada 16 |
| `frontend/src/views/HomeLandingView.vue` | `overflow-x: clip` no root (fix sticky) |
| `frontend/src/components/landing/layout/CanvasChapterShell.vue` | Estrutura narrativa continua |
| `frontend/src/components/landing/layout/ChapterHeaderOverlay.vue` | Estrutura narrativa continua |
| `frontend/src/components/landing/layout/NarrativeProgressRail.vue` | Progress rail |
| `frontend/src/components/landing/layout/SectionConnectorGlow.vue` | Conectores entre capitulos |
| `frontend/src/components/landing/canvas/JourneyExplainerCanvas.vue` | Hotfix IndexSizeError arc raio negativo |
| `frontend/src/components/landing/canvas/CapabilityMapCanvas.vue` | Hotfix TypeError `t` nao-finito |
| `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md` | Checkpoint fase UX |
| `docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md` | Checkpoint fase QA |
| `docs/handoffs/homepage-canvas-continuous-storytelling/10-documentation-final.md` | Este arquivo |

## Endpoints e contratos

Sem alteracoes de endpoint, contrato OpenAPI ou exemplos. Escopo restrito a UX/comportamento visual da homepage publica.

## Comandos e validacoes consolidados

1. `get_errors` nos arquivos de escopo da rodada final (sem erros);
2. `npm --prefix frontend run build` (sucesso, `vite build`, `built in 7.50s`);
3. QA assistida com validacao por breakpoint de sequencia, dominancia final, overlap, sticky, ancora, dark mode e clipping.

## Riscos residuais nao bloqueantes

1. Warning pre-existente de chunk > 500 kB no build frontend permanece sem impacto no aceite do workstream.
2. Desacoplamento por janela narrativa fixa (`end` da janela util) pode requerer retuning fino se houver futura mudanca estrutural grande no pacing da secao.
3. Spine SVG da journey tem altura fixa de 667px; em futuras alteracoes do numero de nos, o placement explicito de grid deve ser revisitado.

## Estado final do workstream

**Concluido e aprovado — rodada 16.**

Sem pendencias bloqueantes abertas para este WORK_ID.
