# 00 - Orchestration

## Demanda resumida
Subir o ambiente local completo (frontend, worker e API), revisar e sanear as tasks do VS Code removendo entradas desatualizadas/obsoletas, criar uma task única confiável para colocar toda a stack no ar e executar validação completa com evidências objetivas de funcionamento.

## Classificação
```yaml
orchestration:
  work_id: "localhost-stack-validation-tasks"
  intent: "operate"
  complexity: "complex"
  domains:
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "estrutura-vscode-mtr"
  phase_sequence:
    - phase: "localhost-availability"
      agent: "estrutura-vscode-mtr"
      required: true
      reason: "subir stack local completa e revisar tasks/launch do VS Code"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "validar API, worker e frontend com evidências de funcionamento e smoke visual/operacional"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar tasks finais, evidências e status operacional"
```

## Critérios de pronto
- Ambiente local com Postgres, API, worker e frontend operacionais.
- Task do VS Code para subir a stack local completa funcionando de ponta a ponta.
- Tasks desatualizadas/obsoletas revisadas e removidas quando aplicável.
- Evidências objetivas de validação funcional (health, worker, frontend e smoke/testes relevantes).
- Handoff final consolidado com instruções de uso.

## Checkpoints esperados
- 01-localhost-availability.md
- 09-qa-validation.md
- 10-documentation-final.md
