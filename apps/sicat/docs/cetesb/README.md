# Fonte da verdade CETESB

Esta pasta é a **fonte original de evidência real** da integração CETESB para este projeto.

## Evidências disponíveis

- `mtr.cetesb.sp.gov.br_login.har`
- `mtr.cetesb.sp.gov.br_gerar_mtr.har`
- `mtr.cetesb.sp.gov.br_imprimir_mtr.har`
- `mtr.cetesb.sp.gov.br_cancelar_mtr.har`
- `mtr.cetesb.sp.gov.br_criar_cadastro.har`

## Regra obrigatória

Toda decisão de contrato, payload, parsing, validação e mapeamento de integração deve priorizar evidências desta pasta.

Quando houver divergência entre hipótese e evidência:
1. prevalece a evidência em `docs/cetesb/`
2. a hipótese deve ser registrada como hipótese em documentação técnica
3. OpenAPI/examples/código/testes devem ser realinhados

## Uso por camada

- `openapi/`: exemplos e schemas alinhados com os HARs
- `examples/`: payloads representativos derivados dos HARs
- `src/gateways/`: mapeamentos e transformações orientados por evidência
- `tests/`: cenários de sucesso/falha baseados nos fluxos observados
- `scripts/`: validações automáticas de aderência à fonte da verdade
