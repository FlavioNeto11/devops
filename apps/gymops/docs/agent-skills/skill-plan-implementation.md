# Skill: Plan Implementation

## Objetivo

Transformar um pedido em um plano executável com TodoWrite, identificando dependências, ordem e arquivos a alterar.

## Quando usar

- Tarefa não-trivial (≥3 passos)
- Tarefa multi-camada (backend + frontend + docs)
- Sprint inteira

## Quando NÃO usar

- Ajuste pontual em 1 arquivo
- Resposta a pergunta

## Entradas esperadas

- Contexto carregado (`skill-read-project-context`)
- Tipo da tarefa
- Sprint relevante / docs canônicos lidos

## Arquivos de contexto

- Specs/docs relevantes do tipo de tarefa
- Sprint atual (`tasks/sprint-N.md`)

## Passos

1. **Quebrar em sub-tarefas atômicas** — cada uma com efeito mensurável
2. **Identificar dependências** — schema antes de rota, rota antes de UI, UI antes de E2E
3. **Decidir ordem** — pode ter passos paralelos onde não há dependência
4. **Estimar mentalmente** — se passar de ~15 sub-tarefas, considerar dividir em fases
5. **Criar TodoWrite** com lista
6. **Marcar primeiro item como `in_progress`**

## Estrutura sugerida de plano

```
1. Schema Prisma + migration (se aplicável)
2. Backend: rota Fastify + Zod + RBAC + audit
3. Backend: teste de integração
4. Frontend: API client
5. Frontend: página + componentes + estados
6. Frontend: navegação + visibilidade por role
7. E2E (fluxo principal)
8. Validação (lint + typecheck + test + build)
9. Sincronizar docs (status, sprints, api-spec, etc.)
10. Relatório final
```

## Saída esperada

TodoWrite registrado com 5-15 itens em estado `pending`, primeiro como `in_progress`.

## Erros comuns

- Tarefas vagas demais ("implementar feature")
- Pular dependência (criar UI antes do endpoint)
- Listar 30 micro-tarefas (ruído)
- Esquecer validação e docs (passos 8 e 9)

## Checklist

- [ ] Cada todo é mensurável (sei quando está pronto)
- [ ] Ordem respeita dependências
- [ ] Validação e docs incluídos
- [ ] Primeiro item está `in_progress`
- [ ] Total entre 5 e 15 itens (senão, fragmentar em fases)
