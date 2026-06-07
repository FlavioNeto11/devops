# 00 - Orchestration

## Demanda resumida

Implementar uma experiencia dedicada de `Relatorio dos MTRs` no SICAT como primeira fatia de paridade SIGOR, reaproveitando o contrato atual de listagem filtrada de manifestos e separando consulta orientada a relatorio da listagem operacional existente.

## Classificacao

```yaml
orchestration:
  work_id: "manifest-report-workspace"
  intent: "implement"
  complexity: "moderate"
  domains:
    - "frontend-ux"
    - "backend-contract"
    - "qa"
    - "docs"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "entregar a nova view/workspace de relatorio dos MTRs sobre a base contratual existente"
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: false
      reason: "acionar somente se a implementacao revelar gap real no contrato atual para filtros ou leitura esperada"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar a nova experiencia de relatorio e regressao basica da listagem operacional"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "registrar escopo entregue, limites deliberados e proximos passos da paridade"
```

## Fontes de verdade iniciais

- `docs/handoffs/sigor-parity-backlog/10-documentation-final.md`
- `docs/handoffs/sigor-sicat-gap-map/10-documentation-final.md`
- `docs/handoffs/sigor-sicat-gap-map/06-frontend-ux.md`
- `docs/handoffs/sigor-sicat-gap-map/03-backend-contracts.md`

## Escopo alvo da primeira entrega

- view dedicada de `Relatorio dos MTRs`
- filtros focados em periodo e contrapartes suportadas pelo contrato atual
- tabela orientada a consulta, distinta da listagem operacional de manifestos
- sem incluir DMR, exportacoes complexas, relatorio de armazenamento temporario ou variantes especializadas nesta primeira fatia

## Criterios de pronto

- existe uma experiencia dedicada e claramente separada da listagem operacional
- a view usa apenas contratos ja publicados ou registra explicitamente bloqueio de contrato
- a navegacao e nomenclatura deixam claro o recorte desta primeira fatia
- QA cobre fluxo principal e ausencia de regressao evidente na listagem atual

## Checkpoints esperados

- `docs/handoffs/manifest-report-workspace/06-frontend-ux.md`
- `docs/handoffs/manifest-report-workspace/03-backend-contracts.md` se necessario
- `docs/handoffs/manifest-report-workspace/09-qa-validation.md`
- `docs/handoffs/manifest-report-workspace/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `frontend-vue-ux-mtr`.

Objetivo: implementar a primeira fatia de paridade SIGOR no SICAT por meio de um workspace dedicado de `Relatorio dos MTRs`, priorizando reaproveitamento do contrato atual e baixo acoplamento com dominios ainda ausentes como DMR e provisórios.