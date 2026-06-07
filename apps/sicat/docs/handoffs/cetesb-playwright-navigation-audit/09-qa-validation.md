# 09 - QA Validation

## Objetivo da fase

Revalidar a estrutura corrigida de agente e prompt para auditoria externa com Playwright quanto a coerencia, discoverability, gates de seguranca, parametrizacao de runtime e aderencia as regras do repositorio.

## Arquivos analisados

- `docs/handoffs/cetesb-playwright-navigation-audit/00-orchestration.md`
- `docs/handoffs/cetesb-playwright-navigation-audit/06-meta-evolution.md`
- `.github/agents/auditor-navegacao-externa-mtr.agent.md`
- `.github/prompts/auditar-navegacao-cetesb-playwright.prompt.md`
- `.github/instructions/agent-orchestration.instructions.md`
- `.github/instructions/documentation.instructions.md`
- `.github/instructions/executor-handoffs.instructions.md`

## Findings

Nenhum finding bloqueante na estrutura corrigida.

Confirmacoes objetivas da revalidacao:

1. PASSOU - `work_id` agora esta parametrizado em runtime e nao hardcoded.
   Evidencia: `.github/prompts/auditar-navegacao-cetesb-playwright.prompt.md` usa `${input:work_id:Informe um work_id em slug curto e estavel; ex.: navegacao-externa-auditoria}` sem valor fixo de entrega.

2. PASSOU - O gate de fluxo sensivel esta internamente consistente e sem ambiguidade operacional.
   Evidencia: o prompt e o agente usam apenas `sim` ou `nao` para `sensitive_flows_allowed` e `stop_before_mutation`, com precedencia coerente entre `stop_before_mutation=sim`, `stop_before_mutation=nao` e `sensitive_flows_allowed=sim|nao`.

3. PASSOU - O agente nao exige mais `01-source-validation.md` na primeira execucao.
   Evidencia: `.github/agents/auditor-navegacao-externa-mtr.agent.md` manda ler primeiro `00-orchestration.md` e trata `01-source-validation.md` como checkpoint condicional de retomada: `Se docs/handoffs/<work_id>/01-source-validation.md ja existir... leia esse checkpoint antes de prosseguir`.

## Validacao dos requisitos solicitados

- Credenciais como parametros de runtime, sem defaults sensiveis persistidos: PASSOU. O agente e o prompt deixam explicito que login e segredo entram apenas em runtime e nao devem ser persistidos. Nao foi encontrado segredo real hardcoded.
- Checkpoint explicito de CAPTCHA assistido: PASSOU. O prompt e o agente exigem pausa no CAPTCHA com continuidade somente apos confirmacao humana explicita.
- Confirmacao antes de fluxo sensivel ou mutavel: PASSOU. O agente e o prompt convergem na mesma regra operacional e deixam a precedencia do bloqueio antes de mutacao explicita.
- Expectativa explicita de documentacao em estilo handoff: PASSOU. O prompt e o agente definem `docs/handoffs/<work_id>/01-source-validation.md` como artefato operacional primario, e os READMEs tornam a entrada descobrivel.
- Cobertura de correlacao payload/network com frontend SICAT: PASSOU. O agente exige correlacao com arquivos e fluxos do frontend SICAT quando houver evidencia suficiente, e o prompt/README de prompts expõem `sicat_correlation_scope`.

## Validações executadas

- Revisao manual dos artefatos obrigatorios da fase 06 e das instrucoes aplicaveis aos arquivos de agente, prompt e checkpoint.
- Busca textual focada em `work_id`, `01-source-validation.md`, `sensitive_flows_allowed` e `stop_before_mutation` para confirmar a remocao do hardcode e a coerencia das regras.
- `npm: validate: agents` via task do workspace: concluiu sem falhas nas validacoes encadeadas; saida registrou `[ok] OpenAPI validado com sucesso`, `[ok] Politica de fonte da verdade CETESB validada com sucesso` e `[ok] Nenhum problema de links/ancoras encontrado`.
- `npm: validate: markdown links` via task do workspace: concluiu sem falhas; saida registrou `[ok] Nenhum problema de links/ancoras encontrado`.
- Diagnostics nos arquivos-alvo: sem erros em `.github/agents/auditor-navegacao-externa-mtr.agent.md`, `.github/prompts/auditar-navegacao-cetesb-playwright.prompt.md` e neste checkpoint de QA.

## Decisao de QA

Status final de QA: APROVADO.

Justificativa: as tres correcoes solicitadas foram confirmadas diretamente nos artefatos e nas validacoes executadas. A estrutura agora esta reutilizavel, com `work_id` parametrizado em runtime, gate sensivel coerente e checkpoint inicial sem dependencia indevida de `01-source-validation.md` na primeira execucao.

## Arquivos alterados nesta fase

- `docs/handoffs/cetesb-playwright-navigation-audit/09-qa-validation.md`

## Handoff para a proxima fase

Proximo agente obrigatorio: `documentador-mtr`.

Runtime note: o executor atual nao expoe `agent/runSubagent` neste fluxo de QA. Portanto, a continuidade deve ser entregue como `next_agent_required`.

Prompt pronto:

```text
next_agent_required
Agent: documentador-mtr
Work ID: cetesb-playwright-navigation-audit
Leia docs/handoffs/cetesb-playwright-navigation-audit/09-qa-validation.md e consolide a fase final de documentacao registrando que a revalidacao de QA aprovou a estrutura, com work_id parametrizado em runtime, gate sensivel coerente e checkpoint inicial sem dependencia indevida de 01-source-validation.md na primeira execucao.
```
