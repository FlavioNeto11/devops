# Estrutura `.github`

Este diretório concentra a camada operacional do Copilot no repositório: agentes, prompts, skills, instructions e validações de governança.

## Como entrar na cadeia certa

Para demandas amplas, multi-camada ou ainda mal classificadas, a entrada recomendada é o `orquestrador-mtr`. Essa é a política canônica definida em `instructions/agent-orchestration.instructions.md`.

Exceção prática: pedidos isolados de subir ambiente local, subir stack local, deixar localhost no ar ou preparar o workspace para validação manual não devem abrir handoff/workstream próprio; o roteamento esperado é execução direta em `estrutura-vscode-mtr`.

Fluxo recomendado:

1. Dispare a demanda com `orquestrador-mtr` ou com um prompt amplo que o utilize.
2. O orquestrador classifica impacto, registra checkpoint e decide a cadeia de especialistas.
3. Especialistas executam implementação, validação, documentação e, quando aplicável, CI.

O `executor-handoffs` continua existindo como camada intermediária de execução de handoffs e presets coordenados, mas não deve ser divulgado como porta principal para demandas amplas.

## Entradas práticas no VS Code

Prompts em `prompts/` podem ser executados diretamente no VS Code de três formas:

1. Chat Panel: `Ctrl+Shift+I`, depois `/` e selecione o prompt.
2. Context menu no arquivo `.prompt.md` com `Execute in New Chat`.
3. Command Palette com `GitHub Copilot: Run Prompt`.

Entradas mais úteis:

- `prompts/executar-demanda-plataforma.prompt.md`: entrada ampla para execução orientada por orquestração.
- `prompts/continuar-demanda-plataforma.prompt.md`: retoma uma cadeia já iniciada por `work_id`.
- `prompts/handoff.prompt.md`: execução unificada de handoffs quando a cadeia já está explícita.
- `prompts/iniciar-frente-operacional-coordenada.prompt.md`: preset observável para frentes coordenadas.
- `prompts/evoluir-estrutura-vscode.prompt.md`: entrada direta para ajustes de workspace, `.vscode` e disponibilidade local quando o pedido for somente operacional.

## Componentes

- `agents/`: definição de especialistas, orquestradores e ownership por domínio.
- `prompts/`: atalhos interativos para disparar fluxos no chat.
- `skills/`: contexto reutilizável por domínio ou estratégia operacional.
- `instructions/`: regras por tipo de arquivo e por camada técnica.
- `workflows/`: validações e automações de CI.

## Memória orquestrada opcional

- `mempalace` é capacidade opcional de runtime, nunca pré-condição do repositório.
- A fonte canônica continua sendo o conteúdo versionado, principalmente `docs/handoffs/<work_id>/`, `docs/copilot/` e os artefatos desta pasta.
- Uso permitido: continuidade entre fases, memória de repositório/workspace, decisões estáveis e recuperação de contexto por `work_id`.
- Uso proibido: segredos, credenciais, tokens, payloads sensíveis e logs transitórios.
- Referência canônica: `skills/mempalace-memory-orchestration/SKILL.md`.

## Fonte da verdade CETESB

- `docs/cetesb/` permanece como evidência primária da integração real.
- Mudanças em contrato, gateway, scripts, testes e examples devem continuar aderentes às evidências dessa pasta.

## Roteamento rápido

| Demanda | Agente primário | Apoio comum |
| --- | --- | --- |
| Mudança ampla multi-camada sem dono claro | `orquestrador-mtr` | delegação sequencial por impacto |
| Manifestos operacionais | `manifestos-operacional-mtr` | `integrador-cetesb-mtr`, `postgres-queue-mtr`, `tester-qa-mtr` |
| Sessão e conta CETESB | `sessao-conta-mtr` | `integrador-cetesb-mtr`, `programador-backend-mtr` |
| Operação admin, Jobs e Logs | `jobs-monitoramento-logs-mtr` | `postgres-queue-mtr`, `tester-qa-mtr` |
| Perfis e acessos | `perfis-acessos-admin-mtr` | `programador-backend-mtr`, `postgres-queue-mtr` |
| Dashboard e observabilidade | `dashboard-observability-mtr` | `programador-backend-mtr`, `postgres-queue-mtr` |
| Frontend transversal, layout e UX | `frontend-vue-ux-mtr` | `tester-qa-mtr`, `documentador-mtr` |
| Estrutura `.vscode` e disponibilidade local isolada | `estrutura-vscode-mtr` | `ci-cd-github-mtr`, `documentador-mtr` |
| Navegação externa auditável com Playwright | `auditor-navegacao-externa-mtr` | `integrador-cetesb-mtr`, `tester-qa-mtr` |

Para navegação externa auditável, CAPTCHA, checkpoint humano pendente ou fechamento acidental da janela não encerram a cadeia: o estado correto é manter a fase atual em espera por desbloqueio do usuário e retomar quando houver nova sessão ativa.

## Validação estrutural

Use estes comandos para verificar a camada de governança:

```bash
npm run validate:agents
npm run test:source-of-truth
```

## Referências canônicas

- `agents/orquestrador-mtr.agent.md`
- `agents/executor-handoffs.agent.md`
- `prompts/README.md`
- `skills/agent-orchestration/SKILL.md`
- `skills/mempalace-memory-orchestration/SKILL.md`
- `instructions/agent-orchestration.instructions.md`
- `../docs/copilot/13-decision-log.md`
- `../docs/copilot/14-estrutura-copilot.md`
