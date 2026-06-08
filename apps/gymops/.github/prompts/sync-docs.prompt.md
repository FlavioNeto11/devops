---
mode: agent
description: Sincronizar docs/status, api-spec, roadmap, sprints, rbac e README após mudança.
---

# Sincronizar Documentação

## Quando usar

Após qualquer mudança não-trivial no código que afete:

- Endpoint REST
- Regra de RBAC
- Schema Prisma
- Tela administrativa
- Integração externa
- Conclusão de sprint
- Decisão arquitetural

## Contexto obrigatório

1. [`.github/instructions/docs.instructions.md`](../instructions/docs.instructions.md) — padrões obrigatórios
2. [`AGENTS.md`](../../AGENTS.md) seção 9 — Política de atualização de documentação
3. Estado atual do repositório (`git diff main`)

## Mapeamento de mudança → docs

| Mudança | Docs a atualizar |
|---|---|
| Endpoint criado/alterado | `docs/api-spec.md` + `docs/status.md` |
| Regra RBAC alterada | `docs/rbac-matrix.md` + `docs/rbac.md` + `docs/status.md` |
| Schema Prisma | `docs/data-model.md` |
| Tela administrativa | `docs/admin-ui-blueprint.md` + `docs/navigation-map.md` + `docs/status.md` |
| Integração externa | `docs/integrations.md` + `docs/status.md` |
| Critério E2E | `docs/e2e-business-flows.md` |
| Sprint concluída | `docs/sprints.md` + `docs/status.md` + `tasks/sprint-N.md` |
| Decisão arquitetural | `docs/architecture.md` |
| Env var nova | `README.md` + `docs/status.md` + `.env.example` + `.env.docker.example` |
| Comando/script novo | `README.md` + `package.json` |

## Passos

1. **Inventário das mudanças**
   - Listar arquivos alterados (`git status`)
   - Categorizar por tipo: schema, route, page, integration, doc

2. **Atualizar canônicos primeiro**
   - `docs/api-spec.md` se houve mudança de contrato
   - `docs/rbac-matrix.md` se houve mudança de permissão
   - `docs/data-model.md` se houve mudança de schema

3. **Atualizar `docs/status.md`**
   - Tabela "Resumo executivo por camada" com novos %
   - Seção "Gap principal" se gap foi fechado/criado
   - Seção "Checklist de go-live" se item foi atendido

4. **Atualizar `docs/sprints.md`** se sprint foi concluída
   - Mover da seção "Planejadas" para "Concluídas"
   - Adicionar resumo do que foi entregue

5. **Atualizar `tasks/sprint-N.md`**
   - Marcar checkboxes como `[x]`
   - Adicionar nota se algo ficou parcial/pendente

6. **Atualizar `README.md`** se houve mudança de comando/setup/env

7. **Verificar coerência interna**
   - Datas consistentes (`Última atualização: YYYY-MM-DD`)
   - Links internos funcionam
   - Status (`✅`/`⚠️`/`🔵`/`❌`) consistentes entre docs

## Não fazer

- **Não duplicar** conteúdo entre `status.md`, `sprints.md`, `roadmap.md` — cada um tem propósito específico
- **Não prometer** feature que não existe — só marcar `✅ Implementado` se está no código
- **Não criar doc novo** se conteúdo cabe em existente
- **Não remover** seções históricas em `docs/sprints.md` — é registro narrativo

## Critérios de aceite

- [ ] Todos os docs canônicos afetados foram atualizados
- [ ] Datas de "Última atualização" foram bumpadas onde necessário
- [ ] Status coerente entre os docs (sem `✅` num e `⚠️` em outro pro mesmo item)
- [ ] Links internos funcionam
- [ ] Nenhuma feature inexistente é prometida
- [ ] Tasks de sprint estão sincronizadas

## Formato da resposta final

1. Resumo das mudanças no código
2. Docs atualizados (com seções)
3. Status que mudou (de → para)
4. Inconsistências encontradas e corrigidas
5. Próxima atualização sugerida
