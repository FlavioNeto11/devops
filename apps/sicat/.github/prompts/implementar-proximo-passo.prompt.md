---
name: implementar-proximo-passo
description: 'Planeja e delega o próximo passo mais valioso do projeto com base no backlog e no contexto técnico.'
agent: orquestrador-mtr
argument-hint: "Descreva a meta ou informe 'seguir backlog atual'"
---

# Implementar Próximo Passo

**Contexto:** planejar e delegar o próximo passo mais valioso do projeto com base no backlog.

**Agente:** `orquestrador-mtr`

**Leitura obrigatória:**

- `docs/copilot/00-onboarding.md`
- `docs/copilot/02-arquitetura.md`
- `docs/copilot/09-roadmap.md`
- `docs/copilot/10-backlog-executavel.md`

## Tarefa

${input:tarefa:Descreva a tarefa desejada ou 'seguir backlog atual'}

Passos:

1. Identifique o item mais valioso e menos ambíguo.
2. Aplique a skill `agent-orchestration` para decidir escalonamento.
3. Delegue usando `#tool:runSubagent` para o owner correto; não implemente diretamente no `orquestrador-mtr`.
4. Se houver múltiplos verbos operacionais ou múltiplos owners, quebre em fases com ownership explícito.
5. Atualize somente o checkpoint de orquestração necessário.
6. Retorne:
   - resumo
   - arquivos alterados
   - como validar
   - pendências
