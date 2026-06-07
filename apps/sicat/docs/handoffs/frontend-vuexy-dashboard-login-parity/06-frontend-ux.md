# 06 - frontend-ux

## Objetivo da fase

Refatorar visual do frontend SICAT para ficar fortemente alinhado ao estilo Vuexy demo-6 (Dashboard CRM/Analytics + Login), preservando lógica funcional existente (auth, stores, serviços, navegação) e responsividade mobile.

## Causa e estratégia visual

- Causa: dashboard e telas de autenticação estavam funcionais, porém com hierarquia visual e composição abaixo da referência demo-6 para leitura executiva rápida.
- Estratégia: aplicar linguagem de produto com cards analíticos, hero contextual, KPIs com progress, blocos de tendência e painel split de autenticação (área ilustrativa + card/form) mantendo o mesmo fluxo funcional.
- Direcionadores:
  - reforço de hierarquia tipográfica e densidade de informação no topo;
  - cards com superfícies elevadas e contraste controlado em light/dark;
  - mini-gráficos e indicadores de progresso para leitura rápida (estilo CRM/Analytics);
  - responsividade preservada com colapsos para 1 coluna em breakpoints menores.

## Arquivos alterados

- frontend/src/views/DashboardView.vue
- frontend/src/views/LoginView.vue
- frontend/src/views/CetesbAccountSelectionView.vue
- frontend/src/App.vue

## Implementação aplicada

- Dashboard:
  - hero analítico com estado de saúde, janela ativa, atualização e progresso de conclusão;
  - KPI tiles no topo com valor, helper e barra de progresso;
  - bloco de capacidade operacional com mini-gráficos de sucesso/latência;
  - bloco de composição de manifestos com anel de conclusão e barras por status;
  - manutenção de tabelas e dados existentes (integração, top operações, últimos manifestos).
- Login SICAT:
  - split visual reforçado com painel ilustrativo e elementos decorativos inspirados no demo-6;
  - card de autenticação com hierarquia e estados consistentes;
  - preservados login/cadastro e alternância de tema.
- Login/entrada CETESB:
  - mesma linguagem split para consistência de fluxo;
  - reforço visual da etapa operacional e do bloco de credenciais;
  - preservadas ações de conta (ativar, remover, adicionar).
- Shell global:
  - refinamento de background e contexto visual para convergir com a linguagem do restante da experiência.

## Rodada corretiva - alinhamento do login ao demo-6

### Objetivo desta rodada

- aproximar explicitamente a tela de login SICAT do split auth do Vuexy demo-6, reduzindo a leitura de landing page e simplificando o lado esquerdo.

### Arquivo alterado nesta rodada

- frontend/src/views/LoginView.vue

### Simplificações aplicadas

- remoção dos cards editoriais e do bloco textual mais longo no lado esquerdo;
- substituição por uma área ilustrativa clara, com composição própria em CSS, foco em mockup central e poucos elementos flutuantes;
- manutenção de logo simples no topo esquerdo da área ilustrativa;
- estreitamento e limpeza do painel direito, com título curto, subtítulo curto e formulário com menos ruído visual;
- preservação do fluxo existente de login, sessão expirada, cadastro expansível, toggle de tema e navegação.

### Decisão visual desta rodada

- a equivalência com o demo foi buscada por proporção, respiro, hierarquia e composição de autenticação, sem reutilizar assets proprietários da Vuexy.

## Decisões de compromisso

- Não foram usados assets proprietários/idênticos da Vuexy demo; foi aplicada paridade visual por composição, hierarquia e estilo usando componentes Vuetify já existentes.
- Mantida integralmente a lógica de negócio/estado; escopo desta fase foi estritamente UX/UI.

## Validações executadas

- get_errors em frontend/src/views/LoginView.vue: sem erros após a rodada corretiva.
- Task shell: frontend: test:ui:validation: execução concluída com validações e testes reportados como sucesso nas etapas exibidas.
- Task shell: frontend: test:ui:audit: execução concluída com sucesso (10 passed, sem falhas).

## Handoff para próxima fase

- Próximo agente: tester-qa-mtr
- Escopo sugerido para QA:
  - validar paridade visual em desktop/mobile para dashboard, login SICAT e login CETESB;
  - executar suite UI audit até conclusão e registrar evidências de regressão/não regressão;
  - validar acessibilidade básica (foco visível, contraste e navegação por teclado nas telas alteradas).

Status: frontend_ux_completed

## Rodada de alta paridade (reabertura critica)

### Objetivo desta rodada

- atingir alta paridade visual com o login Vuexy demo-6 em SICAT login e CETESB login, removendo a leitura de landing page editorial e mantendo a logica funcional existente.

### Arquivos alterados nesta rodada

- frontend/src/views/LoginView.vue
- frontend/src/views/CetesbAccountSelectionView.vue

### Ajustes de paridade aplicados

- arquitetura split harmonizada em ambas as telas:
  - coluna esquerda dominante com fundo claro e composicao ilustrativa central;
  - coluna direita mais estreita com formulario/painel centralizado e hierarquia curta.
- linguagem visual alinhada entre /login e /login/cetesb:
  - marca simples no topo esquerdo;
  - ilustracao proprietaria-free com mockup central e apenas 1-2 chips flutuantes;
  - painel direito limpo, sem blocos visuais extras de marketing.
- no login SICAT:
  - formulario com densidade de spacing proxima do demo;
  - linha de opcoes adicionada (Remember me / Forgot password);
  - cadastro e sessao expirada preservados.
- no login CETESB:
  - mesma arquitetura split e escala visual do login SICAT;
  - bloco direito compacto com selecao de conta salva + cadastro de conta nova;
  - tema, logout, ativacao/remocao e fluxo de entrada preservados.

### O que foi removido para aproximar 1:1 do demo

- removidos textos longos e narrativa de hero/marketing no lado esquerdo das duas telas.
- removidos cards grandes e composicoes de landing (insights extensos, blocos editoriais e elementos decorativos em excesso).
- removida hierarquia de titulos grandes e copy longa fora do formulario.
- removido ruido visual no painel direito (chips e blocos de apoio nao essenciais), mantendo foco no formulario e acoes centrais.

### Validacoes desta rodada

- get_errors em frontend/src/views/LoginView.vue: sem erros.
- get_errors em frontend/src/views/CetesbAccountSelectionView.vue: sem erros.

### Proximo agente

- tester-qa-mtr
- escopo: validar paridade visual desktop/mobile em /login e /login/cetesb contra demo-6 e confirmar nao regressao funcional (sessao expirada, login, cadastro SICAT, conta CETESB nova/salva).

## Rodada corretiva obrigatoria - sem quadro externo e split full-page

### Objetivo desta rodada

- remover completamente o efeito de quadro/card central externo das telas /login e /login/cetesb;
- manter as duas telas em layout full-page split, com metade esquerda ilustrativa e metade direita com formulario/painel, no padrao visual do demo-6.

### Arquivos alterados nesta rodada

- frontend/src/views/LoginView.vue
- frontend/src/views/CetesbAccountSelectionView.vue

### Ajustes aplicados

- /login:
  - wrapper principal alterado para ocupar 100% da viewport sem max-width central;
  - grid ajustado para split 50/50 no desktop;
  - removidas props visuais de container externo no painel direito (rounded/border no v-sheet);
  - removidos border/radius/overflow do layout externo que criavam o quadro central;
  - preservados login, sessao expirada, cadastro, toggle de tema e navegacao.
- /login/cetesb:
  - mesma mudanca estrutural para full-page split sem quadro externo;
  - removidas props de card externo no painel direito (rounded/border no v-sheet);
  - removidos border/radius/overflow do layout externo;
  - preservadas rotinas de carregar contas, ativar/remover/adicionar conta, tema, logout e navegacao.
- responsividade:
  - mantido colapso para 1 coluna em breakpoints menores;
  - espaçamentos mobile preservados para leitura e toque.

### Validacoes desta rodada

- get_errors em frontend/src/views/LoginView.vue: sem erros.
- get_errors em frontend/src/views/CetesbAccountSelectionView.vue: sem erros.

### Handoff

- proximo agente: tester-qa-mtr
- status: next_agent_required
- prompt sugerido: validar visualmente /login e /login/cetesb em desktop/mobile confirmando ausencia de quadro externo, split full-page em ambas as rotas, e nao regressao funcional de autenticacao e selecao de conta CETESB.

## Rodada corretiva especifica - gaps no split e CETESB add account colapsavel

### Objetivo desta rodada

- corrigir gaps visuais no split full-page de /login (espaco entre colunas e faixa branca indevida no extremo direito);
- garantir preenchimento completo da viewport pelas duas metades no desktop;
- corrigir exibicao de identificador longo no bloco Active em /login/cetesb;
- transformar a secao Add a new account em bloco colapsavel por botao (default fechado), preservando fluxo funcional.

### Arquivos alterados nesta rodada

- frontend/src/views/LoginView.vue
- frontend/src/views/CetesbAccountSelectionView.vue

### Ajustes aplicados

- /login:
  - painel direito passou a ocupar toda a coluna do grid (sem estreitar a propria metade);
  - conteudo interno do painel segue centralizado com largura maxima controlada;
  - eliminado efeito visual de gap entre esquerda/direita e faixa branca no lado direito.
- /login/cetesb:
  - painel direito recebeu o mesmo ajuste estrutural de coluna cheia + conteudo interno centralizado;
  - bloco Active agora quebra IDs longos com `overflow-wrap:anywhere` e `word-break:break-all`;
  - secao Add a new account virou colapsavel com botao e estado inicial fechado, usando `v-expand-transition`.

### Validacoes desta rodada

- get_errors em frontend/src/views/LoginView.vue: sem erros.
- get_errors em frontend/src/views/CetesbAccountSelectionView.vue: sem erros.

### Handoff desta rodada

- proximo agente: tester-qa-mtr
- status: next_agent_required
- prompt sugerido: validar em desktop/mobile as rotas /login e /login/cetesb com foco em ausencia de gaps no split, quebra correta de Active ID longo e comportamento colapsavel de Add a new account (default fechado + fluxo funcional preservado).

## Rodada corretiva obrigatoria - proporcao demo, tipografia global e alerta de sessao

### Objetivo desta rodada

- ajustar o split de /login e /login/cetesb para proporcao equivalente ao demo-6 (lado esquerdo dominante e painel direito menor);
- aplicar tipografia global alinhada ao Vuexy demo-6 em toda a aplicacao (familia, escala e hierarquia);
- corrigir o alinhamento e a densidade do alerta "Sua sessao expirou..." em /login.

### Arquivos alterados nesta rodada

- frontend/src/views/LoginView.vue
- frontend/src/views/CetesbAccountSelectionView.vue
- frontend/src/styles/base.css

### Ajustes aplicados

- /login e /login/cetesb:
  - grid desktop alterado de 50/50 para proporcao com esquerda dominante (`1.2fr`) e direita menor (`0.8fr`), mantendo full-height;
  - painel direito mantido em coluna cheia, com conteudo interno mais estreito e alinhado ao centro (largura efetiva reduzida para aproximar o demo);
  - responsividade mobile preservada com colapso para 1 coluna nos breakpoints existentes.
- Tipografia global do SICAT:
  - ajuste de base global para escala mais proxima do Vuexy demo-6 (html/body, headings e classes tipograficas do Vuetify);
  - headings migrados para hierarquia com `Manrope` (display) e corpo em `Public Sans`;
  - refinada hierarquia de `h1..h6`, `text-body-1`, `text-body-2`, `text-caption`, labels e botoes.
- Alerta de sessao expirada em /login:
  - adicionada classe dedicada para controle de margem e line-height do conteudo;
  - reduzida sensacao de altura excessiva e corrigido alinhamento dentro do mesmo grid do formulario.

### Validacoes desta rodada

- get_errors em frontend/src/views/LoginView.vue: sem erros.
- get_errors em frontend/src/views/CetesbAccountSelectionView.vue: sem erros.
- get_errors em frontend/src/styles/base.css: sem erros.

### Handoff desta rodada

- proximo agente: tester-qa-mtr
- status: next_agent_required
- prompt sugerido: validar paridade visual do split (esquerda dominante e painel direito estreito) em /login e /login/cetesb, conferir impacto de tipografia global nas principais telas e confirmar alinhamento/densidade do alerta de sessao expirada em /login, sem regressao funcional de auth e CETESB.

## Rodada corretiva especifica - 2 FAIL do QA (2026-04-22)

### Objetivo desta rodada

- corrigir o FAIL de compactacao/alinhamento do alerta em /login?reason=expired;
- corrigir o FAIL de tipografia global em rota autenticada (/manifestos) para eliminar fallback Roboto em headings utilitarios do Vuetify;
- manter split de login aprovado, fluxo auth/CETESB e estabilidade mobile.

### Fontes dos achados

- docs/handoffs/frontend-vuexy-dashboard-login-parity/09-qa-validation.md
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/validation-summary.json

### Arquivos alterados nesta rodada

- frontend/src/views/LoginView.vue
- frontend/src/styles/base.css
- frontend/src/plugins/vuetify.js
- frontend/src/main.js

### Ajustes aplicados

- Alerta de sessao expirada em /login:
  - reforco de compactacao no bloco `.auth-session-alert` com `min-height` e `padding` controlados;
  - ajuste do conteudo interno do alerta (`.v-alert__content`) para evitar inflacao vertical e manter leitura em uma faixa compacta;
  - alinhamento vertical dos elementos de prepend/append para evitar esticamento visual.
- Tipografia global da aplicacao (escopo total, incluindo views autenticadas):
  - aplicacao de `--v-font-family` global em `.v-application` para impedir fallback Roboto nas classes tipograficas do Vuetify;
  - override global de classes `.text-h1..text-h6` e `.v-card-title` para `var(--font-family-display)`;
  - override global de classes de corpo/subtitulos (`.text-body-*`, `.text-subtitle-*`, `.text-caption`, `.text-overline`) para `var(--font-family-base)`;
  - ajuste da ordem de import no bootstrap (`main.js`) para carregar estilos do Vuetify antes de `base.css`, garantindo precedencia dos overrides globais do SICAT.
- Configuracao de tema/defaults do Vuetify:
  - `defaults.global.style` atualizado com `--v-font-family: var(--font-family-base)` e `font-family` global consistente.

### Validacoes desta rodada

- get_errors em frontend/src/views/LoginView.vue: sem erros.
- get_errors em frontend/src/styles/base.css: sem erros.
- get_errors em frontend/src/plugins/vuetify.js: sem erros.
- get_errors em frontend/src/main.js: sem erros.
- execução de artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/validate-three-axis-checklist.mjs: PASS (`overall.pass=true`), com os itens `item3_loginExpiredAlertAlignedNoBreak=true` e `item4_globalTypographyConsistentLoginDashboardManifestos=true`.

### Handoff desta rodada

- proximo agente: tester-qa-mtr
- status: next_agent_required
- prompt sugerido: reexecutar a checklist QA de tres eixos focando em (1) altura/alinhamento do alerta em /login?reason=expired com faixa compacta no grid do formulario e (2) consistencia tipografica global em /login, /dashboard e /manifestos, confirmando heading/body sem fallback Roboto em views autenticadas.
