# 06 - Meta Evolution

## Objetivo da fase

Incorporar a disponibilizacao localhost como fase padrao da mesma cadeia operacional quando a demanda exigir validacao manual, smoke local, critica do usuario ou entrega navegavel.

## Arquivos analisados

- `.github/instructions/agent-orchestration.instructions.md`
- `.github/agents/orquestrador-mtr.agent.md`
- `.github/agents/estrutura-vscode-mtr.agent.md`
- `.github/agents/tester-qa-mtr.agent.md`
- `.github/copilot-instructions.md`
- `docs/handoffs/localhost-validation-default/00-orchestration.md`

## Decisoes

- O gatilho global deve viver no `orquestrador-mtr` e na instrucao global de orquestracao, para evitar depender de decisao ad hoc no fim da demanda.
- O owner operacional da etapa continua sendo `estrutura-vscode-mtr`.
- A etapa de localhost entra como continuidade da mesma cadeia antes de QA/documentacao, sem criar uma rodada separada.
- Foi evitada a criacao de uma taxonomia nova de dominios ou uma renumeracao global de checkpoints para manter a mudanca pequena e generica.

## Arquivos alterados

- `.github/instructions/agent-orchestration.instructions.md`
- `.github/agents/orquestrador-mtr.agent.md`
- `.github/agents/estrutura-vscode-mtr.agent.md`
- `docs/handoffs/localhost-validation-default/06-meta-evolution.md`

## Validacoes

- Revisao estatica dos gatilhos e ownership entre instrucao global, orquestrador e especialista de workspace.
- Validacao planejada: `npm run validate:agents`.
- Validacao planejada: `npm run validate:markdown-links`.

## Handoff para a proxima fase

Proximo agente obrigatorio: `tester-qa-mtr`.

Escopo sugerido para a fase 09:

- verificar se a regra ficou generica e sem vies de demanda;
- confirmar que localhost passou a ser fase da mesma cadeia quando houver validacao manual/local;
- validar consistencia entre ownership, handoff e linguagem dos agentes globais.
