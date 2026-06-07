---
name: revisar-contrato-openapi
description: 'Revisa consistência entre OpenAPI, exemplos, rotas e implementação.'
agent: orquestrador-mtr
argument-hint: "Informe endpoint ou diga 'revisão geral'"
---

# Revisar Contrato OpenAPI

**Contexto:** revisar consistência entre OpenAPI, exemplos, rotas e implementação.

**Agente:** `orquestrador-mtr`

**Leitura obrigatória:**
- `docs/copilot/06-contrato-openapi.md`
- `docs/copilot/09-roadmap.md`

## Escopo

${input:escopo:Endpoint específico ou 'revisão geral'}

## Áreas de validação

${input:validation_areas:Áreas a validar (YAML syntax, Examples, Generated operations, Rotas, Shape das responses)}

Valide:
1. YAML
2. examples
3. generated operations
4. rotas
5. shape real das responses

Depois, corrija inconsistências e documente o que mudou.

Se houver impacto em múltiplas camadas, delegue em ordem:
1. `programador-backend-mtr` (código/rotas)
2. `tester-qa-mtr` (contrato + smoke)
3. `documentador-mtr` (registro e contexto)
