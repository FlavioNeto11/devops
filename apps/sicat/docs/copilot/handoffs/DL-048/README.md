# DL-048 - Degradação graciosa de `/v1/manifestos` em erro 5xx CETESB

## Contexto
Após DL-046 e DL-047, ainda houve ocorrência de erro 500 da CETESB no endpoint `pesquisaManifesto` mesmo com `kind=0`, causando propagação de falha (`502`) na API interna durante listagem de manifestos.

## Decisão
Aplicar degradação graciosa no serviço de listagem (`listManifests`) para fluxo padrão (`forceSync=false`):
- tenta sincronização remota com CETESB;
- se CETESB responder com falha elegível (5xx/rede/retry exhausted), retorna paginação local (cache/estado interno) em vez de quebrar o endpoint;
- quando `forceSync=true`, mantém comportamento estrito com erro explícito.

## Mudanças técnicas
- `src/services/manifest-service.js`
  - bloco remoto de `gateway.searchManifests(...)` encapsulado em `try/catch`;
  - classificação de erro para degradação segura;
  - retorno de `toPagedResponse(...)` local quando aplicável.
- `tests/unit/cetesb-gateway.test.js`
  - cobertura para fallback de `lookupManifestByHash` (`kind=all -> kind=0`) mantida e validada.

## Resultado esperado
- Falhas transitórias/5xx da CETESB não derrubam `/v1/manifestos` no fluxo comum.
- UX permanece funcional com dados locais enquanto integração externa está instável.

## Validações
- `node --test tests/unit/cetesb-gateway.test.js` ✅ (8/8)

## Riscos residuais
- Em indisponibilidade prolongada da CETESB, a lista poderá ficar desatualizada até próxima sincronização bem-sucedida.

## Próximos passos sugeridos
1. Adicionar teste de integração determinístico para simular CETESB 5xx em `/v1/manifestos` sem dependência do fluxo real de autenticação.
2. Expor métrica/contador de respostas degradadas para observabilidade operacional.
