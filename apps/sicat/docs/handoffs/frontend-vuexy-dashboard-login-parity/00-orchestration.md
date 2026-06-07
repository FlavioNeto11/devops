# Orquestração

## Demanda resumida

Adequar o visual do SICAT para ficar próximo ao Vuexy demo-6 nas áreas:

- dashboard: referência CRM e Analytics;
- login SICAT e login CETESB: referência Login demo-6.

## Classificação

```yaml
orchestration:
  work_id: "frontend-vuexy-dashboard-login-parity"
  intent: "refactor"
  complexity: "moderate"
  domains:
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "Aplicar paridade visual dos dashboards e logins com as referências Vuexy demo-6."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "Validar paridade visual e regressão de navegação."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar evidências e resultado final da entrega."
```

## Critérios de pronto

- Dashboard com composição visual próxima dos demos CRM/Analytics (cards, métricas, blocos analíticos, spacing, tipografia e hierarquia).
- Login SICAT e login CETESB com composição próxima do demo login (split visual, painel de autenticação, campos e ações no padrão).
- Sem regressão funcional de autenticação e navegação.