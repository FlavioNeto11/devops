import type { NextFunction, Request, Response } from 'express';
import { createProblem } from '../lib/problem.js';
import { isChannelRequestUrl } from '../lib/raw-body.js';

type ErrorLike = {
  status?: number;
  statusCode?: number;
  title?: string;
  message?: string;
  code?: string;
  errors?: unknown;
  type?: string;
};

/**
 * Erro lançado pelo body-parser ANTES de qualquer rota (JSON malformado, corpo acima do limite,
 * charset não suportado).
 */
function isBodyParseError(err: unknown, parsedError: ErrorLike): boolean {
  if (['entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'request.aborted'].includes(String(parsedError.type || ''))) {
    return true;
  }
  return err instanceof SyntaxError && 'body' in err;
}

function toErrorLike(err: unknown): ErrorLike {
  if (!err || typeof err !== 'object') {
    return {};
  }
  return err as ErrorLike;
}

export function errorHandlerMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const parsedError = toErrorLike(err);
  const status = Number(parsedError.status || parsedError.statusCode || 500);
  if (res.headersSent) return;

  /*
   * Ramo estreito de canal externo. O `express.json` GLOBAL lança antes de a rota de webhook existir
   * — fora do alcance do try/catch e do error handler do próprio router — e a resposta padrão seria
   * `400`/`413 application/problem+json`. Para o Meta, isso é falha: ele reentrega a mesma mensagem
   * com backoff por DIAS e desativa o webhook depois de falhas persistentes. Um corpo que não parseia
   * não vai parsear na décima tentativa; 200 vazio é a resposta correta.
   */
  if (isChannelRequestUrl(req.originalUrl) && isBodyParseError(err, parsedError)) {
    console.error(`[channel-webhook] corpo inválido descartado (${parsedError.type || 'syntax'}) em ${req.originalUrl}`);
    res.status(200).end();
    return;
  }

  res.status(status).type('application/problem+json').json(createProblem({
    title: parsedError.title || 'Internal Server Error',
    status,
    detail: parsedError.message || 'Unhandled exception while processing request.',
    code: parsedError.code,
    instance: req.originalUrl,
    correlationId: res.locals.correlationId,
    errors: parsedError.errors
  }));
}
