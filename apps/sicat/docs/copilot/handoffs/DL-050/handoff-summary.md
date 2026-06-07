# Handoff Summary - DL-050

## Handoff 1/4 - Backend
- Ajustado `handleManifestSubmit` para diferenciar:
  - submit confirmado (`submitted`) quando há `manCodigo` e `manNumero`;
  - submit pendente (`processing`) quando CETESB retornou apenas hash e ainda não confirmou referência final.
- Mantida persistência de `externalHashCode` para reconciliação posterior.

## Handoff 2/4 - Backend (Ressync)
- `listManifests` passa a degradar graciosamente para dados locais em erros CETESB 5xx/rede/retry exhausted, incluindo chamadas com `forceSync=true`.

## Handoff 3/4 - Frontend
- Store de manifestos deixa de iniciar com `dateFrom/dateTo` no dia atual.
- Evita ocultação involuntária de manifestos antigos (ex.: cancelados no dia 07).

## Handoff 4/4 - Validação e fechamento
- Teste unitário do worker de submit executado com sucesso.
- Build do frontend executado com sucesso.
- Testes de integração dependentes de autenticação CETESB real apresentaram 401 no ambiente e foram registrados como limitação ambiental.
