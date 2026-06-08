# Skill: Validate RBAC

## Objetivo

Verificar que uma regra de permissão está consistente entre matriz canônica, backend, frontend e testes — sem desalinhamento.

## Quando usar

- Após qualquer mudança em RBAC
- Antes de release/merge de PR que toca em auth/permissão
- Quando o usuário pedir auditoria de permissões

## Quando NÃO usar

- Mudança que não toca em permissão

## Entradas esperadas

- Endpoint ou tela afetada
- Papéis envolvidos
- Visibility mode (se atividade)

## Arquivos de contexto

1. [`docs/rbac-matrix.md`](../rbac-matrix.md) — canônico
2. [`docs/rbac.md`](../rbac.md) — algoritmo
3. `apps/api/src/lib/rbac.ts`
4. Rota Fastify afetada
5. Tela frontend afetada

## Passos

1. **Conferir matriz** — `docs/rbac-matrix.md` define o comportamento esperado por role
2. **Conferir backend** — handler Fastify implementa exatamente isso?
3. **Conferir frontend** — UI esconde a ação para roles sem permissão? (UX, não segurança)
4. **Conferir teste** — vitest cobre owner, role permitido e role negado?
5. **Conferir audit log** — ação sensível gera `logAudit`?
6. **Conferir 403 vs 404** — risco de enumeração tratado?
7. **Verificar proteção último owner** se aplicável (`DELETE /memberships/:id`, `PATCH role`)

## Saída esperada

- Lista de divergências encontradas (se houver)
- Correções aplicadas
- Atualização em `docs/rbac-matrix.md` "Desalinhamentos conhecidos" (resolvido / novo)

## Erros comuns

- Confiar só no frontend para impedir ação
- Esquecer de testar role negado
- Esquecer audit log
- Não verificar caso de atividade `restricted`
- Permitir remover último owner

## Checklist

- [ ] Matriz canônica reflete a regra
- [ ] Backend implementa
- [ ] Frontend esconde UI sem permissão (UX)
- [ ] Teste cobre cada role relevante
- [ ] Audit log presente em ação sensível
- [ ] 403/404 correto
- [ ] Proteção último owner OK (se aplicável)
- [ ] Atividade `restricted` tratada se aplicável
- [ ] Desalinhamentos documentados em `docs/rbac-matrix.md`
