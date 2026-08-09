/**
 * Captura do corpo BRUTO das rotas de canal externo (`/v1/channels/**`).
 *
 * A Meta assina o webhook com HMAC-SHA256 sobre os BYTES EXATOS que enviou; qualquer reserialização
 * do JSON já parseado muda o digest e a verificação passa a falhar sempre. Por isso o corpo bruto
 * precisa ser retido no `verify` do body-parser — que é o único ponto em que ele ainda existe.
 *
 * Extraído do `verify` inline que a fase 1 deixou em `app.ts` por um motivo concreto: a fase 3 monta
 * um SEGUNDO parser (`express.urlencoded`, para o Twilio, que manda `x-www-form-urlencoded`) e os
 * dois precisam capturar `rawBody` pela MESMA regra. Duas cópias do predicado divergiriam em silêncio
 * — e o sintoma seria 403 em 100% dos webhooks de um dos provedores, só em produção.
 *
 * O escopo por caminho é deliberado: reter uma cópia de até 2 MB em TODA requisição do SICAT seria
 * custo de memória puro, já que só o canal externo precisa do original.
 */

import type { Request, Response } from 'express';

export const CHANNEL_PATH_PREFIX = '/v1/channels/';

export type RequestWithRawBody = Request & { rawBody?: Buffer };

/**
 * `true` quando a URL pertence à família de canal externo.
 *
 * Compara em MINÚSCULAS de propósito: o Express roteia case-insensitive por default, então
 * `/V1/channels/whatsapp/webhook` casaria a ROTA mas não este predicado — e o resultado seria um 403
 * confuso (rawBody ausente ⇒ assinatura da Meta fail-closed) em vez de um 404 honesto. O router de
 * canal usa `{ caseSensitive: true, strict: true }` justamente para que essas variantes caiam no
 * `notFoundMiddleware`; este predicado é o cinto de segurança do outro lado.
 */
export function isChannelRequestUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url.length === 0) return false;
  return url.toLowerCase().startsWith(CHANNEL_PATH_PREFIX);
}

/** `verify` de body-parser: guarda o corpo bruto só quando a rota é de canal externo. */
export function captureChannelRawBody(req: Request, _res: Response, buffer: Buffer): void {
  if (!isChannelRequestUrl(req.url)) return;
  (req as RequestWithRawBody).rawBody = Buffer.from(buffer);
}
