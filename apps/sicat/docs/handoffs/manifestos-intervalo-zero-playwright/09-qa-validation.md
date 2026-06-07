# 09 - QA Validation

## Objetivo da fase

Validar em E2E (Playwright) o fluxo da tela de Manifestos (conta destinador), confirmando:

- erro de intervalo de datas com mensagem de `0 dias` na abertura
- comportamento do botao `Aplicar Filtros` sem acionar `Limpar Filtros`

## Ambiente e contexto

- Frontend: `http://127.0.0.1:5174`
- Backend: `http://127.0.0.1:8080`
- Conta ativa observada na UI: `Destinador` (MARDAN FIRE..., cod. 40110)
- Stack utilizada como estava no ambiente local (sem mudancas destrutivas)

## Passos executados (Playwright)

1. Acesso direto em `/manifestos` com sessao autenticada ja ativa.
2. Confirmacao visual da tela de Manifestos e da conta destinador ativa.
3. Observacao inicial da area de filtros e dos alertas.
4. Clique em `Aplicar Filtros` sem clicar em `Limpar Filtros`.
5. Nova tentativa controlada ajustando `Data inicial` e `Data final` para `27/04/2026`, seguida de novo clique em `Aplicar Filtros`.
6. Coleta de evidencias de screenshot, snapshot de acessibilidade, requests de rede e instrumentacao de `fetch` no browser.

## Evidencias principais

- Screenshot (abertura):
  - `artifacts/manifestos-intervalo-zero-playwright/qa-manifestos-open.png`
- Screenshot (apos clicar em Aplicar Filtros):
  - `artifacts/manifestos-intervalo-zero-playwright/qa-manifestos-after-apply.png`
- Screenshot (datas alteradas para o mesmo dia e novo clique):
  - `artifacts/manifestos-intervalo-zero-playwright/qa-manifestos-after-date-change-apply.png`
- Snapshot de acessibilidade (contendo mensagem e campos de data):
  - `artifacts/manifestos-intervalo-zero-playwright/snapshot-after-open.md`
- Rede capturada no browser:
  - `artifacts/manifestos-intervalo-zero-playwright/network-all.log`
  - `artifacts/manifestos-intervalo-zero-playwright/network-after-date-change-apply.log`
- Log instrumentado de `fetch` apos clique em `Aplicar Filtros`:
  - `artifacts/manifestos-intervalo-zero-playwright/fetch-log-after-apply.json` (vazio)
  - `artifacts/manifestos-intervalo-zero-playwright/fetch-log-after-date-change-apply.json` (vazio)

### Mensagem exata observada

`O intervalo entre as datas nao pode ser maior que 0 dias.`

### Dados de data observados na UI

- Cenario 1: `dateFrom` visual = `26/04/2026`, `dateTo` visual = `26/04/2026`
- Cenario 2: `dateFrom` visual = `27/04/2026`, `dateTo` visual = `27/04/2026`

### Query/payload de `dateFrom/dateTo`

- Nao foi observado disparo de request de listagem de manifestos (`GET /v1/manifestos`) durante os cliques em `Aplicar Filtros` nas tentativas instrumentadas.
- Portanto, nao houve query efetiva de `dateFrom/dateTo` para `GET /v1/manifestos` nessas acoes.

## Resultado

## REPRODUZ

- O erro de intervalo `0 dias` aparece na tela de Manifestos
- O botao `Aplicar Filtros` nao resultou em chamada de listagem de manifestos durante as tentativas observadas.

## Hipotese tecnica principal

Hipotese principal: bloqueio no frontend antes da chamada de rede de manifestos (fluxo de submit/aplicacao de filtros), com exibicao de erro na camada de UI/estado.

Arquivos candidatos no frontend:

- `frontend/src/views/ManifestsView.vue`
- `frontend/src/stores/manifests.js`
- `frontend/src/utils/date-range-validation.js`

Observacao: existe tratamento backend para erro remoto de janela de 0 dias em busca de manifestos, mas a evidencia desta validacao mostra ausencia de request de listagem no clique analisado.

## Risco

- Operacao de destinador fica sem capacidade de consulta por filtros na tela principal de Manifestos.
- Risco de bloqueio operacional para recebimento/CDF dependente da grade de manifestos.
- Alta chance de regressao de UX/fluxo essencial se nao corrigido no frontend.

## Recomendacao de proximo owner

## frontend-vue-ux-mtr

Justificativa: evidencia aponta para comportamento bloqueado na camada de interface/estado local antes do request de listagem.

## Handoff sugerido ao proximo especialista

- Investigar caminho de `applyFilters` e atualizacao de `error/dateFilterError` na tela
- Confirmar gatilho de `search()` no submit e por que `listManifests` nao e disparado nesse fluxo observado.
- Revisar regra de validacao de intervalo e normalizacao de janela para conta destinador.

---

## Reteste obrigatorio apos correcao de frontend (2026-04-27)

## Escopo do reteste

- Reexecutar o mesmo fluxo E2E em Playwright apos ajustes da fase 06.
- Validar abertura da tela de Manifestos (conta destinador) sem erro local de `0 dias`.
- Validar clique em `Aplicar Filtros` sem `Limpar Filtros`, com confirmacao de `GET /v1/manifestos`.
- Repetir o submit com a mesma data inicial/final para verificar estabilidade.

## Execucao

1. Acesso em `http://127.0.0.1:5174/manifestos` com contexto autenticado e conta ativa `Destinador`.
2. Confirmacao da abertura da tela sem exibicao da mensagem `O intervalo entre as datas nao pode ser maior que 0 dias.`.
3. Clique em `Aplicar Filtros` sem usar `Limpar Filtros`.
4. Confirmacao de requests `GET /v1/manifestos` com `200 OK`.
5. Ajuste de `dateFrom/dateTo` para a mesma data (`27/04/2026`) e novo clique em `Aplicar Filtros`.
6. Nova confirmacao de `GET /v1/manifestos` com `200 OK` e grade com itens carregados.

## Evidencias

- Screenshot abertura:
  - `artifacts/manifestos-intervalo-zero-playwright/retest-open.png`
- Screenshot apos primeiro submit (`Aplicar Filtros` sem limpar):
  - `artifacts/manifestos-intervalo-zero-playwright/retest-after-apply.png`
- Screenshot apos segundo submit (mesma data inicial/final):
  - `artifacts/manifestos-intervalo-zero-playwright/retest-after-same-date-apply.png`
- Snapshot de acessibilidade apos reteste:
  - `artifacts/manifestos-intervalo-zero-playwright/retest-snapshot-after-same-date.md`
- Rede antes/depois:
  - `artifacts/manifestos-intervalo-zero-playwright/retest-network-before-apply.log`
  - `artifacts/manifestos-intervalo-zero-playwright/retest-network-after-apply.log`
  - `artifacts/manifestos-intervalo-zero-playwright/retest-network-after-same-date-apply.log`
- Console erros:
  - `artifacts/manifestos-intervalo-zero-playwright/retest-console-errors.log` (sem erros)

## Resultado final do reteste

## PASSOU

## Evidencia objetiva de contrato de chamada

Requests observados no reteste:

- `GET /v1/manifestos?...dateFrom=2026-04-26&dateTo=2026-04-26&page=1&pageSize=20 => 200 OK`
- `GET /v1/manifestos?...dateFrom=2026-04-27&dateTo=2026-04-27&page=1&pageSize=20 => 200 OK`

## Conclusao QA

- Nao houve regressao do erro local de `0 dias` na abertura.
- `Aplicar Filtros` voltou a acionar listagem remota normalmente.
- Repeticao com mesma data inicial/final permaneceu estavel, sem bloqueio de submit.

## Handoff para proxima fase

- Proximo agente: `documentador-mtr`
- Entregar consolidacao final em `10-documentation-final.md` com o status `PASSOU`, resumo da causa/ajuste e links para evidencias acima.
