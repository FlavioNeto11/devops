# 01 - Source Validation

## Objetivo da fase

Validar a evidencia do fluxo real de frontend apos login e abertura da tela de manifestos, confirmando se o `400` em `GET /v1/manifestos` decorre de mismatch real entre `sessionContextId` e `integrationAccountId`, e delimitar a ownership correta da falha.

## Fontes analisadas

- `docs/handoffs/frontend-manifest-search-account-mismatch/00-orchestration.md`
- `src/services/manifest-service.ts`
- `src/repositories/manifest-repo.ts`
- `frontend/src/stores/auth.js`
- `frontend/src/stores/manifests.js`
- `frontend/src/views/DashboardView.vue`
- `frontend/src/views/ManifestsView.vue`

## Contratos e fluxos extraidos

### Sequencia observada a partir da evidencia consolidada

1. `POST /v1/sicat/auth/login` retorna `200`.
2. `GET /v1/sicat/session` retorna `sessionContextId = scx_ccac5739eb50ce2f480ae3c6cb` e `integrationAccountId = acc_acc_41efad06dc4dd0cdd6c8505332`.
3. `POST /v1/sicat/cetesb-accounts/acc_41efad06dc4dd0cdd6c8505332/activate` retorna `200` e reafirma o mesmo par sessao-conta ativa.
4. `GET /v1/dashboard/overview` usa o mesmo `integrationAccountId = acc_acc_41efad06dc4dd0cdd6c8505332` com o mesmo `sessionContextId`.
5. `GET /v1/manifestos` e disparado com `sessionContextId = scx_ccac5739eb50ce2f480ae3c6cb`, mas com `integrationAccountId = acc_acc_1048c579b90c3e6d788c4812c5`, e recebe `400`.

### Contrato backend comprovado para busca de manifestos

- O backend exige que `sessionContextId` pertença ao `integrationAccountId` informado na busca de manifestos.
- A validacao aparece em `requireOperationalSessionContext` e rejeita a combinacao quando `sessionContext.integrationAccountId !== integrationAccountId`.
- O repositorio reforca a mesma regra ao consultar o ownership do `sessionContextId` antes de operar com manifestos.

### Comportamento frontend corroborado pelo codigo

- A sessao ativa no frontend e atualizada por `activateCetesbAccount`, que chama `applyActiveSession(activeSession)` em `frontend/src/stores/auth.js`.
- A dashboard usa `authStore.integrationAccountId.value` e `authStore.sessionContext.value` diretamente, portanto consome o contexto ativo atual.
- A tela de manifestos monta a busca com `filters.integrationAccountId` em vez de consumir obrigatoriamente o `integrationAccountId` ativo do `authStore`.
- No `onMounted` de `frontend/src/views/ManifestsView.vue`, `route.query.integrationAccountId` pode sobrescrever `filters.integrationAccountId`.
- Em `frontend/src/stores/manifests.js`, o filtro de `integrationAccountId` tambem e persistido em `localStorage`, o que permite reidratar um valor antigo e divergente da conta ativa da sessao.

## Endpoints e interfaces relevantes

- `POST /v1/sicat/auth/login`
- `GET /v1/sicat/session`
- `POST /v1/sicat/cetesb-accounts/{accountId}/activate`
- `GET /v1/dashboard/overview`
- `GET /v1/manifestos`

## Payload estrutural relevante

### Sessao ativa esperada apos login/ativacao

```json
{
  "sessionContextId": "scx_ccac5739eb50ce2f480ae3c6cb",
  "integrationAccountId": "acc_acc_41efad06dc4dd0cdd6c8505332"
}
```

### Busca incorreta observada na tela de manifestos

```json
{
  "sessionContextId": "scx_ccac5739eb50ce2f480ae3c6cb",
  "integrationAccountId": "acc_acc_1048c579b90c3e6d788c4812c5"
}
```

## Respostas observadas

- `POST /v1/sicat/auth/login`: `200`
- `POST /v1/sicat/cetesb-accounts/{accountId}/activate`: `200`
- `GET /v1/dashboard/overview`: sucesso com o par correto de sessao e conta
- `GET /v1/manifestos`: `400 Bad Request` quando o `integrationAccountId` nao pertence ao `sessionContextId`

## Dados sensiveis a sanitizar

- Cookies, bearer tokens e credenciais de login
- Headers de autenticacao e conteudo integral do HAR bruto
- Quaisquer dados pessoais presentes no HAR original
- Os IDs de sessao e conta deste checkpoint devem ser tratados apenas como identificadores operacionais de evidencia, sem reuso fora desta investigacao

## Decisoes

- A evidencia consolidada e suficiente para afirmar que existe mismatch real na chamada da tela de manifestos.
- O comportamento do backend esta correto: o `400` e uma protecao intencional de consistencia entre `sessionContextId` e `integrationAccountId`.
- A ownership mais provavel do defeito e de frontend, porque a dashboard usa o contexto ativo correto enquanto a tela de manifestos aceita um `integrationAccountId` vindo de filtro/query/localStorage diferente da sessao ativa.
- Nao ha evidencia nesta fase de defeito de contrato backend nem de necessidade de alterar validacao no servico de manifestos.

## Incertezas e limites

- O HAR bruto anexado pelo usuario nao foi persistido no workspace desta fase; a validacao foi feita sobre a sequencia consolidada em `00-orchestration.md` e cruzada com o comportamento comprovado no codigo.
- A causa exata dentro do frontend ainda precisa ser fechada pelo owner da fase `06-frontend-ux`, mas o desvio esta delimitado ao uso de estado/filtro divergente da sessao ativa.

## Handoff para a proxima fase

- Objetivo: corrigir a tela de manifestos para sempre derivar a busca do contexto operacional ativo ou invalidar filtros herdados quando houver troca de conta ativa.
- Escopo provavel: `frontend/src/views/ManifestsView.vue` e `frontend/src/stores/manifests.js`.
- Backend: manter a validacao atual de ownership entre `sessionContextId` e `integrationAccountId`.

## Proximo agente recomendado

- `frontend-vue-ux-mtr`