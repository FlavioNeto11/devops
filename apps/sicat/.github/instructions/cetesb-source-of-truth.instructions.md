---
applyTo: ".github/**,.vscode/**,certs/**,docs/**,examples/**,openapi/**,scripts/**,src/**,storage/**,tests/**"
---
## Fonte da verdade CETESB (obrigatória)

- A pasta `docs/cetesb/` é a fonte primária de evidência real para integração CETESB.
- Sempre que houver mudança em contrato, payload, parsing, exemplos ou testes, validar aderência aos HARs em `docs/cetesb/`.
- Não introduzir comportamento de integração baseado apenas em suposição sem registrar como hipótese.
- Toda inferência deve ser explicitada em documentação (`docs/copilot/`) e decisão técnica (`docs/copilot/13-decision-log.md`).
- Em caso de conflito entre implementação atual e evidência HAR, priorizar a evidência e ajustar OpenAPI/examples/código/testes.
