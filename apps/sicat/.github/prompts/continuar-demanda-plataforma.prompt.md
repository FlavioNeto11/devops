---
name: continuar-demanda-plataforma
description: Continua a próxima fase pendente de uma demanda da plataforma SICAT
agent: orquestrador-mtr
argument-hint: informe o work_id ou cole o checkpoint anterior
---

# Continuar demanda da plataforma

CONTINUE_PLATFORM_DEMAND.

Identifique `work_id`.

Leia:

```text
docs/handoffs/<work_id>/00-orchestration.md
```

Verifique checkpoints existentes e acione somente o próximo especialista pendente.

Se o runtime expuser mempalace, consulte-o apenas como memória complementar de continuidade depois de ler os checkpoints versionados.

Não repita fase concluída.
Não use paths hardcoded de uma demanda específica.

Entrada:

${input:entrada:Informe o work_id ou cole o checkpoint anterior}
