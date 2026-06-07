# 06 - Frontend UX

## Objetivo da fase
Reproduzir a regressao visual reportada (icones renderizados como texto), identificar causa raiz tecnica no frontend, aplicar correcao minima preservando o padrao Vuexy/Vuetify e revalidar com Playwright nas telas de Manifestos e Relatorio com campos de data.

## Arquivos analisados
- frontend/src/components/shared/inputs/SicatDateInput.vue
- frontend/src/views/ManifestsView.vue
- frontend/src/styles/base.css
- frontend/src/main.js
- frontend/src/plugins/vuetify.js
- frontend/tests/ui/manifests-resync.spec.js
- frontend/tests/ui/audit.spec.ts
- frontend/playwright.config.js

## Causa raiz
O frontend usa icones por ligature com spans de classe material-symbols-outlined (ex.: chevron_right, calendar_month, expand_more), mas a fonte Material Symbols Outlined nao estava carregada no bundle e a classe global nao definia font-family apropriada.

Efeito observado:
- os tokens de ligature eram exibidos como texto visivel sobre campos e controles;
- principalmente em Manifestos e nos inputs de data (SicatDateInput), invalidando confianca visual dos testes.

Evidencia tecnica de reproducao antes do fix (execucao local assistida com Playwright):
- Manifestos: RAW_ICON_TEXT_VISIBLE=true
- font-family computada em .material-symbols-outlined: "Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif

## Arquivos alterados
- frontend/package.json
  - adicionada dependencia @fontsource/material-symbols-outlined
- frontend/package-lock.json
  - lock atualizado apos instalacao da dependencia
- frontend/src/main.js
  - import de @fontsource/material-symbols-outlined
- frontend/src/styles/base.css
  - ajuste da classe .material-symbols-outlined para usar font-family Material Symbols Outlined e propriedades de ligature/renderizacao
- frontend/tests/ui/icons-font-rendering.spec.ts
  - novo teste Playwright minimo para validar font-family de icones em:
    - Manifestos
    - Relatorio de MTR (tela com inputs de data)

## Validacoes executadas e resultados
1. Reproducao local assistida (antes do fix)
- Comando: node -e (Playwright script ad-hoc em frontend)
- Resultado: problema reproduzido
  - /manifestos RAW_ICON_TEXT_VISIBLE=true
  - ICON_FONT_FAMILY="Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif

2. Validacao Playwright apos correcao
- Comando: npx playwright test tests/ui/icons-font-rendering.spec.ts --reporter=list
- Resultado: PASS
  - 2 passed
  - Manifestos usa Material Symbols Outlined
  - Relatorio de MTR (inputs de data) usa Material Symbols Outlined

3. Evidencias geradas
- frontend/test-results/frontend-visual-playwright-validation/01-manifestos-fixed.png
- frontend/test-results/frontend-visual-playwright-validation/02-relatorio-datas-fixed.png
- frontend/test-results/icons-font-manifestos.png
- frontend/test-results/icons-font-relatorio-mtrs.png

4. Verificacao de erros nos arquivos alterados
- main.js: sem erros
- base.css: sem erros apos ajuste de fallback generico
- icons-font-rendering.spec.ts: sem erros

## Riscos residuais
- Ainda existe instabilidade conhecida em parte da suite de auditoria Playwright (timeouts por waitForLoadState(networkidle)); nao foi alterada nesta fase por nao estar no escopo da regressao de icones.
- Como a regressao era de pipeline de fonte, a robustez depende de manter o import da fonte no bootstrap do frontend.

## Handoff para proximo owner
Status: ready_for_qa_rerun

next_agent_required

Prompt sugerido para tester-qa-mtr:

- work_id: frontend-visual-playwright-validation
- fase: 09-rerun-validation
- objetivo: reexecutar validacao Playwright com foco em regressao visual de icones, cobrindo ao menos Manifestos e Relatorio de MTR (inputs de data)
- arquivos de referencia:
  - frontend/tests/ui/icons-font-rendering.spec.ts
  - frontend/test-results/frontend-visual-playwright-validation/01-manifestos-fixed.png
  - frontend/test-results/frontend-visual-playwright-validation/02-relatorio-datas-fixed.png
  - frontend/test-results/icons-font-manifestos.png
  - frontend/test-results/icons-font-relatorio-mtrs.png
- criterio de aceite:
  - nenhum texto bruto de ligature visivel (calendar_month, chevron_right, chevron_left, expand_more)
  - testes de validacao de fonte de icones passando
  - registrar checkpoint 09-rerun-validation.md com resultado pass/fail e evidencias
