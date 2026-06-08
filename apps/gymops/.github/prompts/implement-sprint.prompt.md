---
mode: agent
description: Executar uma sprint de tasks/sprint-N.md seguindo docs e validações.
---

# Implementar Sprint Inteira

## Quando usar

Quando o usuário pedir para "executar a sprint X", "fazer a sprint X" ou "implementar tasks/sprint-X.md".

## Contexto obrigatório

Antes de começar, ler nesta ordem:

1. [`AGENTS.md`](../../AGENTS.md) — contrato e regras gerais
2. [`docs/status.md`](../../docs/status.md) — estado atual (não duplicar trabalho já feito)
3. `tasks/sprint-${input:sprintNumber}.md` — escopo da sprint
4. [`docs/admin-ui-blueprint.md`](../../docs/admin-ui-blueprint.md) — se a sprint cria telas
5. [`docs/rbac-matrix.md`](../../docs/rbac-matrix.md) — se a sprint mexe em permissões
6. [`docs/api-spec.md`](../../docs/api-spec.md) — endpoints existentes a ampliar
7. [`docs/e2e-business-flows.md`](../../docs/e2e-business-flows.md) — critérios de aceite
8. Sprint anterior em `tasks/sprint-${input:previousSprint}.md` para entender o contexto recente

## Passos

1. **Diagnóstico inicial**
   - Listar todas as tarefas marcadas `- [ ]` em `tasks/sprint-N.md`
   - Identificar dependências entre tarefas (backend antes de frontend, schema antes de rotas)
   - Verificar no `docs/status.md` o que já existe parcialmente

2. **Planejamento**
   - Criar todo list das tarefas (TodoWrite)
   - Definir ordem de execução
   - Identificar arquivos que serão criados/alterados

3. **Execução incremental por camada**
   - Schema Prisma (se aplicável) → migrations → regenerar client
   - Backend: rotas Fastify com Zod + RBAC + audit log
   - Frontend: API client → página → componentes → estados UX
   - Testes: vitest para regras críticas, Playwright para fluxos principais

4. **Validação contínua**
   - Após cada camada: `pnpm --filter @gymops/<pacote> typecheck`
   - No final: `pnpm lint && pnpm typecheck`
   - Build se mexeu em frontend: `pnpm --filter @gymops/web build`

5. **Atualização de docs**
   - Marcar tarefas como `- [x]` em `tasks/sprint-N.md`
   - Atualizar `docs/status.md` (% de readiness, gaps fechados)
   - Atualizar `docs/api-spec.md` se criou endpoints
   - Atualizar `docs/sprints.md` (adicionar à seção "Sprints concluídas")
   - Atualizar `docs/integrations.md` se mexeu em integração

6. **Relatório final** — usar `.github/prompts/prepare-pr-summary.prompt.md`

## Critérios de aceite

- [ ] Todas as tarefas check-listadas estão `- [x]` ou justificadas
- [ ] `pnpm lint` passa sem warnings novos
- [ ] `pnpm typecheck` passa
- [ ] Testes existentes não regridem
- [ ] Docs afetados foram atualizados
- [ ] Critério de saída da sprint (em `docs/product-roadmap.md`) atendido
- [ ] Nenhuma feature do "Fora do MVP" foi adicionada

## Comandos de validação

```bash
pnpm --filter @gymops/api typecheck
pnpm --filter @gymops/web typecheck
pnpm --filter @gymops/web lint
pnpm --filter @gymops/api test
pnpm --filter @gymops/web build
```

## Formato da resposta final

Relatório em Markdown com seções:

1. Resumo executivo (1 frase)
2. Tarefas concluídas (lista com check)
3. Tarefas em aberto / pendências
4. Arquivos criados/alterados (caminhos relativos)
5. Endpoints adicionados/alterados
6. Telas criadas/alteradas
7. Validações executadas e resultado
8. Documentação atualizada
9. Próximos passos sugeridos
