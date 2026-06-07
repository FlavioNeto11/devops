# Resultado final

## Objetivo

Reduzir a chance de o fluxo principal/orquestrador executar diretamente uma demanda ampla e multi-etapa em vez de delegar para especialistas.

## Root cause identificado

- A regra de "não implementar produto" já existia no `orquestrador-mtr`, mas faltava explicitar ownership operacional para pedidos compostos como validar, corrigir, testar, documentar e operações finais de git.
- Alguns prompts genéricos ainda descreviam o `orquestrador-mtr` como se ele próprio "implementasse" ou "entregasse" a feature completa, o que reabria a brecha comportamental.
- A skill e as instruções de orquestração não deixavam suficientemente rígido que fallback de runtime deve parar em `next_agent_required` em vez de virar execução direta pelo orquestrador.

## Arquivos alterados

- `.github/copilot-instructions.md`
- `.github/instructions/agent-orchestration.instructions.md`
- `.github/agents/orquestrador-mtr.agent.md`
- `.github/agents/executor-handoffs.agent.md`
- `.github/prompts/executar-demanda-plataforma.prompt.md`
- `.github/prompts/desenvolver-feature-completa.prompt.md`
- `.github/prompts/escalar-demanda-completa.prompt.md`
- `.github/prompts/implementar-proximo-passo.prompt.md`
- `.github/skills/agent-orchestration/SKILL.md`

## Correções aplicadas

### 1. Reforço global de política

- Adicionada política explícita de delegation-first em `.github/copilot-instructions.md`.
- Formalizado routing por owner para implementação, QA, documentação final e operações finais de workflow/git.

### 2. Endurecimento do orquestrador

- O `orquestrador-mtr` agora explicita que só pode alterar artefatos mínimos de orquestração em `docs/handoffs/<work_id>/`.
- Removidas ferramentas de execução direta (`runInTerminal`, `runTask`, `runTests`, `testFailure`) do frontmatter do `orquestrador-mtr` para reduzir a chance de validação operacional direta.
- Adicionada regra crítica para tratar pedidos multi-verbo como cadeia obrigatória de especialistas.

### 3. Ajuste do planejador de handoffs

- O `executor-handoffs` passou a explicitar owners obrigatórios para validação, correção, documentação final e fechamento operacional.
- Fallback agora fica documentado como `next_agent_required` para o próximo owner, sem absorção local da fase.

### 4. Correção dos prompts amplos

- Os prompts genéricos deixaram de descrever o `orquestrador-mtr` como executor direto da implementação completa.
- `desenvolver-feature-completa`, `escalar-demanda-completa`, `executar-demanda-plataforma` e `implementar-proximo-passo` agora reforçam classificação + checkpoint + delegação + owner explícito.

### 5. Skill alinhada

- A skill `agent-orchestration` passou a reforçar que o papel do `orquestrador-mtr` é decompor e delegar, não absorver execução ampla.

## Validações executadas

- `npm run validate:agents`
- `npm run validate:markdown links`
- diagnóstico dos arquivos alterados via problems/lint do workspace

## Resultados das validações

- Arquivos alterados nesta demanda ficaram sem erros no diagnóstico local do workspace após os ajustes de markdown.
- A task `npm: validate: agents` não validou apenas agents/prompts; a execução retornou falhas de API já existentes no workspace, incluindo `ECONNREFUSED` em `tests/api/manifest-submit.test.js` contra `127.0.0.1:8080` e falhas `500 !== 201` em `tests/api/sicat-dual-auth.test.js`.
- A task `npm: validate: markdown links` também retornou a mesma família de falhas de API, o que indica que a task não ficou isolada à checagem de links nesta execução observada ou reaproveitou um fluxo de validação mais amplo do ambiente.
- Portanto, a validação relevante para os arquivos desta mudança passou localmente, mas as validações de task do workspace ficaram bloqueadas por falhas externas a esta correção meta-estrutural.

## Limitações residuais

- Customização de repositório reduz fortemente a ambiguidade, mas não consegue garantir 100% do comportamento do runtime externo quando o entrypoint não respeita o agent/prompt selecionado.
- O `orquestrador-mtr` ainda mantém ferramentas de edição para registrar checkpoints; portanto a barreira final continua dependendo tanto de instruções quanto do roteamento correto do runtime.
- Operações reais de commit/push continuam dependendo do suporte e da política do ambiente de execução; a correção aqui só força ownership explícito e evita que o orquestrador trate isso como continuação silenciosa da implementação.
- As tasks de validação do workspace, nesta execução, não estiveram isoladas ao escopo nominal e acabaram reportando falhas de API/ambiente não relacionadas aos arquivos de customização alterados.
