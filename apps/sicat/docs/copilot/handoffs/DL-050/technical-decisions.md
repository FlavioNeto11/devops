# Decisões Técnicas - DL-050

## 1) Status transitório de submissão
**Decisão:** não marcar manifesto como `submitted` quando CETESB não retornou `manCodigo/manNumero`.

**Racional:** o retorno da CETESB pode trazer hash inicialmente, com resolução posterior. Exibir sucesso nesse estágio gera falso positivo operacional.

**Implementação:**
- `src/workers/operation-handlers.js`
  - `status = 'processing'` e `externalStatus = 'aguardando confirmação CETESB'` quando referência externa não está resolvida;
  - `status = 'submitted'` apenas com `manCodigo` e `manNumero` disponíveis.

## 2) Resiliência para force sync
**Decisão:** fallback com cache local é permitido apenas na busca normal; `forceSync=true` permanece estrito.

**Racional:**
- busca normal deve degradar com aviso, sem interromper operação;
- ressincronização manual (`forceSync`) precisa expor erro real para o usuário saber que a CETESB não sincronizou.

**Implementação:**
- `src/services/manifest-service.js`
  - fallback local em erro CETESB 5xx/rede/retry exhausted somente quando `forceSync=false`;
  - resposta inclui `syncWarning` para permitir aviso visual no frontend.

- `frontend/src/stores/manifests.js`
  - novo estado `syncWarning` preenchido a partir da resposta da API.

- `frontend/src/views/ManifestsView.vue`
  - renderização de banner de aviso quando `syncWarning` estiver presente e não houver erro fatal.

## 3) Filtro inicial sem restrição de dia
**Decisão:** remover `dateFrom/dateTo` padrão com data atual na store de listagem.

**Racional:** o default anterior induzia falsa ausência de manifestos históricos e confundia diagnóstico de sincronização.

**Implementação:**
- `frontend/src/stores/manifests.js`
  - filtros iniciam vazios e reset também retorna a vazio.

## 4) Escopo de não alteração
- Não foi alterado contrato OpenAPI.
- Não foi introduzido novo endpoint.
- Não foi modificada semântica de DLQ/requeue de jobs fora do fluxo de manifesto submit/listagem.

## 5) Transparência operacional no fallback de cache
**Decisão:** tornar o badge `Dados em cache` interativo para exibir detalhes do último fallback.

**Racional:** além do aviso textual, operadores precisam saber rapidamente quando ocorreu o fallback e qual status HTTP remoto foi observado para triagem de instabilidade CETESB.

**Implementação:**
- `src/services/manifest-service.js`
  - adiciona `fallbackAt` em `syncWarning` no fallback local da busca normal.

- `frontend/src/stores/manifests.js`
  - mantém `syncWarningMeta` com o objeto completo retornado pelo backend.

- `frontend/src/views/ManifestsView.vue`
  - badge `Dados em cache` vira botão com foco visível;
  - modal apresenta `Status HTTP remoto` e `Horário do fallback`.

## 6) Hardening do Ressinc. em erro 500 CETESB
**Decisão:** manter `forceSync` estrito, mas adicionar uma tentativa controlada com refresh de sessão antes de devolver erro final.

**Racional:** no fluxo real (evidenciado por HAR), a CETESB pode retornar `500` mesmo com `sessionContextId` válido; forçar um refresh de token/sessão reduz falhas transitórias sem mascarar indisponibilidade real.

**Implementação:**
- `src/gateways/cetesb-gateway.js`
  - `searchManifests` mantém fallback de `kind=all` para `kind=0`;
  - em `500` persistente, executa `ensureAuthForSession(..., { forceRefresh: true })` uma vez e repete a busca;
  - se ainda falhar, preserva comportamento estrito (erro `502` para `forceSync=true`).

- `frontend/src/views/DashboardView.vue`
  - inclui `sessionContextId` na chamada de `listManifests` para consistência com a tela de manifestos.

## 7) Janela padrão curta para Ressinc. manual
**Decisão:** separar a janela padrão do `forceSync` da janela padrão da busca geral, usando intervalo curto por padrão no Ressinc.

**Racional:** evidência operacional confirmou sucesso no endpoint CETESB com janela curta (ex.: ontem-hoje), enquanto janelas amplas elevam ocorrência de `500` no `pesquisaManifesto` em alguns cenários.

**Implementação:**
- `src/lib/config.js`
  - nova chave `cetesbManifestForceSyncDaysBack` (env `CETESB_MANIFEST_FORCE_SYNC_DAYS_BACK`, default `1`).

- `src/services/manifest-service.js`
  - `resolveMirrorSyncWindow` passou a usar `config.cetesbManifestForceSyncDaysBack` quando `forceSync=true` e não houver `dateFrom/dateTo` explícitos.

## 8) ACK de submissão por hash deve finalizar estado transitório
**Decisão:** considerar `manHashCode` como confirmação de submissão para transição para `submitted`, mesmo sem `manCodigo/manNumero` imediatos.

**Racional:** evidência de HAR/worker mostrou job finalizado com resposta CETESB válida (`simDescricao=salvo` + hash), mas manifesto permanecia `processing`, gerando percepção de execução infinita no frontend.

**Implementação:**
- `src/workers/operation-handlers.js`
  - novo critério `hasSubmissionAck` (`manHashCode` ou referência completa);
  - `status=submitted` quando houver ACK, `processing` apenas sem confirmação externa;
  - `externalStatus` usa `simDescricao` quando disponível (fallback `salvo`).

- `tests/worker/manifest-submit-handler.test.js`
  - cenário adicional cobre retorno CETESB com hash-only e valida manifesto `submitted` + job `succeeded`.
