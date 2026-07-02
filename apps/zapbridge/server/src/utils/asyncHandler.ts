import { Request, Response, NextFunction, RequestHandler } from 'express';

// Envolve handlers async para encaminhar erros ao middleware de erro do Express.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
