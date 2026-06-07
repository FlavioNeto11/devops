# 00 - Orchestration

## Demanda original (resumo)

Usuario relatou que, ao logar, acessar a tela de manifestos e executar a busca, a UI continua falhando. O HAR anexado mostra que a sessao ativa e a dashboard usam um par consistente de `sessionContextId` e `integrationAccountId`, mas a chamada final de `GET /v1/manifestos` ainda envia outro `integrationAccountId`, gerando `400` por mismatch de contexto.

## Classificacao obrigatoria

```yaml
orchestration:
  work_id: "frontend-manifest-search-account-mismatch"
  intent: "fix"
  complexity: "moderate"
  domains:
    - "source-validation"
    - "frontend-ux"
    - "qa"
    - "docs"
  first_agent: "validador-cetesb-mtr"
  phase_sequence:
    - phase: "01-source-validation"
      agent: "validador-cetesb-mtr"
      required: true
      reason: "Ha evidencia HAR do fluxo real de UI mostrando divergencia entre sessao ativa e request final de manifestos; e preciso validar a sequencia observada antes de corrigir o frontend."
    - phase: "06-frontend-ux"
      agent: "frontend-vue-ux-mtr"
      required: true
      reason: "A falha aparente esta no estado da UI ou na montagem do request de manifestos, entao a correcao pertence ao owner de frontend."
    - phase: "09-qa-validation"
      agent: "tester-qa-mtr"
      required: true
      reason: "Apos a correcao, e necessario provar que a busca de manifestos usa o mesmo par sessao/conta exibido pela sessao ativa."
    - phase: "10-documentation-final"
      agent: "documentador-mtr"
      required: true
      reason: "Consolidar causa raiz, correcao e evidencia final do fluxo de UI."
```

## Evidencia inicial

- HAR anexado pelo usuario: fluxo de login em `http://127.0.0.1:5174/login`.
- `POST /v1/sicat/auth/login` retorna `200`.
- `GET /v1/sicat/session` retorna `sessionContextId = scx_ccac5739eb50ce2f480ae3c6cb` e `integrationAccountId = acc_acc_41efad06dc4dd0cdd6c8505332`.
- `POST /v1/sicat/cetesb-accounts/acc_41efad06dc4dd0cdd6c8505332/activate` confirma o mesmo par consistente.
- `GET /v1/dashboard/overview` usa corretamente `integrationAccountId = acc_acc_41efad06dc4dd0cdd6c8505332` com o mesmo `sessionContextId`.
- `GET /v1/manifestos` subsequente usa incorretamente `integrationAccountId = acc_acc_1048c579b90c3e6d788c4812c5` com o mesmo `sessionContextId`, e recebe `400 Bad Request` por mismatch.

## Criterios de pronto

- Causa raiz do mismatch de `integrationAccountId` no frontend identificada com base no HAR e no codigo.
- Correcao aplicada no owner correto sem alterar o contrato backend.
- Validacao final prova que a tela de manifestos envia um par consistente de `sessionContextId` e `integrationAccountId` apos login/ativacao.

## Checkpoints esperados

- `docs/handoffs/frontend-manifest-search-account-mismatch/00-orchestration.md`
- `docs/handoffs/frontend-manifest-search-account-mismatch/01-source-validation.md`
- `docs/handoffs/frontend-manifest-search-account-mismatch/06-frontend-ux.md`
- `docs/handoffs/frontend-manifest-search-account-mismatch/09-qa-validation.md`
- `docs/handoffs/frontend-manifest-search-account-mismatch/10-documentation-final.md`

## Handoff imediato

Proximo agente obrigatorio: `validador-cetesb-mtr`.

Objetivo da fase 01: validar a sequencia do HAR, apontar a divergencia entre estado de sessao/conta ativa e request de manifestos, e delimitar o escopo exato da correcao de frontend.