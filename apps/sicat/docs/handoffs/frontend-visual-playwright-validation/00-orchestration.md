# 00 - Orchestration

## Demanda resumida
Usuário reporta ausência de diferenças recentes e solicita validação completa com Playwright, com inspeção visual de todas as telas e confirmação de todos os erros/itens pedidos anteriormente (fontes, espaçamento, quebras de layout, padrão Vuexy).

## Classificação
```yaml
orchestration:
  work_id: "frontend-visual-playwright-validation"
  intent: "validate"
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
      reason: "garantir stack local executável para navegação e captura visual via Playwright"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "executar Playwright em todas as telas e registrar evidências de falhas visuais"
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "corrigir achados visuais confirmados por evidência"
    - phase: "09-rerun-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "reexecutar Playwright e confirmar fechamento dos achados"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar evidências, resultados e status final"
```

## Critérios de pronto
- Stack local disponível para API + frontend durante execução dos testes.
- Cobertura visual de telas principais por Playwright com evidências (logs/screenshots).
- Todos os erros visuais críticos reportados com reprodução, impacto e status.
- Correções aplicadas para achados confirmados.
- Revalidação Playwright sem pendências críticas abertas.
- Handoff final consolidado.

## Checkpoints esperados
- 09-qa-validation.md
- 06-frontend-ux.md
- 09-rerun-validation.md
- 10-documentation-final.md
