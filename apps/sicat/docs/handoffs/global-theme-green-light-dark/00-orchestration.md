# Orchestration - global-theme-green-light-dark

## Demanda resumida
Aplicar no frontend inteiro do SICAT o mesmo direcionamento de cor esverdeado adotado na homepage, substituindo a predominancia roxa anterior, preservando suporte completo a modo light e modo dark em toda a aplicacao (incluindo home).

## Classificacao obrigatoria
```yaml
orchestration:
  work_id: "global-theme-green-light-dark"
  intent: "refactor"
  complexity: "complex"
  domains:
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: frontend-vue-ux-mtr
      required: true
      reason: "Refatorar tokens/tema global para paleta esverdeada com paridade light/dark sem quebrar UI existente."
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: "Validar cobertura visual em telas principais e alternancia light/dark sem regressao."
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: "Consolidar decisoes de tema, escopo aplicado e evidencias de QA."
```

## Criterios de pronto
- Paleta global do SICAT alinhada com a linguagem esverdeada da home (reduzindo roxo dominante).
- Modo light e modo dark funcionais e coerentes em toda a aplicacao.
- Home preservada com a nova assinatura visual e sem regressao.
- Build do frontend aprovado.
- QA visual aprovado em rotas principais com toggle de tema.

## Checkpoints esperados
- `docs/handoffs/global-theme-green-light-dark/06-frontend-ux.md`
- `docs/handoffs/global-theme-green-light-dark/09-qa-validation.md`
- `docs/handoffs/global-theme-green-light-dark/10-documentation-final.md`
