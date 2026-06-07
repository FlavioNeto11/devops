# DL-055 - Arquitetura de agentes e delegação por bolsões

## Contexto
Foi identificado comportamento inconsistente de delegação no VS Code (prompts sem resolução de agente e execução sem troca efetiva em parte dos fluxos), apesar da estratégia de handoff estar definida.

## Objetivo
Corrigir estrutura dos agentes e formalizar modelo operacional para handoffs síncronos/assíncronos com consolidação obrigatória no orquestrador.

## Entregas
- Normalização de metadados em agentes críticos.
- Correção de YAML inválido em `orquestrador-mtr.agent.md` (bloco `handoffs`).
- Modelo de bolsões (sequencial + paralelo controlado) aplicado em agentes/prompts/skills.
- Validador automático de arquitetura em `scripts/validate-agent-architecture.js`.
- Teste dedicado em `tests/unit/agent-architecture-validation.test.js`.

## Referências
- Decision log: [`docs/copilot/13-decision-log.md#dl-055`](../../13-decision-log.md#dl-055)
- Estrutura: [`docs/copilot/14-estrutura-copilot.md`](../../14-estrutura-copilot.md)
