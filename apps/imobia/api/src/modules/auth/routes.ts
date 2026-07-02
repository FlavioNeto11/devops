// Rotas de autenticacao. Envelope de erro consistente; validacao com Zod.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, type Principal } from '../../lib/auth';
import { registerOrg, login, keycloakLogin, me } from './service';

const registerSchema = z.object({
  orgName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const kcSchema = z.object({ token: z.string().min(10) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const result = await registerOrg(body);
    return reply.code(201).send(result);
  });

  app.post('/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const result = await login(body);
    return reply.send(result);
  });

  // SSO Keycloak: o frontend faz PKCE, obtem o access_token e o envia aqui.
  app.post('/auth/keycloak', async (req, reply) => {
    const body = kcSchema.parse(req.body);
    const result = await keycloakLogin(body);
    return reply.send(result);
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (req) => {
    return me((req as any).principal as Principal);
  });
}
