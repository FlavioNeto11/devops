# 06 - Frontend UX

## Objetivo da fase

Corrigir o bloqueio de `Aplicar Filtros` na tela de Manifestos (conta destinador), removendo falso-positivo de validacao local (`0 dias`) e garantindo normalizacao consistente de `dateFrom/dateTo` antes da validacao e da busca.

## Arquivos analisados

- `frontend/src/views/ManifestsView.vue`
- `frontend/src/stores/manifests.js`
- `frontend/src/utils/date-range-validation.js`
- `docs/handoffs/manifestos-intervalo-zero-playwright/09-qa-validation.md`

## Causa raiz confirmada

A validacao em `evaluateDateRange` aplicava limite de janela mesmo quando `maxDays` nao era configurado.

Detalhe tecnico:

- regra anterior: `Number.isFinite(Number(maxDays))`
- como `Number(null) === 0`, o limite era considerado ativo indevidamente;
- resultado: qualquer janela valida (> 0 dias de span inclusivo) podia gerar erro local `O intervalo entre as datas nao pode ser maior que 0 dias.` e bloquear o submit antes do request.

## Decisoes e alteracoes

### 1) Ajuste de regra de validacao de janela

Arquivo: `frontend/src/utils/date-range-validation.js`

- adicionado `hasMaxDaysLimit` para ativar limite apenas quando `maxDays` estiver explicitamente configurado como numero finito maior que zero
- mantida semantica existente para cenarios com limite valido (`maxDays > 0`);
- eliminado falso-positivo de `0 dias` quando `maxDays` nao e informado.

### 2) Normalizacao consistente na View antes de validar/aplicar

Arquivo: `frontend/src/views/ManifestsView.vue`

- adicionada funcao `normalizeDateFilterInputs()` com `normalizeBrDateInput` para `filters.dateFrom` e `filters.dateTo`
- chamada no inicio de `normalizeReceiverDateWindow()`;
- chamada no inicio de `updateDateFilterFeedback()`.

Efeito:

- a validacao sempre recebe valores normalizados
- reduz estado residual entre digitacao, picker e submit;
- evita bloqueio indevido do `applyFilters` por formato intermediario de data.

### 3) Normalizacao antes de montar request no store

Arquivo: `frontend/src/stores/manifests.js`

- importado `normalizeBrDateInput`
- em `buildManifestRequestParams`, normalizados `filters.dateFrom/dateTo` antes de converter para ISO (`toApiDate`);
- request passa a usar os valores normalizados locais.

Efeito:

- consistencia entre estado exibido, validacao e payload de busca
- previne divergencia entre UI e parametros enviados ao backend.

## Arquivos alterados

- `frontend/src/utils/date-range-validation.js`
- `frontend/src/views/ManifestsView.vue`
- `frontend/src/stores/manifests.js`

## Validacoes executadas

Validacao estatica por arquivo alterado (`get_errors`):

- `frontend/src/utils/date-range-validation.js`: sem erros
- `frontend/src/views/ManifestsView.vue`: sem erros
- `frontend/src/stores/manifests.js`: sem erros

## Risco e compatibilidade

- Mudancas locais e de baixo risco, sem alteracao de contrato HTTP.
- Nao houve mudanca de rotas, OpenAPI, backend ou worker.
- Fluxos que usam `evaluateDateRange` com `maxDays` explicito permanecem com comportamento esperado.

## Handoff para proximo agente

Proximo agente: `tester-qa-mtr`

Objetivo sugerido:

- repetir cenario de `docs/handoffs/manifestos-intervalo-zero-playwright/09-qa-validation.md` em conta destinador
- confirmar que `Aplicar Filtros` dispara `GET /v1/manifestos` sem mensagem local `0 dias`;
- validar normalizacao de `dateFrom/dateTo` em entradas manuais e via date picker.
