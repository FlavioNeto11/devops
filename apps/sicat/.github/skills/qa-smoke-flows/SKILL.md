# Skill: QA Smoke Flows

## Quando usar
Use esta skill para validar os fluxos críticos do sistema mesmo sem ambiente E2E completo.

## Arquivos principais
- `tests/`
- `scripts/smoke-health.js`
- `scripts/smoke-openapi.js`
- `scripts/smoke-manifest-create.js`
- `docs/copilot/11-checklist-qa.md`

## Fluxos prioritários
- criar session context
- criar manifesto
- enfileirar submit
- enfileirar print
- enfileirar cancel
- enfileirar catalog sync
- consultar job
- baixar documento gerado

## Entrega mínima
- matriz de cenários
- smoke tests automatizados quando possível
- checklist manual para o que depender de ambiente externo
