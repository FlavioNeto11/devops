import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  getApp, closeApp, resetDb, initApp, createUser, loginUser, authHeader, testDb,
} from './helpers.js';

interface ProgressRow {
  id: string;
  tutorialId: string;
  status: string;
  currentStepId: string | null;
  completedSteps: string[];
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  updatedAt: string;
}

describe('Tutorial progress', () => {
  beforeAll(initApp);
  afterAll(closeApp);
  beforeEach(resetDb);

  // ── GET /me/tutorial-progress ────────────────────────────────────────────────

  describe('GET /me/tutorial-progress', () => {
    it('returns 401 sem token', async () => {
      const app = await getApp();
      const res = await app.inject({ method: 'GET', url: '/me/tutorial-progress' });
      expect(res.statusCode).toBe(401);
    });

    it('retorna lista vazia para usuário novo', async () => {
      const app = await getApp();
      const user = await createUser({ email: 'alice@test.com', password: 'Password123!' });
      const token = await loginUser(app, user.email, 'Password123!');

      const res = await app.inject({
        method: 'GET',
        url: '/me/tutorial-progress',
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: ProgressRow[] };
      expect(body.data).toEqual([]);
    });
  });

  // ── PATCH /me/tutorial-progress/:id ──────────────────────────────────────────

  describe('PATCH /me/tutorial-progress/:tutorialId', () => {
    it('cria progresso com status in_progress automaticamente', async () => {
      const app = await getApp();
      const user = await createUser({ email: 'bob@test.com', password: 'Password123!' });
      const token = await loginUser(app, user.email, 'Password123!');

      const res = await app.inject({
        method: 'PATCH',
        url: '/me/tutorial-progress/first-steps',
        headers: authHeader(token),
        payload: { currentStepId: 'welcome' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: ProgressRow };
      expect(body.data.tutorialId).toBe('first-steps');
      expect(body.data.status).toBe('in_progress');
      expect(body.data.currentStepId).toBe('welcome');
      expect(body.data.startedAt).toBeTruthy();
    });

    it('upserta — segunda chamada atualiza completedSteps', async () => {
      const app = await getApp();
      const user = await createUser({ email: 'carol@test.com', password: 'Password123!' });
      const token = await loginUser(app, user.email, 'Password123!');

      await app.inject({
        method: 'PATCH',
        url: '/me/tutorial-progress/dashboard-overview',
        headers: authHeader(token),
        payload: { status: 'in_progress', currentStepId: 'kpis' },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: '/me/tutorial-progress/dashboard-overview',
        headers: authHeader(token),
        payload: { completedSteps: ['open', 'kpis'], currentStepId: 'units-table' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: ProgressRow };
      expect(body.data.completedSteps).toEqual(['open', 'kpis']);
      expect(body.data.currentStepId).toBe('units-table');
    });

    it('status=completed preenche completedAt', async () => {
      const app = await getApp();
      const user = await createUser({ email: 'dave@test.com', password: 'Password123!' });
      const token = await loginUser(app, user.email, 'Password123!');

      const res = await app.inject({
        method: 'PATCH',
        url: '/me/tutorial-progress/my-activities',
        headers: authHeader(token),
        payload: { status: 'completed', completedSteps: ['open', 'tabs', 'list'] },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: ProgressRow };
      expect(body.data.status).toBe('completed');
      expect(body.data.completedAt).toBeTruthy();
    });

    it('tutorialId inválido retorna 422', async () => {
      const app = await getApp();
      const user = await createUser({ email: 'eve@test.com', password: 'Password123!' });
      const token = await loginUser(app, user.email, 'Password123!');

      const res = await app.inject({
        method: 'PATCH',
        url: '/me/tutorial-progress/INVALID_HAS_CAPS',
        headers: authHeader(token),
        payload: { status: 'in_progress' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('status inválido retorna 422', async () => {
      const app = await getApp();
      const user = await createUser({ email: 'frank@test.com', password: 'Password123!' });
      const token = await loginUser(app, user.email, 'Password123!');

      const res = await app.inject({
        method: 'PATCH',
        url: '/me/tutorial-progress/first-steps',
        headers: authHeader(token),
        payload: { status: 'WRONG' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('usuário não vê progresso de outro usuário', async () => {
      const app = await getApp();
      const userA = await createUser({ email: 'a@test.com', password: 'Password123!' });
      const userB = await createUser({ email: 'b@test.com', password: 'Password123!' });
      const tokenA = await loginUser(app, userA.email, 'Password123!');
      const tokenB = await loginUser(app, userB.email, 'Password123!');

      await app.inject({
        method: 'PATCH',
        url: '/me/tutorial-progress/first-steps',
        headers: authHeader(tokenA),
        payload: { status: 'completed' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/me/tutorial-progress',
        headers: authHeader(tokenB),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: ProgressRow[] };
      expect(body.data).toEqual([]);

      // confirma no DB que userA tem 1 entrada
      const rowsA = await testDb.tutorialProgress.findMany({ where: { userId: userA.id } });
      expect(rowsA).toHaveLength(1);
      expect(rowsA[0]?.status).toBe('completed');
    });
  });

  // ── POST /me/tutorial-progress/:id/restart ───────────────────────────────────

  describe('POST /me/tutorial-progress/:tutorialId/restart', () => {
    it('zera completedSteps e marca in_progress', async () => {
      const app = await getApp();
      const user = await createUser({ email: 'grace@test.com', password: 'Password123!' });
      const token = await loginUser(app, user.email, 'Password123!');

      await app.inject({
        method: 'PATCH',
        url: '/me/tutorial-progress/first-steps',
        headers: authHeader(token),
        payload: { status: 'completed', completedSteps: ['welcome', 'structure'] },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/me/tutorial-progress/first-steps/restart',
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: ProgressRow };
      expect(body.data.status).toBe('in_progress');
      expect(body.data.completedSteps).toEqual([]);
      expect(body.data.completedAt).toBeNull();
    });

    it('tutorialId inválido no restart retorna 422', async () => {
      const app = await getApp();
      const user = await createUser({ email: 'hank@test.com', password: 'Password123!' });
      const token = await loginUser(app, user.email, 'Password123!');

      const res = await app.inject({
        method: 'POST',
        url: '/me/tutorial-progress/HAS_CAPS/restart',
        headers: authHeader(token),
      });
      expect(res.statusCode).toBe(422);
    });
  });
});
