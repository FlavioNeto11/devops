# Orquestração

## Demanda resumida

Implementar uma homepage pública (sem login) antes da aplicação autenticada, com landing page premium, storytelling completo da jornada do manifesto, seções funcionais solicitadas e CTA para acesso ao login existente, preservando o fluxo atual de autenticação.

## Classificação

```yaml
orchestration:
  work_id: "public-homepage-prelogin-landing"
  intent: "implement"
  complexity: "complex"
  domains:
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "Construir landing pública responsiva e moderna integrada às rotas/layout reais sem quebrar autenticação."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "Validar build/lint/testes disponíveis e regressão básica de login/autenticação."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar mudanças, evidências e handoff final."
```

## Critérios de pronto

- rota pública inicial exibe landing page premium sem autenticação;
- rota/login atual continua funcional e sem regressão;
- landing inclui todas as seções e mensagens funcionais solicitadas (IA, agendamento, baixa automática/compartilhada, NFC, real-time, antifraude, rastreabilidade);
- design responsivo mobile-first com componentes visuais performáticos e microinterações;
- build/lint/testes disponíveis executados com evidências em checkpoint de QA.

## Checkpoints esperados

- `docs/handoffs/public-homepage-prelogin-landing/06-frontend-ux.md`
- `docs/handoffs/public-homepage-prelogin-landing/09-qa-validation.md`
- `docs/handoffs/public-homepage-prelogin-landing/10-documentation-final.md`
