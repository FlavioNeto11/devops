# 00 - Agent Tooling

## Objetivo da fase

Verificar se os agentes responsaveis pela validacao de tela no workstream tinham acesso utilizavel ao Playwright MCP exigido pelo usuario e, se necessario, corrigir a configuracao minima para a proxima rodada de frontend e QA.

## Arquivos analisados

- `.github/agents/frontend-vue-ux-mtr.agent.md`
- `.github/agents/tester-qa-mtr.agent.md`
- `.github/agents/manifestos-operacional-mtr.agent.md`
- `.github/agents/orquestrador-mtr.agent.md`
- `.vscode/mcp.json`
- `.vscode/settings.json`
- `docs/handoffs/frontend-manifests-actions-popover-overflow/00-orchestration.md`

## Findings

- O agente `frontend-vue-ux-mtr` nao expunha nenhuma tool `playwright/browser_*` na lista `tools:`.
- O agente `tester-qa-mtr` tambem nao expunha nenhuma tool `playwright/browser_*`.
- O workspace tinha apenas o servidor MCP `stitch` registrado em `.vscode/mcp.json`; nao havia servidor Playwright configurado localmente.
- Nessas condicoes, os agentes relevantes para a nova rodada de validacao de tela nao tinham acesso utilizavel ao Playwright MCP solicitado pelo usuario.

## Decisoes

- Ajustar somente os agentes diretamente envolvidos nas proximas fases de tela e validacao: `frontend-vue-ux-mtr` e `tester-qa-mtr`.
- Registrar o servidor MCP `playwright` no workspace com configuracao minima via `npx -y @playwright/mcp@latest`.
- Nao alterar agentes nao envolvidos na cadeia imediata nem editar codigo de produto nesta fase.

## Arquivos alterados

- `.github/agents/frontend-vue-ux-mtr.agent.md`
- `.github/agents/tester-qa-mtr.agent.md`
- `.vscode/mcp.json`
- `docs/handoffs/frontend-manifests-actions-popover-overflow/00-agent-tooling.md`

## Validacoes

- Confirmada a ausencia previa de tools Playwright nos agentes de frontend e QA.
- Confirmada a ausencia previa de servidor Playwright em `.vscode/mcp.json`.
- Configuracao atualizada para expor as tools Playwright solicitadas aos agentes relevantes e registrar o servidor MCP correspondente no workspace.

## Handoff

Proximo owner explicito: `frontend-vue-ux-mtr`.

Objetivo do proximo owner: reproduzir o caso real da tela de manifestos com Playwright MCP, corrigir o comportamento do popover sem tocar em backend e registrar a fase em `docs/handoffs/frontend-manifests-actions-popover-overflow/06-frontend-ux.md`.

Se o runtime exigir prompt explicito, usar:

`next_agent_required: frontend-vue-ux-mtr -> Leia docs/handoffs/frontend-manifests-actions-popover-overflow/00-orchestration.md e docs/handoffs/frontend-manifests-actions-popover-overflow/00-agent-tooling.md. Use Playwright MCP para reproduzir o caso real da tela de manifestos, implemente apenas a correcao frontend do popover e atualize docs/handoffs/frontend-manifests-actions-popover-overflow/06-frontend-ux.md.`
