import type { NextFunction, Request, Response } from 'express';
import { config } from '../lib/config.js';
import { createProblem } from '../lib/problem.js';
import { CHANNEL_PATH_PREFIX } from '../lib/raw-body.js';

/**
 * Caminhos PÚBLICOS por contrato.
 *
 * `/v1/channels/` entra aqui porque é chamado por um TERCEIRO (Meta/Twilio) que nunca manda
 * `Authorization` — nenhum provedor de WhatsApp manda. A autenticidade daquela família vem da
 * ASSINATURA HMAC verificada na própria rota, não deste gate, que só checa a PRESENÇA de um Bearer e
 * não verifica coisa nenhuma.
 *
 * Sem esta isenção o webhook quebraria SÓ EM PRODUÇÃO: `config.authRequired` tem default `false`, e
 * é o cluster que injeta `AUTH_REQUIRED: "true"` via `sicat-config`. Em dev local funcionaria
 * perfeitamente, e o sintoma remoto seria "a Meta desativou meu webhook".
 *
 * **NUNCA** isentar `/v1/sicat/channel-links`: aquela é a superfície AUTENTICADA da fase 2 (o
 * cadastro do número pelo próprio dono) e continua sob `sicatAuthMiddleware`.
 *
 * `/docs` e `/openapi.` SAÍRAM daqui: o contrato interno passou a exigir `sicatAuthMiddleware` em
 * `app.ts`. Manter a isenção não reabriria as rotas (o gate forte está nelas), mas deixaria os dois
 * middlewares afirmando coisas opostas sobre a mesma superfície — e é dessa divergência que sai o
 * próximo "achei que estava fechado".
 */
const PUBLIC_PATH_PREFIXES = [CHANNEL_PATH_PREFIX];

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.authRequired) return next();

  // Comparado em MINÚSCULAS: o Express roteia case-insensitive por default, então `/V1/channels/…`
  // alcançaria a rota — o predicado precisa enxergar a mesma coisa que o roteador.
  const path = String(req.path || '').toLowerCase();
  if (path === '/health' || PUBLIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return next();
  }

  const authorization = req.header('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    res.status(401).type('application/problem+json').json(createProblem({
      title: 'Unauthorized',
      status: 401,
      detail: 'Missing or invalid Authorization header. Expected Bearer token.',
      instance: req.originalUrl,
      correlationId: res.locals.correlationId
    }));
    return;
  }
  return next();
}
