// Rotas da IA. /ai/status (publico), /ai/triage e /ai/chat (auth), /ai/stream (SSE, auth por
// query token pois EventSource nao envia headers). Fail-soft: sem chaves, respostas "dormentes".
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { verifyAccessToken } from '@flavioneto11/oidc-kit';
import { env } from '../../env';
import { requireAuth, type Principal } from '../../lib/auth';
import { engineStatus, orchestrate } from '../../ai/engine';
import { SPECIALISTS } from '../../ai/prompts';
import { runChat, runTriage } from '../../ai/service';

const chatSchema = z.object({
  message: z.string().min(1),
  history: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
  threadId: z.string().optional(),
});
const triageSchema = z.object({ message: z.string().min(1) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  // Estado do motor (publico) — a home/assistente mostra o que esta aceso.
  app.get('/ai/status', async () => ({
    ...engineStatus(),
    specialists: engineStatus().specialists.map((s) => {
      const def = SPECIALISTS.find((x) => x.id === s.id)!;
      return { ...s, label: def.label, description: def.description };
    }),
  }));

  app.post('/ai/triage', { preHandler: requireAuth }, async (req) => {
    const { message } = triageSchema.parse(req.body);
    return runTriage(message);
  });

  app.post('/ai/chat', { preHandler: requireAuth }, async (req) => {
    const body = chatSchema.parse(req.body);
    const p = (req as any).principal as Principal;
    return runChat(
      { organizationId: p.organizationId, userId: p.userId, threadId: body.threadId, channel: 'app' },
      { message: body.message, history: body.history },
    );
  });

  // SSE: stream do turno. EventSource nao manda header -> token via ?token=. A rota de ingress
  // dedicada (/imobia/api/ai/stream, priority 40) NAO tem compress (senao bufferiza o SSE).
  app.get('/ai/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as { token?: string; q?: string };
    const header = req.headers.authorization || '';
    const token = q.token || (header.startsWith('Bearer ') ? header.slice(7) : '');
    const verified = token ? verifyAccessToken(token, { secret: env.JWT_SECRET, prefix: 'imobia_access' }) : { valid: false as const, reason: 'sem token' };
    if (!verified.valid) {
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    const message = String(q.q || '').trim();
    if (!message) {
      reply.code(400).send({ error: 'validation', message: 'parametro q obrigatorio' });
      return;
    }

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: string, data: unknown) => raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      send('start', { at: new Date().toISOString() });
      const result = await orchestrate({ message });
      send('route', { dormant: result.dormant, specialist: result.specialist, actor: result.actor, model: result.model, intent: result.cortexIntent });
      // chunk por palavra (prova o transporte SSE sem compress; streaming nativo do LLM chega em F7)
      const parts = String(result.reply).split(/(\s+)/);
      for (const w of parts) {
        if (!w) continue;
        send('delta', { text: w });
        await sleep(12);
      }
      send('done', { specialist: result.specialist, model: result.model, usage: result.usage, costUsd: result.costUsd, latencyMs: result.latencyMs });
    } catch (err) {
      send('error', { message: (err as Error).message });
    } finally {
      raw.end();
    }
  });
}
