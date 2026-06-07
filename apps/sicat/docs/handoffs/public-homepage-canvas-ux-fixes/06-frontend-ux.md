# Fase 06 - Frontend UX

## Objetivo
Aplicar correcoes visuais na homepage publica Canvas para resolver:
- cena inicial com conteudo critico escondido por painel/box na area superior direita;
- textos de etapas truncados/ilegiveis;
- contraste insuficiente de textos sobre fundos escuros.

## Arquivos alterados
- frontend/src/components/landing/canvas/sceneEngine.js
- frontend/src/components/landing/canvas/CanvasOverlayControls.vue
- frontend/src/components/landing/canvas/SicatCanvasExperience.vue
- frontend/src/views/HomeLandingView.vue

## Decisoes de UX e contraste
- Reordenacao de camadas no canvas: paineis contextuais agora sao desenhados antes da rota/hubs para evitar ocultacao de elementos criticos da cena.
- Ajuste de composicao da cena de abertura: painel de baixa compartilhada foi reposicionado para reduzir conflito visual no topo direito.
- HUD do canvas com quebra de linha: titulos e resumos agora usam wrap com limite de linhas e ellipsis controlado, evitando texto ilegivel.
- Timeline das etapas com melhor legibilidade: chips com largura minima maior, altura minima consistente e quebra de palavras habilitada.
- Painel/controles e hint com contraste elevado: bordas, backgrounds e foreground revisados para leitura em fundo escuro.
- Landing publica com contraste reforcado: titulos e textos principais clareados e cards com fundos/bordas ajustados para leitura consistente.

## Validacao executada
- Comando: npm run build (em frontend)
- Resultado: build concluido com sucesso.
- Observacao: warning de chunk size do Vite (>500 kB), sem erro de compilacao.

## Estabilizacao QA (rodada atual)
Objetivo desta rodada:
- confirmar e estabilizar os erros reportados em `HomeLandingView.vue` (import nao resolvido e CSS sem fechamento);
- preservar os refinamentos UX aplicados na homepage/canvas (composicao inicial, legibilidade e contraste).

Arquivos revisados:
- frontend/src/views/HomeLandingView.vue
- frontend/src/components/landing/canvas/SicatCanvasExperience.vue
- frontend/src/components/landing/canvas/CanvasOverlayControls.vue
- frontend/src/components/landing/canvas/sceneEngine.js

Resultado da estabilizacao:
- `HomeLandingView.vue` sem erro de import e sem erro de bloco CSS (diagnostico do editor sem falhas).
- Build de frontend validado novamente com sucesso.
- Refinamentos UX preservados:
	- cena inicial sem elemento critico oculto por painel no topo direito (ordem de render mantida com paineis contextuais antes da rota/hubs);
	- textos da timeline/boxes com wrap para evitar truncamento problemático;
	- contraste de textos mantido legivel em fundo escuro na landing e overlays.

## Handoff para proxima fase
Proximo agente: tester-qa-mtr
Escopo de QA sugerido:
- validar visual da cena inicial no desktop/tablet/mobile sem conteudo critico oculto;
- validar legibilidade dos textos de etapas no overlay timeline e no HUD;
- validar contraste de texto na hero, cards, labels, etapas, controles e overlays;
- validar que rotas / e /login continuam funcionais e sem impacto em autenticacao.

## Nova rodada - Ajuste fino da cena Abertura
Objetivo desta rodada:
- corrigir especificamente a composicao e legibilidade da cena 1 (Abertura), removendo sobreposicao do HUD sobre o trecho inicial da animacao;
- manter experiencia interativa e sem impacto em backend/rotas.

Causa observada:
- o HUD superior esquerdo da cena inicial ocupava area critica da rota/animacao de abertura, escondendo parte da movimentacao inicial;
- o bloco tinha altura fixa, o que aumentava risco de corte visual de linhas em combinacoes de largura/escala.

Decisao de layout:
- `drawHud` agora usa layout adaptativo por cena:
	- na `abertura`, HUD ancorado no canto direito e, em viewport nao compacto, deslocado para a faixa inferior para liberar o trecho inicial da animacao;
	- nas demais cenas, HUD permanece no fluxo original no canto superior esquerdo.
- dimensoes do HUD passaram a ser calculadas pelo conteudo (linhas de titulo/resumo), removendo altura fixa que causava clipping.
- contraste reforcado na `abertura` com painel mais opaco, borda mais evidente e texto com luminancia maior.
- hint inferior mantido no canto esquerdo, com `max-width` mais contido na abertura para evitar competicao visual com o HUD reposicionado.

Arquivos alterados nesta rodada:
- frontend/src/components/landing/canvas/sceneEngine.js
- frontend/src/components/landing/canvas/SicatCanvasExperience.vue

Validacao executada nesta rodada:
- comando: `npm run build` (em `frontend`);
- resultado: build concluido com sucesso;
- observacao: warning de chunk size do Vite (>500 kB), sem erro de compilacao.

Handoff:
- proximo agente sugerido: `tester-qa-mtr` para regressao visual da cena Abertura (desktop/tablet/mobile), verificando que a animacao inicial fica visivel e o HUD permanece legivel sem corte.

## Hotfix - alinhamento de texto do HUD no canvas
Objetivo deste hotfix:
- corrigir corte no inicio das linhas do HUD (texto aparentando truncado no painel) sem impactar labels de outros elementos.

Causa raiz:
- `drawTruck` define `ctx.textAlign = 'center'` para o label do caminhao;
- `drawHud` nao redefinia alinhamento antes de desenhar os `fillText` do painel;
- com heranca de estado do contexto 2D, o HUD podia desenhar texto centralizado usando ancora `contentX`, deslocando parte inicial da frase para fora do painel.

Correcao aplicada:
- em `frontend/src/components/landing/canvas/sceneEngine.js`, metodo `drawHud`, foram definidos explicitamente:
	- `ctx.textAlign = 'left'`;
	- `ctx.textBaseline = 'alphabetic'`.
- a alteracao fica encapsulada em `ctx.save()`/`ctx.restore()` do proprio `drawHud`, evitando regressao em labels de hubs e outros elementos.

Validacao:
- comando: `npm run build` (em `frontend`);
- resultado: build concluido com sucesso;
- observacao: warning de chunk size do Vite (>500 kB), sem erro de compilacao.
