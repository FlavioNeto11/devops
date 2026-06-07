# Orquestração

## Demanda resumida

Corrigir o botão de ressincronização da CETESB para executar automaticamente o processo esperado de limpeza e recarga de manifestos, sem necessidade de execução manual via scripts/copilot.

## Classificação

```yaml
orchestration:
  work_id: "cetesb-resync-button-manifest-reset"
  intent: "fix"
  complexity: "moderate"
  domains:
    - "domain-rules"
    - "backend-contract"
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "manifestos-operacional-mtr"
  phase_sequence:
    - phase: "05-domain-rules"
      agent: "manifestos-operacional-mtr"
      required: true
      reason: "Garantir regra operacional correta para ressincronização de manifestos CETESB."
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: false
      reason: "Ajustar endpoint/serviço se necessário para limpar e recarregar manifestos."
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: false
      reason: "Garantir que o botão dispara o fluxo correto e feedback visual ao usuário."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "Validar ressinc completo sem intervenção manual."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar resultado e evidências da correção."
```

## Critérios de pronto

- botão `Ressinc. CETESB` executa o fluxo completo esperado;
- manifestos locais são substituídos por dados de integração sem limpeza manual separada;
- usuário recebe feedback de sucesso/erro no fluxo;
- validação QA comprovando funcionamento ponta a ponta.