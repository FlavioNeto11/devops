# 00 - Orchestration

## Demanda original (resumo)

Ajustar a estrutura de navegacao externa auditavel para que bloqueios humanos, como CAPTCHA, ou fechamento acidental da janela/browser nao encerrem o fluxo do GitHub Copilot Chat. Nesses casos, o comportamento desejado e manter a cadeia aberta, registrar estado de espera e responder no chat apenas com a solicitacao objetiva de desbloqueio do usuario para retomada.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "external-nav-chat-wait-state"
  intent: "meta"
  complexity: "simple"
  domains:
    - "docs"
  first_agent: "meta-evolution-copilot"
  phase_sequence:
    - phase: "06-meta-evolution"
      agent: "meta-evolution-copilot"
      required: true
      reason: "A demanda altera a estrutura de agente/prompt da navegacao externa auditavel."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "Confirmar que a nova politica de espera em chat ficou coerente e sem regressao estrutural."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar a regra final de continuidade para bloqueios humanos em navegacao externa."
```

## Resultado esperado

- Atualizar o agente e o prompt de navegacao externa para diferenciar `pausa operacional aguardando desbloqueio` de `encerramento da cadeia`.
- Garantir que CAPTCHA e fechamento de janela gerem mensagem objetiva no chat, mantendo o workstream aberto para retomada.
- Preservar as regras existentes de nao contornar CAPTCHA e nao executar mutacoes irreversiveis sem autorizacao.

## Checkpoints esperados

- `docs/handoffs/external-nav-chat-wait-state/00-orchestration.md`
- `docs/handoffs/external-nav-chat-wait-state/06-meta-evolution.md`
- `docs/handoffs/external-nav-chat-wait-state/09-qa-validation.md`
- `docs/handoffs/external-nav-chat-wait-state/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `meta-evolution-copilot`.

Escopo da fase 06: ajustar a estrutura Copilot relacionada a `.github/agents/auditor-navegacao-externa-mtr.agent.md` e `.github/prompts/auditar-navegacao-cetesb-playwright.prompt.md` para que o estado de espera por desbloqueio do usuario seja explicitamente suportado sem finalizar o fluxo do chat.