# 06 - Frontend UX

## Objetivo da fase

Abrir a primeira fatia de implementacao do `Relatorio dos MTRs` como workspace dedicado no frontend do SICAT, reaproveitando o contrato atual de listagem filtrada sem misturar a nova experiencia com a listagem operacional de manifestos.

## Arquivos analisados

### Checkpoints e contexto de entrada

- `docs/handoffs/manifest-report-workspace/00-orchestration.md`
- `docs/handoffs/sigor-parity-backlog/00-orchestration.md`
- `docs/handoffs/sigor-sicat-gap-map/10-documentation-final.md`
- `docs/handoffs/sigor-sicat-gap-map/06-frontend-ux.md`
- `docs/handoffs/sigor-sicat-gap-map/03-backend-contracts.md`

### Frontend inspecionado nesta fase

- `frontend/src/router.js`
- `frontend/src/App.vue`
- `frontend/src/views/ManifestsView.vue`
- `frontend/src/views/ManifestDetailView.vue`
- `frontend/src/components/shared/inputs/SicatDateInput.vue`
- `frontend/src/services/api.js`
- `frontend/src/stores/auth.js`
- `frontend/src/stores/manifests.js`
- `frontend/src/utils/date-format.js`

## Leitura executiva

O corte minimo e viavel no frontend sem abrir fase 03 agora. O contrato atual ja suporta uma consulta dedicada com `dateFrom`, `dateTo`, `manifestNumber`, `carrierQuery`, `receiverQuery`, `status`, `page` e `pageSize` em `GET /v1/manifestos`, e a listagem operacional atual em `ManifestsView.vue` concentra muita logica de acao, selecao em lote, recebimento e CDF para ser reaproveitada como experiencia de relatorio sem contaminar a separacao desejada.

Por isso, a implementacao escolhida foi uma nova rota/view dedicada de leitura, com filtros persistidos separadamente, tabela propria e link explicito de volta para a lista operacional. A nova workspace usa o mesmo contrato de listagem filtrada, mas remove intencionalmente a camada de operacao.

## Decisoes desta fase

- Criar uma rota dedicada `Relatório dos MTRs`, separada de `Manifestos`.
- Preservar o contrato atual, sem pedir endpoint novo nesta primeira fatia.
- Reaproveitar padroes visuais existentes (`sicat-card`, `SicatDateInput`, `sicat-table`, `sicat-status`) para manter consistencia.
- Nao reutilizar `ManifestsView.vue` diretamente, porque a tela atual e operacional por natureza e carrega escopo desnecessario para leitura/reporting.
- Persistir filtros do relatorio em chave propria de `localStorage`, evitando colisao com os filtros da lista operacional.

## Implementacao realizada

### Nova experiencia dedicada

Foi criada a view `frontend/src/views/ManifestReportView.vue` com:

- hero proprio e copy de consulta dedicada;
- resumo da consulta com total, periodo e conta CETESB ativa;
- filtros de periodo, status, numero MTR, transportador e destinador;
- tabela orientada a leitura, sem acoes operacionais de submit, cancelamento, recebimento ou CDF;
- acesso ao detalhe do manifesto via `Abrir detalhe`;
- paginacao simples sobre o contrato atual.

### Navegacao

Foi adicionada a rota dedicada em `frontend/src/router.js` e a entrada correspondente no menu lateral em `frontend/src/App.vue`, mantendo `Manifestos` como area operacional e `Relatório MTR` como area de consulta.

## Arquivos alterados

- `frontend/src/router.js`
- `frontend/src/App.vue`
- `frontend/src/views/ManifestReportView.vue`
- `docs/handoffs/manifest-report-workspace/06-frontend-ux.md`

## Fase 03 e gaps de contrato

`03-backend-contracts` **nao e necessaria para esta primeira fatia implementada**.

Motivo:

- a consulta dedicada cabe sobre o contrato existente ja validado no gap map;
- nao foi tentada equivalencia de exportacao, agregacao analitica nova, filtros fora da listagem atual ou relatorios especializados.

`03-backend-contracts` passa a ser necessaria apenas se a proxima iteracao exigir:

- exportacao dedicada do relatorio;
- semantica propria de `relatorio` distinta da listagem filtrada;
- filtros adicionais nao publicados hoje;
- relatorios fora do recorte desta entrega, como armazenamento temporario, DMR, provisórios, temporarios ou casos especiais de CDF.

## Validacoes desta fase

- leitura do checkpoint de frontend anterior e do checkpoint de contratos concluida;
- confirmada rota/listagem operacional atual como base inadequada para reaproveitamento direto da UX de relatorio;
- implementacao nova mantida sobre `listManifests` e `authStore.ensureSessionContextReady`;
- nenhuma alteracao feita no contrato, no backend ou na listagem operacional existente.

## O que fica para QA

- validar navegacao lateral e breadcrumb do novo workspace;
- validar consulta inicial com periodo padrao e retorno vazio/erro/loading;
- validar troca de conta CETESB com recarregamento correto do relatorio;
- validar que a lista operacional em `Manifestos` continua sem regressao de filtros e acoes;
- validar acesso ao detalhe do manifesto a partir da nova tabela;
- validar responsividade do workspace em largura tablet/mobile.

## Handoff para proxima fase

Proximo agente obrigatorio: `tester-qa-mtr`.

Objetivo do handoff:

- executar validacao funcional da nova workspace `Relatório dos MTRs`;
- verificar regressao basica da rota `Manifestos`;
- confirmar que esta primeira fatia nao depende de fase 03 para o escopo entregue.

Se o runtime nao permitir chamar o proximo especialista, entregar `next_agent_required` para `tester-qa-mtr` com este checkpoint e `docs/handoffs/manifest-report-workspace/00-orchestration.md` como base imediata.
