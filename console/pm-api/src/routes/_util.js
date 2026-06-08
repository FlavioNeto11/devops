// Helpers compartilhados das rotas do pm-api.

/** Envolve um handler async, encaminhando erros ao error-handler do Express. */
export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Monta os fragmentos "col = $n" para os campos `allowed` presentes em `body`.
 * Retorna { sets: string[], values: any[] } — o chamador acrescenta o WHERE.
 */
export function buildPatch(body, allowed) {
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      values.push(body[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }
  return { sets, values };
}

export const notFound = (res, what) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `${what} nao encontrado` } });
export const invalid = (res, message) => res.status(422).json({ error: { code: 'VALIDATION_ERROR', message } });
