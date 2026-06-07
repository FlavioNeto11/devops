# Orchestration - homepage-theme-toggle-contrast-fix

## Demanda resumida
Adicionar na homepage publica um botao de alternancia de tema claro/escuro e corrigir contraste do texto "Explorar demo" no tema claro para garantir legibilidade.

## Classificacao obrigatoria
```yaml
orchestration:
  work_id: "homepage-theme-toggle-contrast-fix"
  intent: "fix"
  complexity: "moderate"
  domains:
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: frontend-vue-ux-mtr
      required: true
      reason: "Implementar switch de tema na home e ajustar contraste do CTA no tema claro."
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: "Validar alternancia de tema na home e legibilidade do CTA Explorar demo no tema claro."
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: "Consolidar escopo, evidencias e status final."
```

## Criterios de pronto
- Home publica possui controle de alternancia light/dark funcional.
- Tema alterna de forma consistente com o estado global da aplicacao.
- Texto/CTA "Explorar demo" fica legivel no tema claro (contraste adequado).
- Build do frontend aprovado.

## Checkpoints esperados
- docs/handoffs/homepage-theme-toggle-contrast-fix/06-frontend-ux.md
- docs/handoffs/homepage-theme-toggle-contrast-fix/09-qa-validation.md
- docs/handoffs/homepage-theme-toggle-contrast-fix/10-documentation-final.md
