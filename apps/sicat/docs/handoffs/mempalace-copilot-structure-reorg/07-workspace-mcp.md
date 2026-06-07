# 07 - Workspace MCP

## Objetivo da fase

Reavaliar a camada de workspace VS Code para que o uso de mempalace fique representado e descobrível em `.vscode`, preservando a natureza opcional da dependência de runtime e evitando acoplamento com segredos, caminhos locais ou configurações específicas de máquina.

## Arquivos analisados

- `docs/handoffs/mempalace-copilot-structure-reorg/00-orchestration.md`
- `docs/handoffs/mempalace-copilot-structure-reorg/06-meta-evolution.md`
- `.vscode/mcp.json`
- `.vscode/settings.json`
- `.vscode/extensions.json`
- `.vscode/tasks.json`
- `.github/instructions/agent-orchestration.instructions.md`
- `.github/agents/estrutura-vscode-mtr.agent.md`
- `docs/copilot/14-estrutura-copilot.md`

## Decisões

- O workspace passa a declarar `mempalace` em `.vscode/mcp.json` usando o launcher oficial exposto pelo próprio CLI: `python -m mempalace.mcp_server`.
- A configuração foi mantida sem `--palace` fixo, sem variáveis sensíveis e sem caminhos absolutos, para continuar genérica e segura para o repositório.
- `.vscode/settings.json` não recebeu ajustes adicionais de `chat.mcp.serverSampling`, porque não houve evidência de necessidade de sampling para o servidor mempalace; evitar configuração extra reduz acoplamento e ruído.
- A descoberta operacional continua explícita: o repositório agora representa mempalace no workspace, mas o uso prático segue condicionado à existência do pacote Python `mempalace` no ambiente do usuário.
- O runtime atual desta máquina expõe o CLI e o módulo Python do mempalace, mas o palace em si ainda não está inicializado; isso não bloqueia a representação do servidor no workspace.

## Arquivos alterados

- `.vscode/mcp.json`
- `docs/handoffs/mempalace-copilot-structure-reorg/07-workspace-mcp.md`

## Validações

- `mempalace --help` para confirmar a existência do CLI e do subcomando `mcp`.
- `mempalace mcp` para confirmar o launcher oficial recomendado pelo próprio projeto (`python -m mempalace.mcp_server`).
- `python -c "import mempalace.mcp_server; print('ok')"` para validar a importação do módulo usado em `.vscode/mcp.json`.
- validação estrutural de `.vscode/mcp.json` e do novo checkpoint via ferramentas do workspace.

## Riscos residuais

- Usuários sem Python configurado no `PATH` ou sem o pacote `mempalace` instalado verão falha de inicialização do servidor MCP até preparar o ambiente local.
- Como não há `--palace` fixo no workspace, o servidor usará o palace padrão do usuário; isso é desejável para não acoplar o repositório a um armazenamento local específico, mas exige documentação e expectativa correta no runtime.
- O ambiente desta máquina retornou `No palace found` nas tools MCP do mempalace; portanto a descoberta do servidor está pronta, porém a utilidade operacional plena ainda depende de inicialização/mineração do palace fora do repositório.

## Handoff para a próxima fase

Próximo agente obrigatório: `tester-qa-mtr`.

Objetivo da fase 09: validar se a nova representação do mempalace no workspace é coerente, segura, descobrível e não introduz regressão estrutural em `.vscode`, `.github` e `docs`.

## next_agent_required

```text
Agent: tester-qa-mtr
Work ID: mempalace-copilot-structure-reorg

Continue a partir de docs/handoffs/mempalace-copilot-structure-reorg/00-orchestration.md, docs/handoffs/mempalace-copilot-structure-reorg/06-meta-evolution.md e docs/handoffs/mempalace-copilot-structure-reorg/07-workspace-mcp.md.

Objetivo da fase 09:
- validar a nova representacao de mempalace em .vscode/mcp.json;
- confirmar que a mudanca continua generica, segura e sem hardcode de maquina/segredos;
- verificar discoverability e ausencia de regressao estrutural;
- registrar resultado em docs/handoffs/mempalace-copilot-structure-reorg/09-qa-validation.md.

Nao repita as fases 06 ou 07 e nao avance para documentacao final nesta etapa.
```
