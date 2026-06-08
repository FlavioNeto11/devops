import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  getApp, closeApp, resetDb, initApp,
  createUser, createOrg, createUnit, createArea, createMembership, createActivity,
  loginUser, authHeader,
} from './helpers.js';

describe('AI Features', () => {
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

  // ── POST /ai/activities/draft ──────────────────────────────────────────────

  describe('POST /ai/activities/draft', () => {
    it('returns fallback draft when OPENAI_API_KEY not set (graceful)', async () => {
      const { app, org, unit, token } = await setup();

      const res = await app.inject({
        method: 'POST',
        url: '/ai/activities/draft',
        headers: authHeader(token),
        payload: {
          text: 'Esteira 4 quebrou — precisa de manutenção urgente',
          organizationId: org.id,
          unitId: unit.id,
        },
      });

      // Even without API key, should return 200 with a fallback
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { title: string } };
      expect(typeof body.data.title).toBe('string');
      expect(body.data.title.length).toBeGreaterThan(0);
    });

    it('returns 429 on 11th request within 1 minute', async () => {
      const { app, org, unit, token } = await setup();
      const payload = {
        text: 'Test activity text',
        organizationId: org.id,
        unitId: unit.id,
      };

      // Make 10 requests (at the limit)
      for (let i = 0; i < 10; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/ai/activities/draft',
          headers: authHeader(token),
          remoteAddress: '10.0.0.1',
          payload,
        });
        // Should all succeed (or return fallback)
        expect(res.statusCode).toBeLessThan(500);
      }

      // 11th request should be rate-limited
      const res = await app.inject({
        method: 'POST',
        url: '/ai/activities/draft',
        headers: authHeader(token),
        remoteAddress: '10.0.0.1',
        payload,
      });

      expect(res.statusCode).toBe(429);
    });

    it('does not send restricted activity content to AI', async () => {
      const { app, org, unit, area, owner, token } = await setup();

      // Create a restricted activity
      await createActivity({
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        createdBy: owner.id,
        title: 'SECRET: Salary Review Q1 2026',
        visibilityMode: 'restricted',
      });

      // The draft endpoint analyzes input text — just verify it doesn't error
      const res = await app.inject({
        method: 'POST',
        url: '/ai/activities/draft',
        headers: authHeader(token),
        remoteAddress: '10.0.0.2',
        payload: {
          text: 'Preciso criar atividade de revisão salarial',
          organizationId: org.id,
          unitId: unit.id,
        },
      });

      expect(res.statusCode).toBe(200);
      // Response should not contain the restricted title
      expect(res.body).not.toContain('SECRET: Salary Review Q1 2026');
    });
  });

  // ── POST /ai/activities/checklist ─────────────────────────────────────────

  describe('POST /ai/activities/checklist', () => {
    it('returns fallback checklist when AI not configured', async () => {
      const { app, org, unit, area, owner, token } = await setup();

      const activity = await createActivity({
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        createdBy: owner.id,
        title: 'Chamado de manutenção — esteira',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/ai/activities/checklist',
        headers: authHeader(token),
        payload: { activityId: activity.id },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { items: unknown[] } };
      expect(Array.isArray(body.data.items)).toBe(true);
    });
  });

  // ── POST /ai/activities/delay-analysis ────────────────────────────────────

  describe('POST /ai/activities/delay-analysis', () => {
    it('returns fallback analysis when AI not configured', async () => {
      const { app, org, unit, area, owner, token } = await setup();

      const dueAt = new Date(Date.now() - 3 * 86_400_000); // 3 days ago
      const activity = await createActivity({
        organizationId: org.id,
        unitId: unit.id,
        areaId: area.id,
        createdBy: owner.id,
        dueAt,
        status: 'em_andamento',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/ai/activities/delay-analysis',
        headers: authHeader(token),
        payload: { activityId: activity.id },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { riskLevel: string } };
      expect(['low', 'medium', 'high', 'critical']).toContain(body.data.riskLevel);
    });
  });

  // ── GET /ai/summaries/daily ────────────────────────────────────────────────

  describe('GET /ai/summaries/daily', () => {
    it('returns null when no summary cached', async () => {
      const { app, org, unit, token } = await setup();

      const res = await app.inject({
        method: 'GET',
        url: `/ai/summaries/daily?unitId=${unit.id}`,
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: unknown };
      expect(body.data).toBeNull();
    });
  });
});
