# Orchestration

```yaml
orchestration:
  work_id: "enforce-agent-delegation"
  intent: "meta"
  complexity: "complex"
  domains:
    - "docs"
    - "ci"
  first_agent: "meta-evolution-copilot"
  phase_sequence:
    - phase: "10-documentation-final"
      agent: meta-evolution-copilot
      required: true
      reason: "A demanda é corrigir a estrutura Copilot para tornar a delegação obrigatória e evitar execução direta indevida pelo agente principal."
    - phase: "11-release-readiness"
      agent: ci-cd-github-mtr
      required: true
      reason: "A solicitação atual é publicar tudo no repositório, o que exige ownership explícito de commit/push fora do orquestrador."
```

- Demanda original resumida: corrigir a estrutura de agentes/instruções para que execuções amplas não sejam conduzidas diretamente pelo agente principal quando houver especialistas apropriados.
- Work ID: `enforce-agent-delegation`
- Sequência de fases: análise da estrutura Copilot, endurecimento das regras de delegação, validação da arquitetura, documentação final e publicação operacional.
- Agentes responsáveis: `orquestrador-mtr` na abertura, `meta-evolution-copilot` na implementação da correção e `ci-cd-github-mtr` na publicação operacional.
- Critérios de pronto:
  - regras explícitas impedem o agente principal de executar diretamente demandas multi-etapa quando houver especialista apropriado;
  - prompts/agentes/instruções relevantes refletem delegação obrigatória;
  - validações da arquitetura continuam passando;
  - resultado documentado neste work_id;
  - mudanças publicadas no repositório pelo owner operacional apropriado.
- Checkpoints esperados:
  - `docs/handoffs/enforce-agent-delegation/00-orchestration.md`
  - `docs/handoffs/enforce-agent-delegation/10-documentation-final.md`