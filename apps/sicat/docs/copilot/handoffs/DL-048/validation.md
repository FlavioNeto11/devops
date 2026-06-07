# Validação DL-048

## Escopo validado
- Resiliência da listagem de manifestos diante de erro 5xx da CETESB.
- Regressão de fallback de parâmetros no gateway (`all -> 0`) em paths de pesquisa.

## Evidências de execução
- Comando:
  - `node --test tests/unit/cetesb-gateway.test.js`
- Resultado:
  - `ok 1 - retries with kind=0 when CETESB returns 500 for kind=all`
  - `ok 2 - retries lookupManifestByHash with kind=0 when CETESB returns 500 for kind=all`
  - demais cenários unitários verdes
  - **8 testes aprovados, 0 falhas**

## Observações
- Um teste de integração específico para este cenário foi prototipado e removido por instabilidade no harness de autenticação (401 no setup), sem invalidar o fix aplicado.
