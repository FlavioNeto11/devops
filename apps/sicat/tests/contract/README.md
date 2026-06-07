# Testes de Contrato - Autenticação

Validação de schemas OpenAPI para endpoints de autenticação.

## Execução

### Pré-requisito
```bash
# Iniciar backend em modo real
npm run dev
```

### Executar Testes
```bash
# Todos os testes de contrato
node --test tests/contract/auth-contract.test.js

# Com output verboso
node --test --test-reporter=spec tests/contract/auth-contract.test.js
```

## Cobertura

- ✅ POST /v1/auth/login retorna 200 com schema válido
- ✅ RecaptchaToken é opcional
- ✅ Validação de campos obrigatórios (document, password)
- ✅ Erros retornam 400 com application/problem+json
- ✅ Token JWT válido (3 partes)
- ✅ ExpiresAt em formato ISO 8601 e no futuro

## Resultado Esperado

```
✔ Auth Contract Tests (9/9 testes)
ℹ tests 9
ℹ pass 9
ℹ fail 0
```
