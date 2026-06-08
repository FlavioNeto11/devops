---
applyTo: "docs/**/*.md,tasks/**/*.md,README.md,CLAUDE.md,AGENTS.md,.github/**/*.md"
---

# Instruções — Documentação

Aplicam-se a toda documentação versionada do repositório.

## Idioma

- **Português brasileiro (pt-BR)** em toda documentação de produto.
- Termos técnicos consagrados em inglês podem permanecer (ex: "endpoint", "soft delete", "JWT").
- Nome de arquivos sempre em inglês ou kebab-case (`status.md`, `admin-ui-blueprint.md`).

## Categorias de status

Toda feature/módulo/tela deve estar marcada com um dos rótulos:

| Rótulo | Significado |
|---|---|
| `✅ Implementado` | Em produção/no código atual, funcional |
| `⚠️ Parcial` | Existe mas faltam pedaços críticos; descrever o que falta |
| `🔵 Planejado` | Tem sprint/ticket; previsto para horizonte conhecido |
| `❌ Fora do MVP` | Backlog pós-MVP ou explicitamente descartado |

## Sincronização obrigatória

Quando alterar:

| Mudança | Docs a atualizar |
|---|---|
| Endpoint REST | `docs/api-spec.md` |
| Regra de permissão | `docs/rbac-matrix.md` (canônico) + `docs/rbac.md` (algoritmo) |
| Schema Prisma | `docs/data-model.md` |
| Tela administrativa nova | `docs/admin-ui-blueprint.md` + `docs/navigation-map.md` |
| Integração externa | `docs/integrations.md` |
| Critério E2E | `docs/e2e-business-flows.md` |
| Sprint concluída | `docs/sprints.md` + `docs/status.md` |
| Decisão arquitetural | `docs/architecture.md` (seção "Decisões técnicas registradas") |
| Roadmap | `docs/product-roadmap.md` |

## Política do `docs/status.md`

`docs/status.md` é **a fonte da verdade do estado**. Atualizar sempre que:

- Sprint for concluída
- Funcionalidade ganhar/perder estado (implementado, parcial, etc.)
- Gap for fechado ou criado
- Variável de ambiente nova for adicionada

Manter a tabela de "Resumo executivo por camada" sempre atualizada com %.

## Nunca prometer feature inexistente

- Não inventar endpoint que não existe no código.
- Não marcar como `✅ Implementado` algo que não está em `apps/` rodando.
- Se a feature está em PR não merged, marcar como `⚠️ Parcial — em PR #X`.

## Estrutura padrão de documento

```markdown
# Título do Documento

**Última atualização**: 2026-MM-DD

Breve descrição do escopo deste arquivo.

---

## Seção 1

Conteúdo.

## Seção 2

Conteúdo.

---

## Próximos passos / Arquivos relacionados

Links para docs relacionados.
```

## Tabelas

- Usar tabelas Markdown padrão (GitHub Flavored).
- Cabeçalhos curtos, células objetivas.
- Para tabelas largas, considerar listas hierárquicas ou seções em vez de muitas colunas.

## Links internos

- Usar caminho relativo: `[texto](../rbac.md)` ou `[texto](rbac.md)`
- Para arquivos do mesmo diretório: `[rbac-matrix.md](rbac-matrix.md)` (sem `./`)
- Confirmar que o link funciona no GitHub render (não usar `file://` ou paths absolutos)

## Diagramas

- Preferir ASCII art simples (cabe em qualquer ambiente)
- Mermaid quando precisar ser interativo no GitHub
- Wireframes textuais em `docs/wireframes.md` e `docs/admin-ui-blueprint.md`

## Tasks (`tasks/sprint-N.md`)

Formato:

```markdown
# Sprint N — Tema da Sprint

**Objetivo**: ...
**Resultado de negócio**: ...
**Duração**: 2 semanas

---

## Backend — API

### Subdomínio
- [ ] Tarefa específica e mensurável
  - Detalhe técnico (validação, contrato, etc.)

## Frontend — Web

### Tela X
- [ ] Tarefa
- [ ] Critério de aceite verificável

## Banco

## Testes

## Documentação a atualizar
```

Tarefas devem ser checkboxes verificáveis (`- [ ]` → `- [x]` quando feito).

## CHANGELOG informal

Em vez de CHANGELOG separado, usar:

- `docs/sprints.md` como histórico narrativo de sprints
- `docs/status.md` como snapshot atual
- `git log` como histórico granular

## CLAUDE.md, AGENTS.md, .github/copilot-instructions.md

- **CLAUDE.md**: regras específicas para Claude Code; pode ter pitfalls detalhados
- **AGENTS.md**: contrato interoperável entre todos os agentes
- **.github/copilot-instructions.md**: instruções globais do Copilot Chat

Não duplicar conteúdo entre os três — apontar via links. Quando uma regra mudar, atualizar o arquivo canônico e os outros apontam para ele.

## Quando criar um novo doc

- Conteúdo único, com propósito claro
- Não cabe naturalmente em doc existente
- Atualizar o índice em `README.md` (seção Documentação)
- Adicionar referência em `AGENTS.md` se for relevante para agentes

## Quando NÃO criar doc

- Anotação efêmera (use comentário inline no código ou PR description)
- Resumo de sessão de trabalho (use memória de agente ou commit messages)
- Plano de implementação de tarefa única (use task em `tasks/sprint-N.md`)
