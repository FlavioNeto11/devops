# CI Validation

- Work ID: `enforce-agent-delegation`
- Phase owner: `ci-cd-github-mtr`
- Objective: publicar apenas os artefatos do workstream de delegação obrigatória, sem absorver alterações alheias.

## Files reviewed for publication

- `.github/copilot-instructions.md`
- `.github/instructions/agent-orchestration.instructions.md`
- `.github/agents/orquestrador-mtr.agent.md`
- `.github/agents/executor-handoffs.agent.md`
- `.github/prompts/executar-demanda-plataforma.prompt.md`
- `.github/prompts/desenvolver-feature-completa.prompt.md`
- `.github/prompts/escalar-demanda-completa.prompt.md`
- `.github/prompts/implementar-proximo-passo.prompt.md`
- `.github/skills/agent-orchestration/SKILL.md`
- `docs/handoffs/enforce-agent-delegation/00-orchestration.md`
- `docs/handoffs/enforce-agent-delegation/10-documentation-final.md`

## Git state decision

- Branch at inspection: `main`
- Remote target: `origin/main`
- Unrelated dirty file detected: `docs/copilot/auditoria-links-quebrados.md`
- Conflict assessment: sem conflito direto com este workstream; deve ficar fora do commit.

## Planned publication scope

- Stage only the agent/prompt/instruction/skill files above plus this checkpoint directory.
- Create one non-amended commit for release readiness.
- Push directly to `origin/main` if staging remains isolated.

## Handoff result

- Próxima ação desta própria fase: executar stage seletivo, commit e push.