# 06 - Meta Evolution

## Objetivo da fase

Atualizar a estrutura reutilizavel de navegacao externa auditavel para introduzir uma retomada operacional rapida quando o usuario informar que um CAPTCHA ou checkpoint humano equivalente ja foi liberado na sessao ativa.

## Arquivos analisados

- `docs/handoffs/external-nav-fast-captcha-resume/00-orchestration.md`
- `.github/instructions/agent-orchestration.instructions.md`
- `.github/instructions/cetesb-source-of-truth.instructions.md`
- `.github/agents/auditor-navegacao-externa-mtr.agent.md`
- `.github/prompts/auditar-navegacao-cetesb-playwright.prompt.md`
- `docs/handoffs/cetesb-platform-complete-navigation/01-source-validation.md`

## Decisoes

- Foi adicionado um modo estrutural `fast_path_resume` para retomadas na mesma fase quando o usuario confirmar que o checkpoint humano ja esta liberado na sessao ativa.
- O `fast_path_resume` prioriza reutilizar a pagina e a sessao ativas sem `refresh`, `reload`, nova navegacao ou reinspecao ampla, exceto quando o contexto estiver objetivamente irrecuperavel.
- A regra operacional agora explicita que, durante a janela sensivel apos o desbloqueio humano, o agente deve preencher apenas os campos faltantes, ajustar selecoes obrigatorias e disparar a acao pendente o quanto antes.
- Documentacao narrativa detalhada, screenshots extras, varredura ampla de DOM, coleta extensa de rede e correlacao aprofundada ficam adiadas ate o passo critico concluir ou ate surgir novo bloqueio.
- Nenhum gate de seguranca foi reduzido: permanece proibido automatizar CAPTCHA, persistir credenciais, contornar `stop_before_mutation` ou executar mutacoes irreversiveis sem autorizacao.

## Arquivos alterados

- `.github/agents/auditor-navegacao-externa-mtr.agent.md`
- `.github/prompts/auditar-navegacao-cetesb-playwright.prompt.md`
- `docs/handoffs/external-nav-fast-captcha-resume/06-meta-evolution.md`

## Validacoes

- Validacao estrutural pendente para `.github/agents` e links Markdown apos aplicacao das regras.
- Validacao funcional com `tester-qa-mtr` nao executada neste runtime porque nao ha ferramenta disponivel para disparar `agent/runSubagent` a partir desta sessao.

## Handoff para QA

Status recomendado: `next_agent_required`

Agente: `tester-qa-mtr`

Prompt pronto:

```text
WORK_ID: external-nav-fast-captcha-resume

Leia primeiro:
- docs/handoffs/external-nav-fast-captcha-resume/00-orchestration.md
- docs/handoffs/external-nav-fast-captcha-resume/06-meta-evolution.md
- .github/agents/auditor-navegacao-externa-mtr.agent.md
- .github/prompts/auditar-navegacao-cetesb-playwright.prompt.md

Objetivo:
Validar que a nova regra `fast_path_resume` da navegacao externa:
- reutiliza a sessao/pagina ativas imediatamente quando o usuario disser que o CAPTCHA ja foi liberado;
- evita refresh, reload, navigate e reinspecao ampla antes do passo critico;
- prioriza preencher apenas campos faltantes e clicar a acao pendente;
- adia documentacao nao essencial sem perder rastreabilidade posterior;
- preserva todos os gates de seguranca existentes, inclusive bloqueios de CAPTCHA, `stop_before_mutation` e proibicao de persistir credenciais.

Entregue em docs/handoffs/external-nav-fast-captcha-resume/09-qa-validation.md:
- cenarios verificados;
- riscos ou regressões encontrados;
- evidencias de que o fast-path e generico e nao especifico de uma unica demanda;
- handoff para documentacao final.
```

## Handoff para a proxima fase

Proximo agente obrigatorio: `tester-qa-mtr`.
