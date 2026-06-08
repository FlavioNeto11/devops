# Modelo Operacional dos Agentes de IA — GymOps

**Última atualização**: 2026-05-16

Este documento descreve **como Copilot Chat e Claude Code (e futuros agentes) trabalham em sinergia** neste repositório, sem conflito e sem retrabalho.

---

## Visão da arquitetura

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Contrato compartilhado                            │
│                                                                          │
│  AGENTS.md       — contrato interoperável (regra geral, leitura inicial) │
│  CLAUDE.md       — regras específicas Claude Code + pitfalls do projeto  │
│  docs/status.md  — estado real (fonte da verdade da realidade)           │
│  docs/*          — documentação canônica (produto, RBAC, API, sprints)   │
└──────────────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│  GitHub Copilot Chat       │   │  Claude Code              │
│  (VS Code Insiders/Stable) │   │  (CLI / IDE integration)  │
├───────────────────────────┤   ├───────────────────────────┤
│  .github/copilot-          │   │  CLAUDE.md (raiz)         │
│    instructions.md         │   │  Skills/agents próprios   │
│  .github/instructions/*    │   │  Respeita .github/instructions│
│  .github/prompts/*         │   │  Lê AGENTS.md e docs/*    │
│  .github/agents/* (perfis) │   │                           │
└───────────────────────────┘   └───────────────────────────┘
                │                           │
                └─────────────┬─────────────┘
                              ▼
                ┌──────────────────────────┐
                │  docs/agent-skills/*     │  ← skills procedurais
                │  docs/agent-task-routing │  ← matriz de roteamento
                │  .github/agents/*        │  ← perfis especialistas
                └──────────────────────────┘
```

---

## Papel de cada peça

### Contrato (`AGENTS.md`)

- **Interoperável** — qualquer agente lê primeiro
- Em conflito com regra local de ferramenta, prevalece
- Não tem regras detalhadas — aponta para os arquivos canônicos

### `CLAUDE.md`

- Regras detalhadas + pitfalls do projeto
- Específico para Claude Code, mas **respeitado também pelo Copilot via referência cruzada**

### `.github/copilot-instructions.md`

- Custom instructions globais do Copilot Chat
- Carregado automaticamente pela extensão em todo prompt
- Versão curta e estável das regras

### `.github/instructions/*.instructions.md`

- Path-specific (frontmatter `applyTo`)
- Carregado automaticamente pelo Copilot quando arquivos do path entram no contexto
- Claude Code as **respeita por referência** quando o tipo da tarefa bate

### `.github/prompts/*.prompt.md`

- Prompts reutilizáveis (slash commands no Copilot Chat)
- Acionados explicitamente pelo usuário (`/implement-sprint`)
- Claude Code os usa como **playbooks** quando o usuário pede tarefa similar

### `.github/agents/*.agent.md`

- **Perfis especialistas** (orquestrador + 8 subagentes)
- Não são "chat modes" formais — são descrições versionadas em Markdown
- Servem para qualquer agente entender qual postura/responsabilidade adotar
- Reusáveis pelo Copilot (futuros chat modes) e por Claude Code (subagentes)

### `docs/agent-skills/*.md`

- **Procedimentos** reutilizáveis (read context, plan, validate RBAC, create endpoint, etc.)
- Consumidos pelos agentes via referência nos prompts e nos agent files
- Linguagem técnica de execução

### `docs/agent-task-routing.md`

- Matriz: tipo de tarefa → quais agentes + prompts + skills usar
- Acelera decisão de "por onde começar"

### `docs/ai-knowledge-base.md`

- Índice resumido do projeto para agentes
- Quando o agente precisa overview rápido sem ler todos os docs

### `docs/how-to-use-ai-agents.md`

- Guia para humanos (não para agentes)
- Como usar Copilot e Claude no projeto

---

## Fluxo padrão de execução

Independente do agente (Copilot ou Claude):

```
┌─────────────────────────────────────────┐
│ 1. Receber tarefa do usuário            │
└───────────────────┬─────────────────────┘
                    ▼
┌─────────────────────────────────────────┐
│ 2. Aplicar skill-read-project-context   │
│    - Ler AGENTS.md                      │
│    - Ler docs/status.md                 │
│    - Ler arquivos condicionais          │
└───────────────────┬─────────────────────┘
                    ▼
┌─────────────────────────────────────────┐
│ 3. Consultar agent-task-routing.md      │
│    - Decidir agente principal           │
│    - Listar agentes auxiliares          │
│    - Identificar prompt aplicável       │
└───────────────────┬─────────────────────┘
                    ▼
┌─────────────────────────────────────────┐
│ 4. Aplicar skill-plan-implementation    │
│    - TodoWrite                          │
│    - Ordem de execução                  │
└───────────────────┬─────────────────────┘
                    ▼
┌─────────────────────────────────────────┐
│ 5. Executar incrementalmente            │
│    - Por camada (schema → api → ui)     │
│    - Validar typecheck após cada camada │
└───────────────────┬─────────────────────┘
                    ▼
┌─────────────────────────────────────────┐
│ 6. Aplicar skill-validate-rbac          │
│    (se mudou permissão)                 │
└───────────────────┬─────────────────────┘
                    ▼
┌─────────────────────────────────────────┐
│ 7. Aplicar skill-run-validation         │
│    (lint + typecheck + test + build)    │
└───────────────────┬─────────────────────┘
                    ▼
┌─────────────────────────────────────────┐
│ 8. Aplicar skill-update-docs            │
│    (sincronizar canônicos)              │
└───────────────────┬─────────────────────┘
                    ▼
┌─────────────────────────────────────────┐
│ 9. Aplicar skill-final-report           │
│    (relatório estruturado)              │
└─────────────────────────────────────────┘
```

---

## Como escolher prompt file

| Pedido do usuário | Prompt |
|---|---|
| "executa a sprint X" | `implement-sprint.prompt.md` |
| "cria tela admin Y" | `implement-admin-screen.prompt.md` |
| "adiciona endpoint Z" | `add-api-endpoint.prompt.md` |
| "muda permissão de W" | `update-rbac.prompt.md` |
| "cria E2E pra fluxo V" | `create-e2e-flow.prompt.md` |
| "revisa segurança" | `review-security.prompt.md` |
| "atualiza docs" | `sync-docs.prompt.md` |
| "CI tá falhando" | `fix-ci.prompt.md` |
| "refatora arquivo grande" | `refactor-large-file.prompt.md` |
| "monta relatório/PR" | `prepare-pr-summary.prompt.md` |

No Copilot Chat (VS Code Insiders): `/<nome-do-prompt>` aciona.

No Claude Code: o agente lê o prompt e segue o roteiro.

---

## Como escolher agent file

| Domínio da tarefa | Agente principal |
|---|---|
| Multi-camada / sprint | `gymops-orchestrator` |
| Decisão de produto/UX admin | `product-admin` |
| Implementação UI | `frontend-next` |
| Endpoint Fastify | `backend-fastify` |
| Permissões / segurança | `rbac-security` |
| Schema / migration | `database-prisma` |
| Integração externa | `integrations` |
| Testes | `testing-e2e` |
| Documentação | `docs-roadmap` |

Detalhe completo em [`docs/agent-task-routing.md`](agent-task-routing.md).

---

## Como atualizar a base de conhecimento

### Quando adicionar regra nova

1. Decidir o arquivo canônico (matriz RBAC, api-spec, instructions, etc.)
2. Atualizar lá primeiro
3. Se for regra geral interoperável, refletir em `AGENTS.md`
4. Se for específica de Claude, refletir em `CLAUDE.md`
5. Se for path-specific, refletir em `.github/instructions/`
6. Apontar dos demais arquivos via link

### Quando adicionar agente novo

1. Criar arquivo `.github/agents/<nome>.agent.md`
2. Adicionar à matriz em `AGENTS.md` (seção 4)
3. Adicionar à matriz detalhada em `docs/agent-task-routing.md`
4. Documentar em `docs/ai-agent-operating-model.md` (este arquivo)

### Quando adicionar prompt novo

1. Criar arquivo `.github/prompts/<nome>.prompt.md`
2. Estrutura: descrição, quando usar, contexto, passos, critérios, comandos, formato da resposta
3. Atualizar tabela "Como escolher prompt file" acima
4. Referenciar das skills/agents que usam

### Quando adicionar skill nova

1. Criar arquivo `docs/agent-skills/skill-<nome>.md`
2. Atualizar `docs/agent-skills/README.md` com link
3. Referenciar dos prompts/agents que usam

---

## Como evitar conflito entre Copilot e Claude

### Princípios

1. **Mesma fonte da verdade** — ambos leem `docs/status.md` e respeitam `AGENTS.md`
2. **Sem instruções contraditórias** — quando atualizar regra, atualizar todos os arquivos relevantes
3. **Stateless por sessão** — agente não confia em "lembrança" de sessão anterior, sempre lê estado real
4. **Mudanças via PR** — qualquer alteração de código/docs passa por revisão

### Onde focar cada um

- **Copilot Chat**: tarefas incrementais, autocompletar enriquecido, refator inline, prompts curtos
- **Claude Code**: tarefas grandes/multi-camada, planejamento de sprint, refator extenso, automação CLI

Não há restrição rígida — usar o que for mais produtivo para cada caso.

### Quando os dois trabalharem em paralelo

- Cada um em sua branch
- Sincronizar via PR
- Conflitos resolvidos como qualquer outro merge conflict

---

## Como validar resultado

Todo agente deve:

1. Rodar `pnpm lint && pnpm typecheck`
2. Rodar testes relevantes (ver `skill-run-validation`)
3. Atualizar docs (`skill-update-docs`)
4. Gerar relatório (`skill-final-report`)

Resultado considerado "pronto" só após esses passos.

---

## Como manter docs sincronizados

Princípio simples: **toda mudança não-trivial atualiza pelo menos `docs/status.md`**.

Mapeamento detalhado em `skill-update-docs.md`.

---

## Limitações conhecidas

- **VS Code "chat modes" / custom agents**: o formato ainda evolui no Insiders. Por isso `.github/agents/*` são Markdown puros (sem frontmatter de modo) e servem como documentação compartilhada, não como modos formais ainda.
- **Agent skills**: formato versionado não-estável; este projeto mantém em `docs/agent-skills/` em vez de `.github/skills/`.
- **Claude Code subagents**: usa o sistema interno do Claude; agent files servem como referência conceitual reusável.
- **Sincronização entre Copilot e Claude**: depende da disciplina do usuário em respeitar o fluxo (não há mecanismo automático).

---

## Próximos passos sugeridos

- Quando VS Code estabilizar custom chat modes, migrar `.github/agents/*` para `.github/chatmodes/*.chatmode.md` com frontmatter apropriado
- Quando agent skills versionadas estabilizarem, considerar mover `docs/agent-skills/` para `.github/skills/`
- Adicionar mais prompts conforme novos padrões emergirem
- Coletar feedback de uso real (Copilot + Claude) para refinar as instruções
