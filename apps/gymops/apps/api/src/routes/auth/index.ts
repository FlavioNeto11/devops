import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@gymops/db';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../../lib/prisma.js';
import { env } from '../../env.js';
import { createSigner } from './tokens.js';
import { resolveUserContext, resolveUserOrganization } from '../../lib/auth-context.js';
import { validateKeycloakToken } from '@flavioneto11/oidc-kit';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { signAccess, signRefresh, verifyRefresh } = createSigner(app);
  const secureCookies = env.NODE_ENV === 'production' && env.FRONTEND_URL.startsWith('https://');

  const createSessionWithRetry = async (
    userId: string,
    payload: { sub: string; email: string; name: string },
  ): Promise<string> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const refreshToken = signRefresh(payload);
      try {
        await db.session.create({
          data: {
            userId,
            refreshTokenHash: hashToken(refreshToken),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
        return refreshToken;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === 'P2002'
          && attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Unable to create session');
  };

  // ── POST /auth/login ─────────────────────────────────────────────────────────
  app.post(
    '/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = loginSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(422).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: body.error.flatten() },
        });
      }

      const user = await db.user.findUnique({
        where: { email: body.data.email, deletedAt: null },
      });

      if (!user?.passwordHash) {
        return reply.status(401).send({
          error: { code: 'INVALID_CREDENTIALS', message: 'Email ou senha inválidos' },
        });
      }

      const valid = await bcrypt.compare(body.data.password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({
          error: { code: 'INVALID_CREDENTIALS', message: 'Email ou senha inválidos' },
        });
      }

      const orgId = await resolveUserOrganization(user.id);

      // Bloqueia login se a academia (organização) do usuário estiver INATIVA (deletedAt).
      // Master da plataforma (isPlatformAdmin) nunca é bloqueado e normalmente não tem org.
      if (!user.isPlatformAdmin && orgId) {
        const org = await db.organization.findUnique({ where: { id: orgId }, select: { deletedAt: true } });
        if (org?.deletedAt) {
          return reply.status(403).send({
            error: { code: 'ORG_INACTIVE', message: 'Academia inativada. Contate o administrador da plataforma.' },
          });
        }
      }

      // Determine role and primary unit via canonical helper (covers org, unit, and area memberships)
      const context = orgId
        ? await resolveUserContext(user.id, orgId)
        : { userRole: null, primaryUnitId: null, organizationId: null };

      const payload = { sub: user.id, email: user.email, name: user.name };
      const accessToken = signAccess(payload);
      const refreshToken = await createSessionWithRetry(user.id, payload);

      void reply.setCookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: secureCookies,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.status(200).send({
        data: {
          accessToken,
          expiresIn: 900,
          organizationId: context.organizationId,
          role: context.userRole,
          primaryUnitId: context.primaryUnitId,
          isPlatformAdmin: user.isPlatformAdmin,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
          },
        },
      });
    },
  );

  // ── POST /auth/refresh ───────────────────────────────────────────────────────
  app.post('/refresh', async (request, reply) => {
    const rawToken = request.cookies['refresh_token'];
    if (!rawToken) {
      return reply.status(401).send({ error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token' } });
    }

    let payload: { sub: string; email: string; name: string };
    try {
      payload = verifyRefresh(rawToken);
    } catch {
      return reply.status(401).send({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' } });
    }

    const session = await db.session.findUnique({
      where: { refreshTokenHash: hashToken(rawToken) },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return reply.status(401).send({ error: { code: 'SESSION_EXPIRED', message: 'Session expired' } });
    }

    const newAccess = signAccess(payload);
    return reply.status(200).send({
      data: { accessToken: newAccess, expiresIn: 900 },
    });
  });

  // ── POST /auth/logout ────────────────────────────────────────────────────────
  app.post('/logout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const rawToken = request.cookies['refresh_token'];
    if (rawToken) {
      await db.session.updateMany({
        where: { refreshTokenHash: hashToken(rawToken) },
        data: { revokedAt: new Date() },
      });
    }
    void reply.clearCookie('refresh_token', { path: '/' });
    return reply.status(204).send();
  });

  // ── GET /auth/google/start ───────────────────────────────────────────────────
  app.get('/google/start', async (_request, reply) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
      return reply.status(503).send({ error: { code: 'OAUTH_NOT_CONFIGURED', message: 'Google OAuth not configured' } });
    }
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'select_account');
    return reply.redirect(url.toString());
  });

  // ── GET /auth/google/callback ────────────────────────────────────────────────
  app.get('/google/callback', async (request, reply) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      return reply.redirect(`${env.FRONTEND_URL}/login?error=oauth_not_configured`);
    }

    const { code } = request.query as { code?: string };
    if (!code) {
      return reply.redirect(`${env.FRONTEND_URL}/login?error=no_code`);
    }

    try {
      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenRes.json() as { access_token?: string; error?: string };
      if (!tokens.access_token) {
        return reply.redirect(`${env.FRONTEND_URL}/login?error=token_exchange_failed`);
      }

      // Get user info
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const googleUser = await userRes.json() as { sub: string; email: string; name: string; picture?: string };

      // Upsert user
      const user = await db.user.upsert({
        where: { googleId: googleUser.sub },
        update: { name: googleUser.name, avatarUrl: googleUser.picture },
        create: {
          googleId: googleUser.sub,
          email: googleUser.email,
          name: googleUser.name,
          avatarUrl: googleUser.picture,
        },
      });

      const payload = { sub: user.id, email: user.email, name: user.name };
      const accessToken = signAccess(payload);
      const refreshToken = await createSessionWithRetry(user.id, payload);

      void reply.setCookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: secureCookies,
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });

      // Pass access token via short-lived httpOnly cookie to avoid exposing it in the URL
      void reply.setCookie('auth_token', accessToken, {
        httpOnly: true,
        secure: secureCookies,
        sameSite: 'lax',
        path: '/',
        maxAge: 60,
      });
      return reply.redirect(`${env.FRONTEND_URL}/auth/callback`);
    } catch (err) {
      app.log.error(err);
      return reply.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  });

  // ── GET /auth/keycloak/start ─────────────────────────────────────────────────
  // SSO ADITIVO (Keycloak/OIDC realm nvit). Google e login proprio seguem intactos.
  // "Dark" ate KEYCLOAK_* estarem configurados (responde 503).
  app.get('/keycloak/start', async (_request, reply) => {
    if (!env.KEYCLOAK_AUTH_URL || !env.KEYCLOAK_CLIENT_ID || !env.KEYCLOAK_REDIRECT_URI) {
      return reply.status(503).send({ error: { code: 'SSO_NOT_CONFIGURED', message: 'Keycloak SSO not configured' } });
    }
    const url = new URL(env.KEYCLOAK_AUTH_URL);
    url.searchParams.set('client_id', env.KEYCLOAK_CLIENT_ID);
    url.searchParams.set('redirect_uri', env.KEYCLOAK_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    return reply.redirect(url.toString());
  });

  // ── GET /auth/keycloak/callback ──────────────────────────────────────────────
  app.get('/keycloak/callback', async (request, reply) => {
    if (!env.KEYCLOAK_TOKEN_URL || !env.KEYCLOAK_USERINFO_URL || !env.KEYCLOAK_CLIENT_ID
      || !env.KEYCLOAK_CLIENT_SECRET || !env.KEYCLOAK_REDIRECT_URI) {
      return reply.redirect(`${env.FRONTEND_URL}/login?error=sso_not_configured`);
    }
    const { code } = request.query as { code?: string };
    if (!code) return reply.redirect(`${env.FRONTEND_URL}/login?error=no_code`);
    try {
      const tokenRes = await fetch(env.KEYCLOAK_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: env.KEYCLOAK_CLIENT_ID,
          client_secret: env.KEYCLOAK_CLIENT_SECRET,
          redirect_uri: env.KEYCLOAK_REDIRECT_URI,
        }),
      });
      const tokens = await tokenRes.json() as { access_token?: string };
      if (!tokens.access_token) return reply.redirect(`${env.FRONTEND_URL}/login?error=token_exchange_failed`);

      // Valida no /userinfo via @flavioneto11/oidc-kit (padrao da plataforma).
      const result = await validateKeycloakToken(tokens.access_token, { userinfoUrl: env.KEYCLOAK_USERINFO_URL });
      if (!result.ok) return reply.redirect(`${env.FRONTEND_URL}/login?error=sso_failed`);
      const claims = result.claims as { email?: string; name?: string; preferred_username?: string };
      const email = String(claims.email || '').trim().toLowerCase();
      if (!email) return reply.redirect(`${env.FRONTEND_URL}/login?error=sso_no_email`);
      const name = String(claims.name || claims.preferred_username || email);

      // Upsert por e-mail (sem tocar googleId/senha): provisiona no 1o login SSO.
      const user = await db.user.upsert({ where: { email }, update: { name }, create: { email, name } });

      const payload = { sub: user.id, email: user.email, name: user.name };
      const accessToken = signAccess(payload);
      const refreshToken = await createSessionWithRetry(user.id, payload);
      void reply.setCookie('refresh_token', refreshToken, {
        httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60,
      });
      void reply.setCookie('auth_token', accessToken, {
        httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/', maxAge: 60,
      });
      return reply.redirect(`${env.FRONTEND_URL}/auth/callback`);
    } catch (err) {
      app.log.error(err);
      return reply.redirect(`${env.FRONTEND_URL}/login?error=sso_failed`);
    }
  });

  // ── GET /auth/consume ────────────────────────────────────────────────────────
  // Reads the short-lived auth_token cookie set by the Google OAuth callback,
  // clears it, and returns the access token to the frontend exactly once.
  app.get('/consume', async (request, reply) => {
    const token = request.cookies['auth_token'];
    if (!token) return reply.status(401).send({ error: { code: 'NO_TOKEN', message: 'No pending auth token' } });
    void reply.clearCookie('auth_token', { path: '/' });
    return reply.send({ data: { accessToken: token } });
  });

  // ── POST /auth/register (dev only) ──────────────────────────────────────────
  if (env.NODE_ENV !== 'production') {
    const registerSchema = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
    });

    app.post('/register', async (request, reply) => {
      const body = registerSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });
      }

      const existing = await db.user.findUnique({ where: { email: body.data.email } });
      if (existing) {
        return reply.status(409).send({ error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } });
      }

      const passwordHash = await bcrypt.hash(body.data.password, 10);
      const user = await db.user.create({
        data: { name: body.data.name, email: body.data.email, passwordHash },
      });

      return reply.status(201).send({
        data: { id: user.id, name: user.name, email: user.email },
      });
    });
  }
};
