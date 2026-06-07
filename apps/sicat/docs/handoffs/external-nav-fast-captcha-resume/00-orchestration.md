# 00 - Orchestration

## Demanda original (resumo)

Ajustar a estrutura de navegacao externa auditavel para reduzir latencia operacional quando o usuario ja tiver liberado o reCAPTCHA ou outro checkpoint humano sensivel. O comportamento desejado e priorizar acao imediata na sessao/browser ativos, sem refresh, sem revalidacoes desnecessarias e sem reinspecao ampla antes de tentar o passo sensivel que depende do tempo de validade do checkpoint humano.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "external-nav-fast-captcha-resume"
  intent: "meta"
  complexity: "moderate"
  domains:
    - "docs"
  first_agent: "meta-evolution-copilot"
  phase_sequence:
    - phase: "06-meta-evolution"
      agent: "meta-evolution-copilot"
      required: true
      reason: "A demanda exige ajuste estrutural em agente/prompt de navegacao externa para priorizar a sessao ativa e o checkpoint humano recem-liberado."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "Confirmar que o fast-path nao enfraquece os gates de seguranca e realmente prioriza a janela ativa sem regressao de comportamento."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar a regra final de retomada rapida para CAPTCHA desbloqueado."
```

## Resultado esperado

- Quando o usuario disser que o CAPTCHA foi liberado, a estrutura deve priorizar a sessao atual com fast-path operacional.
- O agente deve evitar refresh, `navigate`, retorno a home, releitura excessiva e reinspecao ampla antes da tentativa de login/acao dependente do CAPTCHA.
- A documentacao detalhada deve ser minimizada durante a janela sensivel e consolidada depois do passo de autenticacao ou do novo bloqueio, sem perder seguranca.
- A regra de nao persistir credenciais e nao executar mutacoes irreversiveis sem autorizacao continua intacta.

## Checkpoints esperados

- `docs/handoffs/external-nav-fast-captcha-resume/00-orchestration.md`
- `docs/handoffs/external-nav-fast-captcha-resume/06-meta-evolution.md`
- `docs/handoffs/external-nav-fast-captcha-resume/09-qa-validation.md`
- `docs/handoffs/external-nav-fast-captcha-resume/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `meta-evolution-copilot`.

Escopo da fase 06: ajustar `.github/agents/auditor-navegacao-externa-mtr.agent.md` e `.github/prompts/auditar-navegacao-cetesb-playwright.prompt.md` para explicitar um modo de retomada rapida em sessao ativa quando o usuario informar que o CAPTCHA ja foi liberado, priorizando velocidade operacional sem enfraquecer seguranca.