# 06 - Frontend UX

## Objetivo da fase

Refatorar a homepage publica para narrativa continua premium, preservando os tres canvases existentes como protagonistas e removendo percepcao de blocos empilhados.

## Decisoes visuais

- Estrutura de storytelling continuo com fundo atmosferico multicamada fixo e malha suave de profundidade.
- Conectores entre capitulos via componente dedicado com linha, glow e orb central para transicao elegante.
- Wrappers editoriais dos canvases com frame sofisticado, halo, microtexto e variacao de tema por capitulo.
- Progress rail persistente com marcadores de narrativa e realce por intersecao de scroll.
- Costura reforcada hero -> canvas 1 e canvas 3 -> CTA final com linguagem de continuidade.
- Responsividade desktop com rail lateral fixo.
- Responsividade tablet/mobile com rail em modo sticky horizontal e frames com raios e padding reduzidos.
- Performance baseada em CSS com gradientes, blur, mask, color-mix e transform sem competir com animacoes internas dos canvases.

## Arquivos alterados

- `frontend/src/views/HomeLandingView.vue`
- `frontend/src/components/landing/layout/CanvasChapterShell.vue`
- `frontend/src/components/landing/layout/ChapterHeaderOverlay.vue`
- `frontend/src/components/landing/layout/NarrativeProgressRail.vue`
- `frontend/src/components/landing/layout/SectionConnectorGlow.vue`

## Validacoes executadas

- Checagem de erros dos arquivos alterados via tool de diagnostico: sem erros apos ajuste de lint (`dataset.storyChapter`).
- Build frontend executado em `frontend/` com `npm run build`.
- Resultado: sucesso com Vite build concluido.
- Observacao: warning de chunk grande ja existente no projeto, sem falha de build.

## Handoff para QA

Owner: tester-qa-mtr

Escopo de validacao recomendado:

1. Verificar continuidade visual desktop, tablet e mobile entre hero, capitulo 1, capitulo 2, capitulo 3 e CTA.
2. Garantir protagonismo dos canvases sem regressao funcional interna.
3. Confirmar rail de progresso atualizando capitulo ativo durante scroll.
4. Validar navegacao por anchors do rail e botoes hero e CTA.
5. Revalidar tema claro e escuro.

---

## Hotfix Runtime — Canvases 2 e 3 (2026-04-23)

### Contexto

QA reprovou rodada anterior reportando duas regressoes de runtime nos canvases protagonistas.

### Bugs corrigidos

#### Bug 1 — JourneyExplainerCanvas: IndexSizeError em arc com raio negativo

- **Arquivo**: `frontend/src/components/landing/canvas/JourneyExplainerCanvas.vue`
- **Causa raiz**: `drawIllustration` era chamada sem guardar contra `size <= 0`. Em renders iniciais com layout ainda nao finalizado (`getBoundingClientRect().height` proximo de zero), `illSize = Math.min(PANEL_W * 0.42, illH * 0.88)` produzia valores degenerate que propagavam para chamadas de `ctx.arc()` e `createRadialGradient()`, lancando IndexSizeError.
- **Correcao**: early return `if (size <= 0) return;` no topo de `drawIllustration`. Nenhum impacto visual em operacao normal.

#### Bug 2 — CapabilityMapCanvas: TypeError (reading 'x') em drawIconRastreamento

- **Arquivo**: `frontend/src/components/landing/canvas/CapabilityMapCanvas.vue`
- **Causa raiz**: `drawIconRastreamento` nao guardava contra `t` nao-finito (NaN ou Infinity). Se `t` fosse NaN em edge case de remount ou timing de resize, `progress = (t * 0.5) % 1 = NaN`, `seg = NaN`, `path[NaN] = undefined`, e `path[NaN].x` lancava TypeError.
- **Correcao**:
  1. Guard no topo: `if (size <= 0 || !Number.isFinite(t)) return;`
  2. Calculo de `seg` refatorado com `Math.max(0, segRaw)` e `segT` clampeado a `[0, 1]`.
  3. Bounds check explicito: `if (seg + 1 >= path.length) return;` como ultima linha de defesa.

### Validacoes do rebalanceamento

| Validacao | Resultado |
| --- | --- |
| `get_errors` JourneyExplainerCanvas.vue | Sem erros |
| `get_errors` CapabilityMapCanvas.vue | Sem erros |
| `npm run build` em `frontend/` | Sucesso — built in 9.77s |

### Arquivos alterados neste hotfix

- `frontend/src/components/landing/canvas/JourneyExplainerCanvas.vue`
- `frontend/src/components/landing/canvas/CapabilityMapCanvas.vue`

### Handoff para QA (segunda rodada)

Owner: tester-qa-mtr

Focos adicionais de revalidacao:

1. JourneyExplainerCanvas: verificar renderizacao dos 9 paineis para confirmar que as ilustracoes aparecem e animam normalmente.
2. CapabilityMapCanvas: verificar marcador de posicao animado no icone de Rastreamento e confirmar movimento ao longo do caminho sem erros.
3. Regressao geral: confirmar que nenhum dos canvases lanca erros de console em resize ou troca rapida de tabs.

Prompt sugerido para proxima fase:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation na homepage publica apos refatoracao narrativa continua. Validar responsividade, continuidade visual, interacoes de rail/anchors, integridade dos 3 canvases e regressao de tema claro/escuro. Registrar resultados em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md com evidencias e riscos residuais."

---

## Rebalanceamento espacial do canvas unificado (2026-04-23)

### Objetivo desta rodada reaberta

Corrigir a ocupacao espacial do bloco de storytelling unificado para que o stage sticky pareca dominante e proporcional ao percurso vertical reservado, reduzindo a sensacao de vazio no scroll completo sem voltar ao empilhamento anterior.

### Arquivos analisados nesta rodada reaberta

- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `frontend/src/composables/useStickyStoryStage.js`
- `frontend/src/composables/useScrollProgress.js`
- `frontend/src/views/HomeLandingView.vue`

### Arquivos alterados nesta rodada reaberta

- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `frontend/src/composables/useStickyStoryStage.js`

### Decisoes desta rodada

- Reduzi a altura total do bloco unificado de `240vh` para `210vh` no modelo base para cortar scroll morto sem perder espaco de narrativa.
- Aumentei a presenca do stage sticky com altura ligada ao viewport e frame maior, evitando o efeito de card pequeno perdido no meio do bloco.
- Transformei o spacer em um trilho visual continuo com painel atmosferico e eixo vertical, para que a captura longa pareca intencional mesmo fora do estado sticky interativo.
- Reorganizei a densidade interna dos milestones com grids mais preenchidos em desktop e degradacao progressiva em tablet e mobile.
- Corrigi a progressao interna de capacidades e perfis para evitar ultimo item invisivel ou foco estagnado.
- Corrigi seletores de tema escuro no componente usando `:global(.home-root--dark)`, porque os seletores scoped anteriores nao atingiam o root da homepage.

### Validacoes desta rodada

- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`: sem erros.
- `get_errors` em `frontend/src/composables/useStickyStoryStage.js`: sem erros.
- `npm run build` em `frontend/`: sucesso, com warning de chunk grande ja existente e sem falha de build.

### Handoff para QA desta rodada

Owner: tester-qa-mtr

Escopo recomendado:

1. Validar em scroll longo se o bloco da narrativa consolidada agora parece preenchido e proporcional no desktop.
2. Verificar se o stage sticky permanece dominante durante toda a secao, sem regressao de sobreposicao ou quebra de sticky.
3. Confirmar densidade interna das quatro milestones em desktop, tablet e mobile.
4. Revalidar tema claro e escuro no canvas unificado, incluindo fundo do frame, cards e trilho atmosferico.
5. Observar se a progressao de capacidades revela os seis itens e se o foco de perfis percorre os tres estados.

Prompt sugerido para proxima fase:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation focando no canvas unificado da homepage publica apos o rebalanceamento espacial. Verifique ocupacao visual do bloco em scroll longo, dominancia do stage sticky, progressao das quatro milestones, responsividade desktop/tablet/mobile e regressao de tema claro/escuro. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."

---

## Reabertura do lifecycle sticky do stage (2026-04-23)

### Objetivo desta rodada pos-aprovacao

Corrigir a causa raiz que impedia o stage sticky do canvas unificado de permanecer preso ao viewport ao longo da secao, preservando o crossfade entre milestones e sem retornar ao empilhamento bruto.

### Arquivos analisados nesta rodada

- `frontend/src/views/HomeLandingView.vue`
- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `frontend/src/composables/useStickyStoryStage.js`
- `frontend/src/composables/useScrollProgress.js`
- `docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md`

### Arquivos alterados nesta rodada pos-aprovacao

- `frontend/src/views/HomeLandingView.vue`
- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

### Decisoes desta rodada reaberta

- Mantive a estrutura interna do `UnifiedVerticalStoryCanvas` e o crossfade das milestones, porque a causa raiz nao estava no frame sticky nem na composicao do bloco.
- Corrigi o root da homepage para usar `overflow-x: clip` em vez de `overflow-x: hidden`.
- Motivo tecnico: em CSS, `overflow-x: hidden` com `overflow-y: visible` computa o eixo Y como `auto`, o que cria um ancestral de overflow no `.home-root`; isso neutralizava o comportamento esperado de `position: sticky` no stage da narrativa.
- Simplifiquei a geometria do `UnifiedVerticalStoryCanvas`: o elemento `.unified-story-stage` agora funciona como ancora sticky leve (`height: 0`), enquanto o frame visual continua alto e visivel por overflow.
- Motivo tecnico adicional: antes, a propria altura do stage sticky consumia o budget de sticky bounds e fazia o frame comecar a soltar cedo demais na milestone 3/4; com a ancora leve, a fixacao se sustenta durante quase toda a travessia util da secao.
- A correcao remove o falso scroll container e amplia a duracao efetiva do sticky sem reabrir o layout geral da landing nem a logica de milestones.

### Validacoes desta rodada reaberta

- Inspecao DOM/CSS assistida por browser: antes do ajuste, `.home-root` computava `overflow: hidden auto` e o `.unified-story-stage` acompanhava o topo da secao em vez de prender no `top: 72px`.
- Validacao assistida por browser apos a troca para `overflow-x: clip`: `window.scrollY = 2200`, `stageTop = 72`, `sectionTop = -114.91`, confirmando que o sticky voltou a ancorar no viewport.
- Validacao estrutural da ancora sticky: o stage passou a soltar apenas perto do final real do bloco, em vez de perder a fixacao durante a metade da narrativa.
- `get_errors` em `frontend/src/views/HomeLandingView.vue`: sem erros.
- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`: sem erros.
- `get_errors` em `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`: sem erros.

### Handoff para QA desta rodada reaberta

Owner: tester-qa-mtr

Escopo recomendado:

1. Revalidar o canvas unificado em scroll longo no desktop e confirmar que o stage permanece preso ao viewport durante a travessia principal da secao.
2. Confirmar que o crossfade entre as quatro milestones continua progressivo e sem empilhamento bruto.
3. Verificar tablet e mobile para garantir que a troca de `overflow-x` no root nao introduziu overflow horizontal na landing.
4. Revalidar anchors, rail e comportamento geral da homepage publica, porque o root agora deixou de criar um scroll container implicito.

Prompt sugerido para proxima fase:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation focando na correcao do lifecycle sticky do canvas unificado da homepage publica. Verifique em scroll longo se o stage permanece preso ao viewport durante a secao, confirme que o crossfade entre milestones continua legivel sem empilhamento bruto e revalide desktop, tablet e mobile para overflow horizontal e integridade geral da landing. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."

---

## Pos-aprovacao com ressalvas: ancora e hardening responsivo (2026-04-23)

### Objetivo desta rodada de regressao

- Corrigir navegacao por ancora do bloco unificado para eliminar alvo inexistente no DOM.
- Reduzir dependencia de clipping lateral em tablet/mobile, sem quebrar sticky stage e crossfade aprovados.
- Preservar composicao narrativa com protagonismo do stage sticky, sem reintroduzir empilhamento bruto.

### Arquivos alterados nesta rodada

- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`

### Decisoes desta rodada pos-aprovacao

- Adicionei `id="unified-story-canvas"` no root section do canvas unificado para atender links existentes (`#unified-story-canvas`) no rail e em navegacao por ancora.
- Mantive `data-story-chapter="unified-story-canvas"` para nao impactar o tracking por `IntersectionObserver`.
- Endureci responsividade no proprio componente com ajuste de altura do container em breakpoints (`1024px` e `768px`) e reducao de padding/raios do frame para limitar necessidade de clipping lateral.
- Reduzi impacto visual dos elementos decorativos em mobile (`::after` com menor deslocamento e opacidade) para evitar fuga lateral perceptivel.
- Mantive a arquitetura sticky/crossfade intacta (sem alteracao da logica de milestones ou composables), apenas tuning de geometria e overflow horizontal.

### Validacoes executadas nesta rodada

- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`: sem erros.
- `get_errors` em `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`: sem erros.

### Handoff para QA desta rodada pos-aprovacao

Owner: tester-qa-mtr

Escopo recomendado para fase 09:

1. Confirmar que links do rail e acessos por hash para `#unified-story-canvas` nao geram warning de ancora nao encontrada.
2. Revalidar desktop/tablet/mobile para overflow horizontal no bloco unificado apos tuning de espacamento e decorativos.
3. Confirmar que sticky stage e crossfade continuam com comportamento aprovado ao longo da secao.
4. Garantir que nao houve regressao para empilhamento bruto de milestones.

Prompt sugerido para proxima fase:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation apos ajustes de ancora e hardening responsivo do canvas unificado. Valide hash `#unified-story-canvas`, ausencia de warning de ancora, overflow horizontal em tablet/mobile, preservacao do sticky stage/crossfade e ausencia de empilhamento bruto. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."

---

## Correcao de regressao pos-release (2026-04-23)

### Objetivo desta rodada 6

Corrigir tres regressos reportados na homepage publica apos a consolidacao narrativa:

1. degradacao de contraste/composicao no modo dark dentro do bloco unificado;
2. scrollbar indevido no inicio da secao unificada;
3. sobreposicao do bloco unificado sobre o bloco seguinte no final da secao.

### Arquivos analisados nesta rodada de regressao

- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `frontend/src/views/HomeLandingView.vue`

### Arquivos alterados nesta rodada de regressao

- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `frontend/src/views/HomeLandingView.vue`
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

### Decisoes e correcoes aplicadas

- Reforcei contraste no dark theme do bloco unificado:
  - aumento de separacao visual em `legend-item`, `capability-item`, `conversation-channel` e `profile-card`;
  - aumento de legibilidade de textos secundarios (`milestone-header p`, descricoes e itens de lista);
  - realce adicional no estado focado de perfis para manter hierarquia visual.
- Eliminei exibicao de scrollbar interno indevido no stage:
  - mantive `overflow-y: auto` para nao perder conteudo funcional;
  - ocultei trilhos visuais com `scrollbar-width: none` e `::-webkit-scrollbar { width: 0; height: 0; }`.
- Corrigi sobreposicao no final da secao com hardening de bounds/stacking:
  - aumentei espaco de saida do bloco (`margin-bottom` e `padding-bottom` no spacer) para reduzir choque no encerramento do sticky;
  - reduzi z-index do stage sticky e garanti que o bloco seguinte (`cta-section`) pinte acima quando necessario.
- Preservei comportamento aprovado anteriormente:
  - ancora `#unified-story-canvas` mantida;
  - crossfade por milestones sem retorno ao empilhamento bruto;
  - responsividade desktop/tablet/mobile mantida com ajustes proporcionais de saida.

### Validacoes executadas nesta rodada de regressao

- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`: sem erros.
- `get_errors` em `frontend/src/views/HomeLandingView.vue`: sem erros.

### Handoff para QA desta rodada de regressao

Owner: tester-qa-mtr

Escopo recomendado:

1. Revalidar modo dark especificamente no bloco unificado (frame, milestones e cards) para contraste e leitura em desktop e mobile.
2. Confirmar ausencia de scrollbar visual indevido no inicio da secao unificada.
3. Validar fim da secao para garantir que o bloco unificado nao sobreponha conector/CTA seguinte.
4. Reconfirmar sticky + crossfade + ancoragem (`#unified-story-canvas`) sem regressao.

Prompt sugerido para proxima fase:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation focando nas tres regressos corrigidas no canvas unificado da homepage publica: contraste dark, scrollbar indevido no inicio da secao e sobreposicao no encerramento da secao. Validar desktop/tablet/mobile, sticky bounds, crossfade e ancoragem. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."

---

## Reabertura rodada 6: dark mode real no canvas unificado (2026-04-23)

### Objetivo desta rodada 7

Aplicar correcao focada exclusivamente na composicao dark do `UnifiedVerticalStoryCanvas` em runtime, mantendo sem regressao o comportamento ja aprovado de sticky/crossfade, ausencia de scrollbar indevido no inicio e ausencia de sobreposicao no final.

### Causa raiz confirmada na rodada 7

- O componente usava regras dark baseadas em ancestral externo (`.home-root--dark`) dentro de `<style scoped>`.
- Em runtime, esse acoplamento por ancestral no boundary de escopo estava fragil para este fluxo, resultando em nao casamento consistente das regras de gradiente/borda/cards no bloco unificado.

### Correcao aplicada na rodada 7

- Tornei o tema dark deterministico no proprio componente:
  - novo prop `isDark` em `UnifiedVerticalStoryCanvas`;
  - classe local condicional `unified-story-canvas--dark` no root do canvas;
  - substituicao dos seletores `:global(.home-root--dark) ...` por seletores locais `.unified-story-canvas--dark ...`.
- Em `HomeLandingView`, passei explicitamente `:is-dark="isDarkTheme"` para o canvas unificado.
- A alteracao foi restrita ao tema visual; sem mudanca na logica de scroll, sticky, milestones, ancora ou crossfade.

### Arquivos alterados nesta rodada 6

- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `frontend/src/views/HomeLandingView.vue`
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

### Validacoes executadas na rodada 6

- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`: sem erros.
- `get_errors` em `frontend/src/views/HomeLandingView.vue`: sem erros.

### Riscos residuais da rodada 7

- Nao houve validacao visual automatizada de runtime nesta rodada; a confirmacao final do resultado dark continua dependente de QA manual em navegador.
- Como o tema agora e propagado por prop local, qualquer uso futuro isolado do componente sem fornecer `isDark` caira no default claro (comportamento esperado, mas requer atencao em reuso).

### Handoff para proxima fase (rodada 7)

Owner recomendado: tester-qa-mtr

Prompt sugerido:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation focando exclusivamente no dark mode do canvas unificado apos correcao por classe local (`unified-story-canvas--dark`) dirigida por prop `isDark`. Validar em runtime que frame, gradiente de fundo, bordas e cards mudam para composicao dark real com root em dark, e confirmar ausencia de regressao em sticky/crossfade, scrollbar inicial e sobreposicao final. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."

---

## Reabertura fase 06 - QA rodada 7: progressao conversacional (2026-04-23)

### Objetivo desta rodada de regressao visual

Corrigir regressao de progressao/crossfade das milestones no canvas unificado, com foco em manter a milestone conversacional ativa e legivel durante a varredura completa de scroll, sem reabrir regressos ja aprovados (dark mode, scrollbar inicial, sobreposicao final, sticky e ancora).

### Causa raiz confirmada

- O canvas combinava duas logicas diferentes de timeline:
  - milestone ativa/progresso interno via `useMilestoneDetection` em 4 segmentos fixos de 25%;
  - visibilidade/crossfade via janelas customizadas em `useStickyStoryStage`.
- Esse desalinhamento fazia a milestone `conversation` perder estado ativo cedo demais na transicao para `profiles`, resultando em percepcao de inconsistência no passo 3 e crossfade irregular.

### Correcao aplicada

- Centralizei a timeline funcional do canvas em `useStickyStoryStage`:
  - `STORY_MILESTONE_PROGRESS_RANGES` com ranges explicitos por marco;
  - `resolveStoryMilestone(progress)` para milestone ativa consistente;
  - `resolveStoryMilestoneProgress(progress, milestoneId)` para progresso interno por range real.
- Atualizei o `UnifiedVerticalStoryCanvas` para usar essa timeline estabilizada (em vez de segmentos fixos de 25%).
- Rebalanceei as janelas de opacidade para manter sequencia mais estavel e leitura do marco conversacional:
  - `conversation` agora sustenta plateau visual maior antes do fade final;
  - `profiles` inicia fade-in mantendo continuidade sem ruptura abrupta do passo 3.

### Arquivos alterados nesta rodada 7

- `frontend/src/composables/useStickyStoryStage.js`
- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

### Validacoes executadas na rodada 7

- `get_errors` em `frontend/src/composables/useStickyStoryStage.js`: sem erros.
- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`: sem erros.

### Riscos residuais

- Esta rodada validou consistencia estrutural/lint, mas nao incluiu validacao visual automatizada em browser; confirmacao final do comportamento perceptivo de crossfade segue dependente de QA manual de scroll longo.
- A timeline agora esta acoplada ao canvas unificado (intencional para estabilidade); se futuras alteracoes de altura total (`containerHeightVh`) forem significativas, os ranges podem precisar de retuning fino.

### Handoff para proxima fase

Owner recomendado: tester-qa-mtr

Prompt sugerido:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation focando na regressao de progressao conversacional corrigida no canvas unificado. Validar scroll completo desktop/tablet/mobile para confirmar sequencia estavel dos 4 marcos, manutencao da legibilidade de `conversation` durante transicao para `profiles`, e ausencia de regressao em dark mode, scrollbar inicial, sobreposicao final, sticky e ancora. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."

---

## Reabertura fase 06 - regressao visual com evidencias (2026-04-23)

### Objetivo desta rodada 9

Corrigir tres regressos atuais no canvas unificado:

1. inicio da secao entrando quase direto no passo 2;
2. quebra de composicao no fechamento com sobreposicao sobre CTA;
3. trilha narrativa curta e transicoes com pouca suavidade.

### Decisoes e correcoes aplicadas nesta regressao visual

- Entrada do passo 1 mais lenta e dominante:
  - ajuste do trigger de `useScrollProgress` no canvas para iniciar progressao util mais cedo no viewport e evitar avancar a timeline antes da percepcao inicial do bloco;
  - retuning dos ranges oficiais de milestone (`journey` agora ocupa janela maior no inicio).
- Narrativa mais longa:
  - aumento do `containerHeightVh` no modelo visual do stage sticky;
  - incremento proporcional em breakpoints tablet/mobile para manter a trilha util de scroll em telas menores.
- Transicoes mais smooth:
  - substituicao de `ease-out` curtos por curvas `cubic-bezier(0.22, 1, 0.36, 1)` em opacidade/transform dos milestones e cards internos;
  - crossfade com interpolacao de `translateY + scale` orientada por opacidade para evitar cortes secos entre marcos.
- Saida limpa sem overlap com CTA:
  - hardening de bounds com `overflow: clip` no root do canvas;
  - aumento de `padding-bottom` no spacer para janela de desacoplamento visual no final;
  - reducao de `z-index` do stage sticky para evitar pintura acima do bloco seguinte.

### Arquivos alterados nesta rodada de regressao visual

- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `frontend/src/composables/useStickyStoryStage.js`
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

### Validacoes executadas nesta rodada de regressao visual

- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`.
- `get_errors` em `frontend/src/composables/useStickyStoryStage.js`.
- `get_errors` em `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`.

### Handoff para QA desta rodada de regressao visual

Owner recomendado: tester-qa-mtr

Escopo recomendado:

1. Confirmar na entrada da secao que o passo 1 permanece dominante por janela perceptivel antes da transicao para passo 2.
2. Revalidar fechamento da secao para garantir ausencia de sobreposicao do bloco unificado sobre CTA/conector.
3. Validar sensacao de scroll mais longo e suavidade de transicoes entre milestones em desktop/tablet/mobile.
4. Reconfirmar ausencia de scrollbar visual indevido no inicio, ancora `#unified-story-canvas` e dark mode local.

Prompt sugerido para proxima fase:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation apos correcao de regressao visual do canvas unificado. Verifique: (1) dominancia inicial do passo 1, (2) ausencia de overlap no fechamento sobre CTA, (3) trilha de scroll narrativa mais longa com transicoes suaves entre marcos. Revalidar desktop/tablet/mobile, dark mode local, ancora e ausencia de scrollbar indevido no inicio. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."

---

## Reabertura fase 06 - correcao pontual QA rodada 9 (2026-04-23)

### Objetivo desta rodada 10

Corrigir o bloqueador atual em que, no ingresso da secao unificada (`ratio = 0`), a milestone inicial (`journey` / Passo 1) entrava com opacidade `0`, reduzindo a leitura imediata do primeiro estado da narrativa.

### Correcao aplicada na rodada 9

- Ajustei somente a timeline de visibilidade no composable de stage (`useStickyStoryStage`).
- O fade-in de `journey` agora inicia antes do zero util:
  - `fadeInStart`: `-0.055`
  - `fullStart`: `0.03`
- Efeito esperado: no instante inicial da secao (`ratio = 0`), o Passo 1 ja entra perceptivel e dominante, completando naturalmente para opacidade total no inicio do percurso util.
- Nenhuma alteracao foi feita em sticky bounds, ancoragem, dark mode, overflow ou geometria do container.

### Arquivos alterados nesta rodada 9

- `frontend/src/composables/useStickyStoryStage.js`
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

### Validacoes executadas nesta rodada 9

- `get_errors` em `frontend/src/composables/useStickyStoryStage.js`.
- `get_errors` em `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`.

### Riscos residuais da rodada 9

- A calibracao da percepcao inicial depende do ritmo real de scroll/dispositivo; apesar do ajuste preservar a curva global, a validacao final de dominancia visual continua dependente de QA manual.
- Como os ranges seguintes nao foram alterados (intencionalmente), eventuais microajustes futuros devem manter coerencia com a mesma estrategia de timeline centralizada.

---

## Reabertura fase 06 - ajuste de continuidade e janela do passo 4 (2026-04-23)

### Objetivo desta rodada 11

Corrigir os quatro pontos reportados pelo usuario no canvas unificado:

1. passo 4 com baixa janela perceptiva;
2. concorrencia entre scroll interno e scroll externo (principalmente no passo 1);
3. cinematica/transicao com movimento estranho;
4. trilha de scroll curta com encerramento rapido das animacoes.

### Arquivos alterados nesta rodada 10

- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `frontend/src/composables/useStickyStoryStage.js`
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

### Decisoes e correcoes aplicadas nesta rodada 10

- Janela clara para `profiles` (Passo 4):
  - rebalanceei os ranges oficiais de milestone para aumentar a permanencia util do ultimo marco (`profiles` agora inicia em `0.76`);
  - ampliei a janela de visibilidade/fade de `profiles` para iniciar em `0.7` e consolidar em `0.8`, com sustentacao ate o fim.
- Eliminacao de scroll interno concorrente:
  - troquei `overflow-y: auto` por `overflow-y: clip` em `.story-milestone`, removendo rolagem interna do palco;
  - mantive a navegacao pelo scroll externo da pagina como driver unico da narrativa.
- Suavizacao de cinematica e continuidade:
  - aumentei duracoes de transicao (opacidade/transform) para reduzir cortes secos entre milestones;
  - adotei curva `cubic-bezier(0.2, 0.72, 0.2, 1)` com deslocamento/escala mais graduais;
  - substitui a elevacao senoidal reversa do stage por variacao monotonicamente suave para evitar percepcao de ida/volta brusca.
- Trilha de scroll significativamente maior:
  - aumentei `containerHeightVh` base de `248` para `336`;

  ---

  ## Reabertura fase 06 - bloqueador overlap no fechamento tablet/mobile (2026-04-23)

  ### Objetivo desta rodada 12 (tablet/mobile)

  Eliminar completamente o overlap entre frame do canvas unificado e CTA final no fechamento da secao em tablet/mobile, mantendo desktop inalterado e sem regressao dos comportamentos aprovados (passo 1 de entrada, passo 4 final, fluidez, dark mode, ancora e sticky funcional).

  ### Evidencia de entrada (QA)

  - tablet: `maxOverlapY ~153.6px`
  - mobile: `maxOverlapY ~464.97px`

  ### Causa raiz desta rodada

  - Em breakpoints menores, o stage sticky operava com ancora de bound em altura zero (`height: 0`).
  - Esse bound leve favorece permanencia do sticky, mas empurra a soltura para tarde demais na cauda em telas menores.
  - Com frame alto no mobile/tablet, a janela de desacoplamento final estava insuficiente e o frame ainda invadia geometricamente a area do CTA antes de encerrar a secao.

  ### Correcao aplicada na rodada 12 (tablet/mobile)

  - Arquivo ajustado: `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`.
  - Desktop preservado sem alteracao funcional:
    - mantido `--story-stage-bound-height: 0px` no baseline.
  - Tablet/mobile com lifecycle de soltura dedicado:
    - novo bound de sticky por breakpoint com `--story-stage-bound-height` acoplado a altura util do frame;
    - retuning de `--story-stage-top` e `--story-stage-bottom` para reduzir atraso de cauda;
    - aumento de `--story-frame-exit-space` e `--story-frame-bottom-clearance` para abrir janela real de desacoplamento antes do CTA.

  ### Arquivos alterados na rodada 12 (tablet/mobile)

  - `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
  - `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

  ### Validacoes executadas na rodada 12 (tablet/mobile)

  - `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`.
  - `get_errors` em `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`.

  ### Riscos residuais da rodada 12 (tablet/mobile)

  - O ajuste de tail clearance aumenta area de scroll util no fechamento em tablet/mobile; nao deve afetar a narrativa, mas pode alterar levemente o ritmo perceptivo da saida.
  - A confirmacao de overlap zero depende de validacao de scroll real por QA em mais de um viewport por breakpoint.

  ### Handoff para proxima fase da rodada 12 (tablet/mobile)

  Owner recomendado: tester-qa-mtr

  Prompt sugerido:

  "WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation focando exclusivamente no fechamento do canvas unificado apos ajuste de lifecycle sticky para tablet/mobile. Confirmar overlap zero entre frame e CTA no encerramento (desktop/tablet/mobile), sem regressao de passo 1 inicial, passo 4 final, fluidez das transicoes, dark mode, ancora `#unified-story-canvas`, sticky funcional e ausencia de overflow horizontal. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."
  - aumentei tambem em breakpoints (`1024px` e `768px`) para preservar tempo narrativo em telas menores;
  - expandi o `padding-bottom` do spacer para desacoplar melhor a saida da secao e manter encerramento progressivo.

### Validacoes executadas nesta rodada 10

- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`.
- `get_errors` em `frontend/src/composables/useStickyStoryStage.js`.
- `get_errors` em `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`.

### Riscos residuais desta rodada

- Sem validacao visual automatizada de runtime nesta rodada; a percepcao de ritmo final e confirmada por QA manual de scroll longo (desktop/tablet/mobile).
- O aumento de trilha de scroll melhora leitura narrativa, mas pode exigir microajuste posterior de ranges caso o produto queira pacing mais curto em dispositivos especificos.

### Handoff para proxima fase da rodada 10

Owner recomendado: tester-qa-mtr

Prompt sugerido:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation apos ajuste de continuidade do canvas unificado. Validar: (1) janela clara do passo 4 (`profiles`), (2) ausencia de scroll interno concorrente no palco, (3) suavidade da cinematica/transicao entre milestones, (4) trilha de scroll mais longa com encerramento progressivo. Revalidar dark mode, ancora `#unified-story-canvas`, sticky e ausencia de overlap no CTA. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."

---

## Reabertura fase 06 - bloqueadores QA rodada 11 (2026-04-23)

### Objetivo desta rodada 12

Corrigir exclusivamente os dois bloqueadores reportados pela QA rodada 11:

1. passo 4 (`profiles`) sem dominancia clara no trecho final da narrativa;
2. overlap mensuravel entre frame sticky do canvas unificado e CTA final em desktop/tablet.

### Arquivos alterados nesta rodada 11

- `frontend/src/composables/useStickyStoryStage.js`
- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

### Decisoes e correcoes aplicadas na rodada 11

- Timeline de milestone e handoff para `profiles`:
  - rebalanceei os ranges oficiais para entregar o passo 4 mais cedo e com permanencia maior no fim:
    - `journey`: `0.00 -> 0.24`
    - `capabilities`: `0.24 -> 0.46`
    - `conversation`: `0.46 -> 0.69`
    - `profiles`: `0.69 -> 1.00`
  - ajustei janelas de visibilidade para reduzir cauda de `conversation` e fortalecer takeover de `profiles` no trecho final (`conversation` encerra fade antes; `profiles` inicia fade mais cedo e estabiliza antes do final).
- Foco de perfil no final sem estado neutro:
  - revisei watcher de `profileFocus` para iniciar pre-foco de `profiles` ainda na transicao final (a partir de `scrollProgress >= 0.66`), evitando cards todos em `0.4` quando o marco ja esta visualmente entrando;
  - mapeei progressao de foco com permanencia maior no ultimo card (`admin`) no final da narrativa.
- Geometria de saida sticky e overlap com CTA:
  - introduzi variavel de espaco de desacoplamento (`--story-frame-exit-space`) e apliquei no `min-height`/`padding-bottom` do spacer para ampliar a janela de saida do frame antes do CTA;
  - aumentei `margin-bottom` da secao unificada para reforcar separacao visual no fechamento;
  - reduzi stacking local do stage/frame (`z-index: 0`) para garantir prioridade de pintura do CTA quando as secoes encostam.

### Validacoes executadas na rodada 11

- `get_errors` em `frontend/src/composables/useStickyStoryStage.js`.
- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`.
- `get_errors` em `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`.

### Riscos residuais da rodada 11

- A rodada remove as causas estruturais de takeover tardio e overlap, mas a percepcao de dominancia final ainda depende de QA visual em scroll real (desktop/tablet/mobile).
- O aumento de espaco de saida melhora desacoplamento do CTA; caso produto queira fechamento mais curto no futuro, o tuning deve preservar o novo limite minimo de separacao para nao reintroduzir overlap.

### Handoff para proxima fase da rodada 11

Owner recomendado: tester-qa-mtr

Prompt sugerido:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation focando nos dois bloqueadores da rodada 11 apos os ajustes: (1) takeover de `profiles` no trecho final com foco claro de card, (2) ausencia de overlap entre frame sticky e CTA final em desktop/tablet. Revalidar tambem ausencia de scroll interno concorrente no passo 1, dark mode, ancora e overflow horizontal. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."

---

## Reabertura fase 06 - fine tuning cinematica do canvas unificado (2026-04-23)

### Objetivo desta rodada 13

Aprimorar a fluidez perceptiva do storytelling continuo com foco em timing/easing de transicoes entre milestones, movimento do stage/frame e suavidade de elementos internos, sem regressao dos criterios ja aprovados.

### Arquivos alterados nesta rodada 12

- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `frontend/src/composables/useStickyStoryStage.js`
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

### Decisoes e ajustes aplicados

- Crossfade entre milestones com cinematica mais longa e elegante:
  - `getMilestoneStyle` passou a usar interpolacao `smoothstep` para `translateY/scale` (menos corte seco na troca de marcos);
  - transicoes de milestone alongadas com curva `cubic-bezier(0.23, 0.86, 0.24, 1)`.
- Movimento do stage/frame mais estavel:
  - elevacao do stage em `useStickyStoryStage` mudou de senoide para curva `smoothstep`, com amplitude menor (`-2` a `+2`) para reduzir percepcao de "tranco".
- Janelas de visibilidade retunadas para continuidade:
  - ranges oficiais ajustados para transicao progressiva (`journey 0-0.26`, `capabilities 0.26-0.5`, `conversation 0.5-0.74`, `profiles 0.74-1`);
  - opacidades de `milestoneVisibility` recalibradas para overlap suave e fechamento mais limpo.
- Elementos internos com reveals mais fluidos:
  - nos da jornada com opacidade eased (sem ramp linear rigida);
  - circles de capabilities com transicao real de opacidade/transform + delay (antes havia duracao dependente do delay);
  - canais conversacionais com deslocamento inicial menor e `scale` suave;
  - cards de perfis com `opacity + translateY + scale` para troca de foco sem salto abrupto.
- Guardrails preservados:
  - sem mudanca estrutural em sticky, ancora `#unified-story-canvas`, dark mode local e controle de overflow horizontal;
  - sem alteracao de contract funcional da narrativa.

### Validacoes executadas nesta rodada 12

- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`: sem erros.
- `get_errors` em `frontend/src/composables/useStickyStoryStage.js`: sem erros.
- `get_errors` em `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`.

### Riscos residuais desta rodada 12

- A rodada validou integridade estatica/lint, mas nao incluiu medicao visual automatizada de runtime; confirmacao final da "elegancia" perceptiva depende de QA manual em scroll real.
- Como houve retuning de ranges e curvas, pode haver necessidade de microajuste fino por breakpoint em dispositivos com scroll muito acelerado.

### Handoff para proxima fase da rodada 12

Owner recomendado: tester-qa-mtr

Prompt sugerido:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation focando no fine tuning cinematico do canvas unificado. Validar em desktop/tablet/mobile: (1) transicoes mais suaves entre milestones, (2) fluidez de movimento do stage/frame e elementos internos, (3) ausencia de cortes abruptos no passo 2->3 e 3->4. Reconfirmar criterios obrigatorios: passo 1 dominante na entrada, passo 4 dominante no final, zero overlap com CTA, dark mode/ancora/sticky e ausencia de overflow horizontal. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."

---

## Reabertura fase 06 - bloqueador unico da rodada 13 (2026-04-23)

### Objetivo desta rodada 14

Eliminar o overlap residual entre o frame sticky do canvas unificado e o bloco de CTA no fechamento da secao, com ajuste cirurgico apenas em geometria de saida e limites de encerramento do sticky/frame.

### Escopo e restricoes atendidas

- Mantida a timeline principal (sem retuning de ranges, progresso ou logica de milestones).
- Mantida a cinematica/easing da rodada de fine tuning.
- Preservados criterios sem regressao: passo 1 dominante na entrada, passo 4 dominante no final, dark mode, ancora, sticky e ausencia de overflow horizontal.

### Arquivos alterados nesta rodada 13

- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

### Decisoes e correcoes aplicadas na rodada 13

- Aumentei o espaco de desacoplamento de saida (`--story-frame-exit-space`) para ampliar a janela de desligamento visual do frame antes do CTA.
- Introduzi `--story-frame-bottom-clearance` para reforcar o afastamento final de forma explicita e responsiva.
- Recalibrei `min-height` e `padding-bottom` do spacer com a soma de `exit-space + bottom-clearance`, garantindo folga estrutural no encerramento sem tocar no motor de timeline.
- Reforcei `margin-bottom` da secao unificada com base no novo clearance para evitar encosto visual no CTA em desktop/tablet/mobile.
- Ajustei apenas tokens de geometria em breakpoints (`1024px` e `768px`) para manter comportamento consistente no fechamento em telas menores.

### Validacoes executadas nesta rodada 13

- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`.
- `get_errors` em `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`.

### Riscos residuais desta rodada 13

- A correcao foi deliberadamente limitada a geometria de saida; a confirmacao perceptiva final de zero overlap no fechamento permanece dependente de QA visual em scroll real.
- Como houve aumento de espacamento final, a secao fica com desacoplamento mais folgado antes do CTA; se produto pedir fechamento mais curto no futuro, o ajuste deve preservar clearance minimo para nao reintroduzir overlap.

### Handoff para proxima fase desta rodada 13

Owner recomendado: tester-qa-mtr

Prompt sugerido:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation focando exclusivamente no bloqueador da rodada 13: confirmar zero overlap entre frame sticky do canvas unificado e CTA no fechamento da secao. Revalidar sem regressao: passo 1 dominante na entrada, passo 4 dominante no final, fluidez/easing da rodada de fine tuning, dark mode, ancora, sticky e ausencia de overflow horizontal. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."

---

## Reabertura fase 06 - regressao pos-fix de overlap (2026-04-23)

### Objetivo desta rodada

Corrigir a regressao de progressao narrativa introduzida apos o hardening de overlap no fechamento, restaurando sequencia deterministica dos quatro marcos (`journey -> capabilities -> conversation -> profiles`) e dominancia de `profiles` no final, sem perder overlap zero com CTA.

### Causa raiz confirmada nesta rodada

- O progresso da timeline estava diretamente acoplado ao `scrollProgress` bruto da secao completa.
- Como o bloco recebeu aumento de `exit-space`/`bottom-clearance` para eliminar overlap, a parte final da secao passou a representar mais geometria de saida e menos narrativa util.
- Efeito colateral: no fechamento perceptivo do usuario, a timeline ainda nao chegava consistentemente ao fim logico de `profiles`, permitindo dominancia residual de `conversation`.

### Correcao aplicada nesta rodada

- Introduzi uma normalizacao explicita de timeline no composable:
  - novo `STORY_TIMELINE_PROGRESS_WINDOW`;
  - novo `resolveStoryTimelineProgress(progress)` para projetar o progresso bruto na janela narrativa util e reduzir jitter de fronteira.
- O `UnifiedVerticalStoryCanvas` agora usa esse progresso normalizado para:
  - resolver milestone ativa;
  - resolver progresso interno da milestone;
  - dirigir `useStickyStoryStage` (visibilidade/crossfade/foco final);
  - revelar nos da jornada.
- Resultado esperado: a progressao fica deterministica e desacoplada da geometria de saida; ajustes futuros de overlap nao voltam a quebrar o takeover final de `profiles`.

### Arquivos alterados nesta rodada 14

- `frontend/src/composables/useStickyStoryStage.js`
- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

### Validacoes executadas nesta rodada 14

- `get_errors` em `frontend/src/composables/useStickyStoryStage.js`: sem erros.
- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`: sem erros.

### Riscos residuais desta rodada 14

- A normalizacao usa janela fixa de timeline (`end: 0.78`); se houver mudancas estruturais grandes no pacing da secao, pode ser necessario retuning fino deste valor por UX.
- Nesta rodada foi validada integridade estatica/lint; a validacao perceptiva final (dominancia de `profiles` na cauda real por breakpoint) permanece com QA manual de scroll.

### Handoff para proxima fase desta rodada

Owner recomendado: tester-qa-mtr

Prompt sugerido:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation apos reabertura da fase 06 para regressao de progressao pos-fix de overlap. Validar em desktop/tablet/mobile: (1) sequencia deterministica `journey -> capabilities -> conversation -> profiles`, (2) dominancia de `profiles` no final, (3) overlap zero entre frame e CTA, (4) preservacao de passo 1 dominante na entrada, dark mode, ancora, sticky funcional, ausencia de overflow horizontal e ausencia de scroll interno concorrente. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."

---

## Reabertura fase 06 - ajuste fino de transicao 1->2 e clipping da legenda (2026-04-23)

### Objetivo da rodada 15

Corrigir dois pontos reportados pelo usuario no canvas unificado:

1. transicao prematura entre `journey` (passo 1) e `capabilities` (passo 2), mantendo passo 1 dominante por mais tempo;
2. clipping de cards/textos na legenda do passo 1 (principalmente Geofence e NFC), garantindo visibilidade completa sem corte lateral/inferior.

### Arquivos alterados nesta rodada 15

- `frontend/src/composables/useStickyStoryStage.js`
- `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`
- `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`

### Decisoes e correcoes da rodada 15

- Rebalanceei exclusivamente a janela de visibilidade de 1->2 no composable:
  - `journey` manteve fade-in inicial aprovado e passou a sustentar plateau maior (`fullEnd` de `0.23` para `0.28`) com fade-out mais tardio (`0.37` para `0.43`);
  - `capabilities` teve entrada atrasada (`fadeInStart` de `0.22` para `0.30` e `fullStart` de `0.32` para `0.39`);
  - janelas de `capabilities -> conversation` e `conversation -> profiles` foram preservadas para nao regredir comportamento aprovado.
- Ajustei composicao da milestone 1 para evitar clipping da legenda:
  - grade da milestone journey ficou menos comprimida e com alinhamento ao topo;
  - legenda passou para colunas flexiveis (`minmax(0, 1fr)`), largura maxima controlada e padding inferior dedicado;
  - cards da legenda receberam `min-height` e padding mais compacto para manter Geofence/NFC totalmente visiveis;
  - tuning responsivo adicional em `<=1024px` e `<=768px` para manter legibilidade sem corte.
- Mantive guardrails funcionais:
  - sem alteracao na ancora, sticky, dark mode, CTA ou logica final do passo 4;
  - sem introduzir overflow horizontal.

### Validacoes executadas nesta rodada 15

- `get_errors` em `frontend/src/composables/useStickyStoryStage.js`: sem erros.
- `get_errors` em `frontend/src/components/landing/canvas/UnifiedVerticalStoryCanvas.vue`: sem erros.
- `get_errors` em `docs/handoffs/homepage-canvas-continuous-storytelling/06-frontend-ux.md`: sem erros.

### Riscos residuais desta rodada 15

- O ajuste de pacing 1->2 foi calibrado para atrasar entrada visual de `capabilities`; a percepcao final de ritmo ainda depende de QA manual em scroll real por breakpoint.
- Como a legenda do passo 1 recebeu retuning de espacamento, pode haver necessidade de microajuste tipografico futuro caso novos textos maiores sejam adicionados.

### Handoff da rodada 15 para proxima fase

Owner recomendado: tester-qa-mtr

Prompt sugerido:

"WORK_ID: homepage-canvas-continuous-storytelling. Execute a fase 09-qa-validation focando na rodada 15 da fase 06. Validar em desktop/tablet/mobile: (1) passo 1 dominante por mais tempo antes da entrada visual de passo 2, (2) visibilidade completa dos cards/textos da legenda do passo 1 incluindo Geofence e NFC, (3) preservacao sem regressao de 2->3 e 3->4, (4) passo 4 dominante no final, (5) overlap zero com CTA, dark mode, ancora, sticky funcional e ausencia de overflow horizontal. Registrar evidencias e riscos em docs/handoffs/homepage-canvas-continuous-storytelling/09-qa-validation.md."
