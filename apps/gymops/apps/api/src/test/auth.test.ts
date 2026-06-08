import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  getApp, closeApp, resetDb, initApp, createUser, createOrg, createMembership, loginUser, authHeader, testDb,
} from './helpers.js';

describe('Auth', () => {
  beforeAll(initApp);
  afterAll(closeApp);
  beforeEach(resetDb);

  // ── POST /auth/register ────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('creates user and returns profile payload', async () => {
      const app = await getApp();
      const org = await createOrg();

      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          name: 'Alice',
          email: 'alice@test.com',
          password: 'Password123!',
          organizationId: org.id,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as { data: { id: string; email: string } };
      expect(body.data.id).toBeTruthy();
      expect(body.data.email).toBe('alice@test.com');
    });

    it('returns 409 if email already exists', async () => {
      const app = await getApp();
      const org = await createOrg();
      await createUser({ email: 'dup@test.com' });

      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { name: 'Dup', email: 'dup@test.com', password: 'Password123!', organizationId: org.id },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  // ── POST /auth/login ───────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('returns access token on valid credentials', async () => {
      const app = await getApp();
      await createUser({ email: 'bob@test.com', password: 'mypassword' });

      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'bob@test.com', password: 'mypassword' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { accessToken: string; user: { email: string } } };
      expect(body.data.accessToken).toBeTruthy();
      expect(body.data.user.email).toBe('bob@test.com');
    });

    it('returns 401 on wrong password', async () => {
      const app = await getApp();
      await createUser({ email: 'bob@test.com', password: 'mypassword' });

      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'bob@test.com', password: 'wrongpassword' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns 401 on unknown email', async () => {
      const app = await getApp();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'nobody@test.com', password: 'anypassword' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /auth/me ───────────────────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('returns current user for valid token', async () => {
      const app = await getApp();
      await createUser({ email: 'me@test.com', password: 'mypassword' });
      const token = await loginUser(app, 'me@test.com', 'mypassword');

      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { email: string } };
      expect(body.data.email).toBe('me@test.com');
    });

    it('returns 401 without token', async () => {
      const app = await getApp();
      const res = await app.inject({ method: 'GET', url: '/auth/me' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── POST /auth/logout ──────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('revokes session', async () => {
      const app = await getApp();
      await createUser({ email: 'logout@test.com', password: 'mypassword' });
      const token = await loginUser(app, 'logout@test.com', 'mypassword');

      const logout = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: authHeader(token),
      });
      expect(logout.statusCode).toBe(204);
    });
  });

  // ── Org-scoped access ──────────────────────────────────────────────────────

  describe('Membership scope', () => {
    it('org owner can access their org', async () => {
      const app = await getApp();
      const org = await createOrg('acme');
      const user = await createUser({ email: 'owner@test.com', password: 'pass123' });
      await createMembership(user.id, org.id, 'organization', org.id, 'owner');
      const token = await loginUser(app, 'owner@test.com', 'pass123');

      const res = await app.inject({
        method: 'GET',
        url: `/organizations/${org.id}`,
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(200);
    });

    it('user without membership cannot see another org', async () => {
      const app = await getApp();
      const org = await createOrg('other-org');
      const user = await createUser({ email: 'stranger@test.com', password: 'pass123' });
      // No membership for user in org
      const token = await loginUser(app, 'stranger@test.com', 'pass123');

      const res = await app.inject({
        method: 'GET',
        url: `/organizations/${org.id}`,
        headers: authHeader(token),
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
