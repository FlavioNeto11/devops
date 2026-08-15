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
  'TEMPORARILY_UNAVAILABLE',
  // Gateway RNTRC/ANTT (PR-C1) — timeout/rede também classificados por status (>=500/504/502 via
  // `classifyRetryabilityFromStatus`); registrados aqui também para clareza e redundância, no
  // mesmo molde de `CETESB_NETWORK_ERROR`/`CETESB_TIMEOUT` acima.
  'RNTRC_GATEWAY_TIMEOUT',
  'RNTRC_GATEWAY_NETWORK_ERROR',
  // Provedor de CIOT (PR-C2) — "resposta perdida" simulada pelo mock (DL-102: dispatch aconteceu,
  // resposta não chegou). Também coberto por status (504) via `classifyRetryabilityFromStatus`;
  // registrado aqui para clareza/redundância, mesmo molde acima.
  'CIOT_PROVIDER_LOST_RESPONSE_TEST',
  // Erro do reconciliador de CIOT ao consultar o provedor — INCONCLUSIVO, nunca "não existe"
  // (mesmo racional de `SUBMIT_RECONCILE_SEARCH_FAILED`, que não precisa de entrada aqui porque
  // sempre chega embrulhado como AppError 502 sem `code` próprio reconhecido — este JÁ tem code).
  'CIOT_RECONCILE_QUERY_FAILED'
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
  'CETESB_REMOTE_ERROR',
  // Verificação RNTRC (PR-C1): linha `pending` já resolvida por uma tentativa anterior que
  // commitou mas não chegou a `finishJob` (queda do worker). Reter não desfaz o passado — a
  // condição some sozinha na PRÓXIMA verificação (nova linha), não numa nova tentativa desta.
  'RNTRC_VERIFICATION_ALREADY_TERMINAL',
  // Provedor de CIOT (PR-C2): recusa DEFINITIVA do provedor (ex.: frete abaixo do mínimo aceito) —
  // decisão de negócio, não falha transitória. O side-effect terminal (`applyTransporteCiotTerminal
  // FailureSideEffect`) lê justamente ESTE código para distinguir "o provedor respondeu recusando"
  // (→ `rejected`) de "a resposta se perdeu" (→ `request_unconfirmed`, DL-102) — por isso precisa
  // chegar a `failed` numa ÚNICA tentativa, nunca esgotar retries primeiro.
  'CIOT_PROVIDER_REJECTED_TEST',
  // Configuração ausente (`CIOT_PROVIDER_MODE=real`, [EXTERNAL DEPENDENCY] P5 sem provedor
  // contratado) — retentar não resolve, é decisão do operador trocar de modo.
  'CIOT_PROVIDER_NOT_CONFIGURED',
  // Mesma classe de `RNTRC_VERIFICATION_ALREADY_TERMINAL`, para os 5 job types do CIOT: a linha já
  // não está no status esperado para a transição — resultado provavelmente já aplicado por uma
  // tentativa anterior que não chegou a `finishJob`.
  'TRANSPORTE_CIOT_ALREADY_TERMINAL'
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
  | 'conversation.bundle_documents'
  | 'whatsapp.inbound_message'
  | 'whatsapp.outbound_notice'
  | 'transporte.rntrc.verify'
  | 'transporte.ciot.register'
  | 'transporte.ciot.rectify'
  | 'transporte.ciot.cancel'
  | 'transporte.ciot.close'
  | 'transporte.ciot.reconcile';

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
    'conversation.bundle_documents': 4, // Média-baixa - compactação de arquivos
    // Abaixo de `catalog.sync` (3) DE PROPÓSITO. `claimJobs` ordena por `priority desc, queued_at
    // asc` e o worker é consumidor SERIAL: enquanto a raia dedicada (`WORKER_LANE=channel`) não
    // estiver no ar, um turno de conversa e um `manifest.submit` disputam o mesmo consumidor. Nesse
    // modo degradado a conversa NUNCA pode preemptar operação CETESB.
    'whatsapp.inbound_message': 2,
    // ACIMA do turno de conversa (2) e ABAIXO de qualquer operação CETESB (5+): o aviso nunca
    // preempta o trabalho que ele descreve. Consequência assumida enquanto `WORKER_LANE=channel`
    // não estiver no ar: sob backlog o aviso ESPERA, e o prazo de parede de 10 min encosta —
    // desfecho normal vira aviso parcial (texto 6).
    'whatsapp.outbound_notice': 3,
    // Verificação de regularidade RNTRC (PR-C1) — operação de CONSULTA (nunca emite/altera nada na
    // ANTT), sem prazo de parede apertado como o canal WhatsApp. Prioridade baixa-média: abaixo de
    // qualquer operação CETESB (5+) e de `catalog.sync` (3, sincronização de catálogo), acima do
    // turno conversacional (2) — não é interativo, mas também não é housekeeping de fundo.
    'transporte.rntrc.verify': 4,
    // Ciclo do CIOT (PR-C2) — comandos MUTANTES (register/rectify/cancel/close) ficam no mesmo
    // nível de `cadastro.submit`/`transporte.rntrc.verify`: acima de housekeeping (`catalog.sync`,
    // conversa), abaixo das operações CETESB críticas (5+ — o CIOT é outro provedor, não disputa
    // fila com o MTR). `reconcile` fica ABAIXO das mutações: ele resolve um estado indeterminado
    // que já tem uma rede de segurança (varredura periódica) — não é o caminho do usuário esperando.
    'transporte.ciot.register': 4,
    'transporte.ciot.rectify': 4,
    'transporte.ciot.cancel': 4,
    'transporte.ciot.close': 4,
    'transporte.ciot.reconcile': 3
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
    },
    /*
     * Mensagem recebida no WhatsApp. Os QUATRO campos divergem do default herdado
     * (`{ jobMaxAttempts||5, 'exponential', 1000, 300000 }`) e a divergência é o ponto:
     *
     *  - `fixed` + `maxDelayMs: 15000` — o backoff exponencial padrão chega a 5 MINUTOS, e uma
     *    resposta de WhatsApp que chega 5 minutos depois é pior que nenhuma;
     *  - `maxAttempts: 3` — o retry aqui é de ENTREGA, não de LLM: o caminho rápido do handler relê
     *    `payload.replyText` e, se a resposta já foi preparada, PULA o turno e só reenvia. Sem essa
     *    garantia, 5 tentativas significariam 5 chamadas de LLM e 5 respostas diferentes para a
     *    mesma pergunta.
     */
    'whatsapp.inbound_message': {
      maxAttempts: 3,
      strategy: 'fixed',
      baseDelayMs: 5000,
      maxDelayMs: 15000
    },
    /*
     * Aviso de conclusão de ação confirmada (fase 6). A entrada é EXPLÍCITA de propósito: o default
     * de operação desconhecida funcionaria, mas herdaria `maxDelayMs: 300000` exponencial — o mesmo
     * defeito que o comentário de `whatsapp.inbound_message` acima já nomeou.
     *
     * O job de aviso tem DOIS usos de tentativa, e por isso `maxAttempts` é maior:
     *  - REAGENDAMENTO: enquanto os jobs da ação não terminam e o prazo não venceu, o handler lança
     *    erro retentável SEM enviar nada. 15 s → 30 → 60 → 120 (cap) cobre ~10 min em 8 tentativas,
     *    que é o `whatsappNoticeDeadlineMs` default;
     *  - ENTREGA: falha do provedor no envio, exatamente como na fase 3.
     * Na ÚLTIMA tentativa o handler NUNCA lança: entrega o parcial honesto e SUCEDE. Aviso na DLQ é
     * silêncio sobre o silêncio.
     */
    'whatsapp.outbound_notice': {
      maxAttempts: 8,
      strategy: 'exponential',
      baseDelayMs: 15000,
      maxDelayMs: 120000
    },
    // Verificação de regularidade RNTRC via `open_data` (PR-C1) — primeiro job type com gateway
    // externo REAL da vertical Transporte. 4 tentativas, exponencial 5s→120s: folga suficiente para
    // uma instabilidade passageira do CKAN da ANTT (ou do download do CSV mensal), sem prender a
    // operação por horas — é consulta, não emissão; o operador pode sempre pedir de novo.
    'transporte.rntrc.verify': {
      maxAttempts: 4,
      strategy: 'exponential',
      baseDelayMs: 5000,
      maxDelayMs: 120000
    },
    // Ciclo do CIOT via provedor abstraído (PR-C2, mock — sem provedor real contratado, P5). Mesmo
    // orçamento do RNTRC: 4 tentativas, exponencial 5s→120s. `CIOT_PROVIDER_REJECTED_TEST` é
    // NON-retryable (registrado em `NON_RETRYABLE_ERROR_CODES`) — só a resposta PERDIDA
    // (`CIOT_PROVIDER_LOST_RESPONSE_TEST`) de fato percorre este backoff antes de declarar
    // `request_unconfirmed` no terminal.
    'transporte.ciot.register': {
      maxAttempts: 4,
      strategy: 'exponential',
      baseDelayMs: 5000,
      maxDelayMs: 120000
    },
    'transporte.ciot.rectify': {
      maxAttempts: 4,
      strategy: 'exponential',
      baseDelayMs: 5000,
      maxDelayMs: 120000
    },
    'transporte.ciot.cancel': {
      maxAttempts: 4,
      strategy: 'exponential',
      baseDelayMs: 5000,
      maxDelayMs: 120000
    },
    'transporte.ciot.close': {
      maxAttempts: 4,
      strategy: 'exponential',
      baseDelayMs: 5000,
      maxDelayMs: 120000
    },
    // Reconciliador (DL-102): já faz polling PRÓPRIO contra o provedor (`ciot-reconciler.ts`,
    // 5 tentativas com sleep entre elas) — o orçamento de RETRY DA FILA aqui cobre só falha de
    // INFRAESTRUTURA em torno desse polling (ex.: erro ao gravar o resultado), por isso é mais
    // curto que os comandos mutantes.
    'transporte.ciot.reconcile': {
      maxAttempts: 3,
      strategy: 'exponential',
      baseDelayMs: 5000,
      maxDelayMs: 60000
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
