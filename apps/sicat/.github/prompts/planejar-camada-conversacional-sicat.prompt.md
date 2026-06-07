---
name: planejar-camada-conversacional-sicat
description: Planejar a frente conversacional do SICAT com foco na primeira onda sem WhatsApp
agent: executor-handoffs
argument-hint: "restricoes, foco da onda e estado atual da implementacao"
---

# Planejar camada conversacional do SICAT

Use este prompt para pedir ao `executor-handoffs` o planejamento executavel da camada conversacional do SICAT, priorizando:

- backend conversacional
- popup interno
- homepage
- app light
- hardening

## Regras obrigatorias

- nao tratar isso como chatbot generico
- nao puxar WhatsApp para dentro do MVP imediato
- respeitar a arquitetura atual do repositorio
- usar documentacao canonica em `docs/copilot/` e `docs/handoffs/conversacional-operacional-ia/`

## Resultado esperado

1. decomposicao em fases
2. dependencias por fase
3. riscos e gates de seguranca
4. criterio de pronto da primeira onda
5. backlog da segunda onda (WhatsApp)
