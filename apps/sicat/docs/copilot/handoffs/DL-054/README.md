# DL-054 - Validador estrutural HAR→Gateway

## Contexto
A validação existente garantia presença de HARs e referências a `docs/cetesb`, mas não verificava a aderência estrutural entre payloads/evidências reais e o mapeamento do gateway CETESB.

## Objetivo
Implementar um validador automático HAR→Gateway em `scripts/` com teste unitário dedicado para reduzir regressões de integração.

## Entregas
- `scripts/har-gateway-structural-validator.js`
- `scripts/validate-har-gateway-structure.js`
- `tests/unit/har-gateway-structural-validator.test.js`
- Atualizações em `package.json` para execução contínua nas rotinas de validação.

## Execução
- `npm run validate:har-gateway`
- `npm run test:source-of-truth`
- `npm run validate:cetesb-source`

## Referências
- Decision log: [`docs/copilot/13-decision-log.md#dl-054`](../../13-decision-log.md#dl-054)
- Estrutura: [`docs/copilot/14-estrutura-copilot.md`](../../14-estrutura-copilot.md)
