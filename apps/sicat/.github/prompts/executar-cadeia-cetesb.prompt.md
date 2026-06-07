---
name: executar-cadeia-cetesb
description: Compatibilidade: roteia demanda CETESB/SIGOR como demanda genérica de plataforma
agent: orquestrador-mtr
argument-hint: cole a demanda CETESB/SIGOR
---

# Executar demanda CETESB/SIGOR

ROUTE_PLATFORM_DEMAND.

Trate esta demanda como uma demanda da plataforma, não como fluxo hardcoded.

Derive `work_id` a partir do objetivo.

Use checkpoints genéricos em:

```text
docs/handoffs/<work_id>/
```

Se envolver HAR/evidência externa, a primeira fase provavelmente será `validador-cetesb-mtr`, mas não hardcode arquivos ou endpoints no agente.

Demanda:

${input:demanda:Cole a demanda CETESB/SIGOR}
