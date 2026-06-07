import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNextRetry,
  shouldMoveToDLQ,
  isRetryableJobError,
  calculateJobPriority,
  getRetryConfig,
  extractJobTags,
  calculateRetryStats
} from '../../src/lib/retry.js';

test('calculateNextRetry - exponential strategy', () => {
  const baseDelayMs = 1000;
  const maxDelayMs = 60000;
  
  // Tentativa 1: 1s * 2^0 = 1s
  const retry1 = calculateNextRetry(1, 'exponential', baseDelayMs, maxDelayMs);
  const delay1 = retry1.getTime() - Date.now();
  assert.ok(delay1 >= 900 && delay1 <= 1200, `Delay tentativa 1 deve estar entre 900-1200ms, got ${delay1}ms`);
  
  // Tentativa 2: 1s * 2^1 = 2s
  const retry2 = calculateNextRetry(2, 'exponential', baseDelayMs, maxDelayMs);
  const delay2 = retry2.getTime() - Date.now();
  assert.ok(delay2 >= 1800 && delay2 <= 2400, `Delay tentativa 2 deve estar entre 1800-2400ms, got ${delay2}ms`);
  
  // Tentativa 5: 1s * 2^4 = 16s
  const retry5 = calculateNextRetry(5, 'exponential', baseDelayMs, maxDelayMs);
  const delay5 = retry5.getTime() - Date.now();
  assert.ok(delay5 >= 14400 && delay5 <= 19200, `Delay tentativa 5 deve estar entre 14400-19200ms, got ${delay5}ms`);
  
  // Tentativa 10: deve bater no max_delay de 60s
  const retry10 = calculateNextRetry(10, 'exponential', baseDelayMs, maxDelayMs);
  const delay10 = retry10.getTime() - Date.now();
  assert.ok(delay10 <= 66000, `Delay tentativa 10 deve respeitar maxDelay de 60s com jitter, got ${delay10}ms`);
});

test('calculateNextRetry - linear strategy', () => {
  const baseDelayMs = 2000;
  const maxDelayMs = 30000;
  
  // Tentativa 1: 2s * 1 = 2s
  const retry1 = calculateNextRetry(1, 'linear', baseDelayMs, maxDelayMs);
  const delay1 = retry1.getTime() - Date.now();
  assert.ok(delay1 >= 1800 && delay1 <= 2400, `Delay linear tentativa 1 deve estar entre 1800-2400ms, got ${delay1}ms`);
  
  // Tentativa 5: 2s * 5 = 10s
  const retry5 = calculateNextRetry(5, 'linear', baseDelayMs, maxDelayMs);
  const delay5 = retry5.getTime() - Date.now();
  assert.ok(delay5 >= 9000 && delay5 <= 12000, `Delay linear tentativa 5 deve estar entre 9000-12000ms, got ${delay5}ms`);
  
  // Tentativa 20: deve bater no max_delay de 30s
  const retry20 = calculateNextRetry(20, 'linear', baseDelayMs, maxDelayMs);
  const delay20 = retry20.getTime() - Date.now();
  assert.ok(delay20 <= 33000, `Delay linear tentativa 20 deve respeitar maxDelay, got ${delay20}ms`);
});

test('calculateNextRetry - fixed strategy', () => {
  const baseDelayMs = 5000;
  const maxDelayMs = 60000;
  
  // Todas tentativas devem ter delay fixo de 5s
  for (let attempt = 1; attempt <= 10; attempt++) {
    const retry = calculateNextRetry(attempt, 'fixed', baseDelayMs, maxDelayMs);
    const delay = retry.getTime() - Date.now();
    assert.ok(delay >= 4500 && delay <= 5500, `Delay fixed tentativa ${attempt} deve estar entre 4500-5500ms, got ${delay}ms`);
  }
});

test('calculateNextRetry - jitter distribution', () => {
  const baseDelayMs = 10000;
  const maxDelayMs = 300000;
  const samples = 100;
  const delays = [];
  
  // Coletar 100 amostras para verificar distribuição do jitter
  for (let i = 0; i < samples; i++) {
    const retry = calculateNextRetry(1, 'exponential', baseDelayMs, maxDelayMs);
    const delay = retry.getTime() - Date.now();
    delays.push(delay);
  }
  
  const minDelay = Math.min(...delays);
  const maxDelay = Math.max(...delays);
  const avgDelay = delays.reduce((sum, d) => sum + d, 0) / samples;
  
  // Jitter deve adicionar até 10% (1000ms) ao delay base de 10000ms
  assert.ok(minDelay >= 9500, `Min delay ${minDelay}ms deve ser >= 9500ms`);
  assert.ok(maxDelay <= 11500, `Max delay ${maxDelay}ms deve ser <= 11500ms`);
  assert.ok(avgDelay >= 10000 && avgDelay <= 10800, `Avg delay ${avgDelay}ms deve estar entre 10000-10800ms`);
});

test('shouldMoveToDLQ', () => {
  assert.strictEqual(shouldMoveToDLQ({ attempts: 3, maxAttempts: 5 }), false, 'Não deve mover quando attempts < maxAttempts');
  assert.strictEqual(shouldMoveToDLQ({ attempts: 5, maxAttempts: 5 }), true, 'Deve mover quando attempts >= maxAttempts');
  assert.strictEqual(shouldMoveToDLQ({ attempts: 6, maxAttempts: 5 }), true, 'Deve mover quando attempts > maxAttempts');
  assert.strictEqual(shouldMoveToDLQ({ attempts: 0, maxAttempts: 3 }), false, 'Não deve mover job nunca executado');
});

test('isRetryableJobError - HTTP transitório (429/5xx/timeout)', () => {
  assert.strictEqual(isRetryableJobError({ status: 429, message: 'Too Many Requests' }), true);
  assert.strictEqual(isRetryableJobError({ statusCode: 503, message: 'Service Unavailable' }), true);
  assert.strictEqual(isRetryableJobError({ remoteStatus: 408, code: 'CETESB_HTTP_ERROR' }), true);
});

test('isRetryableJobError - erro de rede/timeout transitório', () => {
  assert.strictEqual(isRetryableJobError({ code: 'ETIMEDOUT', message: 'socket timed out' }), true);
  assert.strictEqual(isRetryableJobError({ code: 'CETESB_NETWORK_ERROR' }), true);
  assert.strictEqual(isRetryableJobError({ message: 'network timeout while calling endpoint' }), true);
});

test('isRetryableJobError - não retry para validação e 4xx definitivos', () => {
  assert.strictEqual(isRetryableJobError({ status: 400, message: 'Bad Request' }), false);
  assert.strictEqual(isRetryableJobError({ status: 401, message: 'Unauthorized' }), false);
  assert.strictEqual(isRetryableJobError({ status: 403, message: 'Forbidden' }), false);
  assert.strictEqual(isRetryableJobError({ status: 404, message: 'Not Found' }), false);
  assert.strictEqual(isRetryableJobError({ code: 'VALIDATION_ERROR', message: 'validation failed' }), false);
  assert.strictEqual(isRetryableJobError({ code: 'CETESB_AUTH_FAILED', remoteStatus: 403 }), false);
});

test('calculateJobPriority', () => {
  assert.strictEqual(calculateJobPriority('session.bootstrap'), 10, 'Session bootstrap deve ter prioridade máxima');
  assert.strictEqual(calculateJobPriority('manifest.submit'), 8, 'Manifest submit deve ter prioridade alta');
  assert.strictEqual(calculateJobPriority('manifest.cancel'), 7, 'Manifest cancel deve ter prioridade alta');
  assert.strictEqual(calculateJobPriority('cadastro.submit'), 6, 'Cadastro submit deve ter prioridade média-alta');
  assert.strictEqual(calculateJobPriority('manifest.print'), 5, 'Manifest print deve ter prioridade média');
  assert.strictEqual(calculateJobPriority('catalog.sync'), 3, 'Catalog sync deve ter prioridade baixa');
  assert.strictEqual(calculateJobPriority('unknown.operation'), 5, 'Operação desconhecida deve ter prioridade padrão média');
});

test('getRetryConfig - manifest.submit', () => {
  const config = getRetryConfig('manifest.submit');
  assert.strictEqual(config.strategy, 'exponential', 'Manifest submit deve usar estratégia exponencial');
  assert.strictEqual(config.baseDelayMs, 2000, 'Base delay deve ser 2s');
  assert.strictEqual(config.maxDelayMs, 300000, 'Max delay deve ser 5min');
  assert.ok(config.maxAttempts >= 5, 'Max attempts deve ser >= 5');
});

test('getRetryConfig - session.bootstrap', () => {
  const config = getRetryConfig('session.bootstrap');
  assert.strictEqual(config.strategy, 'fixed', 'Session bootstrap deve usar estratégia fixed');
  assert.strictEqual(config.maxAttempts, 3, 'Max attempts deve ser 3');
  assert.strictEqual(config.baseDelayMs, 2000, 'Base delay deve ser 2s');
  assert.strictEqual(config.maxDelayMs, 10000, 'Max delay deve ser 10s');
});

test('getRetryConfig - catalog.sync', () => {
  const config = getRetryConfig('catalog.sync');
  assert.strictEqual(config.strategy, 'linear', 'Catalog sync deve usar estratégia linear');
  assert.strictEqual(config.maxAttempts, 3, 'Max attempts deve ser 3');
  assert.strictEqual(config.baseDelayMs, 5000, 'Base delay deve ser 5s');
});

test('getRetryConfig - unknown operation', () => {
  const config = getRetryConfig('unknown.operation');
  assert.strictEqual(config.strategy, 'exponential', 'Operação desconhecida deve usar exponencial como padrão');
  assert.ok(config.maxAttempts >= 5, 'Max attempts deve ter padrão >= 5');
  assert.strictEqual(config.baseDelayMs, 1000, 'Base delay padrão deve ser 1s');
});

test('extractJobTags - job básico', () => {
  const tags = extractJobTags({
    operation: 'manifest.submit',
    entityType: 'manifest',
    status: 'queued',
    attempts: 1
  });
  
  assert.ok(tags.includes('category:manifest'), 'Deve ter tag de categoria');
  assert.ok(tags.includes('entity:manifest'), 'Deve ter tag de entity type');
  assert.ok(tags.includes('status:queued'), 'Deve ter tag de status');
  assert.strictEqual(tags.includes('retry'), false, 'Não deve ter tag retry na primeira tentativa');
});

test('extractJobTags - job em retry', () => {
  const tags = extractJobTags({
    operation: 'manifest.print',
    entityType: 'manifest',
    status: 'retry_wait',
    attempts: 3,
    lastErrorCode: 'GATEWAY_ERROR'
  });
  
  assert.ok(tags.includes('category:manifest'), 'Deve ter tag de categoria');
  assert.ok(tags.includes('status:retry_wait'), 'Deve ter tag de status retry_wait');
  assert.ok(tags.includes('retry'), 'Deve ter tag retry quando attempts > 1');
  assert.ok(tags.includes('error:GATEWAY_ERROR'), 'Deve ter tag do código de erro');
});

test('extractJobTags - job sem operation', () => {
  const tags = extractJobTags({
    entityType: 'manifest',
    status: 'running'
  });
  
  assert.ok(tags.includes('entity:manifest'), 'Deve ter tag de entity type');
  assert.ok(tags.includes('status:running'), 'Deve ter tag de status');
  assert.strictEqual(tags.includes('category:'), false, 'Não deve ter tag de categoria vazia');
});

test('calculateRetryStats - estatísticas básicas', () => {
  const jobs = [
    { status: 'succeeded', operation: 'manifest.submit', attempts: 1 },
    { status: 'succeeded', operation: 'manifest.submit', attempts: 2 },
    { status: 'retry_wait', operation: 'manifest.print', attempts: 3 },
    { status: 'failed', operation: 'catalog.sync', attempts: 5 }
  ];
  
  const stats = calculateRetryStats(jobs);
  
  assert.strictEqual(stats.total, 4, 'Total de jobs deve ser 4');
  assert.strictEqual(stats.byStatus.succeeded, 2, 'Deve ter 2 jobs succeeded');
  assert.strictEqual(stats.byStatus.retry_wait, 1, 'Deve ter 1 job retry_wait');
  assert.strictEqual(stats.byStatus.failed, 1, 'Deve ter 1 job failed');
  assert.strictEqual(stats.byOperation['manifest.submit'], 2, 'Deve ter 2 jobs de manifest.submit');
  assert.strictEqual(stats.maxAttempts, 5, 'Max attempts deve ser 5');
  assert.strictEqual(stats.avgAttempts, 2.75, 'Avg attempts deve ser (1+2+3+5)/4 = 2.75');
  assert.strictEqual(stats.totalRetries, 7, 'Total de retries deve ser (0+1+2+4) = 7'); // attempts - 1 for each job
});

test('calculateRetryStats - array vazio', () => {
  const stats = calculateRetryStats([]);
  
  assert.strictEqual(stats.total, 0, 'Total deve ser 0');
  assert.strictEqual(stats.avgAttempts, 0, 'Avg deve ser 0');
  assert.strictEqual(stats.maxAttempts, 0, 'Max deve ser 0');
  assert.strictEqual(stats.totalRetries, 0, 'Total retries deve ser 0');
  assert.strictEqual(stats.retryRate, 0, 'Retry rate deve ser 0');
});
