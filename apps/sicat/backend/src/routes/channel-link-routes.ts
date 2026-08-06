/**
 * Rotas de vínculo de canal — fase 2 (cadeia `whatsapp-channel-sicat`).
 *
 * HTTP mapping only: cada handler delega ao `conversation-channel-link-service`. Sem SQL, sem
 * provedor, sem regra de negócio. Toda a superfície exige sessão SICAT (`sicatAuthMiddleware`) e a
 * identidade sai SEMPRE de `req.sicatUser` — nenhum endpoint aceita `userId`, `channel` ou
 * `integrationAccountId` vindos do cliente. É o que torna estrutural (e não uma checagem) a regra de
 * que o OTP nunca é iniciado a partir do WhatsApp.
 *
 * Os limitadores que dependem só do `userId` vivem aqui; o de TELEFONE vive no service, porque a
 * chave dele depende do número já canonicalizado.
 */

import express from 'express';
import { asyncHandler } from '../lib/http.js';
import { AppError } from '../lib/problem.js';
import { createRateLimiter } from '../lib/rate-limit.js';
import type { RateLimiter } from '../lib/rate-limit.js';
import { sicatAuthMiddleware } from '../middlewares/sicat-auth.js';
import {
  assertChannelDispatchAvailable,
  cancelChannelLinkChallengeService,
  confirmChannelLinkService,
  listChannelLinksService,
  removeChannelLinkService,
  requireSupportedChannel,
  resendChannelLinkChallengeService,
  startChannelLinkService
} from '../services/conversation-channel-link-service.js';

type LooseRecord = Record<string, unknown>;
type RequestWithContext = express.Request & {
  correlationId?: string | null;
  sicatUser?: {
    userId: string;
    email?: string;
    name?: string;
    roles: string[];
  };
};

/**
 * Teto de DESPACHOS por usuário. `start` e `resend` compartilham o balde: cada mensagem custa
 * dinheiro e toca um telefone real, independentemente da rota que a disparou.
 *
 * 8/h por usuário é também o teto real da força bruta — 8 desafios × 5 palpites = 40 palpites/hora
 * contra 10^6, e não o `max_attempts` do desafio.
 */
const DISPATCH_USER_RATE_LIMIT = createRateLimiter(8, 60 * 60 * 1000);
/** Teto global de custo: contém uma conta comprometida (ou um bug de cliente) de gastar a fatura. */
const DISPATCH_GLOBAL_RATE_LIMIT = createRateLimiter(200, 60 * 60 * 1000);
/** Confirmação: soma-se ao `attempt_count` do desafio (defesa em profundidade) e contém o custo do scrypt. */
const CONFIRM_USER_RATE_LIMIT = createRateLimiter(20, 15 * 60 * 1000);
/**
 * `scryptSync` é SÍNCRONO e o `sicat-api` roda com 1 réplica: este é o único freio entre um pico de
 * confirmações e o event loop travado. Se o p95 de `verifyPassword` passar de ~100 ms nesta máquina,
 * é este número que aperta — não o algoritmo.
 */
const CONFIRM_GLOBAL_RATE_LIMIT = createRateLimiter(300, 15 * 60 * 1000);

/** Descarta o estado dos limitadores de rota. Só para testes. */
export function resetChannelLinkRouteRateLimitersForTests(): void {
  DISPATCH_USER_RATE_LIMIT.reset();
  DISPATCH_GLOBAL_RATE_LIMIT.reset();
  CONFIRM_USER_RATE_LIMIT.reset();
  CONFIRM_GLOBAL_RATE_LIMIT.reset();
}

function requireSicatUser(req: express.Request): NonNullable<RequestWithContext['sicatUser']> {
  const sicatUser = (req as RequestWithContext).sicatUser;
  if (!sicatUser?.userId) {
    // Não deveria acontecer: sicatAuthMiddleware roda antes e já teria respondido 401.
    throw new AppError(401, 'Unauthorized', 'Sessão SICAT não resolvida.', {
      code: 'CHANNEL_LINK_PRINCIPAL_UNRESOLVED'
    });
  }
  return sicatUser;
}

function getCorrelationId(req: express.Request): string | null {
  const correlationId = (req as RequestWithContext).correlationId;
  return typeof correlationId === 'string' && correlationId.length > 0 ? correlationId : null;
}

/**
 * Todo 429 carrega `errors.retryAfterSeconds` no corpo problem+json; os limitadores de rota ainda
 * setam o header `Retry-After` (o `errorHandlerMiddleware` não o faz). O frontend lê sempre o corpo,
 * para que cooldown de banco e limitador de memória rendam a mesma UX.
 */
function enforceRateLimit(limiter: RateLimiter, key: string, res: express.Response): void {
  const decision = limiter.check(key);
  if (decision.allowed) return;
  res.setHeader('Retry-After', String(decision.retryAfterSeconds));
  throw new AppError(
    429,
    'Too Many Requests',
    `Limite de solicitações atingido. Tente novamente em ${decision.retryAfterSeconds}s.`,
    { code: 'CHANNEL_LINK_RATE_LIMITED', errors: { retryAfterSeconds: decision.retryAfterSeconds } }
  );
}

/**
 * Ordem obrigatória do caminho de despacho — requisito de código, não comentário:
 * canal habilitado → limitadores → (no service) validação de formato → banco → scrypt.
 * `requireWhatsAppProvider` vem primeiro para que canal desligado não queime a cota do usuário; os
 * limitadores vêm antes do scrypt porque `scryptSync` bloqueia o event loop e derrubaria a API
 * inteira com dezenas de req/s.
 */
function guardDispatch(req: express.Request, res: express.Response, channelType: unknown): string {
  const user = requireSicatUser(req);
  assertChannelDispatchAvailable(requireSupportedChannel(channelType));
  enforceRateLimit(DISPATCH_USER_RATE_LIMIT, `link:dispatch:user:${user.userId}`, res);
  enforceRateLimit(DISPATCH_GLOBAL_RATE_LIMIT, 'link:dispatch:global', res);
  return user.userId;
}

export function registerChannelLinkRoutes(router: express.Router): void {
  router.get('/v1/sicat/channel-links', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const user = requireSicatUser(req);
    const response = await listChannelLinksService(user.userId, (req.query || {}) as LooseRecord);
    res.json(response);
  }));

  router.post('/v1/sicat/channel-links', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const body = (req.body || {}) as LooseRecord;
    const userId = guardDispatch(req, res, body.channelType);
    const response = await startChannelLinkService(userId, body, getCorrelationId(req));
    // 202: o que foi aceito é o ENVIO. A entrega no aparelho não está confirmada e a UI nunca pode
    // afirmar que chegou — a copy é "código enviado".
    res.status(202).json(response);
  }));

  // IMPORTANTE: registrar as rotas de `/challenges/...` ANTES de `/:linkId`, senão o segmento
  // literal `challenges` é capturado pelo parâmetro (mesma armadilha de `/v1/manifestos/:id`).
  router.post(
    '/v1/sicat/channel-links/challenges/:challengeId/resend',
    sicatAuthMiddleware,
    asyncHandler(async (req, res) => {
      const userId = guardDispatch(req, res, undefined);
      const response = await resendChannelLinkChallengeService(
        userId,
        String(req.params.challengeId || ''),
        getCorrelationId(req)
      );
      res.status(202).json(response);
    })
  );

  router.post(
    '/v1/sicat/channel-links/challenges/:challengeId/confirm',
    sicatAuthMiddleware,
    asyncHandler(async (req, res) => {
      const user = requireSicatUser(req);
      enforceRateLimit(CONFIRM_USER_RATE_LIMIT, `link:confirm:user:${user.userId}`, res);
      enforceRateLimit(CONFIRM_GLOBAL_RATE_LIMIT, 'link:confirm:global', res);
      const response = await confirmChannelLinkService(
        user.userId,
        String(req.params.challengeId || ''),
        (req.body || {}) as LooseRecord,
        getCorrelationId(req)
      );
      // 200 (e não 201): a operação é IDEMPOTENTE — duas confirmações simultâneas com o código certo
      // devolvem o mesmo vínculo, sem duplicar auditoria nem inventar um 404.
      res.json(response);
    })
  );

  router.delete(
    '/v1/sicat/channel-links/challenges/:challengeId',
    sicatAuthMiddleware,
    asyncHandler(async (req, res) => {
      const user = requireSicatUser(req);
      await cancelChannelLinkChallengeService(
        user.userId,
        String(req.params.challengeId || ''),
        (req.query || {}) as LooseRecord,
        getCorrelationId(req)
      );
      res.status(204).end();
    })
  );

  router.delete('/v1/sicat/channel-links/:linkId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const user = requireSicatUser(req);
    await removeChannelLinkService(user.userId, String(req.params.linkId || ''), getCorrelationId(req));
    res.status(204).end();
  }));
}
