# Contexto do Copilot

Esta pasta concentra a documentação operacional e estrutural usada para orientar a linha de agentes do repositório.

Use este diretório para entender:

- o contexto do produto e da arquitetura;
- os fluxos operacionais principais;
- as decisões técnicas já registradas;
- a estrutura atual de agentes, prompts, skills e instructions;
- os artefatos estruturais da camada Copilot e sua relação com checkpoints por `work_id`.

## Ordem de leitura recomendada

1. `00-onboarding.md`
2. `02-arquitetura.md`
3. `07-integracao-cetesb.md`
4. `13-decision-log.md`
5. `14-estrutura-copilot.md`
6. `15-testes-automatizados.md`
7. `15-vscode-workflows.md` quando a demanda envolver operacao local no VS Code

Quando a demanda depender de evidência real CETESB, consulte também `../cetesb/README.md` e os HARs em `../cetesb/`.

## Documentos canônicos

| Documento | Papel |
| --- | --- |
| `00-onboarding.md` | Porta de entrada para contexto do projeto |
| `02-arquitetura.md` | Estrutura técnica do backend, worker e integrações |
| `04-fluxos-operacionais.md` | Sequências e fluxos relevantes da aplicação |
| `06-contrato-openapi.md` | Visão documental do contrato da API |
| `07-integracao-cetesb.md` | Integração externa e comportamento do gateway |
| `10-backlog-executavel.md` | Próximos passos e backlog operacional |
| `11-checklist-qa.md` | Critérios e roteiro de validação |
| `12-comandos-uteis.md` | Operação local, smoke e comandos recorrentes |
| `13-decision-log.md` | Histórico canônico das decisões e reorganizações |
| `14-estrutura-copilot.md` | Baseline estrutural atual da camada Copilot |
| `15-testes-automatizados.md` | Visão da suíte automatizada |
| `15-vscode-workflows.md` | Fluxos locais do workspace VS Code e regras de roteamento operacional |

## Como interpretar a documentação estrutural

- `13-decision-log.md` é a trilha cronológica canônica. Para saber o estado mais recente, comece sempre pelo topo do arquivo.
- `14-estrutura-copilot.md` descreve a estrutura vigente de `.github`, o roteamento por especialistas e os artefatos de governança.
- `handoffs/` concentra guias operacionais e artefatos ligados a decisões específicas da camada Copilot.
- `../handoffs/` concentra checkpoints por `work_id` para demandas correntes.
- `implementacoes/` e `validadores/` concentram material técnico mais profundo por tema.
- `legado/` preserva materiais históricos que deixaram de ser parte da trilha canônica do topo de `docs/copilot/`.

Este README não replica baseline histórico detalhado nem contagens estruturais, para evitar que a porta de entrada fique desatualizada quando a estrutura evoluir.

## Destaques atuais da estrutura

- A entrada recomendada para demandas amplas é `orquestrador-mtr`, conforme a política de `../.github/instructions/agent-orchestration.instructions.md`.
- Pedidos isolados para subir ambiente local, subir stack local, deixar localhost no ar ou preparar ambiente para validação manual devem ser tratados como execução direta em `estrutura-vscode-mtr`, não como abertura automática de handoff/workstream.
- `executor-handoffs` permanece como camada intermediária de execução de handoffs e presets, não como porta principal de discoverability para demandas amplas.
- `mempalace` foi formalizado como memória orquestrada opcional de runtime, sem substituir checkpoints versionados nem a documentação do repositório.
- A governança do workspace VS Code fica explícita na trilha de `estrutura-vscode-mtr` e na documentação correspondente.

## Áreas especializadas úteis

- `handoffs/guias/`: guias operacionais de orquestração e execução.
- `handoffs/DL-XXX/`: artefatos ligados a decisões específicas.
- `implementacoes/`: documentos técnicos de implementação.
- `validadores/cetesb/`: material de validação e coerência com as evidências HAR.
- `legado/autenticacao-cetesb/`: trilha histórica de autenticação, E2E e integrações reais preservada apenas por rastreabilidade.

## O que deixou de ser canônico

- A trilha antiga de autenticação real, diagramas e E2E CETESB foi movida para `legado/autenticacao-cetesb/`.
- A revisão histórica de OpenAPI foi movida para `legado/revisoes/`.
- Artefatos específicos de `DL-020` e `DL-023` foram recolocados sob `handoffs/DL-020/execution/` e `handoffs/DL-023/execution/`.
- `auditoria-links-quebrados.md` permanece no topo por ser um artefato operacional de validação ainda usado em handoffs recentes.

## Referências rápidas

- `handoffs/guias/ORQUESTRACAO-HANDOFFS-PERFORMATIVA.md`
- `handoffs/guias/QUICK-REFERENCE-HANDOFFS.md`
- `validadores/cetesb/validador-cetesb-integracao.md`
- `implementacoes/IMPLEMENTACAO-QUEUE-IMPROVEMENTS.md`
- `../.github/README.md`

## Regra prática

Se houver conflito entre um resumo documental e um artefato estrutural versionado, prevalece a fonte canônica mais específica:

1. checkpoint em `docs/handoffs/<work_id>/`;
2. documento estrutural ou decision log aplicável;
3. código, contrato OpenAPI, examples e evidências CETESB.
