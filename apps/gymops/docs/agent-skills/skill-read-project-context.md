# Skill: Read Project Context

## Objetivo

Carregar o contexto mínimo necessário para qualquer tarefa no GymOps, evitando trabalhar com premissa errada sobre o estado do projeto.

## Quando usar

- Início de qualquer sessão / tarefa
- Quando o pedido for vago e exigir entendimento do que já existe
- Antes de planejar implementação

## Quando NÃO usar

- Pergunta pontual sobre arquivo conhecido (use Read direto)
- Resposta puramente conversacional

## Entradas esperadas

- Tipo da tarefa (sprint, tela, endpoint, RBAC, integração, refator, doc)
- Sprint atual (se aplicável)

## Arquivos de contexto (obrigatórios)

Sempre:

1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/status.md`](../status.md)

Condicionais por tipo:

| Tipo | Arquivos adicionais |
|---|---|
| Sprint inteira | `tasks/sprint-N.md`, `docs/product-roadmap.md`, `docs/sprints.md` |
| Tela admin | `docs/admin-ui-blueprint.md`, `docs/navigation-map.md`, `docs/rbac-matrix.md` |
| Endpoint | `docs/api-spec.md`, `.github/instructions/backend.instructions.md` |
| RBAC | `docs/rbac-matrix.md`, `docs/rbac.md`, `.github/instructions/rbac.instructions.md` |
| Schema | `docs/data-model.md`, `.github/instructions/database.instructions.md` |
| Integração | `docs/integrations.md`, `.github/instructions/integrations.instructions.md` |
| E2E | `docs/e2e-business-flows.md`, `.github/instructions/tests.instructions.md` |
| Doc | `.github/instructions/docs.instructions.md` |

## Passos

1. Identificar o tipo da tarefa
2. Ler arquivos obrigatórios
3. Ler arquivos condicionais
4. Em caso de telas existentes similares, ler 1-2 para padrão (não todas)
5. Resumir mentalmente: o que já existe, o que falta, o que pode quebrar

## Saída esperada

Não produz arquivo. Produz **entendimento** que orienta o planejamento (próxima skill).

## Erros comuns

- Pular `docs/status.md` e duplicar trabalho já feito
- Ler 20 arquivos quando 3 bastam
- Confundir `docs/sprints.md` (narrativo) com `docs/status.md` (snapshot)

## Checklist

- [ ] `AGENTS.md` lido nesta sessão
- [ ] `docs/status.md` lido (último update + tabela de readiness)
- [ ] Arquivos condicionais do tipo da tarefa lidos
- [ ] Tenho clareza do que já existe e do que falta
