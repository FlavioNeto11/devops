# Estrutura de Agentes (`.github/agents`)

Este repositório usa um modelo de orquestração com agente principal + especialistas.

## Agente principal

- `orquestrador-mtr`: decide estratégia, escopo, ordem de execução e consolidação.

## Especialistas

- `programador-backend-mtr`: implementação backend por camadas.
- `integrador-cetesb-mtr`: integração real CETESB, sessão e token.
- `postgres-queue-mtr`: persistência, migrations, fila, locking e retries.
- `tester-qa-mtr`: testes, smoke e validação de contrato.
- `frontend-vue-ux-mtr`: frontend Vue.js, CSS avançado, layout, navegação e usabilidade.
- `auditor-navegacao-externa-mtr`: navegação externa auditável com Playwright, CAPTCHA assistido, estado de espera para desbloqueio humano, gates de mutação e correlação de payloads com o SICAT.
- `dashboard-observability-mtr`: evolução do dashboard operacional com métricas consolidadas (health, performance, timeline, latência CETESB e snapshots).
- `jobs-monitoramento-logs-mtr`: operação administrativa global (todos os usuários/sessões) + monitoramento de Jobs/Logs (filtros, status, rastreabilidade e UX operacional).
- `sessao-conta-mtr`: evolução da tela de Sessão e Conta CETESB (contexto ativo, troca de conta e autenticação).
- `manifestos-operacional-mtr`: evolução da tela de Manifestos (listagem, filtros, detalhe, criação e ações operacionais).
- `perfis-acessos-admin-mtr`: evolução do módulo administrativo de Perfis e Acessos (RBAC/ABAC), gestão de usuários/sessões e controle fino de permissões.
- `estrutura-vscode-mtr`: evolução da estrutura de workspace do VS Code (`.vscode`), incluindo tasks, launch/debug, settings e recomendações de extensões.
- `validador-cetesb-mtr`: **NOVO (2026-03-08)** - auditoria de coerência com `docs/cetesb/` (HARs reais).
- `documentador-mtr`: documentação técnica e contexto Copilot.
- `meta-evolution-copilot`: evolução contínua da estrutura de agentes, prompts, skills e workflows.

## Memória orquestrada opcional

- mempalace passa a ser tratado como recurso opcional de continuidade da cadeia, nunca como fonte primária obrigatória.
- O fluxo canônico continua: checkpoint em `docs/handoffs/<work_id>/` primeiro, mempalace depois, apenas para complementar memória de repositório/workspace e decisões estáveis.
- Agentes com perfil base de mempalace: `orquestrador-mtr`, `executor-handoffs`, `meta-evolution-copilot`, `documentador-mtr` e `estrutura-vscode-mtr`.
- Agentes especialistas de produto continuam orientados por checkpoint + código versionado e não devem depender de mempalace para concluir a fase.

## Roteamento rápido (resumo)

| Demanda                                        | Agente primário                 | Apoio comum                                                    |
| ---------------------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| Shell/layout/tokens/acessibilidade transversal | `frontend-vue-ux-mtr`           | `tester-qa-mtr`, `documentador-mtr`                            |
| Sessão e conta CETESB (usuário atual)          | `sessao-conta-mtr`              | `integrador-cetesb-mtr`, `programador-backend-mtr`             |
| Operação admin global + Jobs/Logs              | `jobs-monitoramento-logs-mtr`   | `postgres-queue-mtr`, `tester-qa-mtr`                          |
| RBAC/ABAC, perfis/permissões/políticas         | `perfis-acessos-admin-mtr`      | `programador-backend-mtr`, `postgres-queue-mtr`                |
| Manifestos (lista/detalhe/criação/ações)       | `manifestos-operacional-mtr`    | `integrador-cetesb-mtr`, `postgres-queue-mtr`, `tester-qa-mtr` |
| Navegação externa auditável com Playwright     | `auditor-navegacao-externa-mtr` | `integrador-cetesb-mtr`, `tester-qa-mtr`                       |
| Dashboard/observabilidade                      | `dashboard-observability-mtr`   | `programador-backend-mtr`, `postgres-queue-mtr`                |
| Estrutura `.vscode`                            | `estrutura-vscode-mtr`          | `ci-cd-github-mtr`, `documentador-mtr`                         |
| Demanda multi-camada sem dono claro            | `orquestrador-mtr`              | delegação sequencial por impacto                               |

Observação operacional para navegação externa: CAPTCHA, checkpoint humano pendente ou fechamento acidental da janela devem manter a mesma fase em espera (`awaiting_user_unblock_in_chat`) até o usuário liberar nova sessão ativa.

## Regra de escalonamento

1. O `orquestrador-mtr` sempre avalia impacto em contrato, banco, worker, integração, validação de coerência e docs.
2. Para demanda multi-camada, delega para especialistas na ordem necessária.
3. Só considera concluído com validação local (test/smoke/checklist) e documentação atualizada.
4. **NOVO**: Quando há divergência entre código e HAR em `docs/cetesb/`, sempre escale para `validador-cetesb-mtr` PRIMEIRO.
5. **NOVO (DL-086):** para pacotes operacionais transversais, o `orquestrador-mtr` oferece o preset `Executar Frente Operacional Coordenada + QA/Docs`, organizando a frente operacional por independência de arquivos e fechando com QA/docs em sequência, sem prometer execução simultânea visível no runtime atual.

## Integração com prompts e skills

- Prompts em `.github/prompts/` devem usar preferencialmente `orquestrador-mtr` para permitir handoff automático.
- Skills em `.github/skills/` guiam execução por domínio técnico.
- Instructions em `.github/instructions/` continuam como regras globais por tipo de arquivo.
