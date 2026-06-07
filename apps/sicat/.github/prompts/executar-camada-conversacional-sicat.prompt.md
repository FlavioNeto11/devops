---
name: executar-camada-conversacional-sicat
description: Executar a frente conversacional do SICAT fase por fase, com foco na primeira onda sem WhatsApp
agent: executor-handoffs
argument-hint: "fase alvo, objetivo e restricoes"
---

# Executar camada conversacional do SICAT

Execute esta frente respeitando:

- `docs/handoffs/conversacional-operacional-ia/README.md`
- `docs/handoffs/conversacional-operacional-ia/05-copilot-runbook.md`
- `docs/copilot/16-camada-conversacional.md`
- `docs/copilot/conversacional/*`

## Regras obrigatorias

- primeira onda sem WhatsApp
- backend conversacional com provider OpenAI, LangGraph e LangSmith
- popup interno e app light reaproveitando o mesmo nucleo
- homepage comunicando o diferencial
- hardening ao final da primeira onda

## Validacoes

- nao tratar os canais como identicos
- nao inventar endpoints desconectados do SICAT
- nao burlar policy layer
- nao marcar WhatsApp como pronto
