# 06 - Frontend UX - global-theme-green-light-dark

## Objetivo
Aplicar assinatura de cor esverdeada de forma global no frontend SICAT (substituindo predominancia roxa), preservando suporte completo a modo light e modo dark, incluindo homepage.

## Correcao pos-QA (fase 09)
Bloqueador corrigido: homepage nao mantinha coerencia dark ao navegar de /login para /, mesmo com tema ja ativo em dark.

## Arquivos alterados
- frontend/src/plugins/vuetify.js
- frontend/src/styles/tokens.css
- frontend/src/styles/base.css
- frontend/src/views/HomeLandingView.vue
- frontend/src/main.js
- frontend/src/App.vue
- frontend/src/views/LoginView.vue
- frontend/src/views/CetesbAccountSelectionView.vue
- frontend/src/composables/useAppTheme.js

## Decisao de paleta (light/dark)
1. Camada global de tema (Vuetify + tokens CSS) tornou-se a fonte principal da assinatura verde.
2. Paleta light prioriza superficies claras com verde principal de media saturacao:
   - primary: #0F9D72
   - secondary: #2D7A66
   - background: #F2F8F4
   - surface-light: #EDF7F0
3. Paleta dark preserva contraste alto com base verde profunda e acentos mais luminosos:
   - primary: #34C993
   - secondary: #54A78A
   - background: #0F1D18
   - surface-light: #244137
4. Estados semanticos foram centralizados em tokens para light/dark:
   - neutral, running, success, error, warning
5. Homepage foi ajustada para consumir variaveis por tema (light/dark), evitando visual fixo escuro.

## Implementacao realizada
1. Atualizacao do provider global Vuetify para tons verdes em temas light/dark.
2. Refatoracao de tokens globais de cor, gradientes, sombra e estados em frontend/src/styles/tokens.css.
3. Troca de cores hardcoded em frontend/src/styles/base.css por tokens/derivacoes de tokens:
   - chips de API
   - status badges
   - botao de troca de conta CETESB
   - estados hover/active de itens de manifesto
4. Homepage (HomeLandingView) passou a usar variaveis locais com override por :root[data-theme='dark'], garantindo paridade visual entre modos.

## Causa raiz (pos-QA)
1. A aplicacao tinha logica de tema distribuida em mais de um ponto (App + telas de autenticacao), sem uma unica funcao de aplicacao/persistencia.
2. Nas telas de autenticacao, o toggle alterava tema Vuetify, mas dependia de efeito indireto do App para persistir em localStorage/data-theme.
3. Na homepage, o override dark dependia apenas de seletor global em CSS scoped; com isso, o estado global podia estar em dark e a home ainda manter variaveis visuais de light.

## Fix aplicado (pos-QA)
1. Fonte unica de verdade para tema criada em frontend/src/composables/useAppTheme.js:
   - normalizacao light/dark;
   - mapeamento para nomes Vuetify (vuexy/vuexyDark);
   - persistencia em localStorage;
   - sincronizacao de documentElement.dataset.theme;
   - funcoes de apply/toggle/init unificadas.
2. Bootstrap inicial corrigido para aplicar tema antes do mount:
   - frontend/src/main.js chama bootstrapDocumentTheme().
   - frontend/src/plugins/vuetify.js usa defaultTheme derivado do tema persistido.
3. Sincronizacao entre areas autenticada/publica padronizada:
   - frontend/src/App.vue usa helper central para aplicar e sincronizar side effects.
   - frontend/src/views/LoginView.vue e frontend/src/views/CetesbAccountSelectionView.vue usam toggleAppTheme() (sem fallback paralelo).
4. Homepage passou a consumir estado global real de tema via Vuetify:
   - frontend/src/views/HomeLandingView.vue agora usa useTheme() e classe reativa home-root--dark baseada em theme.global.current.value.dark.
   - Mantida paleta esverdeada e contraste em ambos os modos.

## Validacao build
- Comando executado: npm run build (diretorio frontend)
- Resultado: sucesso (vite build concluido sem erros)
- Observacao: aviso nao bloqueante de chunks grandes apos minificacao.

## Validacao manual obrigatoria (pos-QA)
1. Fluxo executado: /login com tema dark ativo -> navegacao para /.
2. Resultado observado:
   - data-theme permaneceu dark;
   - localStorage (sicat.ui.theme) permaneceu dark;
   - homepage manteve paleta dark (ex.: rootBg rgb(3, 19, 26), navBg rgba(2, 17, 32, 0.74)).
3. Conclusao: comportamento corrigido para persistencia/propagacao entre area publica e autenticada.

## Riscos e pendencias
1. Nao houve auditoria visual manual completa em todas as rotas autenticadas nesta fase; QA visual ainda necessario.
2. Componentes com estilos muito especificos e isolados podem exigir ajuste fino de contraste apos validacao do tester.

## Handoff para tester-qa-mtr
Objetivo da proxima fase (09-qa-validation):
1. Validar cobertura visual em light/dark nas rotas principais (dashboard, manifestos, detalhe, jobs, sessao, admin quando aplicavel).
2. Verificar contraste e estados interativos (cards, botoes, links, chips, inputs, tabelas, hover/focus/active/disabled).
3. Confirmar ausencia de regressao visual na homepage canvas e na experiencia autenticada.
4. Revalidar especificamente o fluxo bloqueador: login dark -> / mantendo dark na home.
5. Registrar evidencias e eventuais ajustes recomendados no checkpoint 09-qa-validation.
