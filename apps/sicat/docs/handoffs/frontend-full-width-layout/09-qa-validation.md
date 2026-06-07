# QA Validation

## Objetivo da fase

Validar em runtime que o layout global full width foi corrigido no frontend, confirmando uso da largura útil da viewport nas telas Manifestos e Relatório MTR, sem regressão em header, footer e drawer mobile.

## Checkpoints lidos

- `docs/handoffs/frontend-full-width-layout/00-orchestration.md`
- `docs/handoffs/frontend-full-width-layout/06-frontend-ux.md`

## Escopo validado

- Manifestos em desktop largo
- Relatório MTR em desktop largo
- Manifestos em mobile
- Relatório MTR em mobile
- shell autenticado com header e footer
- drawer mobile no shell autenticado

## Evidências e ambiente

- frontend respondendo em `http://127.0.0.1:5174/` com sessão autenticada ativa
- backend e worker ativos no stack local durante a navegação
- capturas Playwright geradas durante a validação visual:
  - `relatorio-mtr-desktop-wide.png`
  - `manifestos-mobile-before-drawer.png`
  - `manifestos-mobile-drawer-state.png`
  - `relatorio-mtr-mobile.png`

## Resultado da validação

### Desktop largo

- Manifestos e Relatório MTR preencheram toda a largura útil da viewport, sem reaparecimento de faixa lateral branca.
- O shell autenticado manteve `max-width: none` nos três pontos estruturais esperados: navbar, container principal e footer.
- Em viewport de 1720 px, os containers globais renderizaram com largura útil de 1705 px, alinhados à área útil do documento, preservando padding lateral de 28 px.
- Header e footer permaneceram visualmente íntegros, sem desalinhamento ou centralização residual por container fixo.

### Mobile

- Manifestos e Relatório MTR renderizaram sem overflow horizontal do documento (`scrollWidth = clientWidth = 390`).
- O padding lateral responsivo foi preservado em 18 px no shell global.
- Header mobile permaneceu estável com branding, botão de menu, toggle de tema e menu de usuário.
- Footer mobile continuou visível ao fim da página, sem cortes ou deslocamento lateral.
- O drawer mobile respondeu ao acionamento do botão `Abrir menu`; o DOM registrou `v-navigation-drawer--temporary`, `v-navigation-drawer--active` e `v-navigation-drawer__scrim` visíveis.

## Observações

- Na medição mobile, o `main .container-xxl` pode reportar largura interna maior que a viewport por causa do conteúdo tabular da página, mas isso não gerou overflow horizontal do documento nem faixa branca lateral no shell.
- Não houve reexecução da fase de implementação. Esta etapa foi restrita a validação visual e checagem de regressão do layout.

## Validações executadas

- Navegação manual assistida por Playwright em `/manifestos` e `/relatorios/mtrs`.
- Captura visual em desktop largo e mobile.
- Inspeção de métricas de layout via DOM/computed style para `.container-xxl`, `main` e footer.
- Verificação do drawer mobile por interação e estado estrutural no DOM.
- Console do navegador sem erros durante a validação.

## Decisão

Validação aprovada para a correção do layout global full width no frontend.

## Handoff para próxima fase

Próximo agente: `documentador-mtr`

Foco sugerido:

- consolidar a evidência de QA no handoff final da demanda;
- registrar que a correção foi validada em desktop largo e mobile;
- mencionar explicitamente ausência de regressão em header, footer e drawer mobile.
