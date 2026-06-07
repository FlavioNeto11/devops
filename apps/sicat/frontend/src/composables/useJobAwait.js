import { onBeforeUnmount, ref } from 'vue';
import { getJobById } from '../services/api.js';

/**
 * Acompanha um job assíncrono (padrão 202 + jobId) via polling até atingir um
 * estado terminal. Encapsula o ciclo de vida (cancelamento automático no
 * unmount) para evitar timers órfãos.
 *
 * Uso:
 *   const { awaitJob, status, awaiting, error, cancel } = useJobAwait();
 *   const finalJob = await awaitJob(jobId, { onUpdate: (job) => {...} });
 */

const TERMINAL_STATUSES = new Set([
  'succeeded',
  'submitted',
  'finished',
  'completed',
  'failed',
  'cancelled',
  'dlq'
]);

const SUCCESS_STATUSES = new Set(['succeeded', 'submitted', 'finished', 'completed']);

export function isTerminalJobStatus(status) {
  return TERMINAL_STATUSES.has(String(status || '').trim().toLowerCase());
}

export function isSuccessJobStatus(status) {
  return SUCCESS_STATUSES.has(String(status || '').trim().toLowerCase());
}

export function useJobAwait() {
  const job = ref(null);
  const status = ref(null);
  const awaiting = ref(false);
  const error = ref(null);

  let cancelled = false;
  let timer = null;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function cancel() {
    cancelled = true;
    clearTimer();
    awaiting.value = false;
  }

  function awaitJob(jobId, { intervalMs = 2000, timeoutMs = 120000, onUpdate } = {}) {
    cancel();
    cancelled = false;
    awaiting.value = true;
    error.value = null;
    job.value = null;
    status.value = null;

    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
      const poll = async () => {
        if (cancelled) return;

        try {
          const result = await getJobById(jobId);
          if (cancelled) return;

          job.value = result;
          status.value = result?.status ?? null;
          onUpdate?.(result);

          if (isTerminalJobStatus(status.value)) {
            awaiting.value = false;
            resolve(result);
            return;
          }

          if (Date.now() - startedAt > timeoutMs) {
            awaiting.value = false;
            const timeoutError = new Error('Tempo limite ao acompanhar o processamento do job.');
            timeoutError.code = 'JOB_AWAIT_TIMEOUT';
            error.value = timeoutError;
            reject(timeoutError);
            return;
          }

          timer = setTimeout(poll, intervalMs);
        } catch (pollError) {
          if (cancelled) return;
          awaiting.value = false;
          error.value = pollError;
          reject(pollError);
        }
      };

      void poll();
    });
  }

  onBeforeUnmount(cancel);

  return { job, status, awaiting, error, awaitJob, cancel };
}
