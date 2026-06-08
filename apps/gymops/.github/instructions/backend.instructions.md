---
applyTo: "apps/api/**/*.ts"
---

# Instruções — Backend (Fastify + TypeScript)

Aplicam-se a todos os `.ts` em `apps/api/`.

## Stack

- **Fastify 4+** com plugins por domínio
- **TypeScript 5** strict mode, ESM (`"type": "module"` no package)
- **Prisma** via `@gymops/db` (import do package, não do client direto)
- **Zod** para validação de toda entrada
- **bcryptjs** (default import) para hash de senha
- **bullmq + ioredis** para filas
- **openai** SDK oficial
- **web-push** (não Firebase) para Web Push VAPID
- **twilio** para WhatsApp

## Estrutura de pastas

```
apps/api/src/
├── app.ts                  # buildApp() com registro de plugins e rotas
├── index.ts                # process HTTP
├── worker-process.ts       # process dos workers (separado)
├── env.ts                  # validação Zod das env vars
├── lib/                    # utilitários compartilhados
│   ├── prisma.ts           # export do db client singleton
│   ├── rbac.ts             # resolvePermission, resolveActivityPermission
│   ├── audit.ts            # logAudit fire-and-forget
│   ├── queues.ts           # getNotificationQueue, getImportQueue
│   ├── redis.ts            # cacheGet/Set/Del
│   ├── mailer.ts           # nodemailer + templates
│   ├── push.ts             # web-push VAPID
│   ├── whatsapp.ts         # sendWhatsApp(to, msg)
│   └── crypto.ts           # AES-256-GCM encrypt/decrypt
├── routes/<dominio>/
│   └── index.ts            # plugin Fastify do domínio
├── workers/                # processadores BullMQ
└── test/
    └── helpers.ts          # testDb, getApp, resetDb, factories
```

## Convenções de rota

1. **Plugin por domínio**: `export async function nomeRoutes(app: FastifyInstance)` exportado em `routes/<dominio>/index.ts`. Registrar em `app.ts` com prefix.
2. **PreHandler**: usar `{ preHandler: [app.authenticate] }` em rotas protegidas.
3. **Envelope de resposta**: `{ data, meta?, error? }` — nunca devolver bare object.
4. **HTTP status**: 200 (GET/PATCH ok), 201 (POST criado), 204 (DELETE), 400 (Zod fail), 401 (sem token), 403 (sem permissão), 404 (não encontrado), 422 (validação semântica), 500 (interno).
5. **Paginação**: cursor (`after`, `limit` máx 100) para listas grandes; offset (`page`) para admin com paginação numerada.

### Padrão de handler

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

    // 1. Verificar membership/role
    const membership = await db.membership.findFirst({
      where: { userId: request.user.sub, organizationId, role: { in: ['owner', 'org_manager'] }, deletedAt: null },
    });
    if (!membership) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Sem permissão' } });

    // 2. Executar operação
    const created = await db.someEntity.create({ data: { name, organizationId } });

    // 3. Audit log (fire-and-forget)
    void logAudit({
      organizationId,
      userId: request.user.sub,
      action: 'some.created',
      resourceType: 'some',
      resourceId: created.id,
    });

    // 4. Resposta no envelope
    return reply.status(201).send({ data: created });
  });
}
```

## RBAC sempre no backend

- Backend valida em **toda request**. Frontend é só UX.
- Usar helpers em `lib/rbac.ts`:
  - `resolvePermission(userId, requiredRole, scope)` para rotas administrativas
  - `resolveActivityPermission(userId, activityId, action)` para atividades (considera `visibility_mode`, assignees, permissions)
- Atividade `restricted` quebra herança — IA e workers devem chamar `resolveActivityPermission` antes de acessar conteúdo.
- Em casos de risco de enumeração (atividades restritas), devolver **404** em vez de 403.

Para detalhe canônico, ver [`docs/rbac-matrix.md`](../../docs/rbac-matrix.md) e [`docs/rbac.md`](../../docs/rbac.md).

## Rate limiting

Aplicar via `app.register(fastifyRateLimit, { max, timeWindow })` ou por rota:

- `/auth/login`: 10 req/min por IP
- `/auth/refresh`: 30 req/min por IP
- `/ai/*`: 10 req/min por `userId`
- `/invitations` (POST): 20 req/hora por organização

## Erros para o usuário

- Mensagem amigável em pt-BR.
- Sem stack trace, sem nome de tabela, sem mensagem de Prisma vazada.
- Detalhes técnicos só nos logs do servidor (Pino do Fastify).

```typescript
// ❌ Ruim
return reply.status(500).send({ error: { code: 'P2002', message: 'Unique constraint failed on email' } });

// ✅ Bom
return reply.status(409).send({ error: { code: 'EMAIL_TAKEN', message: 'Este e-mail já está cadastrado.' } });
```

## Workers separados da API

- Processo HTTP em `apps/api/src/index.ts` — **não** instancia workers.
- Processo de workers em `apps/api/src/worker-process.ts` — registra todos os processadores BullMQ.
- Filas: `notifications`, `imports`, `ai-summary`, `delay-scan`.
- **Sempre degradar graciosamente** se `REDIS_URL` ausente — usar `setImmediate` como fallback inline (não lançar erro).

```typescript
export async function enqueueNotification(data: NotificationJob): Promise<void> {
  const q = getNotificationQueue();
  if (!q) {
    // Fallback inline (dev sem Redis)
    setImmediate(() => processNotification(data).catch(console.error));
    return;
  }
  await q.add(data.type, data, { removeOnComplete: 100, removeOnFail: 200 });
}
```

## Integrações externas

- Wrapper em `lib/<provider>.ts` (mailer, push, whatsapp, crypto).
- Health/status endpoint quando aplicável (ex: `GET /integrations/whatsapp/status`).
- Logs em `notification_deliveries` para troubleshooting visível na UI admin.
- Quando env var não configurada, endpoint deve responder com erro amigável, não 500.
- Tokens OAuth criptografados com AES-256-GCM antes de gravar — usar `lib/crypto.ts`.

## IA — regras críticas

- **Nunca salvar IA diretamente** — sempre rascunho para confirmação do usuário.
- Timeout 10s sync, 60s em worker.
- Fallback gracioso: `callAI(fn, fallback, timeoutMs)` — nunca 500 por falha de IA.
- **Nunca enviar atividade `restricted` ao LLM** — guard via `resolveActivityPermission`.
- Estrutura forçada: `response_format: { type: 'json_object' }` com schema Zod validado na resposta.
- Detecção de atraso é **SQL determinístico**, não LLM (`activities.due_at < now() AND status != 'concluido'`).

## Audit log

Em operações administrativas (criar/editar/arquivar unidades, áreas, templates, memberships, etc.), chamar:

```typescript
void logAudit({
  organizationId,
  userId: request.user.sub,
  action: 'unit.archived',
  resourceType: 'unit',
  resourceId: unit.id,
  metadata: { previousStatus: 'active' },
  ipAddress: request.ip,
});
```

`logAudit` é fire-and-forget — nunca lança exceção, nunca quebra o fluxo principal.

## Armadilhas conhecidas

```typescript
// Prisma InputJsonValue
value as unknown as Prisma.InputJsonValue  // ✅
value as Prisma.InputJsonValue             // ❌ TS2352

// ActivityTemplate soft delete
where: { deletedAt: null }                 // ✅
where: { isActive: true }                  // ❌

// bcryptjs (CJS-only)
import bcrypt from 'bcryptjs'              // ✅
import { hash } from 'bcryptjs'            // ❌

// WhatsApp signature
sendWhatsApp(to, message)                  // ✅ posicional
sendWhatsApp({ to, body })                 // ❌

// Memberships polimórficas
db.membership.findMany({ where: { scopeType, scopeId } })  // ✅
unit.memberships                                            // ❌

// Imports ESM no projeto API
import { foo } from './bar.js'             // ✅ extensão .js obrigatória
import { foo } from './bar'                // ❌ runtime ESM falha
```

## Variáveis de ambiente

Validar no boot via `apps/api/src/env.ts` com Zod. Nunca acessar `process.env.X` direto em routes/handlers — sempre `env.X`.

Lista completa em [`docs/integrations.md`](../../docs/integrations.md) e [`CLAUDE.md`](../../CLAUDE.md).

## Testes de integração

- Vitest com banco real (Postgres). **Não mockar PostgreSQL.**
- Helpers em `apps/api/src/test/helpers.ts` (testDb, getApp, resetDb, factories).
- Sempre `await resetDb()` em `beforeEach`.
- Antes de testes, garantir todas as tabelas listadas no TRUNCATE de `resetDb()` (atualizar quando adicionar nova tabela).
