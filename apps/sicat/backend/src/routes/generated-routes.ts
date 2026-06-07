import { Router, type Request, type RequestHandler, type Response, type NextFunction } from 'express';

import { operations } from '../generated/operations.js';
import { buildStubResponse } from '../lib/stub-response.js';

type OpenApiLike = {
  info?: {
    version?: string;
  };
};

function createOperationHandler(operation: (typeof operations)[number]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const response = buildStubResponse(operation, req, String(res.locals.correlationId || ''));

      res.setHeader('X-Stub-Mode', 'true');
      res
        .status(operation.successStatus)
        .json(response);
    } catch (error: unknown) {
      next(error);
    }
  };
}

export function createGeneratedRouter(_openApiSpec: OpenApiLike) {
  const router = Router();

  for (const operation of operations) {
    const handler = createOperationHandler(operation);
    if (operation.method === 'get') {
      router.get(operation.expressPath, handler);
    } else if (operation.method === 'post') {
      router.post(operation.expressPath, handler);
    } else if (operation.method === 'put') {
      router.put(operation.expressPath, handler);
    } else if (operation.method === 'patch') {
      router.patch(operation.expressPath, handler);
    } else if (operation.method === 'delete') {
      router.delete(operation.expressPath, handler);
    }
  }

  return router;
}
