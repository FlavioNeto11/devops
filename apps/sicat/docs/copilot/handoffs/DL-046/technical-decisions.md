# Technical Decisions — DL-046

## 1) Fallback orientado por erro HTTP
**Decisão:** realizar fallback apenas quando a CETESB responder `HTTP 500` para `kind=all`.

**Motivo:** preservar semântica atual para respostas válidas e limitar mudança a cenário comprovadamente problemático.

## 2) Ordem de tentativa determinística
**Decisão:** manter ordem `all` -> `0`.

**Motivo:** respeitar comportamento histórico e aplicar `0` apenas como plano de contingência.

## 3) 404 continua sendo lista vazia
**Decisão:** não alterar tratamento existente de `404`.

**Motivo:** `404` já é interpretado como ausência de manifestos no período e não como erro operacional.

## 4) Observabilidade adicional
**Decisão:** incluir `attemptedKinds` no `sanitizedBody` de auditoria.

**Motivo:** facilitar diagnóstico de incidentes e confirmar quando houve fallback em produção.
