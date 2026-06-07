# 10 - Documentation Final

## Status final

- Demanda concluida para o defeito alvo de mismatch entre `sessionContextId` e `integrationAccountId` na busca de manifestos.
- A correcao de frontend foi validada sem necessidade de alterar contrato ou validacao backend.
- O comportamento esperado agora e: a tela de manifestos sempre monta `GET /v1/manifestos` com o par operacional ativo da sessao, mesmo quando existem valores stale em `route.query.integrationAccountId` e no `localStorage`.

## Root cause comprovada por evidencia HAR e codigo

### Evidencia operacional consolidada

- O fluxo consolidado em `00-orchestration` mostrou que, apos login e ativacao, a sessao ativa e a dashboard usavam o mesmo par consistente de `sessionContextId` e `integrationAccountId`.
- O mesmo fluxo mostrou que a chamada subsequente de `GET /v1/manifestos` saiu com o mesmo `sessionContextId`, mas com outro `integrationAccountId`, produzindo `400 Bad Request` por mismatch.
- A validacao da fase `01-source-validation` confirmou que o backend estava correto ao rejeitar a combinacao inconsistente e que a ownership do defeito era de frontend.

### Causa raiz

- `frontend/src/stores/manifests.js` reidratava `filters.integrationAccountId` a partir de filtros persistidos e do estado salvo de conta ativa, permitindo reaproveitar um valor antigo de outra conta.
- A busca de manifestos so caia no contexto ativo do `authStore` quando `filters.integrationAccountId` estivesse vazio; quando ja vinha preenchido com valor stale, o request seguia incorreto.
- `frontend/src/views/ManifestsView.vue` tambem aceitava `route.query.integrationAccountId` sem validar aderencia ao contexto operacional ativo, reintroduzindo o mismatch ao navegar para `/manifestos`.

## Correcao implementada

- A store de manifestos passou a priorizar explicitamente o contexto operacional ativo do `authStore` ao resolver o `integrationAccountId` inicial.
- Antes de montar `GET /v1/manifestos`, a busca agora executa sincronizacao explicita com o contexto ativo.
- A view de manifestos passou a aceitar `integrationAccountId` vindo da rota apenas quando o valor coincide com a conta operacional ativa ou quando ainda nao existe contexto pronto.
- Valores stale herdados de rota e `localStorage` deixaram de prevalecer sobre a sessao ativa.
- A regra backend de ownership entre `sessionContextId` e `integrationAccountId` foi mantida intacta.

## Arquivos alterados na entrega

- `frontend/src/stores/manifests.js`
- `frontend/src/views/ManifestsView.vue`
- `frontend/tests/ui/manifest-account-context.spec.js`
- `docs/handoffs/frontend-manifest-search-account-mismatch/06-frontend-ux.md`
- `docs/handoffs/frontend-manifest-search-account-mismatch/09-qa-validation.md`
- `docs/handoffs/frontend-manifest-search-account-mismatch/10-documentation-final.md`

## Endpoints e contratos envolvidos

- `POST /v1/sicat/auth/login`
- `GET /v1/sicat/session`
- `POST /v1/sicat/cetesb-accounts/{accountId}/activate`
- `GET /v1/dashboard/overview`
- `GET /v1/manifestos`

### Decisao de contrato

- Nenhum contrato backend foi alterado.
- O `400` em `GET /v1/manifestos` para par inconsistente permaneceu como comportamento correto e desejado.

## Prova final de QA

- A fase `09-qa-validation` validou o cenario alvo com UI real e interceptacao dos endpoints relevantes.
- O teste `frontend/tests/ui/manifest-account-context.spec.js` simulou simultaneamente:
  - sessao autenticada com `integrationAccountId` ativo;
  - `localStorage` com `sicat_manifest_list_filters.integrationAccountId` stale;
  - navegacao para `/manifestos?integrationAccountId=<stale>`.
- O primeiro `GET /v1/manifestos` observado no teste usou o par correto do contexto ativo:

```json
{
  "integrationAccountId": "acc_active_qa_001",
  "sessionContextId": "scx_active_qa_001",
  "status": "submitted"
}
```

- Isso fecha a evidencia pedida pela demanda: a tela de manifestos agora usa a sessao/conta ativa mesmo quando rota e persistencia local carregam valores antigos.

## Comandos e validacoes consolidados

- `npm run build` em `frontend/`
- diagnostico do workspace nos arquivos alterados de frontend
- `npm run smoke:health`
- execucao de validacao automatizada focada do fluxo de manifestos com cobertura Playwright em `frontend/tests/ui/manifest-account-context.spec.js`
- `npm run test:ui -- tests/ui/manifests-resync.spec.js`

## Issue residual fora de escopo

- A validacao adjacente em `frontend/tests/ui/manifests-resync.spec.js` falhou no caso `manifesto impresso permanece cancelavel e com status visual de sucesso`.
- Divergencia observada: o teste ainda esperava `Sucesso`, enquanto a UI exibiu `salvo` no badge.
- Essa falha foi classificada em QA como nao causal e fora do escopo desta demanda, porque nao altera a prova de que `GET /v1/manifestos` agora usa o par ativo correto de sessao e conta.

## Riscos residuais

- A prova final foi feita com teste de UI automatizado e mocks de sessao/contexto operacional; nao houve reproducao navegador-a-navegador com credenciais CETESB reais nesta fase final.
- Fluxos futuros que introduzam novos pontos de persistencia ou novos query params para conta ativa podem reabrir divergencia se nao reutilizarem a mesma sincronizacao com o contexto operacional.
- O desalinhamento de rotulo visual coberto por `frontend/tests/ui/manifests-resync.spec.js` continua pendente de triagem propria.

## Encerramento

- Root cause encerrada: prevalencia indevida de `integrationAccountId` stale no frontend.
- Correcao encerrada: sincronizacao obrigatoria da busca de manifestos com o contexto operacional ativo.
- QA alvo encerrado: request de manifestos comprovadamente alinhado ao par ativo `sessionContextId + integrationAccountId`.
