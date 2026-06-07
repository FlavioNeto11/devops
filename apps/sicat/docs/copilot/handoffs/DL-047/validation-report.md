# Validation Report — DL-047

## Comandos executados

```bash
node --test tests/unit/cetesb-gateway.test.js
```

## Resultado
- `tests/unit/cetesb-gateway.test.js`: ✅ 8/8 passou
- Inclui cenário novo de fallback no `lookupManifestByHash`

## Observações
- Fix concentrado no gateway real CETESB e sem alteração de contrato OpenAPI.
