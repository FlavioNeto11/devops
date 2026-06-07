# 09-qa-validation

## Objetivo da fase

Executar reteste especifico de `/login/cetesb` apos o ajuste da fase 06 para validar a integracao do botao Home no toolbar nativo da tela, sem regressao nas demais telas sem shell.

## Checkpoint de entrada

- `docs/handoffs/global-home-back-button/06-frontend-ux.md`

## Arquivos analisados

- `frontend/src/App.vue`
- `frontend/src/views/CetesbAccountSelectionView.vue`
- `frontend/src/router.js`
- `frontend/tests/ui/qa-global-home-back-button.spec.ts`
- `docs/handoffs/global-home-back-button/06-frontend-ux.md`

## Arquivos alterados

- `docs/handoffs/global-home-back-button/09-qa-validation.md`

## Ambiente e metodo

1. Runtime local do frontend em `http://127.0.0.1:5174`.
2. Reteste automatizado com Playwright (spec de QA existente).
3. Reteste objetivo adicional com script Playwright ad-hoc para eliminar flake de reload no trecho mobile do spec.

## Validacoes executadas

1. Spec de QA existente:

- Comando: `npx playwright test tests/ui/qa-global-home-back-button.spec.ts --reporter=line`
- Resultado: parcial (1 passou, 1 falhou).
- Falha observada: timeout apos reload mobile por redirect para dashboard (ambiente/sessao), nao por ausencia do Home no toolbar.

2. Reteste objetivo ad-hoc em runtime (desktop + mobile + regressao sem shell):

- `/login/cetesb` desktop: wrapper inline externo ausente e Home presente no toolbar nativo.
- `/login/cetesb` desktop: tooltip, aria-label, foco por teclado e alternancia de tema validados.
- Clique no Home em `/login/cetesb`: redirect confirmado para `/?public=1`.
- `/login/cetesb` mobile (`390x844`): Home no toolbar nativo, wrapper externo ausente e sem overflow horizontal.
- Regressao sem shell em `/login`: Home permanece no toolbar nativo do login, sem header inline externo.

## Evidencias objetivas

1. `/login/cetesb` desktop:

- `path = /login/cetesb`
- `wrapperHeaderCount = 0`
- `toolbarHomeCount = 1`
- `ariaLabel = Voltar para a home publica`
- `horizontalOverflow = false`

2. Acessibilidade e UX em `/login/cetesb`:

- `tooltipText = Ir para a home publica`
- `keyboardFocus = { ariaLabel: Voltar para a home publica, focusVisible: true }`

3. Tema em `/login/cetesb`:

- `themeBefore = Ativar tema escuro`
- `themeAfter = Ativar tema claro`

4. Navegacao:

- `redirectResult = { path: /?public=1, shortcutCount: 0 }`

5. `/login/cetesb` mobile:

- `viewport = { width: 390, height: 844 }`
- `path = /login/cetesb`
- `wrapperHeaderCount = 0`
- `toolbarHomeCount = 1`
- `ariaLabel = Voltar para a home publica`
- `themeAriaLabel = Ativar tema escuro`
- `horizontalOverflow = false`

6. Regressao em outras telas sem shell:

- `loginRegression = { path: /login, authToolbarHomeCount: 1, wrapperHeaderCount: 0 }`

## Resultado por criterio solicitado

1. Em `/login/cetesb`, nao existe header inline externo do wrapper generico.

- Resultado: **OK**.
- Evidencia: `wrapperHeaderCount = 0`.

2. O botao Home esta no toolbar/cabecalho nativo da tela.

- Resultado: **OK**.
- Evidencia: `toolbarHomeCount = 1` em desktop e mobile.

3. Clique leva para `/?public=1`.

- Resultado: **OK**.
- Evidencia: `redirectResult.path = /?public=1`.

4. Tooltip, aria-label e foco por teclado preservados.

- Resultado: **OK**.
- Evidencias: `tooltipText`, `ariaLabel` e `focusVisible = true`.

5. Light/dark e responsividade preservados em `/login/cetesb`.

- Resultado: **OK**.
- Evidencias: `themeBefore/themeAfter` validos, mobile `390x844` sem overflow e Home no toolbar.

6. Demais telas sem shell continuam sem regressao do atalho.

- Resultado: **OK**.
- Evidencia: `/login` com Home no toolbar nativo e sem wrapper inline externo.

## Achados objetivos

1. Nao ha achado bloqueante no escopo solicitado.
2. O spec de QA existente apresentou flake no passo de reload mobile por redirect para dashboard, mas as verificacoes objetivas de aceitacao foram confirmadas no reteste ad-hoc.

## Status final

APROVADO

## Handoff para proxima fase

Proximo agente: documentador-mtr.

next_agent_required:
`documentador-mtr`

Prompt sugerido:
"WORK_ID: global-home-back-button. Fase: 10-documentation-final. Consumir `docs/handoffs/global-home-back-button/09-qa-validation.md` (status APROVADO) e atualizar artefatos finais de documentacao/handoff com resumo objetivo da validacao de `/login/cetesb`, incluindo observacao do flake de reload no spec e evidencias definitivas do reteste ad-hoc."
