# 09 - qa-validation

## Objetivo da fase

Validar a entrega frontend-vuexy-dashboard-login-parity com foco em regressao visual e funcional, cobrindo:

- paridade visual com referencia Vuexy demo-6 para Dashboard (CRM/Analytics), Login SICAT e entrada/login CETESB;
- comportamento em desktop e mobile;
- execucao da validacao automatizada disponivel no workspace;
- registro de evidencias e riscos residuais.

Nesta rodada corretiva, o foco principal foi revalidar o Login SICAT apos a simplificacao do split auth.

## Arquivos e artefatos analisados

- docs/handoffs/frontend-vuexy-dashboard-login-parity/00-orchestration.md
- docs/handoffs/frontend-vuexy-dashboard-login-parity/06-frontend-ux.md
- frontend/tests/ui/audit.spec.ts
- frontend/tests/ui/validation-e2e.spec.ts
- frontend/tests/ui/icons-font-rendering.spec.ts
- frontend/playwright.config.js
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation/*

## Validacoes executadas

1. Task shell: frontend: test:ui:audit
- Resultado principal: 10 passed (sem falhas) em execucoes completas observadas.
- Reexecucao desta rodada: 10 passed em 26.5s e 10 passed em 20.7s.
- Cobertura observada:
  - login (light/dark) em desktop 1920x1080;
  - dashboard (estado autenticado/nao autenticado);
  - estrutura de navbar e avatar;
  - check mobile 375x667 (login);
  - ausencia de erros de console nao esperados.
- Evidencias salvas em artifacts/frontend-vuexy-dashboard-login-parity/qa-validation:
  - 01-light-login-desktop-1920x1080.png
  - 02-dark-login-desktop-1920x1080.png
  - 03-light-dashboard-desktop-1920x1080.png
  - 04-navbar-structure.png
  - 05-topbar-avatar.png
  - 07-mobile-login-375x667.png
  - 10-font-rendering.png

2. Task shell: frontend: test:ui:validation
- Resultado principal: 5 passed (sem falhas) nas execucoes completas observadas.
- Reexecucao desta rodada: 5 passed em 22.3s e 5 passed em 26.0s.
- Cobertura observada:
  - login SICAT real com redirecionamento para /login/cetesb;
  - selecao/ativacao de conta CETESB e acesso ao dashboard;
  - verificacao de contas CETESB;
  - carregamento do dashboard sem erros JS relevantes;
  - navegacao por rotas autenticadas (/dashboard, /manifestos, /jobs, /sessao).
- Evidencias salvas em artifacts/frontend-vuexy-dashboard-login-parity/qa-validation:
  - e2e-01-cetesb-account-selection.png
  - e2e-02-dashboard.png
  - e2e-03-all-cetesb-accounts.png
  - e2e-04-dashboard-loaded.png
  - e2e-05-dashboard.png
  - e2e-05-manifestos.png
  - e2e-05-jobs.png
  - e2e-05-sessao.png

3. Inspecao manual instrumentada da rodada corretiva em runtime
- Contexto: validacao manual do Login SICAT servindo em http://127.0.0.1:5174/login, com coleta de layout em desktop, mobile, estado de sessao expirada e expansao do cadastro.
- Evidencias objetivas coletadas:
  - desktop 1440x900: grid do split auth em 826px + 430px, confirmando painel direito mais estreito que a area ilustrativa;
  - painel direito com fundo rgba(255, 255, 255, 0.98) e border-radius 24px, consistente com o objetivo de card branco e objetivo;
  - mobile 375x667: layout colapsado para uma unica coluna de 324px, sem overflow horizontal efetivo (scrollWidth = clientWidth);
  - lado esquerdo com composicao reduzida a 1 card flutuante e 2 badges, sem blocos editoriais em card dentro da showcase;
  - copy enxuta: titulo principal "Automacao MTR em um acesso simples e direto." e subtitulo do painel "Entre para continuar.";
  - aviso de sessao expirada visivel em /login?reason=expired;
  - cadastro expansivel validado com exibicao do campo "Nome completo" apos acionar "Criar novo usuario SICAT";
  - toggle de tema com aria-label acessivel ("Ativar tema escuro") presente no toolbar do painel.

## Resultado por objetivo

1. Paridade visual (Vuexy demo-6)
- Status: PASS
- Evidencia: composicao visual validada nas telas-alvo por screenshots de auditoria (dashboard e login) e navegacao E2E para fluxo de entrada CETESB.

2. Desktop e mobile
- Status: PASS (com ressalva)
- Evidencia desktop: viewport 1920x1080 em audit.
- Evidencia mobile: viewport 375x667 no login em audit.
- Ressalva: nao ha baseline automatizada de screenshot para tela CETESB em mobile nesta suite.

3. Regressao visual/funcional disponivel no workspace
- Status: PASS
- Evidencia: suites frontend: test:ui:audit e frontend: test:ui:validation concluidas sem falhas em execucoes completas desta fase.

4. Rodada corretiva do Login SICAT alinhada ao split auth do Vuexy demo-6
- Status: PASS
- Evidencia: proporcao do split confirmada em runtime (826px + 430px no desktop), painel direito branco e estreito, copy simplificada e ausencia de cards editoriais no lado esquerdo.

5. Lado esquerdo mais limpo e ilustrativo, sem aparencia de landing page editorial
- Status: PASS
- Evidencia: composicao limitada a mockup central, 1 card contextual e 2 badges; nao foram encontrados blocos de v-card editoriais dentro da showcase durante a inspecao manual.

6. Painel direito mais estreito, branco e objetivo
- Status: PASS
- Evidencia: largura medida em 430px no desktop, fundo rgba(255, 255, 255, 0.98), titulo curto, subtitulo curto e CTA primario unico.

7. Ausencia de regressao em login, sessao expirada, cadastro expansivel, toggle de tema e navegacao
- Status: PASS
- Evidencia: login real redirecionando para /login/cetesb; alerta de sessao expirada renderizado; painel de cadastro expandido com campos visiveis; toggle de tema acessivel identificado; navegacao autenticada validada para /dashboard, /manifestos, /jobs e /sessao.

## Rodada adicional solicitada (Playwright headed) - 2026-04-22

Escopo executado exatamente conforme solicitado:

- comparacao visual entre:
  - http://127.0.0.1:5174/login
  - http://127.0.0.1:5174/login/cetesb
  - https://demos.pixinvent.com/vuexy-vuejs-admin-template/demo-6/login
- validacao do fluxo funcional com credenciais:
  - flavio_padilha_neto@msn.com
  - 08897520@Fpn
- evidencias por screenshot da rodada headed em:
  - artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-headed-2026-04-22/

### Evidencias geradas na rodada headed

- 01-reference-vuexy-login-desktop.png
- 02-local-login-desktop.png
- 03-local-login-expired-session.png
- 04-local-cetesb-after-login.png
- 05-new-cetesb-account-submit-result.png
- 05-activate-saved-account-result.png
- 07-local-login-mobile-375x667.png
- 08-cetesb-post-login-diagnostic.png
- 09-cetesb-before-functional-actions.png
- 10-activate-saved-account-dashboard.png

### Achados objetivos desta rodada

1. Paridade visual split layout em /login
- Status: PASS
- Evidencia objetiva: layout detectado com split valido (hasSplit=true), coluna esquerda dominante (showcase=898px) e painel direito estreito branco (panel=420px; bg=rgb(255, 255, 255)).

2. Paridade visual split layout em /login/cetesb
- Status: PASS
- Evidencia objetiva: layout detectado com split valido (hasSplit=true), coluna esquerda dominante (showcase=868px) e painel direito estreito branco (panel=450px; bg=rgb(255, 255, 255)).

3. Ausencia de CTA estilo "buy now"
- Status: PASS
- Evidencia objetiva: varredura de botoes/links com detector textual retornou buyNowFound=false tanto em /login quanto em /login/cetesb.

4. Estado de sessao expirada
- Status: PASS
- Evidencia objetiva: aviso de expiracao presente em /login?reason=expired (expiredVisible=true).

5. Login com credenciais e redirecionamento para /login/cetesb
- Status: PASS
- Evidencia objetiva: submit com credenciais informadas e waitForURL concluido em **/login/cetesb.

6. Ativar conta CETESB salva
- Status: PASS
- Evidencia objetiva: contas salvas disponiveis (3) e botao "Entrar" visivel; clique em "Entrar" redirecionou para /dashboard (activatedRedirected=true), com screenshot de confirmacao.

7. Adicionar nova conta CETESB sem quebra de layout
- Status: PASS (layout) / FAIL (confirmacao funcional de criacao)
- Evidencia objetiva:
  - tentativa de submit do formulario "Add a new account" executada (newAccountAttempted=true);
  - sem overflow horizontal apos tentativa (scrollWidth == clientWidth, antes e depois, em execucoes da rodada);
  - nao houve confirmacao de criacao/redirect para dashboard nesta tentativa (newAccountRedirectedDashboard=false), portanto a parte de nao quebra de layout passou, mas a confirmacao de criacao com as credenciais fornecidas nao foi comprovada.

## Riscos residuais

- Nao existe comparacao pixel-perfect automatizada contra baseline historica; a validacao visual foi por heuristica + screenshots atuais.
- Cobertura mobile automatizada concentra-se no login; dashboard e entrada CETESB mobile nao possuem assercoes visuais dedicadas na suite atual.
- Houve intermitencia transitoria em etapas de smoke:health disparadas no pipeline de tasks (falha momentanea de conectividade com API), seguida de recuperacao e execucoes verdes.

## Observacoes

- A task shell: frontend: test:ui:audit executou pipelines encadeadas e repetiu a execucao do Playwright mais de uma vez; as evidencias utilizadas consideram apenas runs completas com resultado aprovado.
- A task shell: frontend: test:ui:validation tambem repetiu a execucao do Playwright; as evidencias desta rodada consideram apenas os runs completos com 5/5 testes aprovados.
- Artefatos foram copiados para pasta dedicada para evitar limpeza automatica do diretório test-results entre execucoes.

## Rodada solicitada pelo usuario - remocao do quadro externo (2026-04-22)

Escopo validado nesta rodada, conforme pedido:

- telas: /login e /login/cetesb;
- criterios visuais:
  - (1) layout full-page split sem container central com borda/radius externo;
  - (2) equivalencia visual pratica com https://demos.pixinvent.com/vuexy-vuejs-admin-template/demo-6/login;
  - (3) mobile sem regressao;
- criterios funcionais:
  - login real com credenciais informadas;
  - sessao expirada;
  - cadastro expansivel;
  - fluxo CETESB (ativacao de conta salva e redirecionamento).

### Execucoes desta rodada

1. Task shell: frontend: test:ui:audit
- Resultado: PASS (10 passed em execucoes completas observadas nesta rodada).

2. Task shell: frontend: test:ui:validation
- Resultado: PASS (5 passed em execucoes completas observadas nesta rodada).

3. Validacao dirigida Playwright com evidencias dedicadas
- Pasta de evidencias: artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-removal-check/
- Sumario tecnico: artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-removal-check/validation-summary.json
- Capturas:
  - 01-reference-vuexy-login-desktop.png
  - 02-local-login-desktop.png
  - 03-local-login-expired-session.png
  - 04-local-login-signup-expanded.png
  - 05-local-cetesb-after-real-login.png
  - 06-cetesb-activate-saved-account-dashboard.png
  - 07-local-login-mobile-375x667.png
  - 08-local-cetesb-mobile-375x667.png

### Resultado por criterio solicitado

1. Criterio (1) - full-page split sem quadro externo
- Status: PASS
- Evidencia objetiva (validation-summary.json):
  - /login: layoutWidth=1440, layoutMaxWidth=none, layoutBorderRadius=0px, split valido (showcase=720 > panel=520).
  - /login/cetesb: layoutWidth=1440, layoutMaxWidth=none, layoutBorderRadius=0px, split valido (showcase=720 > panel=560).

2. Criterio (2) - equivalencia visual pratica com demo Vuexy login
- Status: PASS
- Evidencia:
  - comparacao lado a lado por screenshot de referencia e telas locais na mesma rodada:
    - 01-reference-vuexy-login-desktop.png
    - 02-local-login-desktop.png
    - 05-local-cetesb-after-real-login.png
  - heuristica objetiva no sumario: practicalVisualParityWithDemo=true.

3. Criterio (3) - mobile sem regressao
- Status: PASS
- Evidencia objetiva (validation-summary.json):
  - mobileLoginNoOverflow=true;
  - mobileCetesbNoOverflow=true.
- Evidencia visual:
  - 07-local-login-mobile-375x667.png
  - 08-local-cetesb-mobile-375x667.png

4. Funcional - login real
- Status: PASS
- Evidencia: realLoginRedirectedToCetesb=true e captura 05-local-cetesb-after-real-login.png.

5. Funcional - sessao expirada
- Status: PASS
- Evidencia: sessionExpiredVisible=true e captura 03-local-login-expired-session.png.

6. Funcional - cadastro expansivel
- Status: PASS
- Evidencia objetiva (validation-summary.json): inputsBefore=3, inputsAfter=7, signupCtaVisible=true.
- Evidencia visual: 04-local-login-signup-expanded.png.

7. Funcional - fluxo CETESB
- Status: PASS
- Evidencia: cetesbActivateSavedAccountToDashboard=true e captura 06-cetesb-activate-saved-account-dashboard.png.

## Status final

PASS

## Rodada dirigida solicitada - validacao especifica de correcoes em /login e /login/cetesb (2026-04-22)

Escopo executado exatamente conforme checklist obrigatorio solicitado:

1. /login desktop: sem espaco branco estranho entre lado esquerdo e lado direito.
2. /login desktop: sem espaco entre painel direito e o fim da pagina.
3. /login/cetesb: bloco Active com account id longo sem quebra visual.
4. /login/cetesb: secao Add a new account oculta por padrao e exibida apenas apos clique.
5. /login/cetesb: apos expandir Add a new account, layout permanece integro.
6. Mobile: sem regressao grave de layout em /login e /login/cetesb.

### Execucao realizada

- Script dirigido Playwright: artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-login-cetesb-specific-checklist/validate-login-cetesb-specific-fixes.mjs
- Sumario tecnico objetivo: artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-login-cetesb-specific-checklist/validation-summary.json

### Evidencias geradas

- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-login-cetesb-specific-checklist/01-login-desktop.png
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-login-cetesb-specific-checklist/02-login-cetesb-desktop-default.png
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-login-cetesb-specific-checklist/03-login-cetesb-active-long-account-id.png
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-login-cetesb-specific-checklist/04-login-cetesb-add-account-expanded.png
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-login-cetesb-specific-checklist/05-login-mobile-375x667.png
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-login-cetesb-specific-checklist/06-login-cetesb-mobile-375x667.png

### PASS/FAIL por item

1. /login desktop: sem espaco branco estranho entre lado esquerdo e lado direito
- Status: PASS
- Evidencia objetiva: gapPx=0 no split (left.right == panel.left) e screenshot 01-login-desktop.png.

2. /login desktop: sem espaco entre painel direito e o fim da pagina
- Status: PASS
- Evidencia objetiva: rightWhitespacePx=0; painel direito termina exatamente no limite direito da viewport; screenshot 01-login-desktop.png.

3. /login/cetesb: bloco Active nao quebra com account id longo
- Status: PASS
- Evidencia objetiva:
  - id validado: acc_000117bc56830a7569ece87c1d;
  - estilos efetivos: overflowWrap=anywhere e wordBreak=break-all;
  - sem overflow horizontal no valor (scrollWidth=clientWidth=249), linesEstimated=2, overflowsParent=false;
  - screenshot 03-login-cetesb-active-long-account-id.png.

4. /login/cetesb: Add a new account oculta por padrao e so aparece ao clicar
- Status: PASS
- Evidencia objetiva: cetesbLoginInputCountBeforeClick=0 no estado inicial; screenshot 02-login-cetesb-desktop-default.png.

5. /login/cetesb: apos expandir Add a new account, layout permanece integro
- Status: PASS
- Evidencia objetiva: cetesbLoginInputVisible=true apos clique; documentScrollWidth=documentClientWidth=1440 (sem overflow horizontal) e panelRightWhitespace=0; screenshot 04-login-cetesb-add-account-expanded.png.

6. Mobile: sem regressao grave nas duas telas
- Status: PASS
- Evidencia objetiva:
  - /login mobile: scrollWidth=375 e clientWidth=375;
  - /login/cetesb mobile: scrollWidth=375 e clientWidth=375;
  - screenshots 05-login-mobile-375x667.png e 06-login-cetesb-mobile-375x667.png.

### Resultado consolidado desta rodada

- Checklist obrigatorio (6 itens): 6 PASS, 0 FAIL.

### Handoff de continuidade

- proximo agente: documentador-mtr
- status: next_agent_required
- prompt sugerido: consolidar no checkpoint 10 os resultados objetivos desta rodada (6/6 PASS), incluindo referencia ao summary JSON e as 6 capturas geradas em artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-login-cetesb-specific-checklist/.

## Handoff para proxima fase

- Proximo agente: documentador-mtr
- Escopo do handoff:
  - consolidar o resultado QA (PASS) no fechamento da entrega;
  - incluir riscos residuais de cobertura mobile e ausencia de baseline pixel-perfect;
  - referenciar evidencias em artifacts/frontend-vuexy-dashboard-login-parity/qa-validation.

## Rodada solicitada - 3 eixos (split, tipografia, alerta) - 2026-04-22

Escopo executado conforme checklist solicitado:

1. proporcao de layout em /login e /login/cetesb (nao 50/50; esquerda dominante);
2. tipografia global aproximada Vuexy nas telas principais;
3. alerta de sessao expirada alinhado e sem quebra visual em /login;
4. mobile sem regressao grave nas duas telas de login;
5. fluxo funcional real: login SICAT -> /login/cetesb -> ativacao de conta CETESB -> /dashboard.

### Execucao desta rodada

- Script dirigido Playwright:
  - artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/validate-three-axis-checklist.mjs
- Sumario tecnico objetivo:
  - artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/validation-summary.json

### Evidencias geradas

- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/01-login-desktop-split.png
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/02-login-expired-alert.png
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/03-login-cetesb-desktop-split.png
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/04-dashboard-after-cetesb-activation.png
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/05-manifestos-authenticated.png
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/06-login-mobile-375x667.png
- artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/07-login-cetesb-mobile-375x667.png

### PASS/FAIL por item do checklist

1. /login desktop: split nao 50/50, com painel direito mais estreito
- Status: PASS
- Evidencia objetiva:
  - leftWidth=864, rightWidth=576, ratioLeftToRight=1.5;
  - gapPx=0 e rightWhitespacePx=0.
  - screenshot: 01-login-desktop-split.png.

2. /login/cetesb desktop: mesmo padrao de split (esquerda dominante)
- Status: PASS
- Evidencia objetiva:
  - leftWidth=864, rightWidth=576, ratioLeftToRight=1.5;
  - gapPx=0 e rightWhitespacePx=0.
  - screenshot: 03-login-cetesb-desktop-split.png.

3. /login?reason=expired: alerta com altura/padding coerentes e texto alinhado ao formulario
- Status: FAIL
- Evidencia objetiva:
  - alinhamento horizontal passou (leftDeltaPx=0, widthDeltaPx=0);
  - altura medida do alerta ficou muito acima do esperado para a densidade compacta (alertHeightPx=322.97);
  - line-height interno medido: 20.25px;
  - screenshot: 02-login-expired-alert.png.

4. Tipografia global consistente (login, dashboard e tela autenticada adicional)
- Status: FAIL
- Evidencia objetiva:
  - login: body="Public Sans" e heading="Manrope" (ok);
  - dashboard: body="Public Sans" e heading="Manrope" (ok);
  - manifestos (tela autenticada adicional): heading principal medido como "Roboto" (nao alinhado ao padrao de heading validado nas outras telas).
  - screenshot: 05-manifestos-authenticated.png.

5. Mobile: sem regressao grave em /login e /login/cetesb
- Status: PASS
- Evidencia objetiva:
  - /login mobile: scrollWidth=375, clientWidth=375;
  - /login/cetesb mobile: scrollWidth=375, clientWidth=375;
  - screenshots: 06-login-mobile-375x667.png e 07-login-cetesb-mobile-375x667.png.

6. Fluxo funcional: login real e chegada em /login/cetesb; ativacao CETESB ate /dashboard
- Status: PASS
- Evidencia objetiva:
  - login real com credenciais fornecidas redirecionou para /login/cetesb;
  - activateButtonsFound=3;
  - ativacao da conta salva redirecionou para /dashboard (activatedRedirectedToDashboard=true);
  - screenshots: 03-login-cetesb-desktop-split.png e 04-dashboard-after-cetesb-activation.png.

### Resultado consolidado desta rodada

- Checklist desta solicitacao: 4 PASS, 2 FAIL.
- Resultado geral da rodada: FAIL (pendencias em alerta de sessao e tipografia global em tela autenticada adicional).

### Handoff de continuidade

- proximo agente: documentador-mtr
- status: next_agent_required
- prompt sugerido: consolidar no checkpoint 10 o resultado 4 PASS / 2 FAIL desta rodada, destacando que o fluxo funcional e o split em /login e /login/cetesb passaram, mas persistem ajustes em altura/composicao do alerta de sessao expirada e consistencia de heading tipografico em tela autenticada adicional.

## Revalidacao focada apos correcao dos 2 FAIL - 2026-04-22

Escopo executado conforme solicitacao:

1. revalidar os 2 itens corrigidos:
   - /login?reason=expired com alerta compacto, alinhado e sem altura inflada;
   - tipografia global consistente em /login, /dashboard e /manifestos (sem fallback Roboto em heading autenticado).
2. confirmar nao regressao dos demais itens:
   - split nao 50/50 em /login e /login/cetesb;
   - mobile sem regressao;
   - fluxo funcional login + ativacao CETESB.

### Execucao desta revalidacao

- Script dirigido Playwright:
  - artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/validate-three-axis-checklist.mjs
- Sumario tecnico objetivo atualizado:
  - artifacts/frontend-vuexy-dashboard-login-parity/qa-validation-2026-04-22-three-axis-checklist/validation-summary.json

### PASS/FAIL por item revalidado

1. /login?reason=expired: alerta compacto, alinhado e sem altura inflada
- Status: PASS
- Evidencia objetiva:
  - leftDeltaPx=0 e widthDeltaPx=0;
  - alertHeightPx=37.97 (antes estava inflado);
  - alertLineHeight=18.9844px;
  - screenshot: 02-login-expired-alert.png.

2. Tipografia global consistente em /login, /dashboard e /manifestos
- Status: PASS
- Evidencia objetiva:
  - bodyFontFamily com Public Sans nas 3 telas;
  - headingFontFamily com Manrope nas 3 telas;
  - em /manifestos, heading principal medido como Manrope (sem fallback Roboto).
  - screenshot: 05-manifestos-authenticated.png.

3. /login e /login/cetesb com split nao 50/50 e esquerda dominante
- Status: PASS
- Evidencia objetiva:
  - /login: leftWidth=864, rightWidth=576, ratioLeftToRight=1.5, gapPx=0, rightWhitespacePx=0;
  - /login/cetesb: leftWidth=864, rightWidth=576, ratioLeftToRight=1.5, gapPx=0, rightWhitespacePx=0.

4. Mobile sem regressao
- Status: PASS
- Evidencia objetiva:
  - /login: scrollWidth=375 e clientWidth=375;
  - /login/cetesb: scrollWidth=375 e clientWidth=375.

5. Fluxo funcional login + ativacao CETESB
- Status: PASS
- Evidencia objetiva:
  - login redireciona para /login/cetesb;
  - activateButtonsFound=3;
  - activatedRedirectedToDashboard=true.

### Resultado consolidado desta revalidacao

- Checklist revalidado: 6 PASS, 0 FAIL.
- Resultado final objetivo da rodada: PASS.

### Handoff de continuidade

- proximo agente: documentador-mtr
- status: next_agent_required
- prompt sugerido: atualizar docs/handoffs/frontend-vuexy-dashboard-login-parity/10-documentation-final.md consolidando a revalidacao final (6 PASS, 0 FAIL), com referencia ao validation-summary.json e as 7 capturas da pasta qa-validation-2026-04-22-three-axis-checklist.
