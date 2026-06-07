# 00 - Orchestration

## Demanda original (resumo)

Iniciar todo o SICAT e executar as etapas necessarias de bootstrap para deixar o ambiente pronto para testes.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "stack-bootstrap-tests"
  intent: "operate"
  complexity: "moderate"
  domains:
    - "ci"
    - "qa"
  first_agent: "ci-cd-github-mtr"
  phase_sequence:
    - phase: "11-release-readiness"
      agent: "ci-cd-github-mtr"
      required: true
      reason: "A demanda e operacional: subir infraestrutura, API, worker e frontend usando os workflows/tarefas oficiais do workspace para preparar o ambiente de testes."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: false
      reason: "Se a fase operacional concluir com o stack no ar, a validacao de prontidao pode ser detalhada pelo owner de QA quando necessario."
```

## Critérios de pronto

- Postgres, API, worker e frontend iniciados pelo fluxo oficial do workspace;
- endpoints/portas relevantes reportados para teste;
- falhas de bootstrap, se houver, ficam registradas com causa e proximo owner.

## Checkpoints esperados

- `docs/handoffs/stack-bootstrap-tests/00-orchestration.md`
- `docs/handoffs/stack-bootstrap-tests/11-release-readiness.md`

## Handoff imediato

Proximo agente obrigatorio: `ci-cd-github-mtr`.

Objetivo da fase 11: usar as tasks/workflows oficiais do workspace para preparar e subir o stack completo do SICAT para testes, reportando o estado final do ambiente.