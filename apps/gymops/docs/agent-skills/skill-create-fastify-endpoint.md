# Skill: Create Fastify Endpoint

## Objetivo

Criar endpoint REST Fastify com Zod, RBAC, audit log e envelope padrão.

## Quando usar

- Pedido para adicionar endpoint
- Pedido para alterar endpoint (mudar contrato, regras)

## Quando NÃO usar

- Mudança interna que não afeta contrato externo (use `skill-refactor` futuramente)

## Entradas esperadas

- Método HTTP, path
- Body schema (campos + tipos)
- Response schema
- Role(s) que pode(m) chamar
- Audit log action name (se administrativo)

## Arquivos de contexto

1. [`docs/api-spec.md`](../api-spec.md) — convenções
2. [`docs/rbac-matrix.md`](../rbac-matrix.md) — role exigido
3. [`.github/instructions/backend.instructions.md`](../../.github/instructions/backend.instructions.md)
4. Plugin existente do domínio em `apps/api/src/routes/<dominio>/`
5. `apps/api/src/lib/audit.ts`

## Passos

1. **Escolher plugin** — adicionar ao plugin existente do domínio ou criar novo
2. **Schema Zod** — definir no topo do handler ou em `routes/<dominio>/schemas.ts`
3. **PreHandler `[app.authenticate]`** — exceto rotas públicas
4. **Validar entrada** — `safeParse` com 422 em erro
5. **Verificar permissão** — `db.membership.findFirst` ou `resolveActivityPermission`
6. **Executar operação** — Prisma query
7. **Audit log** — `void logAudit({...})` fire-and-forget
8. **Resposta envelope** — `{ data }` ou `{ data, meta }`
9. **Registrar rota** em `apps/api/src/app.ts` se plugin novo
10. **Teste de integração** — happy + 403 + 422 mínimo
11. **Atualizar `docs/api-spec.md`** com novo endpoint

## Padrão de handler

```typescript
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { db } from '../../lib/prisma.js';
import { logAudit } from '../../lib/audit.js';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  organizationId: z.string().uuid(),
});

export async function exemploRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', details: parsed.error.flatten() },
      });
    }
    const { name, organizationId } = parsed.data;

    const allowed = await db.membership.findFirst({
      where: {
        userId: request.user.sub,
        organizationId,
        role: { in: ['owner', 'org_manager'] },
        deletedAt: null,
      },
    });
    if (!allowed) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Sem permissão' } });
    }

    const created = await db.example.create({ data: { name, organizationId } });

    void logAudit({
      organizationId,
      userId: request.user.sub,
      action: 'example.created',
      resourceType: 'example',
      resourceId: created.id,
    });

    return reply.status(201).send({ data: created });
  });
}
```

## Saída esperada

- Handler implementado no plugin certo
- Rota registrada em `app.ts` (se plugin novo)
- Teste de integração cobrindo happy + RBAC negado + Zod fail
- `docs/api-spec.md` atualizado

## Erros comuns

- Esquecer `preHandler: [app.authenticate]`
- Confiar em token sem checar membership
- Esquecer envelope (bare object)
- Vazar mensagem técnica de Prisma
- Esquecer audit em ação administrativa
- Esquecer extensão `.js` em imports ESM

## Checklist

- [ ] Zod validando entrada
- [ ] RBAC validada (incluindo membership ativa)
- [ ] Envelope `{ data, meta?, error? }`
- [ ] Status code semântico
- [ ] Audit log se administrativo
- [ ] Teste cobre happy + 403 + 422
- [ ] `docs/api-spec.md` atualizado
- [ ] Lint + typecheck OK
