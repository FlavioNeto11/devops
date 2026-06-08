import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  getApp, closeApp, resetDb, initApp,
  createUser, createOrg, createUnit, createArea, createMembership, createActivity,
  loginUser, authHeader, testDb,
} from './helpers.js';

describe('Recurrence', () => {
  beforeAll(initApp);
  afterAll(closeApp);
  beforeEach(resetDb);

  async function setup() {
    const app = await getApp();
    const org = await createOrg();
    const unit = await createUnit(org.id);
    const area = await createArea(org.id);
    const owner = await createUser({ email: 'owner@test.com', password: 'pass123' });
    await createMembership(owner.id, org.id, 'organization', org.id, 'owner');
    const token = await loginUser(app, 'owner@test.com', 'pass123');
    return { app, org, unit, area, owner, token };
  }

  // ── POST /activities/:id/recurrence ───────────────────────────────────────

  describe('POST /activities/:id/recurrence', () => {
    it('creates daily recurrence rule and calculates next_run_at', async () => {
      const { app, org, unit, area, owner, token } = await setup();
      const dueAt = new Date(Date.now() + 7 * 86_400_000); // 1 week from now
      const activity = await createActivity({
        organizationId: org.id, unitId: unit.id, areaId: area.id,
        createdBy: owner.id, dueAt,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/activities/${activity.id}/recurrence`,
        headers: authHeader(token),
        payload: { frequency: 'diaria', interval: 1, generationMode: 'on_complete' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { frequency: string; nextRunAt: string } };
      expect(body.data.frequency).toBe('diaria');
      // nextRunAt should be dueAt + 1 day
      const expectedNext = new Date(dueAt.getTime() + 86_400_000);
      const actualNext = new Date(body.data.nextRunAt);
      const diffMs = Math.abs(actualNext.getTime() - expectedNext.getTime());
      expect(diffMs).toBeLessThan(1000); // within 1 second
    });

    it('calculates weekly recurrence on specified weekdays', async () => {
      const { app, org, unit, area, owner, token } = await setup();
      const monday = new Date();
      // Set to next Monday
      monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
      monday.setHours(10, 0, 0, 0);

      const activity = await createActivity({
        organizationId: org.id, unitId: unit.id, areaId: area.id,
        createdBy: owner.id, dueAt: monday,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/activities/${activity.id}/recurrence`,
        headers: authHeader(token),
        payload: { frequency: 'semanal', interval: 1, weekdays: [1, 3, 5], generationMode: 'on_complete' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { nextRunAt: string } };
      const nextDay = new Date(body.data.nextRunAt).getDay();
      // Next should be Wed (3) or Fri (5) since current is Mon (1)
      expect([1, 3, 5]).toContain(nextDay);
    });

    it('upserts rule when called twice (updates existing rule)', async () => {
      const { app, org, unit, area, owner, token } = await setup();
      const activity = await createActivity({
        organizationId: org.id, unitId: unit.id, areaId: area.id, createdBy: owner.id,
      });

      // First call: daily
      await app.inject({
        method: 'POST',
        url: `/activities/${activity.id}/recurrence`,
        headers: authHeader(token),
        payload: { frequency: 'diaria', interval: 1, generationMode: 'on_complete' },
      });

      // Second call: change to weekly
      const res = await app.inject({
        method: 'POST',
        url: `/activities/${activity.id}/recurrence`,
        headers: authHeader(token),
        payload: { frequency: 'semanal', interval: 1, generationMode: 'on_complete' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { frequency: string } };
      expect(body.data.frequency).toBe('semanal');

      // Only one rule should exist
      const count = await testDb.recurrenceRule.count({ where: { activityId: activity.id } });
      expect(count).toBe(1);
    });
  });

  // ── DELETE /activities/:id/recurrence ────────────────────────────────────

  describe('DELETE /activities/:id/recurrence', () => {
    it('removes recurrence rule', async () => {
      const { app, org, unit, area, owner, token } = await setup();
      const activity = await createActivity({
        organizationId: org.id, unitId: unit.id, areaId: area.id, createdBy: owner.id,
      });

      await app.inject({
        method: 'POST',
        url: `/activities/${activity.id}/recurrence`,
        headers: authHeader(token),
        payload: { frequency: 'diaria', interval: 1, generationMode: 'on_complete' },
      });

      const del = await app.inject({
        method: 'DELETE',
        url: `/activities/${activity.id}/recurrence`,
        headers: authHeader(token),
      });

      expect(del.statusCode).toBe(204);
      const count = await testDb.recurrenceRule.count({ where: { activityId: activity.id } });
      expect(count).toBe(0);
    });

    it('returns 404 when no rule exists', async () => {
      const { app, org, unit, area, owner, token } = await setup();
      const activity = await createActivity({
        organizationId: org.id, unitId: unit.id, areaId: area.id, createdBy: owner.id,
      });

      const res = await app.inject({
        method: 'DELETE',
        url: `/activities/${activity.id}/recurrence`,
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── on_complete trigger ───────────────────────────────────────────────────

  describe('on_complete generation', () => {
    it('generates next activity when marking concluido with on_complete rule', async () => {
      const { app, org, unit, area, owner, token } = await setup();
      const dueAt = new Date(Date.now() + 86_400_000);
      const activity = await createActivity({
        organizationId: org.id, unitId: unit.id, areaId: area.id,
        createdBy: owner.id, dueAt, status: 'em_andamento',
      });

      // Set recurrence rule
      await app.inject({
        method: 'POST',
        url: `/activities/${activity.id}/recurrence`,
        headers: authHeader(token),
        payload: { frequency: 'diaria', interval: 1, generationMode: 'on_complete' },
      });

      // Mark activity as concluido
      await app.inject({
        method: 'PATCH',
        url: `/activities/${activity.id}`,
        headers: authHeader(token),
        payload: { status: 'concluido' },
      });

      // Wait for async generation
      await new Promise((r) => setTimeout(r, 200));

      // A new activity should have been generated with the same title
      const newActivities = await testDb.activity.findMany({
        where: { organizationId: org.id, title: 'Test Activity' },
        orderBy: { createdAt: 'asc' },
      });

      expect(newActivities.length).toBeGreaterThanOrEqual(2);
      // Second activity should have dueAt = original dueAt + 1 day
      const second = newActivities[1];
      expect(second).toBeDefined();
      if (second?.dueAt) {
        const diff = Math.abs(second.dueAt.getTime() - (dueAt.getTime() + 86_400_000));
        expect(diff).toBeLessThan(5000);
      }
    });

    it('does NOT generate new activity before marking concluido', async () => {
      const { app, org, unit, area, owner, token } = await setup();
      const activity = await createActivity({
        organizationId: org.id, unitId: unit.id, areaId: area.id, createdBy: owner.id, status: 'em_andamento',
      });

      await app.inject({
        method: 'POST',
        url: `/activities/${activity.id}/recurrence`,
        headers: authHeader(token),
        payload: { frequency: 'diaria', interval: 1, generationMode: 'on_complete' },
      });

      // Change to a non-conclusive status
      await app.inject({
        method: 'PATCH',
        url: `/activities/${activity.id}`,
        headers: authHeader(token),
        payload: { status: 'aguardando_terceiro' },
      });

      await new Promise((r) => setTimeout(r, 100));

      const count = await testDb.activity.count({ where: { organizationId: org.id } });
      expect(count).toBe(1); // Only the original
    });
  });
});
