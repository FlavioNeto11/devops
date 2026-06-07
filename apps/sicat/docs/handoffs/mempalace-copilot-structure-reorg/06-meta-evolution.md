# 06 - Meta Evolution

## Objetivo da fase

Integrar mempalace como memória orquestrada opcional na estrutura Copilot do repositório, definindo orientação global de uso, perfil mínimo de tools para os agentes certos e discoverability suficiente em `.github` e `docs`, sem invadir a fase de workspace/MCP.

## Arquivos analisados

- `docs/handoffs/mempalace-copilot-structure-reorg/00-orchestration.md`
- `.github/instructions/agent-orchestration.instructions.md`
- `.github/copilot-instructions.md`
- `.github/README.md`
- `.github/agents/README.md`
- `.github/prompts/README.md`
- `.github/agents/orquestrador-mtr.agent.md`
- `.github/agents/executor-handoffs.agent.md`
- `.github/agents/meta-evolution-copilot.agent.md`
- `.github/agents/documentador-mtr.agent.md`
- `.github/agents/estrutura-vscode-mtr.agent.md`
- `.github/skills/agent-orchestration/SKILL.md`
- `.github/skills/copilot-structure-evolution/SKILL.md`
- `docs/copilot/13-decision-log.md`
- `docs/copilot/14-estrutura-copilot.md`
- `docs/copilot/README.md`
- `.vscode/mcp.json`

## Decisões

- mempalace foi formalizado como dependência opcional de runtime, nunca como pré-condição estrutural do repositório.
- A política global ficou centralizada em `.github/instructions/agent-orchestration.instructions.md` para evitar duplicidade de regras entre agentes, prompts e skills.
- Foi criada a skill `.github/skills/mempalace-memory-orchestration/SKILL.md` para documentar perfil base, perfil avançado, política de escrita e fallback.
- Apenas agentes de orquestração/documentação/workspace receberam perfil mínimo de tools mempalace: `orquestrador-mtr`, `executor-handoffs`, `meta-evolution-copilot`, `documentador-mtr` e `estrutura-vscode-mtr`.
- A fase 06 não alterou `.vscode/mcp.json`; qualquer wiring concreto de runtime/MCP fica reservado para a fase 07 sob ownership de `estrutura-vscode-mtr`.

## Arquivos alterados

- `.github/instructions/agent-orchestration.instructions.md`
- `.github/skills/mempalace-memory-orchestration/SKILL.md`
- `.github/skills/agent-orchestration/SKILL.md`
- `.github/skills/copilot-structure-evolution/SKILL.md`
- `.github/agents/orquestrador-mtr.agent.md`
- `.github/agents/executor-handoffs.agent.md`
- `.github/agents/meta-evolution-copilot.agent.md`
- `.github/agents/documentador-mtr.agent.md`
- `.github/agents/estrutura-vscode-mtr.agent.md`
- `.github/README.md`
- `.github/agents/README.md`
- `.github/prompts/README.md`
- `.github/prompts/executar-demanda-plataforma.prompt.md`
- `.github/prompts/continuar-demanda-plataforma.prompt.md`
- `docs/copilot/13-decision-log.md`
- `docs/copilot/14-estrutura-copilot.md`
- `docs/copilot/README.md`
- `docs/copilot/auditoria-links-quebrados.md` (artefato atualizado pela validação)

## Validações

- `npm run validate:agents`
- `npm run validate:md-links`

## Riscos residuais

- O runtime analisado ainda não expõe mempalace em `.vscode/mcp.json`; portanto a integração estrutural está pronta, mas o wiring de workspace continua pendente da fase 07.
- A utilidade prática de memória avançada (taxonomia, drawers, hooks) depende de como `estrutura-vscode-mtr` vai declarar e documentar o MCP no workspace.

## Handoff para a próxima fase

Próximo agente obrigatório: `estrutura-vscode-mtr`.

Objetivo da fase 07: revisar a camada de workspace/MCP para refletir mempalace no runtime quando aplicável, alinhando `.vscode` e demais artefatos locais sem hardcode de disponibilidade universal.

## next_agent_required

```text
Agent: estrutura-vscode-mtr
Work ID: mempalace-copilot-structure-reorg

Continue a partir de docs/handoffs/mempalace-copilot-structure-reorg/00-orchestration.md e docs/handoffs/mempalace-copilot-structure-reorg/06-meta-evolution.md.

Objetivo da fase 07:
- revisar a camada de workspace/MCP para mempalace;
- decidir se .vscode/mcp.json e artefatos correlatos precisam ser ajustados;
- manter mempalace como dependência opcional de runtime;
- registrar conclusões em docs/handoffs/mempalace-copilot-structure-reorg/07-workspace-mcp.md.

Não repita a fase meta já concluída e não avance para QA/documentação final nesta etapa.
```