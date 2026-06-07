# 00 - Orchestration

## Demanda resumida

Comparar o conhecimento adquirido na auditoria real do SIGOR MTR com as telas e componentes atuais do SICAT, identificar diferencas, lacunas e features adicionais, e montar um mapa claro de cobertura, divergencia e backlog funcional.

## Classificacao

```yaml
orchestration:
  work_id: "sigor-sicat-gap-map"
  intent: "document"
  complexity: "moderate"
  domains:
    - "source-validation"
    - "frontend-ux"
    - "backend-contract"
    - "docs"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "comparar a superficie autenticada auditada no SIGOR com as views, componentes e fluxos expostos no frontend do SICAT"
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: false
      reason: "so deve ser acionado se a comparacao revelar gaps de contrato/API que impeçam a cobertura da UI mapeada"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar o mapa final SIGOR vs SICAT com diferencias, faltantes e extras"
```

## Fontes de verdade iniciais

- `docs/handoffs/cetesb-platform-complete-navigation/01-source-validation.md`
- `docs/handoffs/cetesb-platform-complete-navigation/10-documentation-final.md`
- `frontend/src/views/**`
- `frontend/src/components/**`
- arquivos de fluxo CETESB/SICAT correlacionados no frontend e backend quando necessario

## Criterios de pronto

- mapear quais modulos/telas do SIGOR estao representados no SICAT
- explicitar o que o SICAT adiciona alem do portal original
- explicitar o que ainda falta ou diverge no SICAT em relacao ao SIGOR auditado
- separar cobertura ja implementada, cobertura parcial, ausencias e extras
- entregar um mapa final reutilizavel para orientar backlog e alinhamento funcional

## Checkpoints esperados

- `docs/handoffs/sigor-sicat-gap-map/06-frontend-ux.md`
- `docs/handoffs/sigor-sicat-gap-map/03-backend-contracts.md` apenas se a analise exigir
- `docs/handoffs/sigor-sicat-gap-map/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `frontend-vue-ux-mtr`.

Objetivo da fase 06: ler o mapa consolidado do SIGOR, inspecionar as views/componentes atuais do SICAT e produzir uma comparacao estruturada entre superficie do portal, superficie do produto e gaps por fluxo.