---
mode: agent
description: Criar ou alterar endpoint Fastify com Zod, RBAC, testes e docs.
---

# Adicionar/Alterar Endpoint Fastify

## Quando usar

Quando o pedido for criar/alterar/remover endpoint REST em `apps/api/src/routes/<dominio>/`.

## Contexto obrigatório

1. [`docs/api-spec.md`](../../docs/api-spec.md) — convenções e endpoints existentes
2. [`docs/rbac-matrix.md`](../../docs/rbac-matrix.md) — qual role pode usar
3. [`.github/instructions/backend.instructions.md`](../instructions/backend.instructions.md) — padrões obrigatórios
4. Plugin do domínio em `apps/api/src/routes/<dominio>/index.ts` (se existe)
5. Helpers: `lib/prisma.ts`, `lib/rbac.ts`, `lib/audit.ts`

## Passos

1. **Definir contrato**
   - Método HTTP, path, query, body, response
   - Status codes esperados (200/201/204/400/401/403/404/422/500)
   - Atualizar mentalmente `docs/api-spec.md`

2. **Schema Zod**
   - `const xxxSchema = z.object({...})` no topo do handler ou em `routes/<dominio>/schemas.ts`
   - `safeParse` com retorno 422 em erro

3. **Permissão**
   - `preHandler: [app.authenticate]`
   - Verificar membership/role no início do handler
   - Para atividades: `resolveActivityPermission`
   - 403 se sem permissão, 404 se houver risco de enumeração

4. **Implementação**
   - Validar entrada → resolver permissão → executar operação → audit log → resposta envelope

5. **Audit log** (se for ação administrativa)
   - `void logAudit({...})` — fire-and-forget
   - Action format: `<resource>.<verb>` (`unit.created`, `membership.deleted`)

6. **Registrar rota**
   - Se plugin novo, registrar em `apps/api/src/app.ts` com prefix
   - `await app.register(xxxRoutes, { prefix: '/xxx' });`

7. **Teste de integração**
   - Criar `apps/api/src/routes/<dominio>/<dominio>.test.ts` ou adicionar caso ao existente
   - Cobrir: happy path + 403 (RBAC) + 422 (Zod) + side effect mensurável

8. **Atualizar docs**
   - `docs/api-spec.md`: adicionar/atualizar seção do endpoint
   - `docs/status.md`: atualizar contagem/status do domínio
   - `docs/integrations.md` se for integração externa
   - `docs/rbac-matrix.md` se afetar permissão

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
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', details: parsed.error.flatten() } });
    }
    const { name, organizationId } = parsed.data;

    const allowed = await db.membership.findFirst({
      where: { userId: request.user.sub, organizationId, role: { in: ['owner', 'org_manager'] }, deletedAt: null },
    });
    if (!allowed) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Sem permissão' } });

    const created = await db.example.create({ data: { name, organizationId } });

    void logAudit({
      organizationId, userId: request.user.sub,
      action: 'example.created', resourceType: 'example', resourceId: created.id,
    });

    return reply.status(201).send({ data: created });
  });
}
```

## Critérios de aceite

- [ ] Validação Zod em toda entrada
- [ ] RBAC validada no backend
- [ ] Resposta no envelope `{ data, meta?, error? }`
- [ ] Status codes semânticos
- [ ] Audit log em ações administrativas
- [ ] Teste de integração cobrindo happy path + 403 + 422
- [ ] `docs/api-spec.md` atualizado
- [ ] `pnpm --filter @gymops/api typecheck` passa
- [ ] `pnpm --filter @gymops/api test` passa (ou justificar regressão pré-existente)

## Comandos de validação

```bash
pnpm --filter @gymops/api typecheck
pnpm --filter @gymops/api lint
pnpm --filter @gymops/api test
```

## Formato da resposta final

1. Endpoint criado (método + path)
2. Contrato (body, response, status codes)
3. Permissão exigida
4. Audit log gerado (se aplicável)
5. Arquivos criados/alterados
6. Validações executadas
7. Atualizações em docs
