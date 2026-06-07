# 06 - Meta Evolution

## Objetivo da fase

Criar a estrutura mínima e reutilizável de agente e prompt para auditoria de navegação externa com Playwright, com parâmetros de runtime, checkpoint humano para CAPTCHA, gates antes de mutação e documentação em formato de handoff.

## Arquivos analisados

- `.github/copilot-instructions.md`
- `.github/instructions/agent-orchestration.instructions.md`
- `.github/instructions/documentation.instructions.md`
- `.github/instructions/cetesb-source-of-truth.instructions.md`
- `.github/instructions/gateway-cetesb.instructions.md`
- `.github/README.md`
- `.github/agents/README.md`
- `.github/prompts/README.md`
- `.github/agents/meta-evolution-copilot.agent.md`
- `.github/agents/integrador-cetesb-mtr.agent.md`
- `.github/agents/tester-qa-mtr.agent.md`
- `.github/agents/frontend-vue-ux-mtr.agent.md`
- `.github/prompts/executar-demanda-plataforma.prompt.md`
- `.github/prompts/continuar-demanda-plataforma.prompt.md`
- `.github/prompts/validar-fluxo-cetesb.prompt.md`
- `docs/copilot/13-decision-log.md`
- `docs/copilot/14-estrutura-copilot.md`
- `docs/handoffs/cetesb-playwright-navigation-audit/00-orchestration.md`

## Decisões

- Criado o agente `.github/agents/auditor-navegacao-externa-mtr.agent.md` para ownership específico de navegação externa auditável com Playwright, sem alterar o comportamento global dos agentes existentes.
- Criado o prompt `.github/prompts/auditar-navegacao-cetesb-playwright.prompt.md` como entrypoint parametrizado para URL, perfil, login, segredo, flags de sensibilidade, stop-before-mutation e escopo de navegação.
- Credenciais e segredos ficam restritos ao runtime; a estrutura nova explicita que esses valores não devem ser persistidos em handoffs nem em arquivos permanentes.
- O checkpoint humano para CAPTCHA foi tornado obrigatório e explícito na estrutura.
- A navegação segura de fluxos de criar, receber, baixar e registrar foi limitada ao ponto imediatamente anterior à submissão, salvo autorização explícita do usuário durante a sessão.
- A documentação operacional observada deve ser persistida em `docs/handoffs/<work_id>/01-source-validation.md`, com passos, telas, requests, payloads, checkpoints e correlação com frontend SICAT quando aplicável.
- READMEs e docs estruturais foram atualizados para deixar o novo fluxo descobrível.

## Rodada corretiva apos QA

- Removido o `work_id` fixo do prompt reutilizável; a entrada agora exige um slug curto e estável informado em runtime, sem enviesar a estrutura para um caso específico.
- Unificada a convenção dos gates sensíveis em `sim` ou `nao`, com precedência explícita: `stop_before_mutation=sim` sempre bloqueia mutação; `sensitive_flows_allowed=nao` impede mutação; `sensitive_flows_allowed=sim` só permite avançar mediante confirmação humana imediata antes da ação irreversível.
- Ajustada a entrada do agente para tratar `01-source-validation.md` como checkpoint condicional de retomada, não como pré-requisito obrigatório da primeira execução da própria fase.

## Arquivos alterados

- `.github/agents/auditor-navegacao-externa-mtr.agent.md`
- `.github/prompts/auditar-navegacao-cetesb-playwright.prompt.md`
- `.github/README.md`
- `.github/agents/README.md`
- `.github/prompts/README.md`
- `docs/copilot/13-decision-log.md`
- `docs/copilot/14-estrutura-copilot.md`
- `docs/handoffs/cetesb-playwright-navigation-audit/06-meta-evolution.md`

## Arquivos alterados na rodada corretiva

- `.github/agents/auditor-navegacao-externa-mtr.agent.md`
- `.github/prompts/auditar-navegacao-cetesb-playwright.prompt.md`
- `docs/handoffs/cetesb-playwright-navigation-audit/06-meta-evolution.md`

## Validações

- `npm run validate:agents`
- `npm run validate:md-links`

## Validações da rodada corretiva

- Validar novamente `npm run validate:agents` para confirmar coerência estrutural do agente e do prompt.
- Validar novamente `npm run validate:md-links` para garantir que a atualização do checkpoint não quebrou referências Markdown.

## Handoff para a próxima fase

Próximo agente obrigatório: `tester-qa-mtr`.

Objetivo: validar coerência estrutural da nova entrada de auditoria externa, revisar os gates de segurança operacional e confirmar a discoverability da estrutura nos READMEs e docs Copilot.

Prompt pronto para continuidade:

```text
CONTINUE_CHAIN. Work ID: cetesb-playwright-navigation-audit. Leia docs/handoffs/cetesb-playwright-navigation-audit/06-meta-evolution.md e valide a estrutura nova de auditoria externa com Playwright, incluindo CAPTCHA assistido, pausa antes de mutação, documentação step-by-step e correlação com o frontend SICAT.
```
