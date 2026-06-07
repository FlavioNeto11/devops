# DL-045 — Auto preenchimento de Código parceiro CETESB

## Status
- ✅ COMPLETADO em 2026-03-13

## Objetivo
Restaurar o comportamento de auto preenchimento do campo `Código parceiro` na etapa `Selecionar Conta CETESB`, quando o `Login CETESB` for CNPJ/CPF válido.

## Escopo
- Reintrodução de lookup para `GET /v1/auth/partner-info`
- Auto preenchimento de `partnerCode` e e-mail no formulário de conta nova CETESB
- Atualização de mocks e validação smoke responsiva

## Referências
- `docs/copilot/13-decision-log.md#dl-045`
- `docs/copilot/14-estrutura-copilot.md`
