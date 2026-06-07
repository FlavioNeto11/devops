# Testes de submit de manifesto

## Objetivo

Validar o fluxo de `/v1/manifestos/:id/submit` nas camadas de API, serviço e worker.

## Execução

```powershell
docker compose up -d postgres
npm install
npm run migrate
npm run test:manifest:submit
```

## Escopo coberto

- criação de job de submit
- reaproveitamento de `sessionContextId`
- propagação de `correlationId`
- persistência de referências externas retornadas
- retry e auditoria no worker

## Limitações conhecidas

- reCAPTCHA não é automatizado nos testes
- renovação de token e concorrência multi-worker exigem validação manual
- cenários de instabilidade da CETESB devem ser cobertos com smoke real e observabilidade

## Referências

- `tests/README.md`
- `tests/manifest-submit-summary.md`
