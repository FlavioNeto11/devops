# Skill: Update Docs

## Objetivo

Sincronizar documentação após qualquer mudança no código, evitando promessa de feature inexistente ou duplicação.

## Quando usar

- Após implementar feature/sprint/refator
- Após mudança em endpoint, schema, RBAC, integração
- Conclusão de sprint
- Decisão arquitetural

## Quando NÃO usar

- Mudança puramente cosmética em código
- Refatoração interna sem efeito visível

## Entradas esperadas

- `git diff main` (ou base relevante)
- Tipo de mudança (endpoint, schema, RBAC, tela, integração, decisão)

## Arquivos de contexto

1. [`.github/instructions/docs.instructions.md`](../../.github/instructions/docs.instructions.md)
2. Docs canônicos relevantes ao tipo de mudança

## Mapeamento mudança → docs

| Mudança | Docs |
|---|---|
| Endpoint | `docs/api-spec.md` + `docs/status.md` |
| RBAC | `docs/rbac-matrix.md` + `docs/rbac.md` + `docs/status.md` |
| Schema | `docs/data-model.md` |
| Tela admin | `docs/admin-ui-blueprint.md` + `docs/navigation-map.md` + `docs/status.md` |
| Integração | `docs/integrations.md` + `docs/status.md` |
| E2E | `docs/e2e-business-flows.md` |
| Sprint | `docs/sprints.md` + `docs/status.md` + `tasks/sprint-N.md` |
| Arquitetura | `docs/architecture.md` |
| Env/comando | `README.md` + `docs/status.md` + `.env.example` |

## Passos

1. **Inventário do diff** — listar arquivos alterados e categorizar
2. **Atualizar canônicos** primeiro (matriz RBAC, api-spec, data-model)
3. **Atualizar `docs/status.md`** — tabela de readiness, gaps, checklist
4. **Atualizar `docs/sprints.md`** se sprint foi concluída
5. **Atualizar `tasks/sprint-N.md`** — marcar checkboxes
6. **Atualizar `README.md`** se houve mudança de setup/env/comando
7. **Bumpar datas** (`Última atualização: YYYY-MM-DD`)
8. **Conferir coerência** — status (`✅/⚠️/🔵/❌`) consistente entre docs

## Saída esperada

- Docs atualizados, datados, coerentes
- Sem promessa de feature inexistente
- Sem duplicação criada
- Status sincronizado entre `status.md`, `sprints.md`, `tasks/`

## Categorias de status

- `✅ Implementado` — em produção, funcional
- `⚠️ Parcial` — existe mas falta pedaço; descrever
- `🔵 Planejado` — tem sprint/ticket
- `❌ Fora do MVP` — backlog pós-MVP

## Não fazer

- Duplicar conteúdo entre status/sprints/roadmap
- Prometer feature que não está no código
- Criar doc novo se cabe em existente
- Remover seção histórica em `sprints.md`

## Erros comuns

- Marcar `✅` algo que está em PR ainda não merged
- Esquecer de atualizar `tasks/sprint-N.md`
- Não bumpar data
- Inconsistência (`✅` em status, `⚠️` em sprints para o mesmo item)

## Checklist

- [ ] Docs canônicos afetados atualizados
- [ ] Datas bumpadas
- [ ] Status coerente entre docs
- [ ] Links internos funcionam
- [ ] Nenhuma feature inexistente prometida
- [ ] README atualizado se setup mudou
