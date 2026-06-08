import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { enqueueNotification } from '../lib/queues.js';
import * as redis from '../lib/redis.js';
import { runDelayScan } from '../workers/delay-scan-worker.js';
import {
  getApp, closeApp, resetDb, initApp,
  createUser, createOrg, createUnit, createArea, createMembership, createActivity,
  loginUser, authHeader, testDb,
} from './helpers.js';

describe('Notifications', () => {
  beforeAll(initApp);
  afterAll(closeApp);
  beforeEach(resetDb);
  beforeEach(() => {
    vi.mocked(enqueueNotification).mockClear();
    vi.restoreAllMocks();
  });

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

  // ── activity_assigned ─────────────────────────────────────────────────────────

  describe('activity_assigned', () => {
    it('enqueues notification for each non-creator assignee', async () => {
      const { app, org, unit, area, owner, token } = await setup();
      const assignee = await createUser({ email: 'assignee@test.com', password: 'pass123' });
      await createMembership(assignee.id, org.id, 'unit', unit.id, 'executor');

      const res = await app.inject({
        method: 'POST',
        url: '/activities',
        headers: authHeader(token),
        payload: {
          organizationId: org.id,
          unitId: unit.id,
          areaId: area.id,
          title: 'Task for assignee',
          assigneeIds: [assignee.id],
        },
      });

      expect(res.statusCode).toBe(201);

      const calls = vi.mocked(enqueueNotification).mock.calls;
      const assigned = calls.filter(([job]) => job.type === 'activity_assigned' && job.userId === assignee.id);
      expect(assigned.length).toBe(1);
    });

    it('does not notify when creator assigns only themselves', async () => {
      const { app, org, unit, area, owner, token } = await setup();

      const res = await app.inject({
        method: 'POST',
        url: '/activities',
        headers: authHeader(token),
        payload: {
          organizationId: org.id,
          unitId: unit.id,
          areaId: area.id,
          title: 'Self-assigned task',
          assigneeIds: [owner.id],
        },
      });

      expect(res.statusCode).toBe(201);

      const calls = vi.mocked(enqueueNotification).mock.calls;
      const selfNotif = calls.filter(([job]) => job.type === 'activity_assigned' && job.userId === owner.id);
      expect(selfNotif.length).toBe(0);
    });
  });

  // ── delay-scan-worker ─────────────────────────────────────────────────────────

  describe('delay-scan', () => {
    it('enqueues overdue notification for alta/critica activity with assignees', async () => {
      const { org, unit, area, owner } = await setup();
      const assignee = await createUser({ email: 'exec@test.com' });

      const activity = await createActivity({
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        createdBy: owner.id,
        priority: 'critica',
        dueAt: new Date(Date.now() - 86_400_000), // 1 day overdue
        status: 'em_andamento',
      });

      await testDb.activityAssignee.create({
        data: { activityId: activity.id, userId: assignee.id, kind: 'responsible' },
      });

      await runDelayScan();

      const calls = vi.mocked(enqueueNotification).mock.calls;
      const overdue = calls.filter(([job]) => job.type === 'overdue' && job.userId === assignee.id);
      expect(overdue.length).toBe(1);
      expect(overdue[0]?.[0]).toMatchObject({
        type: 'overdue',
        activityId: activity.id,
        userId: assignee.id,
      });
    });

    it('skips activity that is already flagged in cache (dedup)', async () => {
      const { org, unit, area, owner } = await setup();
      const assignee = await createUser({ email: 'exec@test.com' });

      const activity = await createActivity({
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        createdBy: owner.id,
        priority: 'critica',
        dueAt: new Date(Date.now() - 86_400_000),
        status: 'em_andamento',
      });

      await testDb.activityAssignee.create({
        data: { activityId: activity.id, userId: assignee.id, kind: 'responsible' },
      });

      // Simulate Redis flag already set — activity was notified in previous scan
      vi.spyOn(redis, 'cacheGet').mockResolvedValue('1');

      await runDelayScan();

      const calls = vi.mocked(enqueueNotification).mock.calls;
      expect(calls.length).toBe(0);
    });

    it('skips baixa/media priority activities', async () => {
      const { org, unit, area, owner } = await setup();
      const assignee = await createUser({ email: 'exec@test.com' });

      const activity = await createActivity({
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        createdBy: owner.id,
        priority: 'baixa',
        dueAt: new Date(Date.now() - 86_400_000),
        status: 'em_andamento',
      });

      await testDb.activityAssignee.create({
        data: { activityId: activity.id, userId: assignee.id, kind: 'responsible' },
      });

      await runDelayScan();

      expect(vi.mocked(enqueueNotification).mock.calls.length).toBe(0);
    });

    it('skips concluido activities', async () => {
      const { org, unit, area, owner } = await setup();
      const assignee = await createUser({ email: 'exec@test.com' });

      const activity = await createActivity({
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        createdBy: owner.id,
        priority: 'critica',
        dueAt: new Date(Date.now() - 86_400_000),
        status: 'concluido',
      });

      await testDb.activityAssignee.create({
        data: { activityId: activity.id, userId: assignee.id, kind: 'responsible' },
      });

      await runDelayScan();

      expect(vi.mocked(enqueueNotification).mock.calls.length).toBe(0);
    });
  });
});
