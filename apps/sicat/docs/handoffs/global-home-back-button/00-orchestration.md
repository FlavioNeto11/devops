# Orchestration - global-home-back-button

## Demanda resumida
Adicionar em todo o SICAT um botao discreto e elegante para voltar para a home publica, posicionado em local estrategico e consistente entre telas, sem quebrar navegacao existente.

## Classificacao obrigatoria
```yaml
orchestration:
  work_id: "global-home-back-button"
  intent: "implement"
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
      reason: "Implementar botao global de retorno para home em ponto estrategico e discreto."
    - phase: "09-qa-validation"
      agent: tester-qa-mtr
      required: true
      reason: "Validar presenca do botao nas telas relevantes e navegacao correta para /."
    - phase: "10-documentation-final"
      agent: documentador-mtr
      required: true
      reason: "Consolidar escopo entregue e evidencias de validacao."
```

## Criterios de pronto
- Botao para voltar a home disponivel em todas as telas relevantes do SICAT.
- Aparencia discreta/elegante e posicionamento estrategico sem poluir UI.
- Funciona em light/dark e mobile/desktop.
- Nao interfere com autenticacao, rotas existentes e interacoes principais.
- Build frontend aprovado.

## Checkpoints esperados
- `docs/handoffs/global-home-back-button/06-frontend-ux.md`
- `docs/handoffs/global-home-back-button/09-qa-validation.md`
- `docs/handoffs/global-home-back-button/10-documentation-final.md`
