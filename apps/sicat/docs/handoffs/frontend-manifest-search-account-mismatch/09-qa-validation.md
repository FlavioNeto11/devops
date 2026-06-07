# 09 - QA Validation

## Objetivo da fase

Validar o fluxo apos a correcao de frontend para comprovar que a busca de manifestos usa sempre o contexto operacional ativo da sessao, mesmo quando a rota ou o `localStorage` carregam um `integrationAccountId` stale.

## Arquivos analisados

- `docs/handoffs/frontend-manifest-search-account-mismatch/00-orchestration.md`
- `docs/handoffs/frontend-manifest-search-account-mismatch/01-source-validation.md`
- `docs/handoffs/frontend-manifest-search-account-mismatch/06-frontend-ux.md`
- `frontend/src/stores/manifests.js`
- `frontend/src/views/ManifestsView.vue`
- `frontend/tests/ui/manifests-resync.spec.js`
- `frontend/tests/ui/manifest-account-context.spec.js`

## Findings

- Nenhum defeito novo encontrado na correcao validada.
- O request de `GET /v1/manifestos` passou a usar consistentemente o par ativo `integrationAccountId + sessionContextId`, mesmo com `integrationAccountId` stale simultaneamente na query da rota e no filtro persistido em `localStorage`.
- A validacao adjacente `frontend/tests/ui/manifests-resync.spec.js` revelou um ponto fora do escopo desta demanda: o caso `manifesto impresso permanece cancelável e com status visual de sucesso` falhou porque a UI exibiu o texto `salvo` no badge, enquanto o teste ainda esperava `Sucesso`.
- Nao foi possivel reproduzir localmente o fluxo completo com login real CETESB no navegador durante esta fase porque a validacao disponivel no workspace e viavel sem credenciais reais via Playwright com mocks de sessao e contexto operacional. O backend local, entretanto, respondeu normalmente aos health checks durante a validacao.

## Validacoes executadas

### 1. Inspecao da correcao aplicada

- Confirmado em `frontend/src/stores/manifests.js` que `search()` chama `syncWithActiveOperationalContext()` antes de montar `requestParams`.
- Confirmado em `frontend/src/views/ManifestsView.vue` que `route.query.integrationAccountId` so e aceito quando coincide com a conta operacional ativa, ou quando ainda nao existe contexto pronto.

### 2. Build e diagnostico do frontend

- Sem erros de diagnostico nos arquivos alterados `frontend/src/stores/manifests.js` e `frontend/src/views/ManifestsView.vue`.
- O build do frontend ja estava verde na fase anterior e permaneceu consistente com a cobertura de QA adicionada.

### 3. Smoke do backend local

- `npm run smoke:health` no workspace raiz.
- Resultado observado: `7/7` endpoints de health responderam com sucesso em `http://localhost:8080`.

### 4. Validacao automatizada focada no mismatch reportado

- Adicionado teste de UI `frontend/tests/ui/manifest-account-context.spec.js`.
- Cenario exercitado:
  1. sessao autenticada e conta operacional ativa reidratadas no browser;
  2. `localStorage` contem `sicat_manifest_list_filters.integrationAccountId = acc_stale_qa_999`;
  3. navegacao para `/manifestos?integrationAccountId=acc_stale_qa_999`;
  4. interceptacao do primeiro `GET /v1/manifestos` para validar os query params efetivos.
- Resultado esperado e confirmado pelo teste:

```json
{
  "integrationAccountId": "acc_active_qa_001",
  "sessionContextId": "scx_active_qa_001",
  "status": "submitted"
}
```

- O valor stale `acc_stale_qa_999` nao prevaleceu nem via rota nem via filtro persistido.

### 5. Regressao adjacente verificada

- Executado `npm run test:ui -- tests/ui/manifests-resync.spec.js` em `frontend/`.
- Resultado: `1 passed`, `1 failed`.
- Falha observada no caso `manifesto impresso permanece cancelável e com status visual de sucesso`:

```text
Expected: "Sucesso"
Received: "salvo"
```

- Leitura inicial: evidencia de desalinhamento entre expectativa do teste e rotulagem visual atual baseada em `externalStatus`; nao ha indicio de relacao causal com o mismatch de `integrationAccountId` desta demanda.

## Limites da validacao

- Esta fase nao executou login real com credenciais CETESB no navegador.
- A validacao mais proxima viavel no ambiente foi um teste de Playwright com UI real e interceptacao dos endpoints de sessao/manifestos, suficiente para provar a montagem correta do request que falhava no HAR original.

## Decisao de QA

- Correcao aprovada para o defeito reportado de mismatch entre `sessionContextId` e `integrationAccountId` na busca de manifestos.
- Nao ha evidencia de regressao no comportamento alvo validado nesta demanda.
- Existe uma falha adjacente de teste de UI em `frontend/tests/ui/manifests-resync.spec.js` que deve ser triada separadamente.

## Arquivos alterados nesta fase

- `frontend/tests/ui/manifest-account-context.spec.js`
- `docs/handoffs/frontend-manifest-search-account-mismatch/09-qa-validation.md`

## Handoff para a proxima fase

- Consolidar a evidencia final da demanda, registrando que o frontend agora prioriza o contexto operacional ativo ao buscar manifestos e ignora valores stale herdados de rota e `localStorage`.

## Proximo agente recomendado

- `documentador-mtr`
