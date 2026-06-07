## Demanda resumida

- Usuário reporta que a tela de Manifestos continua exibindo erro de intervalo de datas (`0 dias`) e pediu validação prática com Playwright até funcionar.

## Classificação

```yaml
orchestration:
  work_id: "manifestos-intervalo-zero-playwright"
  intent: "validate"
  complexity: "moderate"
  domains:
    - "frontend-ux"
    - "backend-contract"
    - "qa"
    - "docs"
  first_agent: "tester-qa-mtr"
  phase_sequence:
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "Reproduzir erro com Playwright e validar comportamento real da tela de Manifestos."
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: false
      reason: "Aplicar ajuste em serviço/rota se QA confirmar falha no fluxo remoto CETESB."
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: false
      reason: "Ajustar comportamento da UI/estado de filtros se QA confirmar regressão visual/interação."
    - phase: "09-qa-validation-retest"
      agent: "tester-qa-mtr"
      required: true
      reason: "Retestar com Playwright após correções até eliminar erro e restaurar Aplicar Filtros."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: false
      reason: "Registrar evidências finais e handoff da cadeia."
```

## Critérios de pronto

- Fluxo Playwright da tela de Manifestos executa sem exibir erro de intervalo `0 dias` na abertura.
- Botão `Aplicar Filtros` dispara busca com retorno consistente.
- Evidências de QA anexadas no checkpoint de validação.

## Checkpoints esperados

- `docs/handoffs/manifestos-intervalo-zero-playwright/09-qa-validation.md`
- (se necessário) `docs/handoffs/manifestos-intervalo-zero-playwright/03-backend-contracts.md`
- (se necessário) `docs/handoffs/manifestos-intervalo-zero-playwright/06-frontend-ux.md`
- `docs/handoffs/manifestos-intervalo-zero-playwright/10-documentation-final.md`
