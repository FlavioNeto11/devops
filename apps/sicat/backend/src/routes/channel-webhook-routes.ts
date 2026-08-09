/**
 * Webhook de canal externo — a PRIMEIRA superfície do SICAT sem `sicatAuthMiddleware`.
 *
 * A identidade do CHAMADOR não vem de token: vem da ASSINATURA HMAC do provedor, verificada logo no
 * início do POST. A identidade do USUÁRIO vem de um vínculo `verified` em
 * `conversation_channel_links`. Nada aqui aceita `userId`, `channel` ou `integrationAccountId` do
 * corpo — o corpo é dado de terceiro, não instrução.
 *
 * SEPARADO de `api-routes.ts` de propósito. Aquele arquivo é a superfície AUTENTICADA (é lá que
 * `registerChannelLinkRoutes` da fase 2 continua sob `sicatAuthMiddleware`); misturar convida alguém
 * a um dia pôr um `router.use(sicatAuthMiddleware)` no topo — ou a perder de vista que uma das rotas
 * dali não tem auth.
 *
 * ORÇAMENTO: o POST é síncrono e tem p99 alvo abaixo de 300 ms. Nenhuma chamada de rede sai daqui.
 */

import express from 'express';
import type { IncomingHttpHeaders } from 'node:http';
import { asyncHandler } from '../lib/http.js';
import { config } from '../lib/config.js';
import { createCorrelationId } from '../lib/ids.js';
import { createRateLimiter, type RateLimiter } from '../lib/rate-limit.js';
import { captureChannelRawBody, type RequestWithRawBody } from '../lib/raw-body.js';
import { resolveWhatsAppProvider } from '../services/conversation/channel/whatsapp/index.js';
import {
  ingestWhatsAppWebhook,
  isInfrastructureError
} from '../services/conversation/channel/whatsapp/whatsapp-inbound-service.js';

export const WHATSAPP_WEBHOOK_PATH = '/v1/channels/whatsapp/webhook';

/**
 * O `hub.challenge` é entrada controlada por TERCEIRO sendo refletida na resposta. `text/plain` +
 * `nosniff` (helmet + `secure-headers` do Traefik) contêm o risco; este padrão fecha o resto.
 */
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

/**
 * Teto GLOBAL da rota — protege a FILA, não a autenticidade.
 *
 * Limitar por IP seria inútil: sem `app.set('trust proxy', …)` (que o backend não seta em lugar
 * nenhum), `req.ip` é o IP do pod do Traefik para o mundo inteiro — um balde global disfarçado de
 * balde por cliente.
 */
let globalRateLimiter: RateLimiter | null = null;
function getGlobalRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = createRateLimiter(config.whatsappInboundGlobalPerMinute, 60_000);
  }
  return globalRateLimiter;
}

export function resetChannelWebhookLimitersForTests(): void {
  globalRateLimiter = null;
}

function toHeaderMap(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  const entries = Object.entries(headers).map(([key, value]) => {
    if (typeof value === 'string') return [key, value] as const;
    if (Array.isArray(value)) return [key, value.join(', ')] as const;
    return [key, undefined] as const;
  });
  return Object.fromEntries(entries);
}

/**
 * GET — desafio de verificação do Meta. Sem corpo, sem assinatura, sem banco, sem estado.
 */
export async function handleWhatsAppWebhookVerification(
  req: express.Request,
  res: express.Response
): Promise<void> {
  const provider = resolveWhatsAppProvider();
  // Canal desligado ⇒ a rota NÃO EXISTE. NUNCA `requireWhatsAppProvider()`: ele lança
  // `AppError(503, …, 'Defina WHATSAPP_PROVIDER=twilio|meta')` e `createProblem` anexa `instance` +
  // `correlationId` — reconhecimento gratuito para um anônimo.
  if (!provider) {
    res.status(404).end();
    return;
  }

  const challenge = provider.handleVerificationChallenge((req.query || {}) as Record<string, unknown>);
  if (!challenge || !CHALLENGE_PATTERN.test(challenge)) {
    res.status(403).end();
    return;
  }

  // O valor sai CRU. `res.json(challenge)` REPROVA a verificação do Meta — ele compara byte a byte e
  // as aspas do JSON quebram a comparação.
  res.status(200).type('text/plain').send(challenge);
}

/**
 * POST — recepção. Absorve TUDO: responder != 2xx faz o provedor reentregar a mesma mensagem por
 * dias e, com falhas persistentes, o Meta DESATIVA o webhook.
 *
 * Não-2xx é reservado a exatamente três casos: 403 (assinatura), 404 (canal desligado) e o 500 de
 * falha de INFRAESTRUTURA na gravação (qualquer mensagem do lote perdida por erro de conexão).
 */
export async function handleWhatsAppWebhookInbound(
  req: express.Request,
  res: express.Response
): Promise<void> {
  // O `X-Correlation-Id` de ENTRADA é ignorado: numa rota pública, honrá-lo é injeção de log no Loki
  // e colisão deliberada com a trilha de operações legítimas.
  const correlationId = createCorrelationId();

  const provider = resolveWhatsAppProvider();
  if (!provider) {
    res.status(404).end();
    return;
  }

  // ── 1. AUTENTICIDADE, antes de qualquer leitura de banco, parse de mensagem ou log de conteúdo ──
  const verified = provider.verifyWebhookSignature({
    rawBody: (req as RequestWithRawBody).rawBody ?? null,
    parsedBody: (req.body || {}) as Record<string, unknown>,
    headers: toHeaderMap(req.headers || {}),
    // URL EXTERNA, só de config. NUNCA reconstruída de `req.protocol`/`req.get('host')`/
    // `req.originalUrl`: o Traefik strippa `/sicat/api` e `trust proxy` não está setado, então a
    // reconstrução daria `http://…/v1/channels/…` — esquema e caminho errados. O HMAC do Twilio
    // nunca bateria, e o sintoma seria 403 em 100% dos webhooks, SÓ em produção.
    url: config.whatsappWebhookUrl
  });
  if (!verified) {
    res.status(403).end();
    return;
  }

  // ── 2. TETO GLOBAL, DEPOIS da assinatura ─────────────────────────────────────────────────────
  // Um 429 antes dela seria oráculo gratuito para tráfego forjado. E aqui responde-se 200, não 429:
  // não-2xx sustentado faz o Meta desativar o webhook.
  if (!getGlobalRateLimiter().check('channel:whatsapp:inbound').allowed) {
    console.error(`[whatsapp-webhook] teto global da rota atingido; lote descartado (correlationId=${correlationId})`);
    res.status(200).end();
    return;
  }

  // ── 3. INGESTÃO ──────────────────────────────────────────────────────────────────────────────
  // O `IngestSummary` devolvido NÃO é lido aqui de propósito: a observabilidade do lote (log por
  // descarte, linha-resumo e as métricas `sicat_channel_inbound_*`) é emitida DENTRO de
  // `ingestWhatsAppWebhook`, num `finally` — do contrário ela se perderia justamente no caminho que
  // mais importa, o do throw que vira 500.
  try {
    await ingestWhatsAppWebhook({
      provider,
      body: (req.body || {}) as Record<string, unknown>,
      correlationId
    });
  } catch (error) {
    if (isInfrastructureError(error)) {
      // REGRA DE 500: QUALQUER mensagem do lote perdida por falha de conexão — inclusive quando
      // outras do MESMO lote entraram. É o único caso em que a reentrega do provedor é uma FEATURE, e
      // ela é segura porque o `unique` de `jobs.command_id` torna a reentrega no-op para o que já
      // gravou. A regra antiga (só com zero enfileiradas) descartava em silêncio a pergunta de quem
      // estava na segunda posição de um lote parcial: 200 para o provedor, nunca mais reentregue.
      console.error(`[whatsapp-webhook] infraestrutura indisponível na recepção (correlationId=${correlationId})`);
      res.status(500).end();
      return;
    }
    // Nunca o texto do usuário, nunca telefone em claro.
    console.error(`[whatsapp-webhook] falha absorvida na recepção (correlationId=${correlationId})`);
  }

  // 200 com corpo VAZIO. JSON aqui rende o erro 12300 "Invalid Content-Type" no console do Twilio.
  res.status(200).end();
}

export function createChannelWebhookRouter(): express.Router {
  // `caseSensitive`/`strict` ligados de propósito: com os defaults do Express,
  // `/V1/channels/whatsapp/webhook` e `/…/webhook/` casariam a ROTA mas não os predicados de caminho
  // (`isChannelRequestUrl`, isenção de auth) — e o resultado seria um 403 confuso por `rawBody`
  // ausente em vez de um 404 honesto.
  const router = express.Router({ caseSensitive: true, strict: true });

  router.get(WHATSAPP_WEBHOOK_PATH, asyncHandler(handleWhatsAppWebhookVerification));

  router.post(
    WHATSAPP_WEBHOOK_PATH,
    // O Twilio manda `application/x-www-form-urlencoded`, que o `express.json` global não parseia (e
    // também não consome — o stream chega intacto aqui). Montado NA ROTA, nunca global: globalmente,
    // TODA rota POST do SICAT passaria a aceitar form-encoded, ampliando a superfície sem ganho.
    // O `verify` é o MESMO capturador do `app.ts`, para que Meta e Twilio sigam a mesma regra.
    express.urlencoded({ extended: false, limit: '1mb', verify: captureChannelRawBody }),
    asyncHandler(handleWhatsAppWebhookInbound)
  );

  // Error handler PRÓPRIO (4 argumentos): nada do caminho de ingestão pode alcançar o
  // `errorHandlerMiddleware` global, que responderia `problem+json` e provocaria reentrega.
  router.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(error);
    console.error(`[whatsapp-webhook] exceção não tratada no router de canal: ${error instanceof Error ? error.name : typeof error}`);
    res.status(200).end();
  });

  return router;
}
