# 00 - Orchestration

## Demanda resumida

Corrigir todos os problemas encontrados na auditoria navegacional anterior e executar nova validacao ate nao haver achados bloqueantes, incluindo teste de consistencia do chat operacional para pedidos variados.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "navigation-chat-full-remediation"
  intent: "fix"
  complexity: "complex"
  domains:
    - "frontend-ux"
    - "backend-contract"
    - "qa"
    - "docs"
  first_agent: "frontend-vue-ux-mtr"
  phase_sequence:
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "corrigir problemas de filtros por periodo, feedback de validacao e navegabilidade mapeados na auditoria"
    - phase: "03-backend-contracts"
      agent: "programador-backend-mtr"
      required: true
      reason: "endurecer consistencia conversacional do chat para pedidos variados quando necessario"
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "retestar sistema inteiro e chat com cobertura ampla ate ausencia de achados bloqueantes"
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "consolidar evidencias finais, correcoes aplicadas e decisao aprovado/bloqueado"
```

## Escopo minimo de correcao

1. Validacao de periodo invertido com feedback explicito em manifestos, relatorio e CDF emitidos.
2. Coerencia de resultados em recorte amplo versus recorte curto para buscas por data.
3. Feedback de permissao insuficiente em acesso administrativo (sem redirecionamento silencioso).
4. Reducao de ruido tecnico em fluxos CDF (erros de console nao bloqueantes, quando aplicavel).
5. Consistencia do chat para pedidos variados (consulta simples, filtrada, composta, follow-up contextual, acoes seguras).

## Criterios de pronto

- Achados de severidade alta/media da auditoria anterior resolvidos ou reclassificados com evidencia tecnica.
- Reteste navegacional e de datas sem regressao funcional.
- Chat testado com variedade de pedidos, com respostas coerentes e sem quebras operacionais.
- Validacoes obrigatorias verdes: lint, typecheck, test, build:ts e quality:gate.

## Checkpoints esperados

- docs/handoffs/navigation-chat-full-remediation/00-orchestration.md
- docs/handoffs/navigation-chat-full-remediation/06-frontend-ux.md
- docs/handoffs/navigation-chat-full-remediation/03-backend-contracts.md
- docs/handoffs/navigation-chat-full-remediation/09-qa-validation.md
- docs/handoffs/navigation-chat-full-remediation/10-documentation-final.md

## Cadeia imediata iniciada

1. frontend-vue-ux-mtr: corrigir problemas de UX/validacao de datas e navegabilidade mapeados na auditoria.
