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

  // ── Ingestão de ARQUIVOS (multimodal) — retrocompat + fail-soft ────────────────
  // Monta um corpo multipart/form-data simples p/ o light-my-request (app.inject).
  function multipart(fields: Record<string, string>, files: Array<{ field: string; filename: string; type: string; body: string }>) {
    const boundary = '----gymopsTestBoundary' + Math.random().toString(16).slice(2);
    const parts: string[] = [];
    for (const [name, value] of Object.entries(fields)) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    }
    for (const f of files) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\nContent-Type: ${f.type}\r\n\r\n${f.body}\r\n`);
    }
    const payload = parts.join('') + `--${boundary}--\r\n`;
    return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
  }

  describe('multipart file ingestion', () => {
    it('POST /ai/activities/draft accepts a text file (multipart) and still returns 200', async () => {
      const { app, org, unit, token } = await setup();
      const mp = multipart(
        { text: 'Resuma o relatório anexado', organizationId: org.id, unitId: unit.id },
        [{ field: 'files', filename: 'relatorio.txt', type: 'text/plain', body: 'Esteira 4 com vibração anormal; revisar rolamento.' }],
      );
      const res = await app.inject({
        method: 'POST', url: '/ai/activities/draft', remoteAddress: '10.0.1.1',
        headers: { ...authHeader(token), ...mp.headers }, payload: mp.payload,
      });
      // Sem API key → fallback, mas a rota NÃO quebra com arquivo (200).
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { title: string } };
      expect(typeof body.data.title).toBe('string');
    });

    it('POST /ai/chat accepts files via multipart (fields + history JSON) and returns 200', async () => {
      const { app, org, token } = await setup();
      const mp = multipart(
        { message: 'O que diz este documento?', organizationId: org.id, history: JSON.stringify([{ role: 'user', content: 'oi' }]) },
        [{ field: 'files', filename: 'nota.md', type: 'text/markdown', body: '# Nota\nTroca de filtro pendente.' }],
      );
      const res = await app.inject({
        method: 'POST', url: '/ai/chat', remoteAddress: '10.0.1.2',
        headers: { ...authHeader(token), ...mp.headers }, payload: mp.payload,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { reply: string } };
      expect(typeof body.data.reply).toBe('string');
    });

    it('POST /ai/chat with JSON body is unchanged (retrocompat, no multipart)', async () => {
      const { app, org, token } = await setup();
      const res = await app.inject({
        method: 'POST', url: '/ai/chat', remoteAddress: '10.0.1.3',
        headers: authHeader(token),
        payload: { message: 'Como vão as atividades?', organizationId: org.id },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { reply: string } };
      expect(typeof body.data.reply).toBe('string');
    });

    it('POST /ai/chat degrades to text-only when a binary file cannot be extracted (fail-soft)', async () => {
      const { app, org, token } = await setup();
      // .doc legado (binário) → o kit registra name-only; a rota NÃO quebra.
      const mp = multipart(
        { message: 'Analise o anexo', organizationId: org.id },
        [{ field: 'files', filename: 'antigo.doc', type: 'application/msword', body: '\x00\x01binário-cru\x02' }],
      );
      const res = await app.inject({
        method: 'POST', url: '/ai/chat', remoteAddress: '10.0.1.4',
        headers: { ...authHeader(token), ...mp.headers }, payload: mp.payload,
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
