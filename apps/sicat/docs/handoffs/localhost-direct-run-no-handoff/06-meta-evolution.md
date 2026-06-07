# 06 - Meta Evolution

## Objetivo da fase

Ajustar a estrutura Copilot para diferenciar pedidos isolados de disponibilidade local de cadeias maiores com handoff, mantendo `estrutura-vscode-mtr` como especialista operacional de localhost sem forcar abertura de workstream autonomo.

## Arquivos analisados

- `.github/agents/orquestrador-mtr.agent.md`
- `.github/agents/estrutura-vscode-mtr.agent.md`
- `.github/instructions/agent-orchestration.instructions.md`
- `.github/prompts/executar-demanda-plataforma.prompt.md`
- `.github/README.md`
- `.github/prompts/README.md`
- `.github/HANDOFF-QUICK-START.md`
- `docs/copilot/README.md`
- `docs/copilot/14-estrutura-copilot.md`
- `docs/copilot/15-vscode-workflows.md`
- `docs/handoffs/localhost-direct-run-no-handoff/00-orchestration.md`

## Decisoes

- Pedidos isolados como `subir o ambiente`, `subir stack local`, `deixar localhost no ar` e `preparar ambiente para eu validar` passam a ser classificados como execucao operacional direta de `estrutura-vscode-mtr`.
- `orquestrador-mtr` continua inserindo `estrutura-vscode-mtr` como fase intermediaria quando localhost fizer parte de cadeia maior com implementacao, QA, documentacao ou outro owner.
- Abertura de `docs/handoffs/<work_id>/` deixa de ser comportamento padrao para localhost isolado; permanece apenas para continuidade explicita ou cadeia multi-owner.
- Textos de discoverability passam a separar `orquestrador/handoff` de `estrutura-vscode-mtr` para reduzir gatilho incorreto de workstream.

## Arquivos alterados

- `.github/agents/orquestrador-mtr.agent.md`
- `.github/instructions/agent-orchestration.instructions.md`
- `.github/prompts/executar-demanda-plataforma.prompt.md`
- `.github/README.md`
- `.github/prompts/README.md`
- `.github/HANDOFF-QUICK-START.md`
- `docs/copilot/README.md`
- `docs/copilot/14-estrutura-copilot.md`
- `docs/copilot/15-vscode-workflows.md`

## Validacoes

- Revisao manual de coerencia entre regra canônica do orquestrador, instruction global e docs de discoverability.
- Validacao estrutural pendente na fase de QA para confirmar ausencia de contradicoes adicionais na camada Copilot.
- Ajuste pos-QA aplicado em `.github/HANDOFF-QUICK-START.md` para separar explicitamente a trilha `/handoff` das operacoes isoladas de localhost e destacar a entrada direta via `estrutura-vscode-mtr` e `/evoluir-estrutura-vscode`.

## Handoff para a proxima fase

Proximo agente obrigatorio: `tester-qa-mtr`.

Prompt sugerido:

```text
START_OR_CONTINUE_PHASE. Work ID: localhost-direct-run-no-handoff.
Valide a coerencia estrutural da nova regra de localhost isolado sem handoff proprio.
Confirme que:
- pedidos isolados de subir ambiente/stack local/localhost/preparar ambiente roteiam como execucao direta em estrutura-vscode-mtr;
- estrutura-vscode-mtr continua como fase intermediaria em cadeias maiores;
- nao restaram textos de discoverability contraditorios na camada .github/docs/copilot alterada nesta fase.
Grave checkpoint em docs/handoffs/localhost-direct-run-no-handoff/09-qa-validation.md.
```
