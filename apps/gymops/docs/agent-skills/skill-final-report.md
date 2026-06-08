# Skill: Final Report

## Objetivo

Gerar relatório final estruturado para tarefa concluída, sprint encerrada ou descrição de PR.

## Quando usar

- Conclusão de tarefa não-trivial
- Encerramento de sprint
- Preparação de PR para revisão

## Quando NÃO usar

- Resposta conversacional simples
- Ajuste pontual sem mudança de arquivo

## Entradas esperadas

- Lista de arquivos alterados (`git status`)
- Tipo da tarefa (sprint, feature, refactor, fix, etc.)
- Validações já executadas
- Docs atualizados

## Estrutura padrão

```markdown
## Resumo executivo

[1-3 frases — o que foi entregue em linguagem de negócio]

## Mudanças

### Backend
- `apps/api/src/routes/x/index.ts` — [o que mudou]

### Frontend
- `apps/web/src/app/(app)/y/page.tsx` — [o que mudou]

### Banco
- Migration: [nome] — [descrição]

### Docs
- `docs/status.md` — [seção atualizada]
- `docs/api-spec.md` — [endpoint adicionado]

## Endpoints adicionados/alterados

- `POST /x` — [descrição]

## Telas adicionadas/alteradas

- `/y` — [propósito + roles que veem]

## RBAC

[Mudou alguma permissão? Sim/Não. Se sim, link `docs/rbac-matrix.md`]

## Validações executadas

- [x] `pnpm typecheck` — sem erros
- [x] `pnpm lint` — sem warnings novos
- [x] `pnpm --filter @gymops/api test` — passa
- [x] `pnpm --filter @gymops/web build` — passa

## Risco / pontos de atenção

[O que pode quebrar, requer atenção em deploy]

## Limitações conhecidas

[O que ficou parcial e por quê — não esconder]

## Próximos passos sugeridos

[O que vem depois]
```

## Princípios

- **Linguagem de negócio no resumo** — leitor não-técnico entende
- **Detalhe técnico nas seções específicas**
- **Caminhos relativos** para arquivos
- **Não esconder pendências** — se ficou parcial, dizer
- **Validações com resultado real** — não inventar
- **Riscos honestos** — proteger o leitor

## Não fazer

- Não listar cada commit como item
- Não repetir título do PR no corpo
- Não prometer feature futura como pronta
- Não esconder regressão ou warning novo

## Comandos úteis

```bash
git diff main --stat
git log main..HEAD --oneline
git diff main --name-only
git diff main -- docs/
```

## Erros comuns

- Lista de commits em vez de narrativa
- Sem validação documentada
- Esconder pendências
- Linguagem técnica demais no resumo

## Checklist

- [ ] Resumo executivo em linguagem de negócio
- [ ] Arquivos listados com caminho relativo
- [ ] Endpoints/telas documentados
- [ ] Validações documentadas com resultado real
- [ ] Limitações declaradas (se houver)
- [ ] Próximos passos sugeridos
- [ ] Pronto para colar em PR ou compartilhar
