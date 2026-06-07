# Validation Report — DL-017

## Validações executadas
- `node --test tests/unit/cetesb-gateway.test.js` ✅
- `node --test tests/unit/retry.test.js tests/unit/job-runner-failure.test.js` ✅
- `node --test tests/unit/manifest-validator.test.js` ✅
- `node --test tests/integration/job-queue-improvements.test.js` ✅
- `npm run validate:openapi` ✅
- `npm run test:contract` ✅
- `npm run smoke:health` ✅
- `npm run smoke:openapi` ✅ (com `SMOKE_BASE_URL=http://localhost:8081`)

## Observações de ambiente
- `localhost:8080` ocupado por processos do host (`wslrelay`/`com.docker.backend`), impedindo boot da API local nessa porta.
- Smoke OpenAPI executado contra instância temporária da API em `8081` para validação do código atualizado.

## Resultado final
- Escopo do DL-017 validado com sucesso para código, contrato, aderência HAR e documentação.
