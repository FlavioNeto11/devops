# 06 - Frontend UX

## Objetivo da fase

Corrigir a busca da tela de manifestos para sempre usar o mesmo par operacional ativo de `integrationAccountId` e `sessionContextId` apos login e ativacao de conta CETESB, sem relaxar a validacao backend.

## Arquivos analisados

- `frontend/src/stores/auth.js`
- `frontend/src/stores/manifests.js`
- `frontend/src/views/ManifestsView.vue`
- `frontend/src/views/ManifestCreateView.vue`

## Causa raiz confirmada

- O `authStore` ja mantinha a conta operacional ativa correta em `state.integrationAccountId` e `state.sessionContext` apos `activateCetesbAccount`.
- O `manifestsStore` inicializava `filters.integrationAccountId` a partir de `localStorage` (`sicat_manifest_list_filters` e `sicat_active_integration_account_id`), preservando um valor antigo de outra conta.
- A funcao `search()` so reaproveitava o contexto ativo quando `filters.integrationAccountId` estivesse vazio. Se o filtro reidratado ja viesse preenchido com uma conta antiga, o request seguia com esse valor stale.
- Em paralelo, `ManifestsView.vue` aceitava `route.query.integrationAccountId` sem validar se ele ainda pertencia a sessao operacional ativa, o que podia reintroduzir a divergencia ao voltar de outros fluxos.

## Decisoes implementadas

- A store de manifestos agora resolve o `integrationAccountId` inicial priorizando o contexto ativo do `authStore` antes de olhar filtros persistidos.
- Toda busca de manifestos passou a chamar uma sincronizacao explicita com o contexto operacional ativo antes de montar o request.
- O mesmo helper de sincronizacao foi exposto para a view, permitindo alinhar a tela quando a conta ativa muda ou quando a rota chega com query params.
- O `integrationAccountId` vindo da URL agora so e aceito quando coincide com a conta operacional ativa; se divergir, a tela preserva a conta ativa.
- A validacao backend de ownership entre `sessionContextId` e `integrationAccountId` foi mantida intacta.

## Arquivos alterados

- `frontend/src/stores/manifests.js`
- `frontend/src/views/ManifestsView.vue`
- `docs/handoffs/frontend-manifest-search-account-mismatch/06-frontend-ux.md`

## Validacoes executadas

- Analise dirigida do fluxo entre `authStore` e `manifestsStore` para confirmar que a origem do mismatch era reidratacao stale no frontend.
- Build focado do frontend com `npm run build` em `frontend/`.
- Verificacao de erros dos arquivos alterados via diagnostico do workspace.

## Riscos e observacoes

- Fluxos que redirecionam para `/manifestos` com `integrationAccountId` em query continuam funcionais quando o valor coincide com a conta ativa; quando nao coincide, a query e ignorada por seguranca operacional.
- Como o filtro de conta nao e editavel na tela atual, alinhar o request com a conta ativa nao remove nenhuma capacidade visivel do usuario.

## Handoff para QA

- Validar login real, ativacao de conta CETESB e navegacao ate `/manifestos`.
- Confirmar que `GET /v1/manifestos` usa o mesmo `integrationAccountId` da sessao ativa e do dashboard.
- Exercitar retorno para `/manifestos` a partir de fluxos que usam query string, verificando que valores stale de `integrationAccountId` nao prevalecem sobre a conta ativa.

## Proximo agente recomendado

- `tester-qa-mtr`
