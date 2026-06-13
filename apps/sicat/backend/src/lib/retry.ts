import { config } from '../lib/config.js';

const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 401, 403, 404]);
const RETRYABLE_HTTP_STATUSES = new Set([408, 429]);

const RETRYABLE_NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'ABORT_ERR'
]);

const RETRYABLE_ERROR_CODES = new Set([
  'CETESB_NETWORK_ERROR',
  'CETESB_RETRY_EXHAUSTED',
  'CETESB_TIMEOUT',
  'REQUEST_TIMEOUT',
  'TIMEOUT',
  'NETWORK_ERROR',
  'RATE_LIMIT_EXCEEDED',
  'TOO_MANY_REQUESTS',
  'SERVICE_UNAVAILABLE',
  'TEMPORARILY_UNAVAILABLE'
]);

const NON_RETRYABLE_ERROR_CODES = new Set([
  'VALIDATION_ERROR',
  'MANIFEST_VALIDATION_ERROR',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'MISSING_CREDENTIALS',
  'MISSING_TOKEN',
  'MISSING_DOCUMENT',
  'INVALID_CREDENTIALS',
  'PARTNER_NOT_FOUND',
  'CETESB_AUTH_FAILED',
  // Erro de negócio definitivo retornado pela CETESB (ex: manifesto não está Ativo para cancelar).
  // Retry não ajudará — a condição de negócio não muda com novas tentativas.
  'CETESB_REMOTE_ERROR'
]);

type ErrorLike = {
  status?: number;
  statusCode?: number;
  httpStatus?: number;
  remoteStatus?: number;
  response?: { status?: number };
  code?: string;
  errorCode?: string;
  remoteCode?: string;
  cetesbCode?: string;
  cause?: { code?: string };
  message?: string;
};

type RetryStrategy = 'exponential' | 'linear' | 'fixed';

type RetryableOperation =
  | 'session.bootstrap'
  | 'manifest.submit'
  | 'manifest.cancel'
  | 'manifest.print'
  | 'manifest.receive'
  | 'cdf.generate'
  | 'cdf.download'
  | 'catalog.sync'
  | 'cadastro.submit'
  | 'conversation.bundle_documents';

type JobLike = {
  attempts: number;
  maxAttempts: number;
  operation: string;
  status: string;
  entityType?: string;
  lastErrorCode?: string;
};

function asErrorLike(error: unknown): ErrorLike {
  if (!error || typeof error !== 'object') return {};
  return error as ErrorLike;
}

function extractErrorStatus(error: unknown): number | null {
  const parsedError = asErrorLike(error);
  const status = Number(
    parsedError.status
    ?? parsedError.statusCode
    ?? parsedError.httpStatus
    ?? parsedError.remoteStatus
    ?? parsedError.response?.status
  );
  return Number.isFinite(status) ? status : null;
}

function extractErrorCode(error: unknown): string {
  const parsedError = asErrorLike(error);
  return String(
    parsedError.code
    ?? parsedError.errorCode
    ?? parsedError.remoteCode
    ?? parsedError.cetesbCode
    ?? parsedError.cause?.code
    ?? ''
  ).toUpperCase();
}

function isRetryableHttpStatus(status: number | null): boolean {
  return status != null && (RETRYABLE_HTTP_STATUSES.has(status) || status >= 500);
}

function isNonRetryableMessage(message: string): boolean {
  return [
    'validation',
    'bad request',
    'unauthorized',
    'forbidden',
    'not found'
  ].some((fragment) => message.includes(fragment));
}

function classifyRetryabilityFromStatus(status: number | null): boolean | null {
  if (status == null) {
    return null;
  }

  if (NON_RETRYABLE_HTTP_STATUSES.has(status)) {
    return false;
  }

  if (isRetryableHttpStatus(status)) {
    return true;
  }

  return null;
}

// 4xx definitivo da CETESB. Os AppError do gateway chegam com status=502 (o
// wrapper "gateway error") e o código HTTP REAL em remoteStatus — sem este
// desvio, a classificação por status enxerga "5xx" e re-tenta erros
// definitivos (incidente 2026-06-13: 400 de binding re-tentado 5x até a DLQ).
// 401/403 viram CETESB_AUTH_FAILED no gateway (com refresh de sessão) e não
// passam por aqui; 408/429/timeout/5xx seguem retryable pelas regras gerais.
const DEFINITIVE_CETESB_REMOTE_STATUSES = new Set([400, 403, 404, 409, 422]);

function classifyCetesbGatewayError(error: unknown): boolean | null {
  const code = extractErrorCode(error);
  if (code === 'CETESB_REMOTE_ERROR') {
    // Erro de negócio definitivo da CETESB (payload.erro=true): novas
    // tentativas não mudam a condição — também era mascarado pelo 502.
    return false;
  }
  if (code !== 'CETESB_HTTP_ERROR') {
    return null;
  }
  const remoteStatus = Number(asErrorLike(error).remoteStatus);
  if (!Number.isFinite(remoteStatus)) {
    return null;
  }
  return DEFINITIVE_CETESB_REMOTE_STATUSES.has(remoteStatus) ? false : null;
}

function classifyRetryabilityFromCode(code: string, status: number | null): boolean | null {
  if (!code) {
    return null;
  }

  if (NON_RETRYABLE_ERROR_CODES.has(code)) {
    return false;
  }

  if (RETRYABLE_NETWORK_CODES.has(code) || RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }

  if (code === 'CETESB_HTTP_ERROR' && status != null) {
    return isRetryableHttpStatus(status);
  }

  if (code.startsWith('VALIDATION_') || code.startsWith('INVALID_') || code.startsWith('MISSING_')) {
    return false;
  }

  return null;
}

/**
 * Classifica erro de job entre retryable e definitivo.
 *
 * Retryable: timeout/rede/429/5xx e códigos CETESB transitórios.
 * Não retryable: validação/400/401/403/404.
 *
 * @param {Error|object} error
 * @returns {boolean}
 */
export function isRetryableJobError(error: unknown): boolean {
  if (!error) return false;

  // Erros do gateway CETESB primeiro: o que define a retryability é o erro
  // REMOTO, não o status 502 do wrapper.
  const gatewayClassification = classifyCetesbGatewayError(error);
  if (gatewayClassification != null) {
    return gatewayClassification;
  }

  const status = extractErrorStatus(error);
  const retryabilityFromStatus = classifyRetryabilityFromStatus(status);
  if (retryabilityFromStatus != null) {
    return retryabilityFromStatus;
  }

  const code = extractErrorCode(error);
  const retryabilityFromCode = classifyRetryabilityFromCode(code, status);
  if (retryabilityFromCode != null) {
    return retryabilityFromCode;
  }

  const parsedError = asErrorLike(error);
  const message = String(parsedError.message || '').toLowerCase();
  if (!message) return true;

  if (isNonRetryableMessage(message)) {
    return false;
  }

  return true;
}

export function getJobErrorCode(error: unknown): string {
  const code = extractErrorCode(error);
  if (code) return code;

  const status = extractErrorStatus(error);
  if (status != null) return `HTTP_${status}`;

  return 'JOB_ERROR';
}

/**
 * Calcula o próximo retry com backoff exponencial
 * 
 * @param {number} attempts - Número de tentativas já realizadas
 * @param {string} strategy - Estratégia de retry ('exponential', 'linear', 'fixed')
 * @param {number} baseDelayMs - Delay base em milissegundos (padrão: 1000ms)
 * @param {number} maxDelayMs - Delay máximo em milissegundos (padrão: 300000ms = 5min)
 * @returns {Date} Data/hora do próximo retry
 */
export function calculateNextRetry(
  attempts: number,
  strategy: RetryStrategy = 'exponential',
  baseDelayMs = 1000,
  maxDelayMs = 300000
): Date {
  let delayMs;

  switch (strategy) {
    case 'exponential':
      // Exponencial: base_delay * (2 ^ (attempts - 1))
      delayMs = Math.min(baseDelayMs * Math.pow(2, attempts - 1), maxDelayMs);
      break;
    case 'linear':
      // Linear: base_delay * attempts
      delayMs = Math.min(baseDelayMs * attempts, maxDelayMs);
      break;
    case 'fixed':
    default:
      // Fixed: sempre base_delay
      delayMs = baseDelayMs;
  }

  // Adiciona jitter de até 10% para evitar thundering herd
  const jitterMs = Math.random() * delayMs * 0.1;

  return new Date(Date.now() + delayMs + jitterMs);
}

/**
 * Verifica se um job deve ir para DLQ
 * 
 * @param {object} job - Job a ser verificado
 * @returns {boolean} True se deve ir para DLQ
 */
export function shouldMoveToDLQ(job: Pick<JobLike, 'attempts' | 'maxAttempts'>): boolean {
  return job.attempts >= job.maxAttempts;
}

/**
 * Calcula prioridade de um job baseado em tipo de operação
 * 
 * @param {string} operation - Nome da operação
 * @returns {number} Prioridade (0-10, maior = mais prioritário)
 */
export function calculateJobPriority(operation: string): number {
  const priorities: Record<RetryableOperation, number> = {
    'session.bootstrap': 10,      // Alta prioridade - autenticação
    'manifest.submit': 8,          // Alta prioridade - operação crítica
    'manifest.cancel': 7,          // Alta prioridade - cancelamento
    'manifest.print': 5,           // Média prioridade - impressão
    'manifest.receive': 7,         // Alta prioridade - recebimento operacional
    'cdf.generate': 6,             // Média-alta prioridade - emissão de certificado
    'cdf.download': 5,             // Média prioridade - obtenção de PDF
    'catalog.sync': 3,             // Baixa prioridade - sincronização
    'cadastro.submit': 6,          // Média-alta prioridade
    'conversation.bundle_documents': 4 // Média-baixa - compactação de arquivos
  };

  return priorities[operation as RetryableOperation] || 5; // Padrão: média prioridade
}

/**
 * Formata histórico de delays de retry para armazenamento
 * 
 * @param {Array<number>} delays - Array de delays em ms
 * @returns {Array<object>} Array de objetos com delay e timestamp
 */
export function formatRetryDelays(delays: number[]): Array<{ attempt: number; delayMs: number; scheduledFor: string }> {
  return delays.map((delayMs: number, index: number) => ({
    attempt: index + 1,
    delayMs,
    scheduledFor: new Date(Date.now() + delayMs).toISOString()
  }));
}

/**
 * Extrai tags de um job para categorização
 * 
 * @param {object} job - Job a ser categorizado
 * @returns {Array<string>} Array de tags
 */
export function extractJobTags(job: Partial<JobLike>): string[] {
  const tags: string[] = [];

  // Tag por tipo de operação
  if (job.operation) {
    const [category] = job.operation.split('.');
    tags.push(`category:${category}`);
  }

  // Tag por entityType
  if (job.entityType) {
    tags.push(`entity:${job.entityType}`);
  }

  // Tag por status
  if (job.status) {
    tags.push(`status:${job.status}`);
  }

  // Tag se está em retry
  if ((job.attempts ?? 0) > 1) {
    tags.push('retry');
  }

  // Tag se tem erro
  if (job.lastErrorCode) {
    tags.push(`error:${job.lastErrorCode}`);
  }

  return tags;
}

/**
 * Configuração de retry por tipo de operação
 * 
 * @param {string} operation - Nome da operação
 * @returns {object} Configuração de retry
 */
type RetryConfig = {
  maxAttempts: number;
  strategy: RetryStrategy;
  baseDelayMs: number;
  maxDelayMs: number;
};

export function getRetryConfig(operation: string): RetryConfig {
  const configs: Record<RetryableOperation, RetryConfig> = {
    'session.bootstrap': {
      maxAttempts: 3,
      strategy: 'fixed',
      baseDelayMs: 2000,
      maxDelayMs: 10000
    },
    'manifest.submit': {
      maxAttempts: config.jobMaxAttempts || 5,
      strategy: 'exponential',
      baseDelayMs: 2000,
      maxDelayMs: 300000 // 5 minutos
    },
    'manifest.print': {
      maxAttempts: config.jobMaxAttempts || 5,
      strategy: 'exponential',
      baseDelayMs: 1000,
      maxDelayMs: 180000 // 3 minutos
    },
    'manifest.cancel': {
      maxAttempts: config.jobMaxAttempts || 5,
      strategy: 'exponential',
      baseDelayMs: 10000,  // HANDOFF 4: delay maior para aguardar MTR aparecer na pesquisa CETESB
      maxDelayMs: 300000 // 5 minutos
    },
    'manifest.receive': {
      maxAttempts: config.jobMaxAttempts || 5,
      strategy: 'exponential',
      baseDelayMs: 2000,
      maxDelayMs: 300000
    },
    'cdf.generate': {
      maxAttempts: config.jobMaxAttempts || 5,
      strategy: 'exponential',
      baseDelayMs: 2000,
      maxDelayMs: 300000
    },
    'cdf.download': {
      maxAttempts: config.jobMaxAttempts || 5,
      strategy: 'exponential',
      baseDelayMs: 1000,
      maxDelayMs: 180000
    },
    'catalog.sync': {
      maxAttempts: 3,
      strategy: 'linear',
      baseDelayMs: 5000,
      maxDelayMs: 60000 // 1 minuto
    },
    'cadastro.submit': {
      maxAttempts: config.jobMaxAttempts || 5,
      strategy: 'exponential',
      baseDelayMs: 2000,
      maxDelayMs: 300000
    },
    'conversation.bundle_documents': {
      maxAttempts: 5,
      strategy: 'exponential',
      baseDelayMs: 1500,
      maxDelayMs: 120000
    }
  };

  return configs[operation as RetryableOperation] || {
    maxAttempts: config.jobMaxAttempts || 5,
    strategy: 'exponential',
    baseDelayMs: 1000,
    maxDelayMs: 300000
  };
}

/**
 * Calcula estatísticas de retry para observabilidade
 * 
 * @param {Array<object>} jobs - Lista de jobs
 * @returns {object} Estatísticas agregadas
 */
export function calculateRetryStats(jobs: JobLike[]): {
  total: number;
  byStatus: Record<string, number>;
  byOperation: Record<string, number>;
  avgAttempts: number;
  maxAttempts: number;
  totalRetries: number;
  retryRate: number;
} {
  const stats = {
    total: jobs.length,
    byStatus: {} as Record<string, number>,
    byOperation: {} as Record<string, number>,
    avgAttempts: 0,
    maxAttempts: 0,
    totalRetries: 0,
    retryRate: 0
  };

  jobs.forEach((job: JobLike) => {
    // Contar por status
    stats.byStatus[job.status] = (stats.byStatus[job.status] || 0) + 1;

    // Contar por operação
    stats.byOperation[job.operation] = (stats.byOperation[job.operation] || 0) + 1;

    // Acumular tentativas
    stats.totalRetries += job.attempts - 1; // attempts include first try
    stats.maxAttempts = Math.max(stats.maxAttempts, job.attempts);
  });

  if (jobs.length > 0) {
    const totalAttempts = jobs.reduce((sum: number, job: JobLike) => sum + job.attempts, 0);
    stats.avgAttempts = totalAttempts / jobs.length;
    stats.retryRate = stats.totalRetries / jobs.length;
  }

  return stats;
}
