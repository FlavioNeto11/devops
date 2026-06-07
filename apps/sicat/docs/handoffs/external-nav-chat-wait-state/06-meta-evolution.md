# 06 - Meta Evolution

## Objetivo da fase

Ajustar a estrutura reutilizável de navegação externa auditável para que checkpoints humanos e perda acidental da janela/browser não sejam tratados como conclusão do fluxo no chat, preservando as restrições de segurança já existentes.

## Arquivos analisados

- `docs/handoffs/external-nav-chat-wait-state/00-orchestration.md`
- `.github/instructions/agent-orchestration.instructions.md`
- `.github/agents/auditor-navegacao-externa-mtr.agent.md`
- `.github/prompts/auditar-navegacao-cetesb-playwright.prompt.md`
- `docs/handoffs/cetesb-platform-complete-navigation/00-orchestration.md`
- `docs/handoffs/cetesb-platform-complete-navigation/01-source-validation.md`
- `.github/README.md`
- `.github/agents/README.md`
- `.github/prompts/README.md`
- `docs/copilot/14-estrutura-copilot.md`

## Decisões

- Formalizado o estado `awaiting_user_unblock_in_chat` como pausa operacional reutilizável para navegação externa.
- CAPTCHA, checkpoint humano pendente, timeout operacional e fechamento acidental da janela/browser deixam de ser tratados como fim da fase quando o mesmo especialista continua owner da retomada.
- A resposta esperada no chat durante o bloqueio passa a ser curta e objetiva, apenas pedindo desbloqueio do usuário ou nova sessão ativa.
- A retomada correta passa a ser a mesma fase, usando o checkpoint já registrado, sem afrouxar regras de CAPTCHA, sem persistir credenciais e sem autorizar mutações irreversíveis.
- `next_agent_required` continua reservado para mudança real de owner na cadeia, não para pausas operacionais do mesmo especialista.

## Arquivos alterados

- `.github/agents/auditor-navegacao-externa-mtr.agent.md`
- `.github/prompts/auditar-navegacao-cetesb-playwright.prompt.md`
- `.github/agents/README.md`
- `.github/README.md`
- `.github/prompts/README.md`
- `docs/copilot/14-estrutura-copilot.md`
- `docs/handoffs/external-nav-chat-wait-state/06-meta-evolution.md`

## Validações

- `npm run validate:agents` OK
- validação de links markdown do workspace sem problemas reportados (`Nenhum problema de links/âncoras encontrado.`)

## Riscos e limites preservados

- CAPTCHA continua exigindo ajuda humana.
- Nenhuma credencial, segredo ou token deve ser persistido.
- Nenhuma mutação irreversível pode ocorrer sem autorização explícita do usuário em runtime.
- A mudança é estrutural e genérica, sem amarrar a regra a um site específico.

## Handoff para QA

- próximo agente: `tester-qa-mtr`
- status: `next_agent_required`
- motivo: validar que a nova semântica de espera operacional está coerente no agente, prompt e docs estruturais sem regressão de governança
- execução automática: não disparada neste runtime porque `agent/runSubagent` não está disponível nesta sessão
- prompt pronto:

```text
CONTINUE_CHAIN. Work ID: external-nav-chat-wait-state. Leia docs/handoffs/external-nav-chat-wait-state/06-meta-evolution.md e valide a estrutura ajustada de navegacao externa auditavel, confirmando que CAPTCHA, checkpoint humano pendente ou janela fechada mantem a mesma fase em espera (`awaiting_user_unblock_in_chat`) sem encerrar o fluxo, sem persistir credenciais e sem afrouxar gates de seguranca.
```
