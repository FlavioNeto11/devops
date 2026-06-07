export class AppError extends Error {
  status: number;
  statusCode: number;
  title: string;
  code?: string;
  instance?: string;
  correlationId?: string;
  errors?: unknown;
  context?: unknown;

  constructor(status: number, title: string, detail: string, extra: Partial<AppError> = {}) {
    super(detail);
    this.name = 'AppError';
    this.status = status;
    this.statusCode = status;
    this.title = title;
    Object.assign(this, extra);
  }
}

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code?: string;
  instance?: string;
  correlationId?: string;
  errors?: unknown;
};

export function createProblem({
  type = 'about:blank',
  title = 'Unexpected Error',
  status = 500,
  detail = 'An unexpected error occurred.',
  code = undefined,
  instance = undefined,
  correlationId = undefined,
  errors = undefined
}: Partial<ProblemDetails> = {}): ProblemDetails {
  const payload: ProblemDetails = { type, title, status, detail };
  if (code) payload.code = code;
  if (instance) payload.instance = instance;
  if (correlationId) payload.correlationId = correlationId;
  if (errors) payload.errors = errors;
  return payload;
}
