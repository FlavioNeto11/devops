---
name: continuar-cadeia-cetesb
description: Continua a próxima fase pendente da cadeia CETESB/SIGOR sem repetir auditoria HAR
agent: orquestrador-mtr
argument-hint: opcional: cole observações da fase anterior
---

# Continuar cadeia CETESB/SIGOR

ROUTE_NEXT_PHASE.

Verifique checkpoints em `docs/handoffs/` e execute a próxima fase pendente.

Não releia HARs se `docs/handoffs/cetesb-sigor-mtr-01-har-contracts.md` já existir.

Observações:

${input:observacoes:}
