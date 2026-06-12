import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@gymops/db';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../../lib/prisma.js';
import { hasOrgRole } from '../../lib/rbac.js';
import { logAudit } from '../../lib/audit.js';
import { bootstrapOrganization } from '../../lib/bootstrap-organization.js';
import { OrgBlueprintSchema } from '../../lib/org-blueprint.schema.js';
import { callAI, chatJSON } from '../../ai/ai.service.js';
import { OrgSetupDraftSchema } from '../../ai/schemas/org-setup-draft.schema.js';
import { buildOrgSetupPrompt } from '../../ai/prompts/org-setup.prompt.js';

export const organizationRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /organizations/slug-available ────────────────────────────────────────
  app.get('/slug-available', async (request, reply) => {
    const { slug } = z.object({ slug: z.string().min(2) }).parse(request.query);
    const existing = await db.organization.findUnique({ where: { slug } });
    return reply.send({ data: { available: !existing } });
  });

  // ── POST /organizations — public wizard endpoint ─────────────────────────────
  const createOrgSchema = z.object({
    name: z.string().min(2).max(100),
    slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
    ownerEmail: z.string().email(),
    ownerName: z.string().min(2).max(100),
    ownerPassword: z.string().min(8),
    initialUnit: z.object({
      name: z.string().min(1).max(100),
      code: z.string().max(20).optional(),
      address: z.string().max(255).optional(),
    }).optional(),
    // Estrutura customizada do onboarding (qualquer segmento) — montada pelo
    // usuário (manual) ou pela IA APÓS revisão humana. Sem blueprint, o
    // bootstrap usa o catálogo canônico (comportamento atual).
    blueprint: OrgBlueprintSchema.optional(),
    setupMeta: z.object({
      mode: z.enum(['ai', 'manual']),
      segmentLabel: z.string().max(60).optional(),
    }).optional(),
  });

  app.post(
    '/',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const body = createOrgSchema.safeParse(request.body);
      if (!body.success)
        return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });

      const { name, slug, ownerEmail, ownerName, ownerPassword, initialUnit, blueprint, setupMeta } = body.data;

      if (blueprint?.units?.length && initialUnit) {
        return reply.status(422).send({ error: { code: 'CONFLICTING_UNITS', message: 'Use blueprint.units OR initialUnit, not both' } });
      }

      const existingSlug = await db.organization.findUnique({ where: { slug } });
      if (existingSlug)
        return reply.status(422).send({ error: { code: 'SLUG_TAKEN', message: 'Slug already taken' } });

      const existingUser = await db.user.findUnique({ where: { email: ownerEmail, deletedAt: null } });
      if (existingUser)
        return reply.status(422).send({ error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } });

      const passwordHash = await bcrypt.hash(ownerPassword, 10);

      const result = await bootstrapOrganization({
        name,
        slug,
        owner: { name: ownerName, email: ownerEmail, passwordHash },
        initialUnit,
        blueprint,
        ...(setupMeta ? { settings: { onboarding: setupMeta } } : {}),
      });

      return reply.status(201).send({
        data: {
          organizationId: result.organizationId,
          organizationSlug: slug,
          userId: result.ownerUserId,
        },
      });
    },
  );

  // ── POST /organizations/setup-draft — rascunho de configuração por IA ───────
  // PÚBLICO (o cadastro acontece antes de existir conta) e por isso com rate
  // limit apertado + entrada limitada. A IA NUNCA cria nada: devolve uma
  // proposta (áreas/templates/unidades adequadas ao negócio DESCRITO) que o
  // usuário revisa/edita no wizard e só então confirma via POST /organizations
  // com blueprint. Conhecimento setorial vive no prompt — nenhum mapa
  // segmento→estrutura no código.
  app.post(
    '/setup-draft',
    { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const body = z.object({
        businessDescription: z.string().min(10).max(1500),
        organizationName: z.string().min(2).max(100).optional(),
      }).safeParse(request.body);
      if (!body.success)
        return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });

      const prompt = buildOrgSetupPrompt({
        businessDescription: body.data.businessDescription,
        organizationName: body.data.organizationName,
      });

      const attempt = () => callAI(
        (client) => chatJSON(client, prompt),
        null,
        { stage: 'org-setup', timeoutMs: 30_000 },
      );

      let raw = await attempt();
      if (raw === null) {
        return reply.status(503).send({ error: { code: 'AI_UNAVAILABLE', message: 'AI assistant is unavailable right now' } });
      }

      let parsed = OrgSetupDraftSchema.safeParse(raw);
      if (!parsed.success) {
        // 1 retry — saída fora do contrato não é consertada no código.
        raw = await attempt();
        parsed = raw === null
          ? parsed
          : OrgSetupDraftSchema.safeParse(raw);
        if (!parsed.success) {
          return reply.status(502).send({ error: { code: 'AI_INVALID_OUTPUT', message: 'AI returned an invalid structure, try again' } });
        }
      }

      return reply.send({ data: parsed.data });
    },
  );
  // ── GET /organizations/:id ───────────────────────────────────────────────────
  app.get(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user.sub;

      // Must be a member to view
      const isMember = await db.membership.findFirst({
        where: { userId, organizationId: id, deletedAt: null },
      });
      if (!isMember) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      }

      const org = await db.organization.findUnique({
        where: { id, deletedAt: null },
      });
      if (!org) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      }

      return reply.send({ data: org });
    },
  );

  // ── PATCH /organizations/:id ─────────────────────────────────────────────────
  const patchSchema = z.object({
    name: z.string().min(2).optional(),
    logoUrl: z.string().url().nullable().optional(),
    settings: z.record(z.unknown()).optional(),
  });

  app.patch(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user.sub;

      const isOwner = await hasOrgRole(userId, id, ['owner']);
      if (!isOwner) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only owners can edit organization' } });
      }

      const body = patchSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() } });
      }

      const { settings, ...restData } = body.data;
      const org = await db.organization.update({
        where: { id },
        data: {
          ...restData,
          ...(settings !== undefined && { settings: settings as Prisma.InputJsonValue }),
        },
      });

      void logAudit({ organizationId: id, userId, action: 'org.updated', resourceType: 'organization', resourceId: id });

      return reply.send({ data: org });
    },
  );

  // ── GET /organizations/:id/me ── current user memberships in this org
  app.get(
    '/:id/me',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user.sub;

      const memberships = await db.membership.findMany({
        where: { userId, organizationId: id, deletedAt: null },
        select: { scopeType: true, scopeId: true, role: true },
      });

      return reply.send({ data: memberships });
    },
  );
};
