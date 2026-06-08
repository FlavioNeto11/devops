import { PrismaClient } from '@gymops/db';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

// Dedicated test client pointing at DATABASE_URL_TEST
export const testDb = new PrismaClient({
  datasources: { db: { url: process.env['DATABASE_URL'] } },
  log: [],
});

let _app: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!_app) {
    _app = await buildApp();
    await _app.ready();
  }
  return _app;
}

// beforeAll-compatible wrapper (returns void, not FastifyInstance)
export async function initApp(): Promise<void> {
  await getApp();
}

export async function closeApp(): Promise<void> {
  if (_app) {
    await _app.close();
    _app = null;
  }
}

// Truncate all tables in dependency order
export async function resetDb(): Promise<void> {
  await testDb.$executeRawUnsafe(`
    TRUNCATE TABLE
      activity_checklist_items,
      activity_checklists,
      activity_comments,
      activity_attachments,
      activity_events,
      activity_assignees,
      activity_permissions,
      recurrence_rules,
      activities,
      activity_templates,
      notification_preferences,
      notification_deliveries,
      tutorial_progress,
      integration_accounts,
      import_sources,
      import_items,
      import_jobs,
      invitations,
      saved_views,
      audit_logs,
      organization_plans,
      unit_areas,
      memberships,
      sessions,
      units,
      areas,
      users,
      organizations
    RESTART IDENTITY CASCADE
  `);
}

// ── Factories ──────────────────────────────────────────────────────────────────

export async function createOrg(slug = 'test-org') {
  return testDb.organization.create({ data: { name: 'Test Org', slug } });
}

export async function createUser(opts: { email?: string; name?: string; password?: string } = {}) {
  const passwordHash = await bcrypt.hash(opts.password ?? 'pass123', 4);
  return testDb.user.create({
    data: {
      name: opts.name ?? 'Test User',
      email: opts.email ?? `user-${Date.now()}@test.com`,
      passwordHash,
    },
  });
}

export async function createMembership(
  userId: string,
  organizationId: string,
  scopeType: 'organization' | 'unit' | 'area',
  scopeId: string,
  role: string,
) {
  return testDb.membership.create({
    data: { userId, organizationId, scopeType, scopeId, role } as never,
  });
}

export async function createUnit(organizationId: string, name = 'Test Unit') {
  return testDb.unit.create({ data: { organizationId, name, code: name.slice(0, 3).toUpperCase() } });
}

export async function createArea(organizationId: string, key = 'admin', name = 'Administrativo') {
  return testDb.area.upsert({
    where: { organizationId_key: { organizationId, key } },
    update: { name },
    create: { organizationId, key, name },
  });
}

export async function createActivity(opts: {
  organizationId: string;
  unitId: string;
  areaId: string;
  createdBy: string;
  title?: string;
  priority?: 'baixa' | 'media' | 'alta' | 'critica';
  status?: 'novo' | 'em_andamento' | 'aguardando_terceiro' | 'aguardando_aprovacao' | 'concluido' | 'cancelado';
  dueAt?: Date;
  visibilityMode?: 'inherited' | 'restricted' | 'shared';
}) {
  return testDb.activity.create({
    data: {
      organizationId: opts.organizationId,
      unitId: opts.unitId,
      areaId: opts.areaId,
      createdBy: opts.createdBy,
      title: opts.title ?? 'Test Activity',
      priority: opts.priority ?? 'media',
      status: opts.status ?? 'novo',
      dueAt: opts.dueAt,
      visibilityMode: opts.visibilityMode ?? 'inherited',
    },
  });
}

// Perform an authenticated API call, returning the bearer token
export async function loginUser(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
  const body = JSON.parse(res.body) as { data?: { accessToken?: string } };
  return body.data?.accessToken ?? '';
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
