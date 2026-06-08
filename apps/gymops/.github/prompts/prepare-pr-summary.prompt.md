---
mode: agent
description: Gerar relatório final ou descrição de PR com arquivos, riscos e validações.
---

# Preparar Relatório / Descrição de PR

## Quando usar

- Concluiu uma tarefa não-trivial
- Vai abrir PR
- Vai fechar uma sprint
- Usuário pede "relatório", "summary", "PR description"

## Contexto obrigatório

1. `git diff main` ou `git diff <branch base>`
2. `git log <base>..HEAD --oneline`
3. Tasks da sprint relevante (`tasks/sprint-N.md`)
4. Docs alterados (`git diff main -- docs/`)

## Estrutura do relatório

### Para PR

```markdown
## Resumo

[1-3 frases: o que esse PR entrega em linguagem de negócio]

## Mudanças

### Backend
- [arquivo]: [o que mudou]

### Frontend
- [arquivo]: [o que mudou]

### Banco
- [migration / schema change]

### Docs
- [arquivo]: [o que foi atualizado]

## Endpoints adicionados / alterados

- `POST /xxx` — [descrição]
- `GET /yyy?z=` — [descrição]

## Telas adicionadas / alteradas

- `/settings/xxx` — [propósito + roles que veem]

## RBAC

[Mudou alguma permissão? Sim/Não. Se sim, link para `docs/rbac-matrix.md` atualizado]

## Validações executadas

- [x] `pnpm lint` — passa
- [x] `pnpm typecheck` — passa
- [x] `pnpm --filter @gymops/api test` — passa (N testes)
- [x] `pnpm --filter @gymops/web build` — passa
- [ ] E2E — [status]

## Test plan

- [ ] Cenário 1: ...
- [ ] Cenário 2: ...

## Risco / pontos de atenção

[O que pode quebrar, o que requer atenção em produção]

## Próximos passos

[O que naturalmente vem depois deste PR]
```

### Para relatório de sprint

```markdown
# Sprint N — Relatório de Conclusão

## Resumo executivo

[1 frase: o que a sprint entregou e qual gap fechou]

## Tarefas

[Lista das tarefas da sprint com [x] / [ ] + nota se ficou parcial]

## Entregas

### Backend
- N endpoints novos: ...
- M endpoints alterados: ...

### Frontend
- N telas novas: ...
- M telas alteradas: ...

### Banco
- N migrations: ...
- M tabelas novas: ...

### Docs
- Lista de docs atualizados

## Validações

- Comandos rodados e resultado

## Métricas do código

- Linhas adicionadas/removidas (`git diff --stat`)
- Cobertura de teste (se medida)

## Decisões técnicas tomadas

[Trade-offs notáveis]

## Limitações conhecidas

[O que ficou parcial e por quê]

## Próxima sprint sugerida

[Sprint N+1 ou ajustes a fazer]
```

## Princípios

- **Linguagem de negócio** no resumo; técnico nas mudanças
- **Listar arquivos com caminho relativo** (links se possível)
- **Não esconder pendências** — se algo ficou parcial, dizer
- **Validações documentadas** com resultado real
- **Riscos honestos** — o que pode quebrar em produção

## Não fazer

- Listar cada commit como item separado (o leitor não precisa do diário)
- Repetir o título do PR no corpo
- Promessa de feature futura como se estivesse pronta
- Esconder regressões ou warnings novos

## Comandos úteis

```bash
git diff main --stat
git log main..HEAD --oneline
git diff main -- docs/
git diff main --name-only
```

## Formato da saída

Pronto para colar no GitHub PR ou copiar para um doc. Markdown puro, sem code fences extras envolvendo o template.
