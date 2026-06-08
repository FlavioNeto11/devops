# Agent Skills — GymOps

> **Decisão de localização**: este projeto usa `docs/agent-skills/` como diretório de skills versionadas (em vez de `.github/skills/`) porque o formato de Agent Skills do VS Code Copilot Chat ainda não tem spec estável. Esses arquivos são Markdown documentado, consumidos pelos agentes (Copilot/Claude) por referência.

## O que é uma skill

Skill é um **procedimento reutilizável** que combina contexto, passos, validação e saída esperada. Diferente de um agente (perfil/especialista) ou prompt (gatilho para uma tarefa específica), a skill descreve **como executar uma operação técnica recorrente**.

## Skills disponíveis

| Skill | Objetivo |
|---|---|
| [skill-read-project-context](skill-read-project-context.md) | Carregar contexto mínimo do projeto antes de qualquer tarefa |
| [skill-plan-implementation](skill-plan-implementation.md) | Quebrar tarefa em plano executável com TodoWrite |
| [skill-validate-rbac](skill-validate-rbac.md) | Verificar RBAC end-to-end (matriz + backend + frontend + testes) |
| [skill-create-admin-ui](skill-create-admin-ui.md) | Criar tela administrativa nova |
| [skill-create-fastify-endpoint](skill-create-fastify-endpoint.md) | Criar endpoint Fastify com Zod + RBAC + audit |
| [skill-create-prisma-migration](skill-create-prisma-migration.md) | Criar migration segura |
| [skill-create-playwright-e2e](skill-create-playwright-e2e.md) | Criar spec E2E por fluxo de negócio |
| [skill-update-docs](skill-update-docs.md) | Sincronizar documentação após mudança |
| [skill-run-validation](skill-run-validation.md) | Rodar a bateria de validação (lint + typecheck + test + build) |
| [skill-final-report](skill-final-report.md) | Gerar relatório final estruturado |

## Como uma skill é consumida

- **Claude Code**: agente lê o arquivo da skill quando o orquestrador decidir que ela se aplica
- **Copilot Chat**: prompts em `.github/prompts/` referenciam skills relevantes; o agente carrega o contexto da skill ao executar

## Como criar nova skill

1. Decidir se a operação é recorrente (acontece em ≥3 tarefas similares)
2. Criar arquivo `skill-<nome-kebab>.md` neste diretório
3. Estrutura padrão (ver arquivos existentes):
   - Objetivo
   - Quando usar / Quando não usar
   - Entradas esperadas
   - Arquivos de contexto
   - Passos
   - Saída esperada
   - Erros comuns
   - Checklist
4. Adicionar à tabela acima
5. Apontar do(s) prompt(s) que a usam
