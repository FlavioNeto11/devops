import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  getApp, closeApp, resetDb, initApp,
  createUser, createOrg, createUnit, createArea, createMembership, createActivity,
  loginUser, authHeader,
} from './helpers.js';

describe('RBAC', () => {
  beforeAll(initApp);
  afterAll(closeApp);
  beforeEach(resetDb);

  // ── Unit isolation ─────────────────────────────────────────────────────────

  describe('unit_manager isolation', () => {
    it('unit_manager sees activities only in their unit', async () => {
      const app = await getApp();
      const org = await createOrg();
      const unitA = await createUnit(org.id, 'Unit A');
      const unitB = await createUnit(org.id, 'Unit B');
      const area = await createArea(org.id);
      const manager = await createUser({ email: 'mgr@test.com', password: 'pass123' });
      const admin = await createUser({ email: 'admin@test.com', password: 'pass123' });

      // Manager only has access to unitA
      await createMembership(manager.id, org.id, 'unit', unitA.id, 'unit_manager');
      // Admin is org owner
      await createMembership(admin.id, org.id, 'organization', org.id, 'owner');

      const adminToken = await loginUser(app, 'admin@test.com', 'pass123');

      // Create one activity in each unit
      await app.inject({
        method: 'POST',
        url: '/activities',
        headers: authHeader(adminToken),
        payload: { organizationId: org.id, unitId: unitA.id, areaId: area.id, title: 'Activity in A' },
      });
      await app.inject({
        method: 'POST',
        url: '/activities',
        headers: authHeader(adminToken),
        payload: { organizationId: org.id, unitId: unitB.id, areaId: area.id, title: 'Activity in B' },
      });

      // Manager lists activities in their org — should only see unitA
      const mgrToken = await loginUser(app, 'mgr@test.com', 'pass123');
      const res = await app.inject({
        method: 'GET',
        url: `/activities?organizationId=${org.id}`,
        headers: authHeader(mgrToken),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: Array<{ title: string }> };
      const titles = body.data.map((a) => a.title);
      expect(titles).toContain('Activity in A');
      expect(titles).not.toContain('Activity in B');
    });

    it('unit_manager cannot create activities in a unit they do not manage', async () => {
      const app = await getApp();
      const org = await createOrg();
      const unitA = await createUnit(org.id, 'Unit A');
      const unitB = await createUnit(org.id, 'Unit B');
      const area = await createArea(org.id);
      const manager = await createUser({ email: 'mgr@test.com', password: 'pass123' });

      await createMembership(manager.id, org.id, 'unit', unitA.id, 'unit_manager');

      const token = await loginUser(app, 'mgr@test.com', 'pass123');
      const res = await app.inject({
        method: 'POST',
        url: '/activities',
        headers: authHeader(token),
        payload: { organizationId: org.id, unitId: unitB.id, areaId: area.id, title: 'Sneaky' },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('activities list filters', () => {
    it('searches and filters activities using the backend status enum', async () => {
      const app = await getApp();
      const org = await createOrg();
      const unit = await createUnit(org.id);
      const area = await createArea(org.id);
      const owner = await createUser({ email: 'owner@test.com', password: 'pass123' });

      await createMembership(owner.id, org.id, 'organization', org.id, 'owner');

      await createActivity({
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        createdBy: owner.id,
        title: 'Vistoria final do salão',
        status: 'concluido',
      });
      await createActivity({
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        createdBy: owner.id,
        title: 'Troca de lâmpadas do estacionamento',
        status: 'novo',
      });

      const token = await loginUser(app, 'owner@test.com', 'pass123');

      const searchRes = await app.inject({
        method: 'GET',
        url: `/activities?organizationId=${org.id}&search=vistoria`,
        headers: authHeader(token),
      });

      expect(searchRes.statusCode).toBe(200);
      const searchBody = JSON.parse(searchRes.body) as { data: Array<{ title: string }> };
      expect(searchBody.data).toHaveLength(1);
      expect(searchBody.data[0]?.title).toBe('Vistoria final do salão');

      const statusRes = await app.inject({
        method: 'GET',
        url: `/activities?organizationId=${org.id}&status=concluido`,
        headers: authHeader(token),
      });

      expect(statusRes.statusCode).toBe(200);
      const statusBody = JSON.parse(statusRes.body) as { data: Array<{ status: string }> };
      expect(statusBody.data).toHaveLength(1);
      expect(statusBody.data[0]?.status).toBe('concluido');
    });
  });

  // ── Restricted visibility ──────────────────────────────────────────────────

  describe('restricted visibility', () => {
    it('executor cannot view restricted activity without explicit permission', async () => {
      const app = await getApp();
      const org = await createOrg();
      const unit = await createUnit(org.id);
      const area = await createArea(org.id);
      const owner = await createUser({ email: 'owner@test.com', password: 'pass123' });
      const executor = await createUser({ email: 'exec@test.com', password: 'pass123' });

      await createMembership(owner.id, org.id, 'organization', org.id, 'owner');
      await createMembership(executor.id, org.id, 'unit', unit.id, 'executor');

      // Owner creates a restricted activity
      const activity = await createActivity({
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        createdBy: owner.id,
        visibilityMode: 'restricted',
      });

      const execToken = await loginUser(app, 'exec@test.com', 'pass123');
      const res = await app.inject({
        method: 'GET',
        url: `/activities/${activity.id}`,
        headers: authHeader(execToken),
      });

      // Should be 404 (not 403) to avoid leaking existence
      expect(res.statusCode).toBe(404);
    });

    it('assignee can view restricted activity they are assigned to', async () => {
      const app = await getApp();
      const org = await createOrg();
      const unit = await createUnit(org.id);
      const area = await createArea(org.id);
      const owner = await createUser({ email: 'owner@test.com', password: 'pass123' });
      const executor = await createUser({ email: 'exec@test.com', password: 'pass123' });

      await createMembership(owner.id, org.id, 'organization', org.id, 'owner');
      await createMembership(executor.id, org.id, 'unit', unit.id, 'executor');

      const activity = await createActivity({
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        createdBy: owner.id,
        visibilityMode: 'restricted',
      });

      // Assign executor to the activity
      const ownerToken = await loginUser(app, 'owner@test.com', 'pass123');
      await app.inject({
        method: 'POST',
        url: `/activities/${activity.id}/assign`,
        headers: authHeader(ownerToken),
        payload: { add: [{ userId: executor.id, kind: 'responsible' }], remove: [] },
      });

      const execToken = await loginUser(app, 'exec@test.com', 'pass123');
      const res = await app.inject({
        method: 'GET',
        url: `/activities/${activity.id}`,
        headers: authHeader(execToken),
      });

      expect(res.statusCode).toBe(200);
    });

    it('org_manager always sees restricted activities in their org', async () => {
      const app = await getApp();
      const org = await createOrg();
      const unit = await createUnit(org.id);
      const area = await createArea(org.id);
      const orgManager = await createUser({ email: 'org-mgr@test.com', password: 'pass123' });

      await createMembership(orgManager.id, org.id, 'organization', org.id, 'org_manager');

      const activity = await createActivity({
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        createdBy: orgManager.id,
        visibilityMode: 'restricted',
      });

      const token = await loginUser(app, 'org-mgr@test.com', 'pass123');
      const res = await app.inject({
        method: 'GET',
        url: `/activities/${activity.id}`,
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // ── Status transitions ─────────────────────────────────────────────────────

  describe('status transitions', () => {
    it('rejects invalid status transition', async () => {
      const app = await getApp();
      const org = await createOrg();
      const unit = await createUnit(org.id);
      const area = await createArea(org.id);
      const owner = await createUser({ email: 'owner@test.com', password: 'pass123' });
      await createMembership(owner.id, org.id, 'organization', org.id, 'owner');

      const activity = await createActivity({ organizationId: org.id, unitId: unit.id, areaId: area.id, createdBy: owner.id, status: 'concluido' });

      const token = await loginUser(app, 'owner@test.com', 'pass123');
      const res = await app.inject({
        method: 'PATCH',
        url: `/activities/${activity.id}`,
        headers: authHeader(token),
        payload: { status: 'novo' },
      });

      // concluido → novo is not in VALID_TRANSITIONS
      expect(res.statusCode).toBe(422);
    });

    it('allows valid transition: novo → em_andamento', async () => {
      const app = await getApp();
      const org = await createOrg();
      const unit = await createUnit(org.id);
      const area = await createArea(org.id);
      const owner = await createUser({ email: 'owner@test.com', password: 'pass123' });
      await createMembership(owner.id, org.id, 'organization', org.id, 'owner');

      const activity = await createActivity({ organizationId: org.id, unitId: unit.id, areaId: area.id, createdBy: owner.id });

      const token = await loginUser(app, 'owner@test.com', 'pass123');
      const res = await app.inject({
        method: 'PATCH',
        url: `/activities/${activity.id}`,
        headers: authHeader(token),
        payload: { status: 'em_andamento' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { status: string } };
      expect(body.data.status).toBe('em_andamento');
    });
  });
});
