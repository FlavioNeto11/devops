# 06-frontend-ux

## Objetivo da fase
Aplicar fix pos-QA para eliminar a colisao de hitbox entre botao Home e botao de menu na app bar autenticada em mobile (390x844), mantendo o atalho global funcional e discreto.

## Arquivos analisados
- `frontend/src/App.vue`
- `frontend/tests/ui/audit.spec.ts`
- `docs/handoffs/global-home-back-button/09-qa-validation.md`

## Arquivos alterados
- `frontend/src/App.vue`
- `docs/handoffs/global-home-back-button/06-frontend-ux.md`

## Causa raiz da colisao mobile
1. Na shell autenticada mobile, botao de menu e botao Home eram renderizados em blocos irmaos sem um agrupamento dedicado para a regiao de acoes compactas.
2. Sem restricao explicita de largura/flex para os dois gatilhos iconicos, a composicao resultava em intersecao horizontal de hitbox no viewport 390x844 (achado da fase 09).

## Fix aplicado na app bar autenticada
1. Criado container dedicado para acoes mobile (`.navbar-mobile-leading`) com ordem clara: menu -> Home.
2. Home da shell autenticada passou a ter visibilidade condicional por breakpoint:
- mobile/tablet (`!isDesktop`): renderizado ao lado do menu dentro do novo container mobile;
- desktop (`isDesktop`): mantido em `.navbar-extra`.
3. Definidas dimensoes e comportamento flex explicitos para evitar sobreposicao:
- `.mobile-nav-trigger` e `.nav-home-action-mobile` com largura fixa (44px), `min-width`, `flex-basis` e `margin: 0`.
4. Acessibilidade e UX preservadas:
- `aria-label` mantido;
- tooltip "Ir para a home publica" mantido;
- foco visual permanece via regras de `:focus-visible` ja existentes;
- estilos continuam compativeis com light/dark.
5. Fluxo funcional preservado:
- botao global nao foi removido;
- clique continua navegando para `/?public=1`;
- telas sem shell/full-bleed permanecem com atalho inline sem alteracao de comportamento.

## Validacao executada
1. Build obrigatorio:
- Comando: `npm run build` (cwd `frontend/`)
- Resultado: sucesso.
- Observacao: warning de chunk size do Vite permaneceu (nao bloqueante).

2. Checagem especifica de overlap no viewport 390x844 (shell autenticada):
- Metodo: medicao de `getBoundingClientRect()` dos seletores `.mobile-nav-trigger` e `.nav-home-action-mobile` via Playwright.
- Resultado coletado:
	- menu: x=130.50, y=12.00, w=44, h=48
	- home: x=184.50, y=12.00, w=44, h=48
	- overlapX=0
	- overlapArea=0
- Conclusao: sem intersecao de bounding boxes no breakpoint alvo.

## Riscos residuais
1. Em larguras extremas com localizacao de strings muito longas na app bar, pode ser necessario revisar densidade do bloco de usuario para manter respiracao horizontal.

## Handoff para QA (`tester-qa-mtr`)
Validar regressao de navegacao e UX responsiva com foco em:
1. No mobile 390x844, confirmar distancia tactil entre menu e Home sem overlap visual ou de hitbox.
2. Home visivel e clicavel na app bar autenticada e em telas sem shell/full-bleed, ausente na home publica.
3. Tooltip, foco por teclado e contraste corretos em light/dark.
4. Confirmar que fluxos de autenticacao/redirect continuam inalterados.

## Rodada atual - ajuste especifico do login

### Objetivo da rodada
Reposicionar o botao Home da rota `/login` para dentro de uma regiao estrutural nativa do layout de autenticacao, removendo o aspecto de elemento solto acima da composicao.

### Arquivos analisados nesta rodada
- `frontend/src/App.vue`
- `frontend/src/views/LoginView.vue`
- `docs/handoffs/global-home-back-button/06-frontend-ux.md`

### Arquivos alterados nesta rodada
- `frontend/src/App.vue`
- `frontend/src/views/LoginView.vue`
- `docs/handoffs/global-home-back-button/06-frontend-ux.md`

### Causa observada
1. A rota de login usa `hideShell`, mas nao `fullBleed`, portanto recebia o atalho Home pelo wrapper generico de telas sem shell.
2. Esse header externo ficava acima do layout do login e competia visualmente com a composicao em duas colunas, parecendo um elemento deslocado da hierarquia da tela.

### Decisao de posicionamento
1. O header externo do wrapper foi mantido para outras telas sem shell, mas desativado especificamente na rota `Login`.
2. O botao Home do login foi movido para o `toolbar` nativo do `auth-panel`, ao lado do controle de tema.
3. Essa posicao preserva intencionalidade visual, reduz ruido no topo da pagina e continua clara para navegacao secundaria sem competir com o branding da coluna esquerda.

### Comportamento preservado
1. Clique continua navegando para `/?public=1`.
2. Tooltip "Ir para a home publica" e `aria-label` "Voltar para a home publica" permanecem ativos.
3. Navegacao por teclado e foco do `v-btn` continuam suportados pelo proprio componente Vuetify.
4. Light/dark e responsividade permanecem inalterados, com o botao integrado ao toolbar do painel em todos os breakpoints do login.

### Validacao executada nesta rodada
1. Build obrigatorio:
- Comando: `npm run build` (cwd `frontend/`)
- Resultado: sucesso.
- Observacao: Vite manteve warning nao bloqueante de chunk acima de 500 kB apos minificacao.

### Handoff para QA (`tester-qa-mtr`) desta rodada
Validar especificamente no login:
1. Ausencia do header solto acima do conteudo na rota `/login`.
2. Presenca do botao Home no toolbar do painel de autenticacao, ao lado do controle de tema.
3. Navegacao para `/?public=1`, tooltip, `aria-label`, foco por teclado e contraste em light/dark.
4. Sem regressao nas demais telas sem shell que ainda dependem do atalho global inline.

## Rodada atual - ajuste especifico do /login/cetesb

### Objetivo da rodada
Remover o atalho Home do wrapper inline generico na rota `/login/cetesb` e integrá-lo a uma regiao estrutural nativa da tela de selecao de conta CETESB, alinhando o comportamento visual ao fix ja aplicado em `/login`.

### Arquivos analisados nesta rodada
- `frontend/src/App.vue`
- `frontend/src/views/CetesbAccountSelectionView.vue`
- `frontend/src/router.js`
- `docs/handoffs/global-home-back-button/06-frontend-ux.md`

### Arquivos alterados nesta rodada
- `frontend/src/App.vue`
- `frontend/src/views/CetesbAccountSelectionView.vue`
- `docs/handoffs/global-home-back-button/06-frontend-ux.md`

### Causa observada
1. A rota `/login/cetesb` usa `hideShell`, mas nao tinha exclusao especifica no wrapper generico de telas sem shell.
2. Com isso, o botao Home era renderizado como header inline externo acima da composicao principal da tela, destoando do layout nativo da view.

### Decisao de posicionamento
1. O wrapper generico passou a excluir explicitamente a rota `LoginCetesb`, preservando o comportamento nas demais telas sem shell.
2. O botao Home foi integrado ao toolbar nativo do painel da `CetesbAccountSelectionView`, ao lado do controle de tema.
3. O CTA de logout permaneceu no cabecalho principal da tela, evitando competicao visual entre a navegacao secundaria e a acao operacional da etapa.

### Comportamento preservado
1. Clique continua navegando para `/?public=1`.
2. Tooltip "Ir para a home publica" e `aria-label` "Voltar para a home publica" permanecem ativos.
3. Navegacao por teclado e foco do `v-btn` seguem suportados pelo componente nativo do Vuetify.
4. Light/dark e responsividade permanecem consistentes, com o Home agora ancorado numa regiao estrutural da tela em vez de um header externo.
5. Demais telas sem shell continuam elegiveis ao atalho inline quando nao houver exclusao especifica.

### Validacao executada nesta rodada
1. Build obrigatorio:
- Comando: `npm run build` (cwd `frontend/`)
- Resultado: sucesso.
- Observacao: Vite manteve warning nao bloqueante de chunk acima de 500 kB apos minificacao.

### Handoff para QA (`tester-qa-mtr`) desta rodada
Validar especificamente em `/login/cetesb`:
1. Ausencia do header inline externo acima da tela.
2. Presenca do botao Home no toolbar nativo do painel, ao lado do controle de tema.
3. Navegacao para `/?public=1`, tooltip, `aria-label`, foco por teclado e contraste em light/dark.
4. Sem regressao nas demais telas sem shell que ainda dependem do atalho global inline.
